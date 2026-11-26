import * as THREE from 'three';
import { computeMlnAngleDeg, computeMlnFreqScale } from './state.js';
import { QUALITY_PRESETS, createDefaultVisualSettings, computeAcuityBlurUV } from './personas.js';
import visionFrag from './shaders/vision.frag.glsl?raw';

const EYE_HALF_IPD_M = 0.029;
const NEAR_CLIP = 0.02;
const FAR_CLIP = 30.0;
const OD_FOV_DEG = 62;
const TARGET_MLN_FREQ_HZ = 5.5; // 5-6 beats/sec clinical MLN beat rate
const CVD_TYPE_MAP = { none: 0, deutan: 1, protan: 2, tritan: 3 };
const LENS_PROFILE_MAP = { none: 0, aphakic_bifocal: 1, single_vision: 2, bifocal: 3, progressive: 4 };
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
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  const initW = Math.max(1, size.x);
  const initH = Math.max(1, size.y);
  const aspect = initW / initH;

  const odCamera = new THREE.PerspectiveCamera(OD_FOV_DEG, aspect, NEAR_CLIP, FAR_CLIP);

  // Half-float linear HDR targets (with safe 8-bit fallback) so optical defocus/HOAs run in linear light before ACES + sRGB
  const useHalfFloat =
    Boolean(renderer.capabilities?.isWebGL2) &&
    Boolean(renderer.extensions?.has('EXT_color_buffer_float'));
  const rtType = useHalfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;

  // 4x WebGL2 MSAA on dominant OD target + quarter-res separable blur targets for smooth +13 D defocus
  const rtOD = createEyeRenderTarget(initW, initH, 4, rtType);
  const blurW = Math.max(1, Math.floor(initW * 0.25));
  const blurH = Math.max(1, Math.floor(initH * 0.25));
  const rtBlurH = createBlurRenderTarget(blurW, blurH, rtType);
  const rtBlurV = createBlurRenderTarget(blurW, blurH, rtType);

  const baseFreq = waveformData?.phases?.mln_occluded?.dominant_freq_hz || waveformData?.waveform?.cycle_freq_hz || 0.85;
  const waveSpeedScale = THREE.MathUtils.clamp(TARGET_MLN_FREQ_HZ / Math.max(0.25, baseFreq), 1.0, 9.0);

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
    uNear: { value: NEAR_CLIP },
    uFar: { value: FAR_CLIP },
    uAspect: { value: aspect },
    uTime: { value: 0 },
    uGlassesOn: { value: 1 },
    uEyelidClose: { value: 0 },
    uEyelidLight: { value: 0.35 },
    uFatigue: { value: 0.08 },
    uOcclOD: { value: 0 },
    uFocusEffort: { value: 0 },
    uCompareNormal: { value: 0 },
    uMlnOffsetUV: { value: new THREE.Vector2(0, 0) },
    uMlnVelUV: { value: 0 },
    uExposure: { value: renderer.toneMappingExposure || 1.0 },
    uResolution: { value: new THREE.Vector2(initW, initH) },
    uLensProfile: { value: 1.0 },
    uLensPowerD: { value: 13.0 },
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

  let elapsed = 0;
  let mlnElapsed = 0;
  let shadowFrame = 0;

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
    const hasDiplopia = Math.abs(s.diplopiaH ?? -1.53) >= 0.01 || Math.abs(s.diplopiaV ?? 0.31) >= 0.01;
    // In single-vision / no-lens mode without diplopia, blend non-dominant acuity via binocular summation so OS acuity stays active
    const acuityBlurDom =
      lensProfile !== 'aphakic_bifocal' && !hasDiplopia
        ? rawDomBlur * 0.75 + acuityBlurNonDom * 0.25
        : rawDomBlur;
    const mlnUserScale = s.mlnScale ?? 1.0;

    // Instantaneous gaze-shift nystagmus: prominent when turning head/mouse (strongest unfocused), stops immediately on 0 speed
    const gazeSpike = Math.min(1.0, (state.gazeVel || 0) * 1.10);

    const isNormal = Boolean(state.compareNormal);
    const freqScale = isNormal
      ? 1.0
      : computeMlnFreqScale(state.focusStrength || 0, state.fatigue || 0, state.occlusionLevel || 0, gazeSpike);
    mlnElapsed += dt * freqScale;

    const wave = sampleLoopingWaveform(waveformData, mlnElapsed, waveSpeedScale);
    const mlnBase = state.mlnOnlyIntensity ?? state.mlnIntensity ?? 0;
    const mlnScale =
      isNormal || mlnUserScale <= 0.005
        ? 0
        : Math.min(1.25, mlnBase + gazeSpike * 0.55 * mlnUserScale);
    const mln =
      isNormal || mlnUserScale <= 0.005
        ? { dxDeg: 0, dyDeg: 0, velDegS: 0 }
        : computeMlnAngleDeg(
            wave,
            mlnElapsed,
            TARGET_MLN_FREQ_HZ,
            state.occlusionLevel || 0,
            mlnScale,
            gazeSpike * mlnUserScale,
            state.focusStrength || 0,
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

    odCamera.position.copy(savedPos).addScaledVector(rightVec, isNormal ? 0 : EYE_HALF_IPD_M * (domIsOS ? -1 : 1));
    odCamera.quaternion.copy(savedQuat).multiply(mlnQuat);
    odCamera.updateMatrixWorld(true);

    const prevTarget = renderer.getRenderTarget();

    renderer.setRenderTarget(rtOD);
    renderer.clear();
    renderer.render(scene, odCamera);
    renderer.shadowMap.needsUpdate = false;

    // Skip quarter-res blur passes when eyelids are closed, comparing normal, or no blur-using optics/pathology active
    const needBlur =
      !isNormal &&
      (state.eyelidClose || 0) < 0.995 &&
      (lensProfileCode > 0 ||
        glaucoma > 0.01 ||
        amd > 0.01 ||
        cataract > 0.01 ||
        albinism > 0.01 ||
        diabeticRetinopathy > 0.01 ||
        myopiaD > 0.1 ||
        presbyopiaD > 0.1 ||
        astigmatismD > 0.1 ||
        lensCylD > 0.1 ||
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
    uniforms.uGlassesOn.value = state.glassesOn ? 1.0 : 0.0;
    uniforms.uEyelidClose.value = state.eyelidClose || 0.0;
    uniforms.uEyelidLight.value = state.eyelidLight ?? 0.35;
    uniforms.uFatigue.value = state.fatigue || 0.0;
    uniforms.uOcclOD.value = domIsOS ? (state.occlOS || 0.0) : (state.occlOD || 0.0);
    uniforms.uFocusEffort.value = state.focusStrength || 0.0;
    uniforms.uCompareNormal.value = isNormal ? 1.0 : 0.0;
    uniforms.uExposure.value = renderer.toneMappingExposure || 1.0;
    uniforms.uMlnOffsetUV.value.set(mln.dxDeg / 62.0, mln.dyDeg / 62.0);
    uniforms.uMlnVelUV.value = THREE.MathUtils.clamp(Math.abs(effVelDegS) / 900.0, 0.0, 0.015);

    uniforms.uLensProfile.value = lensProfileCode;
    uniforms.uLensPowerD.value = s.lensPowerD ?? 13.0;
    uniforms.uNearAddD.value = s.nearAddD ?? 4.0;
    uniforms.uLensCylD.value = lensCylD;
    uniforms.uLensAxisRad.value = THREE.MathUtils.degToRad(s.lensAxisDeg ?? 90);
    uniforms.uMyopiaD.value = myopiaD;
    uniforms.uPresbyopiaD.value = presbyopiaD;
    uniforms.uAstigmatismD.value = astigmatismD;
    uniforms.uAstigmatismAxisRad.value = THREE.MathUtils.degToRad(s.astigmatismAxisDeg ?? 90);
    uniforms.uDomIsOS.value = domIsOS ? 1.0 : 0.0;
    uniforms.uAcuityBlurDom.value = acuityBlurDom;
    uniforms.uAcuityBlurNonDom.value = acuityBlurNonDom;
    uniforms.uDiplopiaTan.value.set(
      Math.tan(THREE.MathUtils.degToRad(s.diplopiaH ?? -1.53)),
      Math.tan(THREE.MathUtils.degToRad(s.diplopiaV ?? 0.31)),
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

    renderer.setRenderTarget(prevTarget);
    renderer.render(quadScene, quadCamera);
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

    rtOD.setSize(bw, bh);
    const nextBlurW = Math.max(1, Math.floor(bw * 0.25));
    const nextBlurH = Math.max(1, Math.floor(bh * 0.25));
    rtBlurH.setSize(nextBlurW, nextBlurH);
    rtBlurV.setSize(nextBlurW, nextBlurH);
    blurStepH.set(blurStepUV / newAspect, 0);
    uniforms.uAspect.value = newAspect;
    uniforms.uResolution.value.set(bw, bh);
  }

  function dispose() {
    rtOD.dispose();
    rtBlurH.dispose();
    rtBlurV.dispose();
    quadGeo.dispose();
    blurMat.dispose();
    quadMaterial.dispose();
  }

  return { odCamera, render, resize, setQuality, dispose };
}
