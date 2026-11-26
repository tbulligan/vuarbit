import * as THREE from 'three';
import { computeMlnAngleDeg, computeMlnFreqScale } from './state.js';
import visionFrag from './shaders/vision.frag.glsl?raw';

const EYE_HALF_IPD_M = 0.029;
const NEAR_CLIP = 0.02;
const FAR_CLIP = 30.0;
const OD_FOV_DEG = 62;
const TARGET_MLN_FREQ_HZ = 5.5; // 5-6 beats/sec clinical MLN beat rate

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

    // Instantaneous gaze-shift nystagmus: prominent when turning head/mouse (strongest unfocused), stops immediately on 0 speed
    const gazeSpike = Math.min(1.0, (state.gazeVel || 0) * 1.10);

    const isNormal = Boolean(state.compareNormal);
    const freqScale = isNormal
      ? 1.0
      : computeMlnFreqScale(state.focusStrength || 0, state.fatigue || 0, state.occlusionLevel || 0, gazeSpike);
    mlnElapsed += dt * freqScale;

    const wave = sampleLoopingWaveform(waveformData, mlnElapsed, waveSpeedScale);
    const mlnScale = isNormal ? 0 : Math.min(1.25, (state.mlnIntensity || 0) + gazeSpike * 0.55);
    const mln = isNormal
      ? { dxDeg: 0, dyDeg: 0, velDegS: 0 }
      : computeMlnAngleDeg(
          wave,
          mlnElapsed,
          TARGET_MLN_FREQ_HZ,
          state.occlusionLevel || 0,
          mlnScale,
          gazeSpike,
          state.focusStrength || 0,
        );
    const effVelDegS = mln.velDegS * freqScale;

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

    odCamera.position.copy(savedPos).addScaledVector(rightVec, isNormal ? 0 : EYE_HALF_IPD_M);
    odCamera.quaternion.copy(savedQuat).multiply(mlnQuat);
    odCamera.updateMatrixWorld(true);

    const prevTarget = renderer.getRenderTarget();

    renderer.setRenderTarget(rtOD);
    renderer.clear();
    renderer.render(scene, odCamera);
    renderer.shadowMap.needsUpdate = false;

    // Skip quarter-res blur passes when eyelids are fully closed or in normal comparison mode
    const needBlur = !isNormal && (state.eyelidClose || 0) < 0.995;
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
    uniforms.uOcclOD.value = state.occlOD || 0.0;
    uniforms.uFocusEffort.value = state.focusStrength || 0.0;
    uniforms.uCompareNormal.value = isNormal ? 1.0 : 0.0;
    uniforms.uExposure.value = renderer.toneMappingExposure || 1.0;
    uniforms.uMlnOffsetUV.value.set(mln.dxDeg / 62.0, mln.dyDeg / 62.0);
    uniforms.uMlnVelUV.value = THREE.MathUtils.clamp(Math.abs(effVelDegS) / 900.0, 0.0, 0.015);

    renderer.setRenderTarget(prevTarget);
    renderer.render(quadScene, quadCamera);
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

  return { odCamera, render, resize, dispose };
}
