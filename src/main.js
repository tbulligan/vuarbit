import * as THREE from 'three';
import { createSimState, normalizeLanguage, toggleCompareNormal, toggleGlasses, updateSimState } from './state.js';
import {
  QUALITY_PRESETS,
  TIME_OF_DAY_PRESETS,
  applyPersona,
  getSceneById,
  updateVisualSetting,
} from './personas.js';
import { createControls } from './controls.js';
import { createOpticsRenderer } from './optics.js';
import { createTinnitusAudio } from './audio.js';
import { createHud } from './hud.js';
import { createSettingsDrawer } from './settings.js';

// Explicit allow-list dynamic scene loaders (ES import() natively caches resolved modules)
const SCENE_LOADERS = {
  classroom: () => import('./scene.js').then((m) => m.createClassroomScene),
  exam_room: () => import('./scene/exam_room.js').then((m) => m.createExamRoomScene),
  car_passenger: () => import('./scene/car_passenger.js').then((m) => m.createCarPassengerScene),
};

async function loadSceneFactory(sceneId) {
  if (!Object.hasOwn(SCENE_LOADERS, sceneId)) return null;
  return SCENE_LOADERS[sceneId]();
}

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

  const state = createSimState();
  const initDprCap = QUALITY_PRESETS[state.qualityPreset]?.dprCap ?? 1.75;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, initDprCap));
  renderer.setSize(window.innerWidth, window.innerHeight);

  let waveformData;
  let initialSceneFactory;
  try {
    [waveformData, initialSceneFactory] = await Promise.all([
      loadWaveform(),
      loadSceneFactory(state.sceneId),
    ]);
  } catch {
    renderer.dispose();
    return;
  }
  if (!initialSceneFactory) {
    renderer.dispose();
    return;
  }

  document.documentElement.lang = state.language;
  let sceneApi = initialSceneFactory(renderer);
  const optics = createOpticsRenderer(renderer, sceneApi.scene, waveformData);
  const controls = createControls(canvas, state, sceneApi);
  const audio = createTinnitusAudio();
  const hud = createHud(hudRoot, state, {
    onSettingsToggle() {
      state.settingsOpen = !state.settingsOpen;
      if (state.settingsOpen) {
        document.exitPointerLock?.();
        state.glassesPinned = false;
      }
    },
    onCompareToggle() {
      toggleCompareNormal(state);
    },
    onGlassesToggle() {
      toggleGlasses(state);
    },
    onSitToggle() {
      controls.toggleSeatMode();
    },
  });

  let sceneLoadSeq = 0;

  async function switchScene(nextSceneId) {
    if (!getSceneById(nextSceneId) || !Object.hasOwn(SCENE_LOADERS, nextSceneId) || nextSceneId === state.sceneId) {
      return;
    }
    const loadToken = ++sceneLoadSeq;
    state.sceneLoading = true;
    try {
      const factory = await loadSceneFactory(nextSceneId);
      if (!factory || loadToken !== sceneLoadSeq || nextSceneId === state.sceneId) {
        return;
      }
      const prevSceneApi = sceneApi;
      const nextSceneApi = factory(renderer);
      sceneApi = nextSceneApi;
      state.sceneId = nextSceneId;
      state.occlOD = 0;
      state.occlOS = 0;
      state.occlusionLevel = 0;
      state.squint = 0;
      controls.setScene(nextSceneApi);
      optics.setScene(nextSceneApi.scene, nextSceneApi.farClip);
      prevSceneApi.dispose?.();
    } catch {
      // Keep active scene running if dynamic chunk fetch fails
    } finally {
      if (loadToken === sceneLoadSeq) {
        state.sceneLoading = false;
      }
    }
  }

  const onResize = () => {
    const dprCap = QUALITY_PRESETS[state.qualityPreset]?.dprCap ?? 1.75;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
    renderer.setSize(window.innerWidth, window.innerHeight);
    optics.resize(window.innerWidth, window.innerHeight);
  };

  const settings = createSettingsDrawer(hudRoot, state, {
    onSceneChange(sceneId) {
      switchScene(sceneId);
    },
    onLanguageChange(lang) {
      state.language = normalizeLanguage(lang);
      document.documentElement.lang = state.language;
    },
    onSelectPersona(id) {
      applyPersona(state, id);
    },
    onSettingChange(key, value) {
      updateVisualSetting(state, key, value);
    },
    onReset() {
      applyPersona(state, 'vuarbit_frut');
    },
    onCompareToggle() {
      toggleCompareNormal(state);
    },
    onGlassesToggle() {
      toggleGlasses(state);
    },
    onTimeOfDayChange(todId) {
      if (!TIME_OF_DAY_PRESETS[todId]) return;
      state.timeOfDay = todId;
    },
    onLightsToggle() {
      state.lightsOn = state.lightsOn === false;
    },
    onGlareLightToggle() {
      state.glareLightOn = state.glareLightOn === false;
    },
    onQualityChange(presetId) {
      if (!QUALITY_PRESETS[presetId]) return;
      state.qualityPreset = presetId;
      optics.setQuality(presetId);
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
    sceneApi.dispose?.();
    audio.dispose();
    settings.dispose();
    hud.dispose();
    renderer.dispose();
  });
}

init();
