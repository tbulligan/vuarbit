import * as THREE from 'three';
import {
  computeAutoDprCap,
  createSimState,
  normalizeLanguage,
  t,
  toggleCompareNormal,
  toggleGlasses,
  updateSimState,
} from './state.js';
import {
  TIME_OF_DAY_PRESETS,
  applyCustomProfile,
  applyPersona,
  decodeCustomProfileParams,
  encodeCustomProfileParams,
  getSceneById,
  sanitizeCustomName,
  sanitizeVisualSettings,
  updateVisualSetting,
} from './personas.js';

const CUSTOM_PROFILE_STORAGE_KEY = 'vuarbit.customProfile.v1';

function loadSavedCustomProfile() {
  try {
    const raw = window.localStorage?.getItem(CUSTOM_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.settings) return null;
    return {
      name: sanitizeCustomName(parsed.name),
      settings: sanitizeVisualSettings(parsed.settings),
      glassesOn: typeof parsed.glassesOn === 'boolean' ? parsed.glassesOn : true,
    };
  } catch {
    return null;
  }
}

function saveCustomProfileToStorage(profile) {
  try {
    window.localStorage?.setItem(CUSTOM_PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore storage quota or private-browsing blocks
  }
}

function clearUrlQuery() {
  if (!window.location.search) return;
  try {
    window.history?.replaceState?.(null, '', `${window.location.pathname}${window.location.hash || ''}`);
  } catch {
    // Ignore history restrictions on file:// or sandboxed frames
  }
}
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
  const urlCustom = decodeCustomProfileParams(window.location.search);
  if (urlCustom) {
    state.customProfile = {
      name: urlCustom.name,
      settings: urlCustom.settings,
      glassesOn: urlCustom.glassesOn,
    };
    applyCustomProfile(state, state.customProfile);
    if (urlCustom.sceneId) {
      state.sceneId = urlCustom.sceneId;
    }
  } else {
    const savedCustom = loadSavedCustomProfile();
    if (savedCustom) {
      state.customProfile = savedCustom;
    }
  }
  const initDprCap = computeAutoDprCap();
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
    onMuteToggle() {
      state.muted = !state.muted;
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
    const dprCap = computeAutoDprCap();
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
      clearUrlQuery();
    },
    onSelectCustom() {
      if (state.customProfile) {
        applyCustomProfile(state, state.customProfile);
      }
    },
    onSaveCustom() {
      const profile = {
        name: 'Custom',
        settings: sanitizeVisualSettings(state.settings),
        glassesOn: state.settings.lensProfile !== 'none' && Boolean(state.glassesOn),
      };
      state.customProfile = profile;
      state.personaId = 'custom';
      saveCustomProfileToStorage(profile);
      clearUrlQuery();
      hud.notify(t(state.language, 'toast.customSaved'));
    },
    onShareCustom() {
      const qs = encodeCustomProfileParams(state.settings, {
        sceneId: state.sceneId,
        glassesOn: Boolean(state.glassesOn),
      });
      const shareUrl = `${window.location.origin}${window.location.pathname}?${qs}`;
      const fallbackUrlBar = () => {
        try {
          window.history?.replaceState?.(null, '', `?${qs}`);
        } catch {
          // Ignore history restrictions on file:// or sandboxed frames
        }
        hud.notify(t(state.language, 'toast.urlUpdated'));
      };
      if (navigator.clipboard?.writeText) {
        navigator.clipboard
          .writeText(shareUrl)
          .then(() => hud.notify(t(state.language, 'toast.linkCopied')))
          .catch(fallbackUrlBar);
      } else {
        fallbackUrlBar();
      }
    },
    onSettingChange(key, value) {
      updateVisualSetting(state, key, value);
    },
    onReset() {
      applyPersona(state, 'vuarbit_frut');
      clearUrlQuery();
    },
    onCompareToggle() {
      toggleCompareNormal(state);
    },
    onGlassesToggle() {
      toggleGlasses(state);
    },
    onMuteToggle() {
      state.muted = !state.muted;
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
