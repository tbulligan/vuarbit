import * as THREE from 'three';
import { createSimState, updateSimState } from './state.js';
import { QUALITY_PRESETS, applyPersona, updateVisualSetting } from './personas.js';
import { createClassroomScene } from './scene.js';
import { createControls } from './controls.js';
import { createOpticsRenderer } from './optics.js';
import { createTinnitusAudio } from './audio.js';
import { createHud } from './hud.js';
import { createSettingsDrawer } from './settings.js';

// shortcut: 180-sample synthetic sawtooth fallback when JSON unavailable, upgrade by bundling default waveform
function buildFallbackWaveform() {
  const rate = 60;
  const n = 180;
  const samplesX = [];
  const samplesY = [];
  for (let i = 0; i < n; i++) {
    const phase = ((i / rate) * 3.4) % 1.0;
    const saw = (phase < 0.8 ? phase / 0.8 : 1.0 - (phase - 0.8) / 0.2) * 2.4 - 1.2;
    samplesX.push(saw);
    samplesY.push(saw * 0.14);
  }
  return {
    waveform: {
      sample_rate_hz: rate,
      cycle_freq_hz: 3.4,
      amplitude_deg: 2.4,
      samples_x_deg: samplesX,
      samples_y_deg: samplesY,
    },
  };
}

async function loadWaveform() {
  try {
    const res = await fetch('./data/nystagmus_waveform.json');
    if (!res.ok) return buildFallbackWaveform();
    const data = await res.json();
    if (!data?.waveform?.samples_x_deg?.length) return buildFallbackWaveform();
    return data;
  } catch {
    return buildFallbackWaveform();
  }
}

async function init() {
  const canvas = document.getElementById('sim-canvas');
  const hudRoot = document.getElementById('hud-root');
  if (!canvas || !hudRoot) return;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
  });
  // High-DPI realism rendering (1.75 DPR cap + 4x MSAA on OD render target eliminates jagged edges)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const waveformData = await loadWaveform();
  const state = createSimState();
  const sceneApi = createClassroomScene();
  const optics = createOpticsRenderer(renderer, sceneApi.scene, waveformData);
  const controls = createControls(canvas, state, sceneApi);
  const audio = createTinnitusAudio();
  const hud = createHud(hudRoot, state);

  const onResize = () => {
    const dprCap = QUALITY_PRESETS[state.qualityPreset]?.dprCap ?? 1.75;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    renderer.setSize(window.innerWidth, window.innerHeight);
    optics.resize(window.innerWidth, window.innerHeight);
  };

  const settings = createSettingsDrawer(hudRoot, state, {
    onSelectPersona(id) {
      applyPersona(state, id);
    },
    onSettingChange(key, value) {
      updateVisualSetting(state, key, value);
    },
    onReset() {
      applyPersona(state, 'vuarbit_1994');
    },
    onQualityChange(presetId) {
      if (!QUALITY_PRESETS[presetId]) return;
      state.qualityPreset = presetId;
      if (optics.setQuality) {
        optics.setQuality(presetId);
      } else {
        onResize();
      }
    },
    onClose() {
      state.settingsOpen = false;
    },
  });

  const startAudioOnce = () => audio.start();
  window.addEventListener('pointerdown', startAudioOnce, { once: true });
  window.addEventListener('keydown', startAudioOnce, { once: true });

  window.addEventListener('resize', onResize);

  let lastTime = performance.now();
  let rafId = 0;

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;

    controls.update(dt, optics.odCamera);
    sceneApi.updateScene(dt, state, optics.odCamera);
    updateSimState(state, dt);
    optics.render(dt, state);
    audio.update(state);
    hud.update(state);
    settings.sync(state);
  }

  rafId = requestAnimationFrame(frame);

  window.addEventListener('beforeunload', () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', onResize);
    controls.dispose();
    optics.dispose();
    audio.dispose();
    settings.dispose();
    hud.dispose();
    renderer.dispose();
  });
}

init();
