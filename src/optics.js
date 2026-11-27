import * as THREE from 'three';
import {
  computeDecompensation,
  computeDiplopiaOffsetDeg,
  computeEffectiveLensPower,
  computeMlnAngleDeg,
  computeMlnFreqScale,
} from './state.js';
import {
  QUALITY_PRESETS,
  createDefaultVisualSettings,
  computeAcuityBlurUV,
  computeAdaptedExposure,
  resolveIolGlassesOptics,
} from './personas.js';
import visionFrag from './shaders/vision.frag.glsl?raw';

const EYE_HALF_IPD_M = 0.029;
const NEAR_CLIP = 0.02;
const FAR_CLIP = 30.0;
const OD_FOV_DEG = 62;
const TAN_HALF_Y = Math.tan(THREE.MathUtils.degToRad(OD_FOV_DEG * 0.5));
const TARGET_MLN_FREQ_HZ = 2.5; // Calibrated relaxed MLN beat rate (~20 beats / 8 s; ~1.125 Hz calmly focused)
const CVD_TYPE_MAP = { none: 0, deutan: 1, protan: 2, tritan: 3 };
const LENS_PROFILE_MAP = { none: 0, aphakic_bifocal: 1, single_vision: 2, bifocal: 3, progressive: 4, pseudophakic_iol: 5 };
const FRAME_SHAPE_MAP = { auto: 0, round: 1, rect: 2, rounded_rect: 3, semi_rimless: 4, rimless: 5 };
const FRAME_COLOR_MAP = { auto: 0, amber: 1, charcoal: 2, tortoise: 3, titanium: 4, gold: 5, navy: 6, burgundy: 7 };
const DEFAULT_SETTINGS = createDefaultVisualSettings();

const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Fast 15-tap separable Gaussian on quarter-res OD target for smooth, leak-free +13 D aphakic/CoC blur
const BLUR_FRAG = /* glsl */ `
  uniform sampler2D tSource;
  uniform vec2 uStep;
  varying vec2 vUv;

  void main() {
    vec3 acc = vec3(0.0);
    float wSum = 0.0;
    for (int i = -7; i <= 7; i++) {
      float fi = float(i);
      float w = exp(-0.5 * (fi * fi) / (3.3 * 3.3));
      acc += texture2D(tSource, clamp(vUv + uStep * fi, vec2(0.002), vec2(0.998))).rgb * w;
      wSum += w;
    }
    gl_FragColor = vec4(acc / wSum, 1.0);
  }
`;

function createEyeRenderTarget(w, h, samples = 0, type = THREE.UnsignedByteType) {
  const depthTexture = new THREE.DepthTexture(w, h);
  depthTexture.type = THREE.UnsignedIntType;
  depthTexture.format = THREE.DepthFormat;

  return new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type,
    depthBuffer: true,
    depthTexture,
    samples,
  });
}

function createBlurRenderTarget(w, h, type = THREE.UnsignedByteType) {
  return new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

function sampleLoopingWaveform(waveform, timeSec, speedScale) {
  const wf = waveform?.waveform;
  const xs = wf?.samples_x_deg;
  const ys = wf?.samples_y_deg;
  const rate = (wf?.sample_rate_hz || 60) * speedScale;
  if (!xs || !ys || xs.length === 0) {
    const phase = (timeSec * TARGET_MLN_FREQ_HZ) % 1.0;
    const jerkX = (phase < 0.8 ? phase / 0.8 : 1.0 - (phase - 0.8) / 0.2) * 2.2 - 1.1;
    return { dxDeg: jerkX, dyDeg: jerkX * 0.15, vxDegS: 0 };
  }

  const n = xs.length;
  const fIdx = (((timeSec * rate) % n) + n) % n;
  const i0 = Math.floor(fIdx);
  const i1 = (i0 + 1) % n;
  const t = fIdx - i0;
  const dx = xs[i1] - xs[i0];
  return {
    dxDeg: xs[i0] + dx * t,
    dyDeg: ys[i0] + (ys[i1] - ys[i0]) * t,
    vxDegS: dx * rate,
  };
}

/**
 * WebGL2 optics pipeline: 4x MSAA OD target + quarter-res separable Gaussian blur,
 * 5.5 Hz MLN oscillopsia, constant-angle VOS 0.15 diplopia, and straight-cut executive aphakic bifocal.
 */
export function createOpticsRenderer(renderer, scene, waveformData) {
  let activeScene = scene;
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  const initW = Math.max(1, size.x);
  const initH = Math.max(1, size.y);
  const aspect = initW / initH;

  const odCamera = new THREE.PerspectiveCamera(OD_FOV_DEG, aspect, NEAR_CLIP, FAR_CLIP);
  const nonDomCamera = new THREE.PerspectiveCamera(OD_FOV_DEG, aspect, NEAR_CLIP, FAR_CLIP);

  // Half-float linear HDR targets (with safe 8-bit fallback) so optical defocus/HOAs run in linear light before ACES + sRGB
  const useHalfFloat =
    Boolean(renderer.capabilities?.isWebGL2) &&
    Boolean(renderer.extensions?.has('EXT_color_buffer_float'));
  const rtType = useHalfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;

  // 4x WebGL2 MSAA on dominant OD target + quarter-res separable blur & non-dominant stereo eye targets
  const rtOD = createEyeRenderTarget(initW, initH, 4, rtType);
  const blurW = Math.max(1, Math.floor(initW * 0.25));
  const blurH = Math.max(1, Math.floor(initH * 0.25));
  const rtBlurH = createBlurRenderTarget(blurW, blurH, rtType);
  const rtBlurV = createBlurRenderTarget(blurW, blurH, rtType);
  const rtNonDom = createEyeRenderTarget(blurW, blurH, 0, rtType);

  const blurStepUV = 0.0042;
  const blurStepH = new THREE.Vector2(blurStepUV / aspect, 0);
  const blurStepV = new THREE.Vector2(0, blurStepUV);
  const blurUniforms = {
    tSource: { value: rtOD.texture },
    uStep: { value: blurStepH },
  };

  const uniforms = {
    tColorOD: { value: rtOD.texture },
    tBlurOD: { value: rtBlurV.texture },
    tDepthOD: { value: rtOD.depthTexture },
    tColorNonDom: { value: rtNonDom.texture },
    tDepthNonDom: { value: rtNonDom.depthTexture },
    uHasNonDomRT: { value: 0.0 },
    uNear: { value: NEAR_CLIP },
    uFar: { value: FAR_CLIP },
    uAspect: { value: aspect },
    uTime: { value: 0 },
    uGlassesOn: { value: 1 },
    uGlassesSlide: { value: 0 },
    uGlassesBounce: { value: 0 },
    uSquint: { value: 0 },
    uEyelidClose: { value: 0 },
    uEyelidLight: { value: 0.35 },
    uAmbientLight: { value: 1.0 },
    uFatigue: { value: 0.08 },
    uOcclOD: { value: 0 },
    uOcclNonDom: { value: 0 },
    uFocusEffort: { value: 0 },
    uCompareNormal: { value: 0 },
    uMlnOffsetUV: { value: new THREE.Vector2(0, 0) },
    uMlnVelUV: { value: 0 },
    uEyeOffset: { value: new THREE.Vector2(0, 0) },
    uExposure: { value: renderer.toneMappingExposure || 1.0 },
    uResolution: { value: new THREE.Vector2(initW, initH) },
    uLensProfile: { value: 1.0 },
    uFrameShape: { value: 0.0 },
    uFrameColor: { value: 0.0 },
    uLensPowerD: { value: 13.0 },
    uEffLensPowerD: { value: 13.0 },
    uNearAddD: { value: 4.0 },
    uLensCylD: { value: 0.0 },
    uLensAxisRad: { value: Math.PI * 0.5 },
    uMyopiaD: { value: 0.0 },
    uPresbyopiaD: { value: 0.0 },
    uAstigmatismD: { value: 0.0 },
    uAstigmatismAxisRad: { value: Math.PI * 0.5 },
    uDomIsOS: { value: 0.0 },
    uAcuityBlurDom: { value: computeAcuityBlurUV(0.70) },
    uAcuityBlurNonDom: { value: computeAcuityBlurUV(0.15) },
    uDiplopiaTan: {
      value: new THREE.Vector2(
        Math.tan(THREE.MathUtils.degToRad(-1.53)),
        Math.tan(THREE.MathUtils.degToRad(0.31)),
      ),
    },
    uPhospheneScale: { value: 1.0 },
    uFloaterScale: { value: 1.0 },
    uGlaucoma: { value: 0.0 },
    uAmd: { value: 0.0 },
    uAlbinism: { value: 0.0 },
    uCataract: { value: 0.0 },
    uDiabeticRetinopathy: { value: 0.0 },
    uRetinitisPigmentosa: { value: 0.0 },
    uCvdType: { value: 0.0 },
    uCvdSeverity: { value: 0.0 },
    uOsExtraMyopiaD: { value: 0.0 },
    uIolHalo: { value: 0.0 },
  };

  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const blurMat = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: BLUR_FRAG,
    uniforms: blurUniforms,
    depthTest: false,
    depthWrite: false,
  });
  const blurScene = new THREE.Scene();
  blurScene.add(new THREE.Mesh(quadGeo, blurMat));

  const quadMaterial = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: visionFrag,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
  const quadScene = new THREE.Scene();
  quadScene.add(new THREE.Mesh(quadGeo, quadMaterial));

  const savedPos = new THREE.Vector3();
  const savedQuat = new THREE.Quaternion();
  const rightVec = new THREE.Vector3();
  const mlnEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const mlnQuat = new THREE.Quaternion();
  const nonDomEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const nonDomQuat = new THREE.Quaternion();

  let elapsed = 0;
  let mlnElapsed = 0;
  let shadowFrame = 0;
  let adaptedExposure = computeAdaptedExposure(1.0);
  let smoothConvVergence = 1.0 / 3.8; // Smooth physiological vergence (diopters) prevents 1-frame ghost teleport across edges

  function render(dt, state) {
    elapsed += dt;

    const s = state.settings || DEFAULT_SETTINGS;
    const domIsOS = (s.dominantEye ?? 'OD') === 'OS';
    const lensProfile = s.lensProfile ?? 'aphakic_bifocal';
    const glaucoma = s.glaucoma || 0;
    const amd = s.amd || 0;
    const albinism = s.albinism || 0;
    const cataract = s.cataract || 0;
    const diabeticRetinopathy = s.diabeticRetinopathy || 0;
    const retinitisPigmentosa = s.retinitisPigmentosa || 0;
    const myopiaD = s.myopiaD || 0;
    const presbyopiaD = s.presbyopiaD || 0;
    const astigmatismD = s.astigmatismD || 0;
    const lensCylD = s.lensCylD || 0;
    const lensProfileCode = LENS_PROFILE_MAP[lensProfile] ?? 1;
    const vodAcuity = s.vodAcuity ?? 0.70;
    const vosAcuity = s.vosAcuity ?? 0.15;
    const rawDomBlur = computeAcuityBlurUV(domIsOS ? vosAcuity : vodAcuity);
    const acuityBlurNonDom = computeAcuityBlurUV(domIsOS ? vodAcuity : vosAcuity);
    const dipDeg = computeDiplopiaOffsetDeg(state.focusDistM, s);
    const hasDiplopia = Math.abs(dipDeg.dxDeg) >= 0.01 || Math.abs(dipDeg.dyDeg) >= 0.01;
    // In single-vision / no-lens mode without diplopia, blend non-dominant acuity via binocular summation so OS acuity stays active
    const acuityBlurDom =
      lensProfile !== 'aphakic_bifocal' && !hasDiplopia
        ? rawDomBlur * 0.75 + acuityBlurNonDom * 0.25
        : rawDomBlur;
    const mlnUserScale = s.mlnScale ?? 1.0;

    // Calibrated MLN (2.5 Hz relaxed, ~1.125 Hz calmly focused) + Alexander's law directional gaze asymmetry:
    // Closed eyelids behave like open + Focused (unaffected by monocular occlusion or gaze pan).
    const domSign = domIsOS ? -1 : 1;
    const isClosed = Boolean(state.eyesClosed);
    const effOccl = isClosed ? 0 : (state.occlusionLevel || 0);
    const effFocus = isClosed ? 1.0 : (state.focusStrength || 0);
    const beatDir =
      effOccl > 0.08
        ? (state.occlOD || 0) > (state.occlOS || 0)
          ? -1
          : 1
        : domSign;
    const gazeSpike = isClosed ? 0 : Math.min(1.0, (state.gazeVel || 0) * 1.10);
    const fastPanSpike = isClosed ? 0 : Math.min(1.0, Math.max(0, beatDir * (state.gazeVelX || 0)) * 1.15);

    const isNormal = Boolean(state.compareNormal);
    const beatIdx = Math.floor(mlnElapsed * TARGET_MLN_FREQ_HZ);
    const freqScale = isNormal
      ? 1.0
      : computeMlnFreqScale(effFocus, state.fatigue || 0, effOccl, fastPanSpike, beatIdx);
    mlnElapsed += dt * freqScale;

    const wave = sampleLoopingWaveform(waveformData, elapsed, 1.0);
    const decompBoost = 1.0 + 0.25 * computeDecompensation(state.fatigue || 0);
    const mlnScale =
      isNormal || mlnUserScale <= 0.005
        ? 0
        : THREE.MathUtils.clamp(mlnUserScale * decompBoost, 0, 1.35);
    const mln =
      isNormal || mlnUserScale <= 0.005
        ? { dxDeg: 0, dyDeg: 0, velDegS: 0 }
        : computeMlnAngleDeg(
            wave,
            mlnElapsed,
            TARGET_MLN_FREQ_HZ,
            effOccl,
            mlnScale,
            gazeSpike,
            effFocus,
            beatDir,
            fastPanSpike,
          );
    let effVelDegS = mln.velDegS * freqScale;

    // Continuous ~3.8 Hz infantile horizontal pendular/jerk nystagmus for ocular albinism (independent of MLN)
    if (!isNormal && albinism > 0.01) {
      const albAmp = albinism * 1.45 * (1.0 - 0.30 * (state.focusStrength || 0)) * (1.0 - 0.65 * (state.eyelidClose || 0));
      const albOmega = 2.0 * Math.PI * 3.8;
      const albPhase = elapsed * albOmega;
      mln.dxDeg += albAmp * (Math.sin(albPhase) + 0.22 * Math.sin(2.0 * albPhase + 0.4));
      effVelDegS += albAmp * albOmega * (Math.cos(albPhase) + 0.44 * Math.cos(2.0 * albPhase + 0.4));
    }

    savedPos.copy(odCamera.position);
    savedQuat.copy(odCamera.quaternion);
    rightVec.set(1, 0, 0).applyQuaternion(savedQuat);

    mlnEuler.set(
      THREE.MathUtils.degToRad(mln.dyDeg),
      THREE.MathUtils.degToRad(-mln.dxDeg),
      0,
      'YXZ',
    );
    mlnQuat.setFromEuler(mlnEuler);

    // Refresh 2048 shadow map every 2 frames
    if (shadowFrame % 2 === 0) {
      renderer.shadowMap.needsUpdate = true;
    }
    shadowFrame += 1;

    odCamera.position.copy(savedPos).addScaledVector(rightVec, isNormal ? 0 : EYE_HALF_IPD_M * domSign);
    odCamera.quaternion.copy(savedQuat).multiply(mlnQuat);
    odCamera.updateMatrixWorld(true);

    const prevTarget = renderer.getRenderTarget();

    renderer.setRenderTarget(rtOD);
    renderer.clear();
    renderer.render(activeScene, odCamera);
    renderer.shadowMap.needsUpdate = false;

    // Keep physiological vergence smoothly tracked down to 6 cm (no 22 cm wall that flips OS to the right!)
    const targetVerg = 1.0 / THREE.MathUtils.clamp(state.focusDistM || 3.8, 0.06, 20.0);
    smoothConvVergence += (targetVerg - smoothConvVergence) * (1 - Math.exp(-8.5 * Math.min(dt || 0, 0.1)));

    // Render quarter-res stereo 2nd camera ONLY when dominant eye is genuinely covered by an obstacle while non-dom is open
    // (keeps workbook reading & held-item inspection at 100% single-pass 60 FPS with OS strictly left!)
    const occlDom = domIsOS ? (state.occlOS || 0) : (state.occlOD || 0);
    const occlNonDom = domIsOS ? (state.occlOD || 0) : (state.occlOS || 0);
    const domCoveredByObstacle = !state.holding && occlDom > 0.45 && occlNonDom < 0.55;
    const renderNonDom = !isNormal && (state.eyelidClose || 0) < 0.995 && hasDiplopia && domCoveredByObstacle;
    if (renderNonDom) {
      const convYaw = Math.atan((EYE_HALF_IPD_M * 2.0) * smoothConvVergence) * -domSign;
      nonDomEuler.set(
        THREE.MathUtils.degToRad(-dipDeg.dyDeg),
        convYaw + THREE.MathUtils.degToRad(dipDeg.dxDeg),
        0,
        'YXZ',
      );
      nonDomQuat.setFromEuler(nonDomEuler);
      nonDomCamera.position.copy(savedPos).addScaledVector(rightVec, -EYE_HALF_IPD_M * domSign);
      nonDomCamera.quaternion.copy(odCamera.quaternion).multiply(nonDomQuat);
      nonDomCamera.updateMatrixWorld(true);

      renderer.setRenderTarget(rtNonDom);
      renderer.clear();
      renderer.render(activeScene, nonDomCamera);
    }

    // Skip quarter-res blur passes only when no blur-, boundary-, diplopia-, or phosphene-edge consumer reads tBlurOD
    const needBlur =
      !isNormal &&
      (state.eyelidClose || 0) < 0.995 &&
      (lensProfileCode > 0 ||
        hasDiplopia ||
        glaucoma > 0.01 ||
        amd > 0.01 ||
        cataract > 0.01 ||
        albinism > 0.01 ||
        diabeticRetinopathy > 0.01 ||
        retinitisPigmentosa > 0.01 ||
        (s.phosphenes || 0) > 0.005 ||
        myopiaD > 0.1 ||
        presbyopiaD > 0.1 ||
        astigmatismD > 0.1 ||
        lensCylD > 0.1 ||
        (state.ambientLight ?? 1.0) < 0.25 ||
        Math.max(acuityBlurDom, acuityBlurNonDom) > 0.001);
    if (needBlur) {
      blurUniforms.tSource.value = rtOD.texture;
      blurUniforms.uStep.value = blurStepH;
      renderer.setRenderTarget(rtBlurH);
      renderer.render(blurScene, quadCamera);

      blurUniforms.tSource.value = rtBlurH.texture;
      blurUniforms.uStep.value = blurStepV;
      renderer.setRenderTarget(rtBlurV);
      renderer.render(blurScene, quadCamera);
    }

    odCamera.position.copy(savedPos);
    odCamera.quaternion.copy(savedQuat);
    odCamera.updateMatrixWorld(true);

    uniforms.uTime.value = elapsed;
    uniforms.uHasNonDomRT.value = renderNonDom ? 1.0 : 0.0;
    uniforms.uGlassesOn.value = state.glassesOn ? 1.0 : 0.0;
    uniforms.uGlassesSlide.value = state.glassesSlide || 0.0;
    uniforms.uGlassesBounce.value = state.glassesBounce || 0.0;
    uniforms.uSquint.value = state.squint || 0.0;
    uniforms.uEyelidClose.value = state.eyelidClose || 0.0;
    uniforms.uEyelidLight.value = state.eyelidLight ?? 0.35;
    uniforms.uAmbientLight.value = state.ambientLight ?? 1.0;
    uniforms.uFatigue.value = state.fatigue || 0.0;
    uniforms.uOcclOD.value = domIsOS ? (state.occlOS || 0.0) : (state.occlOD || 0.0);
    uniforms.uOcclNonDom.value = domIsOS ? (state.occlOD || 0.0) : (state.occlOS || 0.0);
    uniforms.uFocusEffort.value = state.focusStrength || 0.0;
    uniforms.uCompareNormal.value = isNormal ? 1.0 : 0.0;

    // Asymmetric retinal adaptation: fast cone light adaptation (~1.2s) vs slow rod dark adaptation (~13s, slower in RP)
    const targetExposure = computeAdaptedExposure(state.ambientLight ?? 1.0);
    if (isNormal) {
      adaptedExposure = targetExposure;
    } else {
      const stepDt = Math.min(dt || 0, 0.1);
      const isDarkening = targetExposure > adaptedExposure;
      const adaptRate = isDarkening ? 0.075 / (1.0 + retinitisPigmentosa * 1.8) : 0.85;
      adaptedExposure += (targetExposure - adaptedExposure) * (1 - Math.exp(-adaptRate * stepDt));
    }
    uniforms.uExposure.value = (renderer.toneMappingExposure || 1.0) * adaptedExposure;
    uniforms.uMlnOffsetUV.value.set(mln.dxDeg / 62.0, mln.dyDeg / 62.0);
    uniforms.uMlnVelUV.value = THREE.MathUtils.clamp(Math.abs(effVelDegS) / 1350.0, 0.0, 0.011);
    uniforms.uEyeOffset.value.set(
      -Math.tan(state.eyeYaw || 0) / (2.0 * TAN_HALF_Y),
      Math.tan(state.eyePitch || 0) / (2.0 * TAN_HALF_Y),
    );

    const isIol = lensProfile === 'pseudophakic_iol';
    const iol = isIol ? resolveIolGlassesOptics(s, state.glassesSlot, state.glassesOn) : null;
    const activeLensPowerD = isIol ? iol.lensPowerD : (s.lensPowerD ?? 13.0);
    const activeLensCylD = isIol ? iol.lensCylD : lensCylD;
    uniforms.uLensProfile.value = lensProfileCode;
    uniforms.uFrameShape.value = FRAME_SHAPE_MAP[s.frameShape] ?? 0;
    uniforms.uFrameColor.value = FRAME_COLOR_MAP[s.frameColor] ?? 0;
    uniforms.uLensPowerD.value = activeLensPowerD;
    uniforms.uEffLensPowerD.value = computeEffectiveLensPower(activeLensPowerD, state.glassesSlide || 0);
    uniforms.uNearAddD.value = s.nearAddD ?? 4.0;
    uniforms.uLensCylD.value = activeLensCylD;
    uniforms.uLensAxisRad.value = THREE.MathUtils.degToRad(s.lensAxisDeg ?? 90);
    uniforms.uMyopiaD.value = myopiaD;
    uniforms.uPresbyopiaD.value = presbyopiaD;
    uniforms.uAstigmatismD.value = astigmatismD;
    uniforms.uAstigmatismAxisRad.value = THREE.MathUtils.degToRad(s.astigmatismAxisDeg ?? 90);
    uniforms.uDomIsOS.value = domIsOS ? 1.0 : 0.0;
    uniforms.uAcuityBlurDom.value = acuityBlurDom;
    uniforms.uAcuityBlurNonDom.value = acuityBlurNonDom;
    uniforms.uDiplopiaTan.value.set(
      Math.tan(THREE.MathUtils.degToRad(dipDeg.dxDeg)),
      Math.tan(THREE.MathUtils.degToRad(dipDeg.dyDeg)),
    );
    uniforms.uPhospheneScale.value = s.phosphenes ?? 1.0;
    uniforms.uFloaterScale.value = s.floaters ?? 1.0;
    uniforms.uGlaucoma.value = glaucoma;
    uniforms.uAmd.value = amd;
    uniforms.uAlbinism.value = albinism;
    uniforms.uCataract.value = cataract;
    uniforms.uDiabeticRetinopathy.value = diabeticRetinopathy;
    uniforms.uRetinitisPigmentosa.value = retinitisPigmentosa;
    uniforms.uCvdType.value = CVD_TYPE_MAP[s.cvdType] ?? 0;
    uniforms.uCvdSeverity.value = s.cvdSeverity || 0.0;
    uniforms.uOsExtraMyopiaD.value = isIol ? iol.osExtraMyopiaD : 0.0;
    uniforms.uIolHalo.value = isIol ? 1.0 : 0.0;

    renderer.setRenderTarget(prevTarget);
    renderer.render(quadScene, quadCamera);
  }

  function setScene(nextScene, farClip = FAR_CLIP) {
    if (!nextScene) return;
    activeScene = nextScene;
    const nextFar = Number.isFinite(farClip) && farClip > NEAR_CLIP ? farClip : FAR_CLIP;
    if (odCamera.far !== nextFar) {
      odCamera.far = nextFar;
      odCamera.updateProjectionMatrix();
      nonDomCamera.far = nextFar;
      nonDomCamera.updateProjectionMatrix();
      uniforms.uFar.value = nextFar;
    }
    shadowFrame = 0;
    renderer.shadowMap.needsUpdate = true;
  }

  function setQuality(presetId) {
    const cap = QUALITY_PRESETS[presetId]?.dprCap ?? 1.75;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    resize(window.innerWidth, window.innerHeight);
  }

  function resize(w, h) {
    const dpr = renderer.getPixelRatio();
    const bw = Math.max(1, Math.floor(w * dpr));
    const bh = Math.max(1, Math.floor(h * dpr));
    const newAspect = bw / bh;

    odCamera.aspect = newAspect;
    odCamera.updateProjectionMatrix();
    nonDomCamera.aspect = newAspect;
    nonDomCamera.updateProjectionMatrix();

    rtOD.setSize(bw, bh);
    const nextBlurW = Math.max(1, Math.floor(bw * 0.25));
    const nextBlurH = Math.max(1, Math.floor(bh * 0.25));
    rtBlurH.setSize(nextBlurW, nextBlurH);
    rtBlurV.setSize(nextBlurW, nextBlurH);
    rtNonDom.setSize(nextBlurW, nextBlurH);
    blurStepH.set(blurStepUV / newAspect, 0);
    uniforms.uAspect.value = newAspect;
    uniforms.uResolution.value.set(bw, bh);
  }

  function dispose() {
    rtOD.dispose();
    rtBlurH.dispose();
    rtBlurV.dispose();
    rtNonDom.dispose();
    quadGeo.dispose();
    blurMat.dispose();
    quadMaterial.dispose();
  }

  return { odCamera, render, resize, setQuality, setScene, dispose };
}
