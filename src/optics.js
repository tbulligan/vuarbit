import * as THREE from 'three';
import { computeDiplopiaOffsetDeg } from './state.js';
import visionFrag from './shaders/vision.frag.glsl?raw';

const EYE_HALF_IPD_M = 0.029;
const NEAR_CLIP = 0.04;
const FAR_CLIP = 30.0;

const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

function createEyeRenderTarget(w, h) {
  const depthTexture = new THREE.DepthTexture(w, h);
  depthTexture.type = THREE.UnsignedIntType;
  depthTexture.format = THREE.DepthFormat;

  return new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    depthTexture,
  });
}

function sampleLoopingWaveform(waveform, timeSec) {
  const wf = waveform?.waveform;
  const xs = wf?.samples_x_deg;
  const ys = wf?.samples_y_deg;
  const rate = wf?.sample_rate_hz || 60;
  if (!xs || !ys || xs.length === 0) {
    // Fallback physiological sawtooth jerk nystagmus (~3.5 Hz)
    const phase = (timeSec * 3.5) % 1.0;
    const jerkX = (phase < 0.8 ? phase / 0.8 : 1.0 - (phase - 0.8) / 0.2) * 2.2 - 1.1;
    return { dxDeg: jerkX, dyDeg: jerkX * 0.15 };
  }

  const n = xs.length;
  const fIdx = (((timeSec * rate) % n) + n) % n;
  const i0 = Math.floor(fIdx);
  const i1 = (i0 + 1) % n;
  const t = fIdx - i0;
  return {
    dxDeg: xs[i0] + (xs[i1] - xs[i0]) * t,
    dyDeg: ys[i0] + (ys[i1] - ys[i0]) * t,
  };
}

/**
 * Dual-eye OD/OS WebGL2 optics pipeline with MLN waveform oscillopsia and aphakic bifocal shader.
 */
export function createOpticsRenderer(renderer, scene, waveformData) {
  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  const initW = Math.max(1, size.x);
  const initH = Math.max(1, size.y);
  const aspect = initW / initH;

  const odCamera = new THREE.PerspectiveCamera(62, aspect, NEAR_CLIP, FAR_CLIP);
  const osCamera = new THREE.PerspectiveCamera(62, aspect, NEAR_CLIP, FAR_CLIP);

  let rtOD = createEyeRenderTarget(initW, initH);
  let rtOS = createEyeRenderTarget(initW, initH);

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
    uFatigue: { value: 0.1 },
    uOcclusion: { value: 0 },
    uMlnIntensity: { value: 0 },
    uDiplopiaDeg: { value: new THREE.Vector2(-0.95, 0.29) },
    uMlnOffsetUV: { value: new THREE.Vector2(0, 0) },
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
  const forwardVec = new THREE.Vector3();
  const convergeTarget = new THREE.Vector3();
  const mlnEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const mlnQuat = new THREE.Quaternion();

  let elapsed = 0;
  let gazeSpike = 0;

  function render(dt, state) {
    elapsed += dt;

    // Velocity-coupled oscillopsia burst during rapid mouse turns
    const velDrive = Math.min(1.0, (state.gazeVel || 0) * 0.22);
    gazeSpike += (velDrive - gazeSpike) * Math.min(1, dt * 10);

    const wave = sampleLoopingWaveform(waveformData, elapsed);
    const mlnScale = Math.min(1.25, (state.mlnIntensity || 0) + gazeSpike * 0.65);
    const gazeRebound = gazeSpike * Math.sin(elapsed * 28.0) * 1.4;
    const mlnDegX = wave.dxDeg * mlnScale + gazeRebound;
    const mlnDegY = wave.dyDeg * mlnScale;

    // Preserve clean head-center pose for controls and scene raycasts
    savedPos.copy(odCamera.position);
    savedQuat.copy(odCamera.quaternion);

    rightVec.set(1, 0, 0).applyQuaternion(savedQuat);
    forwardVec.set(0, 0, -1).applyQuaternion(savedQuat);

    mlnEuler.set(
      THREE.MathUtils.degToRad(mlnDegY),
      THREE.MathUtils.degToRad(-mlnDegX),
      0,
      'YXZ',
    );
    mlnQuat.setFromEuler(mlnEuler);

    // OD eye (+0.029m right) with MLN oscillopsia perturbation
    odCamera.position.copy(savedPos).addScaledVector(rightVec, EYE_HALF_IPD_M);
    odCamera.quaternion.copy(savedQuat).multiply(mlnQuat);
    odCamera.updateMatrixWorld(true);

    // OS eye (-0.029m left), softly verged onto gaze distance + MLN perturbation
    const vergeDist = THREE.MathUtils.clamp(state.focusDistM || 3.8, 0.28, 8.0);
    convergeTarget.copy(savedPos).addScaledVector(forwardVec, vergeDist);
    osCamera.position.copy(savedPos).addScaledVector(rightVec, -EYE_HALF_IPD_M);
    osCamera.up.set(0, 1, 0).applyQuaternion(savedQuat);
    osCamera.lookAt(convergeTarget);
    osCamera.quaternion.multiply(mlnQuat);
    osCamera.updateMatrixWorld(true);

    const prevTarget = renderer.getRenderTarget();

    renderer.setRenderTarget(rtOD);
    renderer.clear();
    renderer.render(scene, odCamera);

    renderer.setRenderTarget(rtOS);
    renderer.clear();
    renderer.render(scene, osCamera);

    // Restore un-jittered head-center pose before next frame's controls/scene update
    odCamera.position.copy(savedPos);
    odCamera.quaternion.copy(savedQuat);
    odCamera.updateMatrixWorld(true);

    // Update shader uniforms and composite to screen
    const dip = computeDiplopiaOffsetDeg(state.focusDistM || 3.8);
    uniforms.uTime.value = elapsed;
    uniforms.uGlassesOn.value = state.glassesOn ? 1.0 : 0.0;
    uniforms.uEyelidClose.value = state.eyelidClose || 0.0;
    uniforms.uFatigue.value = state.fatigue || 0.0;
    uniforms.uOcclusion.value = state.occlusionLevel || 0.0;
    uniforms.uMlnIntensity.value = state.mlnIntensity || 0.0;
    uniforms.uDiplopiaDeg.value.set(dip.dxDeg, dip.dyDeg);
    uniforms.uMlnOffsetUV.value.set(mlnDegX / 62.0, mlnDegY / 62.0);

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
    rtOS.setSize(bw, bh);
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
