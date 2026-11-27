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

function zoneLabel(state, lang) {
  if (state.eyelidClose > 0.8 || state.activeZone === 'closed') return t(lang, 'hud.zone.closed');
  if (state.compareNormal || state.activeZone === 'normal') return t(lang, 'hud.zone.normal');
  const lp = state.settings?.lensProfile || 'aphakic_bifocal';
  if (lp === 'none' || state.activeZone === 'emmetropic') {
    return t(lang, 'hud.zone.none');
  }
  if (lp === 'pseudophakic_iol') {
    const iol = resolveIolGlassesOptics(state.settings, state.glassesSlot, state.glassesOn);
    if (!iol.glassesOn || iol.slot === 'off') {
      const dist = Number.isFinite(iol.focalDistM) ? `${iol.focalDistM.toFixed(1)} m` : '∞';
      return t(lang, 'hud.zone.iolOff', { dist });
    }
    if (iol.slot === 'intermediate') {
      return t(lang, 'hud.zone.iolIntermediate', { power: fmtD(iol.lensPowerD) });
    }
    if (iol.slot === 'near') {
      return t(lang, 'hud.zone.iolNear', { power: fmtD(iol.lensPowerD) });
    }
    return t(lang, 'hud.zone.iolDistance', { power: fmtD(iol.lensPowerD) });
  }
  const p = Number.isFinite(state.settings?.lensPowerD) ? state.settings.lensPowerD : 13.0;
  const a = Number.isFinite(state.settings?.nearAddD) ? state.settings.nearAddD : 4.0;
  if (!state.glassesOn || state.activeZone === 'uncorrected') {
    return lp === 'aphakic_bifocal'
      ? t(lang, 'hud.zone.uncorrectedOff', { power: fmtD(p) })
      : t(lang, 'hud.zone.uncorrectedPressZ');
  }
  if (lp === 'progressive') {
    return state.activeZone === 'near'
      ? t(lang, 'hud.zone.progNear', { add: a.toFixed(1) })
      : t(lang, 'hud.zone.progDist');
  }
  if (lp === 'single_vision') return t(lang, 'hud.zone.singleVision', { power: fmtD(p) });
  if (state.activeZone === 'near') return t(lang, 'hud.zone.nearBifocal', { power: fmtD(p + a) });
  return t(lang, 'hud.zone.distance', { power: fmtD(p) });
}

function glassesLabel(state, lang) {
  if (state.compareNormal) return t(lang, 'hud.glasses.normalCompare');
  const lp = state.settings?.lensProfile || 'aphakic_bifocal';
  if (lp === 'none') return t(lang, 'hud.glasses.none');
  if (lp === 'pseudophakic_iol') {
    const iol = resolveIolGlassesOptics(state.settings, state.glassesSlot, state.glassesOn);
    if (!iol.glassesOn || iol.slot === 'off') {
      return t(lang, 'hud.glasses.iolOff');
    }
    const slotName = t(lang, `hud.glasses.slot.${iol.slot}`);
    const ax = Number.isFinite(state.settings?.lensAxisDeg) ? state.settings.lensAxisDeg : 90;
    const cylStr = iol.lensCylD > 0.1 ? ` / ${iol.lensCylD.toFixed(2)} cyl ×${Math.round(ax)}°` : '';
    const slideMm = Math.round((state.glassesSlide || 0) * 14);
    const slideNote = state.glassesPinned
      ? t(lang, 'hud.glasses.pinned')
      : slideMm >= 3
        ? t(lang, 'hud.glasses.slipped', { mm: slideMm })
        : '';
    return `${slotName} (${fmtD(iol.lensPowerD)}${cylStr}${slideNote})`;
  }
  const p = Number.isFinite(state.settings?.lensPowerD) ? state.settings.lensPowerD : 13.0;
  const a = Number.isFinite(state.settings?.nearAddD) ? state.settings.nearAddD : 4.0;
  const cyl = Number.isFinite(state.settings?.lensCylD) ? state.settings.lensCylD : 0;
  const ax = Number.isFinite(state.settings?.lensAxisDeg) ? state.settings.lensAxisDeg : 90;
  const hasAdd = lp !== 'single_vision' && a > 0.1;
  const cylStr = lp !== 'aphakic_bifocal' && cyl > 0.1 ? ` / ${cyl.toFixed(2)} cyl ×${Math.round(ax)}°` : '';
  const rx = hasAdd ? `${fmtD(p)} / +${a.toFixed(1)} add${cylStr}` : `${fmtD(p)}${cylStr}`;
  const slideMm = Math.round((state.glassesSlide || 0) * 14);
  const slideNote = !state.glassesOn
    ? ''
    : state.glassesPinned
      ? t(lang, 'hud.glasses.pinned')
      : slideMm >= 3
        ? t(lang, 'hud.glasses.slipped', { mm: slideMm })
        : '';
  return state.glassesOn
    ? `${t(lang, 'settings.on')} (${rx}${slideNote})`
    : `${t(lang, 'settings.off')} (${rx}${t(lang, 'hud.glasses.pressZ')})`;
}

function personaLabel(state, lang) {
  if (state.personaId === 'custom') return t(lang, 'settings.custom');
  const persona = getPersonaById?.(state.personaId);
  return persona ? t(lang, `persona.${persona.id}.short`) : 'Vuarbit Frut';
}

function sceneLabel(state, lang) {
  const sc = getSceneById?.(state.sceneId || 'classroom');
  return sc ? t(lang, `scene.${sc.id}.short`) : t(lang, 'scene.classroom.short');
}

/**
 * Strictly safe DOM HUD telemetry, mobile action bar & keybind overlay (DOM APIs only, live EN/IT/NL i18n).
 */
export function createHud(rootElement, initialState, callbacks = {}) {
  let entered = false;
  let lastLang = null;
  let lastLegendKey = null;
  let lastTouchMode = null;
  let isTouch = Boolean(initialState?.isTouchDevice);

  const panel = makeEl('div', 'hud-panel');

  function makeRow(labelKey) {
    const row = makeEl('div', 'hud-row');
    const k = makeEl('span', 'hud-label', '');
    const v = makeEl('span', 'hud-val', '-');
    row.replaceChildren(k, v);
    panel.appendChild(row);
    return { row, keyEl: k, labelKey, val: v };
  }

  const rows = {
    scene: makeRow('hud.row.scene'),
    persona: makeRow('hud.row.preset'),
    glasses: makeRow('hud.row.glasses'),
    zone: makeRow('hud.row.zone'),
    focus: makeRow('hud.row.focusDist'),
    effort: makeRow('hud.row.focus'),
    nystagmus: makeRow('hud.row.nystagmus'),
    fatigue: makeRow('hud.row.fatigue'),
    tinnitus: makeRow('hud.row.tinnitus'),
  };

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

  rootElement.replaceChildren(panel, controlsLegend, mobileBar, reticle, overlay);

  function updateStaticCopy(lang, touchMode) {
    for (const r of Object.values(rows)) {
      r.keyEl.textContent = t(lang, r.labelKey);
    }
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

    panel.classList.toggle('is-hidden', !state.hudVisible);
    controlsLegend.classList.toggle('is-hidden', !state.hudVisible || isTouch);
    mobileBar.classList.toggle('is-hidden', !isTouch || !entered);
    reticle.classList.toggle('is-hidden', isTouch || !state.pointerLocked || Boolean(state.settingsOpen));
    reticle.classList.toggle('is-target', Boolean(state.aimingPickable));
    overlay.classList.toggle('is-hidden', entered);

    if (isTouch && entered) {
      const settingsOpen = Boolean(state.settingsOpen);
      const comparing = Boolean(state.compareNormal);
      const glassesActive = hasLens && Boolean(state.glassesOn);
      mobileSettingsBtn.classList.toggle('is-active', settingsOpen);
      mobileSettingsBtn.setAttribute('aria-pressed', settingsOpen ? 'true' : 'false');
      mobileCompareBtn.classList.toggle('is-active', comparing);
      mobileCompareBtn.setAttribute('aria-pressed', comparing ? 'true' : 'false');
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
      const seatedOnly = Boolean(sc?.seatedOnly);
      mobileSitBtn.classList.toggle('is-hidden', seatedOnly);
      if (!seatedOnly) {
        const isSeated = state.mode === 'seated';
        mobileSitBtn.textContent = t(lang, isSeated ? 'hud.mobile.stand' : 'hud.mobile.sit');
        mobileSitBtn.classList.toggle('is-active', isSeated);
        mobileSitBtn.setAttribute('aria-pressed', isSeated ? 'true' : 'false');
      }
    }

    if (!state.hudVisible) return;

    const hasSuppression = hasSuppressionMechanics(s);
    const hasNystagmus = (s.mlnScale || 0) > 0.005 || (s.albinism || 0) > 0.005;
    const hasTinnitus = (s.tinnitus ?? 1) > 0.005;

    rows.glasses.row.classList.toggle('is-hidden', !hasLens && !state.compareNormal);
    rows.effort.row.classList.toggle('is-hidden', !hasSuppression);
    rows.nystagmus.row.classList.toggle('is-hidden', !hasNystagmus);
    rows.fatigue.row.classList.toggle('is-hidden', !hasSuppression);
    rows.tinnitus.row.classList.toggle('is-hidden', !hasTinnitus && !state.muted);

    const moveKey = sc?.seatedOnly ? 'hud.help.moveSeated' : 'hud.help.moveFull';
    if (moveKey !== lastLegendKey) {
      lastLegendKey = moveKey;
      helpMoveLine.textContent = t(lang, moveKey);
    }

    rows.scene.val.textContent = sceneLabel(state, lang);
    rows.persona.val.textContent = personaLabel(state, lang);
    rows.glasses.val.textContent = glassesLabel(state, lang);
    rows.zone.val.textContent = zoneLabel(state, lang);
    const isClosed = state.eyelidClose > 0.8 || state.activeZone === 'closed';
    rows.focus.val.textContent = isClosed
      ? t(lang, 'hud.focus.closed')
      : `${(state.focusDistM || 0).toFixed(2)} m`;
    const effortPct = Math.round((state.focusStrength || 0) * 100);
    rows.effort.val.textContent = isClosed || state.compareNormal
      ? t(lang, 'hud.effort.inactive')
      : state.focusing
        ? t(lang, 'hud.effort.focused', { pct: effortPct })
        : t(lang, 'hud.effort.relaxed');
    const occlPct = Math.round((state.occlusionLevel || 0) * 100);
    const nystPct = Math.round((state.mlnIntensity || 0) * 100);
    rows.nystagmus.val.textContent = (s.mlnScale || 0) > 0.005
      ? t(lang, 'hud.nyst.occl', { occl: occlPct, nyst: nystPct })
      : `${nystPct}%`;
    rows.fatigue.val.textContent = `${Math.round((state.fatigue || 0) * 100)}%`;
    rows.tinnitus.val.textContent =
      state.muted || state.compareNormal
        ? t(lang, 'hud.tinnitus.muted')
        : hasTinnitus
          ? t(lang, 'settings.on')
          : t(lang, 'settings.off');
  }

  function dispose() {
    overlay.removeEventListener('click', onOverlayClick);
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
  return { update, dispose };
}
