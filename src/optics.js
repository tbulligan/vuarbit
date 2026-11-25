import * as THREE from 'three';
import { computeMlnAngleDeg } from './state.js';
import visionFrag from './shaders/vision.frag.glsl?raw';

const EYE_HALF_IPD_M = 0.029;
const NEAR_CLIP = 0.02;
const FAR_CLIP = 30.0;
const TARGET_MLN_FREQ_HZ = 5.5; // 5-6 beats/sec clinical MLN beat rate

const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

function createEyeRenderTarget(w, h, samples = 0) {
  const depthTexture = new THREE.DepthTexture(w, h);
  depthTexture.type = THREE.UnsignedIntType;
  depthTexture.format = THREE.DepthFormat;

  return new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    depthTexture,
    samples,
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
 * Dual-eye OD (full-res) / OS (half-res) WebGL2 optics pipeline with 5.5 Hz MLN oscillopsia,
 * per-pixel diplopia, and straight-cut executive aphakic bifocal.
 */
export function createOpticsRenderer(renderer, scene, waveformData) {
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  const initW = Math.max(1, size.x);
  const initH = Math.max(1, size.y);
  const aspect = initW / initH;

  const odCamera = new THREE.PerspectiveCamera(62, aspect, NEAR_CLIP, FAR_CLIP);
  const osCamera = new THREE.PerspectiveCamera(62, aspect, NEAR_CLIP, FAR_CLIP);

  // Realism mode: 4x WebGL2 MSAA on dominant OD target; 0.75x target on amblyopic OS (VOS 0.15)
  const rtOD = createEyeRenderTarget(initW, initH, 4);
  const rtOS = createEyeRenderTarget(Math.max(1, Math.floor(initW * 0.75)), Math.max(1, Math.floor(initH * 0.75)), 0);

  const baseFreq = waveformData?.phases?.mln_occluded?.dominant_freq_hz || waveformData?.waveform?.cycle_freq_hz || 0.85;
  const waveSpeedScale = THREE.MathUtils.clamp(TARGET_MLN_FREQ_HZ / Math.max(0.25, baseFreq), 1.0, 9.0);

  const uniforms = {
    tColorOD: { value: rtOD.texture },
    tDepthOD: { value: rtOD.depthTexture },
    tColorOS: { value: rtOS.texture },
    tDepthOS: { value: rtOS.depthTexture },
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
    uResolution: { value: new THREE.Vector2(initW, initH) },
  };

  const quadMaterial = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: visionFrag,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });

  const quadScene = new THREE.Scene();
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  quadScene.add(new THREE.Mesh(quadGeo, quadMaterial));

  const savedPos = new THREE.Vector3();
  const savedQuat = new THREE.Quaternion();
  const rightVec = new THREE.Vector3();
  const mlnEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const mlnQuat = new THREE.Quaternion();

  let elapsed = 0;
  let shadowFrame = 0;

  function render(dt, state) {
    elapsed += dt;

    // Instantaneous gaze-shift nystagmus: prominent when turning head/mouse (strongest unfocused), stops immediately on 0 speed
    const gazeSpike = Math.min(1.0, (state.gazeVel || 0) * 1.10);

    const isNormal = Boolean(state.compareNormal);
    const wave = sampleLoopingWaveform(waveformData, elapsed, waveSpeedScale);
    const mlnScale = isNormal ? 0 : Math.min(1.25, (state.mlnIntensity || 0) + gazeSpike * 0.55);
    const mln = isNormal
      ? { dxDeg: 0, dyDeg: 0, velDegS: 0 }
      : computeMlnAngleDeg(
          wave,
          elapsed,
          TARGET_MLN_FREQ_HZ,
          state.occlusionLevel || 0,
          mlnScale,
          gazeSpike,
          state.focusStrength || 0,
        );

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

    // Refresh 2048 shadow map every 2 frames before OD pass only (reused by OS)
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

    // Skip OS render pass completely when eyelids are fully closed or in normal comparison mode
    const needOS = !isNormal && (state.eyelidClose || 0) < 0.995;
    if (needOS) {
      osCamera.position.copy(savedPos).addScaledVector(rightVec, -EYE_HALF_IPD_M);
      osCamera.quaternion.copy(odCamera.quaternion);
      osCamera.updateMatrixWorld(true);

      renderer.setRenderTarget(rtOS);
      renderer.clear();
      renderer.render(scene, osCamera);
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
    uniforms.uMlnOffsetUV.value.set(mln.dxDeg / 62.0, mln.dyDeg / 62.0);
    uniforms.uMlnVelUV.value = THREE.MathUtils.clamp(Math.abs(mln.velDegS) / 900.0, 0.0, 0.015);

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
    osCamera.aspect = newAspect;
    osCamera.updateProjectionMatrix();

    rtOD.setSize(bw, bh);
    rtOS.setSize(Math.max(1, Math.floor(bw * 0.75)), Math.max(1, Math.floor(bh * 0.75)));
    uniforms.uAspect.value = newAspect;
    uniforms.uResolution.value.set(bw, bh);
  }

  function dispose() {
    rtOD.dispose();
    rtOS.dispose();
    quadGeo.dispose();
    quadMaterial.dispose();
  }

  return { odCamera, render, resize, dispose };
}
