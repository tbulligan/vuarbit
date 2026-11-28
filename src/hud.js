import { getPersonaById, getSceneById, hasSuppressionMechanics, resolveIolGlassesOptics } from './personas.js';
import { normalizeLanguage, t } from './i18n.js';

function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function fmtD(v) {
  return `${v > 0.001 ? '+' : ''}${v.toFixed(1)} D`;
}

function personaLabel(state, lang) {
  if (state.personaId === 'custom') return t(lang, 'settings.custom');
  const persona = getPersonaById?.(state.personaId);
  return persona ? t(lang, `persona.${persona.id}.short`) : 'Frut';
}

function sceneLabel(state, lang) {
  const sc = getSceneById?.(state.sceneId || 'classroom');
  return sc ? t(lang, `scene.${sc.id}.short`) : t(lang, 'scene.classroom.short');
}

function formatGlassesToast(state, lang) {
  const s = state.settings || {};
  if (s.lensProfile === 'pseudophakic_iol') {
    const iol = resolveIolGlassesOptics(s, state.glassesSlot, state.glassesOn);
    if (!iol.glassesOn || iol.slot === 'off') {
      return t(lang, 'toast.glassesIolOff');
    }
    const slotName = t(lang, `hud.glasses.slot.${iol.slot}`);
    return `${t(lang, 'toast.glassesPrefix')}: ${slotName} (${fmtD(iol.lensPowerD)})`;
  }
  return state.glassesOn ? t(lang, 'toast.glassesOn') : t(lang, 'toast.glassesOff');
}

/**
 * Strictly safe DOM HUD telemetry, fatigue meter, transient action toast, mobile bar & keybind overlay
 * (DOM APIs only, zero inline styles, live EN/IT/NL i18n).
 */
export function createHud(rootElement, initialState, callbacks = {}) {
  let entered = false;
  let lastLang = null;
  let lastLegendKey = null;
  let lastTouchMode = null;
  let lastMobileBarSig = null;
  let lastHudSig = null;
  let isTouch = Boolean(initialState?.isTouchDevice);

  // Toast transition tracking (seeded on first update so initial load stays silent)
  let toastSeeded = false;
  let toastTimer = null;
  let prevPersonaId = null;
  let prevSceneId = null;
  let prevLensProfile = null;
  let prevGlassesOn = null;
  let prevGlassesSlot = null;
  let prevCompare = null;
  let prevTimeOfDay = null;
  let prevLightsOn = null;
  let prevMuted = null;

  const panel = makeEl('div', 'hud-panel');

  // Compact 1-line context header: Preset · Scene (+ Mute pill on tinnitus presets, Compare pill when active)
  const headerRow = makeEl('div', 'hud-header');
  const titleGroup = makeEl('div', 'hud-title-group');
  const presetEl = makeEl('span', 'hud-preset', '');
  const sepEl = makeEl('span', 'hud-sep', '·');
  const sceneEl = makeEl('span', 'hud-scene', '');
  titleGroup.replaceChildren(presetEl, sepEl, sceneEl);
  const headerPills = makeEl('div', 'hud-header-pills');
  const mutePill = makeEl('button', 'hud-mute-btn is-hidden', '🔊 M');
  mutePill.type = 'button';
  mutePill.setAttribute('aria-pressed', 'false');
  const comparePill = makeEl('span', 'hud-pill hud-pill-compare is-hidden', '');
  headerPills.replaceChildren(mutePill, comparePill);
  headerRow.replaceChildren(titleGroup, headerPills);

  // Focus (F) ON/OFF row
  const focusRow = makeEl('div', 'hud-row');
  const focusLabel = makeEl('span', 'hud-label', '');
  const focusPill = makeEl('span', 'hud-pill', '');
  focusRow.replaceChildren(focusLabel, focusPill);

  // Fatigue meter row (<progress> uses DOM value attribute — zero inline styles, CSP-safe & accessible)
  const fatigueRow = makeEl('div', 'hud-row');
  const fatigueLabel = makeEl('span', 'hud-label', '');
  const fatigueMeter = makeEl('progress', 'hud-fatigue-bar is-low');
  fatigueMeter.max = 100;
  fatigueMeter.value = 0;
  fatigueRow.replaceChildren(fatigueLabel, fatigueMeter);

  // Gentle Rest (R) prompt once fatigue crosses decompensation onset (~60%)
  const restHint = makeEl('div', 'hud-rest-hint is-hidden', '');

  // Contextual Glasses slide/pin position slider (shown only when slipped or actively sliding/pinning)
  const slideRow = makeEl('div', 'hud-row is-hidden');
  const slideLabel = makeEl('span', 'hud-label', '');
  const slideWrap = makeEl('div', 'hud-slide-wrap');
  const slideUpMark = makeEl('span', 'hud-slide-dir', '↑');
  const slideSlider = makeEl('input', 'hud-slide-slider');
  slideSlider.type = 'range';
  slideSlider.min = '0';
  slideSlider.max = '14';
  slideSlider.step = '1';
  slideSlider.value = '0';
  slideSlider.disabled = true;
  const slideDownMark = makeEl('span', 'hud-slide-dir', '↓');
  slideWrap.replaceChildren(slideUpMark, slideSlider, slideDownMark);
  slideRow.replaceChildren(slideLabel, slideWrap);

  const slideHint = makeEl('div', 'hud-slide-hint is-hidden', '');

  panel.replaceChildren(headerRow, focusRow, fatigueRow, restHint, slideRow, slideHint);

  // Transient action toast (Z / V / T / L / M)
  const toast = makeEl('div', 'hud-toast', '');
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  function showToast(message) {
    if (!message) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    if (toastTimer !== null) {
      clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(() => {
      toast.classList.remove('is-visible');
      toastTimer = null;
    }, 2400);
  }

  const controlsLegend = makeEl('div', 'hud-controls');
  const helpMoveLine = makeEl('div', 'hud-controls-line', '');
  const helpOpticsLine = makeEl('div', 'hud-controls-line', '');
  const helpEnvLine = makeEl('div', 'hud-controls-line', '');
  controlsLegend.replaceChildren(helpMoveLine, helpOpticsLine, helpEnvLine);

  const mobileBar = makeEl('div', 'mobile-action-bar is-hidden');
  mobileBar.setAttribute('role', 'toolbar');
  const makeActionBtn = () => {
    const btn = makeEl('button', 'mobile-action-btn', '');
    btn.type = 'button';
    btn.setAttribute('aria-pressed', 'false');
    return btn;
  };
  const mobileSettingsBtn = makeActionBtn();
  const mobileCompareBtn = makeActionBtn();
  const mobileGlassesBtn = makeActionBtn();
  const mobileSitBtn = makeActionBtn();
  mobileBar.replaceChildren(mobileSettingsBtn, mobileCompareBtn, mobileGlassesBtn, mobileSitBtn);

  const stopBarEvent = (e) => e.stopPropagation();
  const onMobileSettings = () => callbacks.onSettingsToggle?.();
  const onMobileCompare = () => callbacks.onCompareToggle?.();
  const onMobileGlasses = () => callbacks.onGlassesToggle?.();
  const onMobileSit = () => callbacks.onSitToggle?.();
  const onMuteClick = (e) => {
    e.stopPropagation();
    callbacks.onMuteToggle?.();
  };
  mutePill.addEventListener('touchstart', stopBarEvent, { passive: true });
  mutePill.addEventListener('pointerdown', stopBarEvent);
  mutePill.addEventListener('mousedown', stopBarEvent);
  mutePill.addEventListener('click', onMuteClick);
  mobileBar.addEventListener('touchstart', stopBarEvent, { passive: true });
  mobileBar.addEventListener('pointerdown', stopBarEvent);
  mobileBar.addEventListener('mousedown', stopBarEvent);
  mobileBar.addEventListener('click', stopBarEvent);
  mobileSettingsBtn.addEventListener('click', onMobileSettings);
  mobileCompareBtn.addEventListener('click', onMobileCompare);
  mobileGlassesBtn.addEventListener('click', onMobileGlasses);
  mobileSitBtn.addEventListener('click', onMobileSit);

  const reticle = makeEl('div', 'hud-reticle');

  const overlay = makeEl('div', 'hud-overlay');
  const card = makeEl('div', 'hud-card');
  const cardTitle = makeEl('h1', null, 'Vuarbit');
  const line1 = makeEl('p', null, '');
  const line2 = makeEl('p', null, '');
  const cta = makeEl('p', 'hud-cta', '');
  card.replaceChildren(cardTitle, line1, line2, cta);
  overlay.replaceChildren(card);

  const onOverlayClick = () => {
    entered = true;
    overlay.classList.add('is-hidden');
    if (isTouch) return;
    const canvas = document.getElementById('sim-canvas');
    if (canvas && canvas.requestPointerLock) {
      Promise.resolve(canvas.requestPointerLock()).catch(() => {});
    }
  };
  overlay.addEventListener('click', onOverlayClick);

  rootElement.replaceChildren(panel, toast, controlsLegend, mobileBar, reticle, overlay);

  function updateStaticCopy(lang, touchMode) {
    focusLabel.textContent = t(lang, 'hud.row.focus');
    fatigueLabel.textContent = t(lang, 'hud.row.fatigue');
    fatigueMeter.setAttribute('aria-label', t(lang, 'hud.row.fatigue'));
    slideSlider.setAttribute('aria-label', t(lang, 'hud.row.glassesPos'));
    mutePill.setAttribute('aria-label', t(lang, 'settings.label.muteAudio'));
    restHint.textContent = t(lang, 'hud.fatigue.restHint');
    slideHint.textContent = t(lang, 'hud.glasses.slideHint');
    comparePill.textContent = t(lang, 'hud.badge.compare');
    helpOpticsLine.textContent = t(lang, 'hud.help.optics');
    helpEnvLine.textContent = t(lang, 'hud.help.env');
    line1.textContent = t(lang, 'hud.overlay.line1');
    line2.textContent = t(lang, touchMode ? 'hud.overlay.line2Touch' : 'hud.overlay.line2');
    cta.textContent = t(lang, touchMode ? 'hud.overlay.ctaTouch' : 'hud.overlay.cta');
    mobileSettingsBtn.textContent = t(lang, 'hud.mobile.settings');
    mobileCompareBtn.textContent = t(lang, 'hud.mobile.compare');
  }

  function update(state) {
    isTouch = Boolean(state.isTouchDevice);
    const lang = normalizeLanguage(state.language);
    if (lang !== lastLang || isTouch !== lastTouchMode) {
      lastLang = lang;
      lastTouchMode = isTouch;
      lastLegendKey = null;
      updateStaticCopy(lang, isTouch);
      rootElement.classList.toggle('is-touch', isTouch);
    }

    if (state.pointerLocked) {
      entered = true;
    }

    const sceneId = state.sceneId || 'classroom';
    const sc = getSceneById?.(sceneId);
    const s = state.settings || {};
    const hasLens = s.lensProfile !== 'none';
    const resting = Boolean(state.eyesClosed) || (state.eyelidClose || 0) > 0.15;

    // Detect user-triggered live toggles for transient toast feedback
    const lensProfileNow = s.lensProfile || 'none';
    const glassesOnNow = Boolean(state.glassesOn);
    const glassesSlotNow = state.glassesSlot || 'distance';
    const compareNow = Boolean(state.compareNormal);
    const todNow = state.timeOfDay || 'sunny';
    const lightsNow = state.lightsOn !== false;
    const mutedNow = Boolean(state.muted);
    if (!toastSeeded) {
      toastSeeded = true;
    } else if (entered) {
      const personaOrSceneChanged = state.personaId !== prevPersonaId || sceneId !== prevSceneId;
      if (compareNow !== prevCompare && !personaOrSceneChanged) {
        showToast(
          compareNow
            ? t(lang, 'toast.compareOn')
            : t(lang, 'toast.compareOff', { preset: personaLabel(state, lang) })
        );
      } else if (
        !personaOrSceneChanged &&
        !compareNow &&
        hasLens &&
        lensProfileNow === prevLensProfile &&
        (glassesOnNow !== prevGlassesOn || glassesSlotNow !== prevGlassesSlot)
      ) {
        showToast(formatGlassesToast(state, lang));
      } else if (todNow !== prevTimeOfDay) {
        showToast(t(lang, `opt.tod.${todNow}`));
      } else if (lightsNow !== prevLightsOn) {
        const key =
          sceneId === 'car_passenger'
            ? lightsNow
              ? 'toast.roadLightsOn'
              : 'toast.roadLightsOff'
            : lightsNow
              ? 'toast.lightsOn'
              : 'toast.lightsOff';
        showToast(t(lang, key));
      } else if (mutedNow !== prevMuted) {
        showToast(mutedNow ? t(lang, 'toast.audioMuted') : t(lang, 'toast.audioOn'));
      }
    }
    prevPersonaId = state.personaId;
    prevSceneId = sceneId;
    prevLensProfile = lensProfileNow;
    prevGlassesOn = glassesOnNow;
    prevGlassesSlot = glassesSlotNow;
    prevCompare = compareNow;
    prevTimeOfDay = todNow;
    prevLightsOn = lightsNow;
    prevMuted = mutedNow;

    // H toggles bottom-left keymap legend only; top-left status HUD stays visible
    controlsLegend.classList.toggle('is-hidden', !state.hudVisible || isTouch);
    mobileBar.classList.toggle('is-hidden', !isTouch || !entered);
    reticle.classList.toggle('is-hidden', isTouch || !state.pointerLocked || Boolean(state.settingsOpen) || resting);
    reticle.classList.toggle('is-target', !resting && Boolean(state.aimingPickable));
    overlay.classList.toggle('is-hidden', entered);

    if (isTouch && entered) {
      const settingsOpen = Boolean(state.settingsOpen);
      const glassesActive = hasLens && Boolean(state.glassesOn);
      const seatedOnly = Boolean(sc?.seatedOnly);
      const mobileBarSig = `${lang}|${settingsOpen}|${compareNow}|${hasLens}|${glassesActive}|${s.lensProfile}|${state.glassesSlot}|${seatedOnly}|${state.mode}`;
      if (mobileBarSig !== lastMobileBarSig) {
        lastMobileBarSig = mobileBarSig;
        mobileSettingsBtn.classList.toggle('is-active', settingsOpen);
        mobileSettingsBtn.setAttribute('aria-pressed', settingsOpen ? 'true' : 'false');
        mobileCompareBtn.classList.toggle('is-active', compareNow);
        mobileCompareBtn.setAttribute('aria-pressed', compareNow ? 'true' : 'false');
        mobileGlassesBtn.disabled = !hasLens;
        mobileGlassesBtn.classList.toggle('is-active', glassesActive);
        mobileGlassesBtn.setAttribute('aria-pressed', glassesActive ? 'true' : 'false');
        if (s.lensProfile === 'pseudophakic_iol') {
          const iol = resolveIolGlassesOptics(s, state.glassesSlot, state.glassesOn);
          mobileGlassesBtn.textContent = iol.glassesOn
            ? t(lang, `hud.glasses.slot.${iol.slot}`)
            : `${t(lang, 'hud.mobile.glasses')}: ${t(lang, 'settings.off')}`;
        } else {
          mobileGlassesBtn.textContent = t(lang, 'hud.mobile.glasses');
        }
        mobileSitBtn.classList.toggle('is-hidden', seatedOnly);
        if (!seatedOnly) {
          const isSeated = state.mode === 'seated';
          mobileSitBtn.textContent = t(lang, isSeated ? 'hud.mobile.stand' : 'hud.mobile.sit');
          mobileSitBtn.classList.toggle('is-active', isSeated);
          mobileSitBtn.setAttribute('aria-pressed', isSeated ? 'true' : 'false');
        }
      }
    }

    if (state.hudVisible) {
      const moveKey = sc?.seatedOnly ? 'hud.help.moveSeated' : 'hud.help.moveFull';
      if (moveKey !== lastLegendKey) {
        lastLegendKey = moveKey;
        helpMoveLine.textContent = t(lang, moveKey);
      }
    }

    const showSuppression = hasSuppressionMechanics(s) && !compareNow;
    const hasTinnitus = (s.tinnitus ?? 1) > 0.005;
    const showMutePill = hasTinnitus && !compareNow;
    const isClosed = state.eyelidClose > 0.8 || state.activeZone === 'closed';
    const focusActive = Boolean(state.focusing) && !isClosed;
    const fatiguePct = Math.round(Math.min(100, Math.max(0, (state.fatigue || 0) * 100)));
    const slideMm = Math.round(Math.min(14, Math.max(0, (state.glassesSlide || 0) * 14)));
    const pinnedNow = Boolean(state.glassesPinned);
    const slidingNow = Boolean(state.glassesSlidingDown);
    const showSlide =
      hasLens &&
      glassesOnNow &&
      !compareNow &&
      !isClosed &&
      (slideMm >= 1 || pinnedNow || slidingNow);
    const hudSig = `${lang}|${state.personaId}|${sceneId}|${compareNow}|${showMutePill}|${mutedNow}|${showSuppression}|${isClosed}|${focusActive}|${fatiguePct}|${showSlide}|${slideMm}|${pinnedNow}|${slidingNow}`;
    if (hudSig === lastHudSig) return;
    lastHudSig = hudSig;

    presetEl.textContent = personaLabel(state, lang);
    sceneEl.textContent = sceneLabel(state, lang);
    comparePill.classList.toggle('is-hidden', !compareNow);
    mutePill.classList.toggle('is-hidden', !showMutePill);
    if (showMutePill) {
      mutePill.textContent = mutedNow ? '🔇 M' : '🔊 M';
      mutePill.classList.toggle('is-muted', mutedNow);
      mutePill.setAttribute('aria-pressed', mutedNow ? 'true' : 'false');
    }

    focusRow.classList.toggle('is-hidden', !showSuppression);
    fatigueRow.classList.toggle('is-hidden', !showSuppression);

    if (showSuppression) {
      focusPill.textContent = isClosed
        ? t(lang, 'hud.focus.resting')
        : focusActive
          ? t(lang, 'settings.on')
          : t(lang, 'settings.off');
      focusPill.classList.toggle('is-on', focusActive);

      fatigueMeter.value = fatiguePct;
      const isHigh = fatiguePct >= 70;
      const isMid = fatiguePct >= 45 && !isHigh;
      fatigueMeter.classList.toggle('is-low', !isMid && !isHigh);
      fatigueMeter.classList.toggle('is-mid', isMid);
      fatigueMeter.classList.toggle('is-high', isHigh);

      const showRestPrompt = !isClosed && fatiguePct >= 60;
      restHint.classList.toggle('is-hidden', !showRestPrompt);
    } else {
      restHint.classList.add('is-hidden');
    }

    slideRow.classList.toggle('is-hidden', !showSlide);
    if (showSlide) {
      slideLabel.textContent = pinnedNow ? t(lang, 'hud.glasses.pinnedLabel') : t(lang, 'hud.row.glassesPos');
      slideLabel.classList.toggle('is-accent', pinnedNow);
      slideSlider.value = String(slideMm);
      slideSlider.classList.toggle('is-pinned', pinnedNow);
      const showSlideHint = slideMm >= 4 && !pinnedNow && !slidingNow;
      slideHint.classList.toggle('is-hidden', !showSlideHint);
    } else {
      slideHint.classList.add('is-hidden');
    }
  }

  function dispose() {
    if (toastTimer !== null) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    overlay.removeEventListener('click', onOverlayClick);
    mutePill.removeEventListener('touchstart', stopBarEvent);
    mutePill.removeEventListener('pointerdown', stopBarEvent);
    mutePill.removeEventListener('mousedown', stopBarEvent);
    mutePill.removeEventListener('click', onMuteClick);
    mobileBar.removeEventListener('touchstart', stopBarEvent);
    mobileBar.removeEventListener('pointerdown', stopBarEvent);
    mobileBar.removeEventListener('mousedown', stopBarEvent);
    mobileBar.removeEventListener('click', stopBarEvent);
    mobileSettingsBtn.removeEventListener('click', onMobileSettings);
    mobileCompareBtn.removeEventListener('click', onMobileCompare);
    mobileGlassesBtn.removeEventListener('click', onMobileGlasses);
    mobileSitBtn.removeEventListener('click', onMobileSit);
    rootElement.classList.remove('is-touch');
    rootElement.replaceChildren();
  }

  update(initialState);
  return { update, notify: showToast, dispose };
}
