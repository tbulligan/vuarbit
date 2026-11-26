import { getPersonaById, hasSuppressionMechanics } from './personas.js';

function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function zoneLabel(state) {
  if (state.eyelidClose > 0.8 || state.activeZone === 'closed') return 'Resting (Closed)';
  if (state.compareNormal || state.activeZone === 'normal') return 'Normal Vision (Compare)';
  if (state.settings?.lensProfile === 'none' || state.activeZone === 'emmetropic') {
    return 'No Glasses';
  }
  const p = Number.isFinite(state.settings?.lensPowerD) ? state.settings.lensPowerD : 13.0;
  const a = Number.isFinite(state.settings?.nearAddD) ? state.settings.nearAddD : 4.0;
  if (!state.glassesOn || state.activeZone === 'uncorrected') {
    return `Uncorrected (+${p.toFixed(1)} D off)`;
  }
  if (state.activeZone === 'near') return `Near Bifocal (+${(p + a).toFixed(1)} D)`;
  return `Distance (+${p.toFixed(1)} D)`;
}

function glassesLabel(state) {
  if (state.compareNormal) return 'OFF (Normal Compare)';
  if (state.settings?.lensProfile === 'none') return 'None';
  const p = Number.isFinite(state.settings?.lensPowerD) ? state.settings.lensPowerD : 13.0;
  const a = Number.isFinite(state.settings?.nearAddD) ? state.settings.nearAddD : 4.0;
  return state.glassesOn
    ? `ON (+${p.toFixed(1)} / +${a.toFixed(1)} D)`
    : `OFF (+${p.toFixed(1)} D off)`;
}

function personaLabel(state) {
  if (state.personaId === 'custom') return 'Custom';
  const persona = getPersonaById?.(state.personaId);
  return persona ? persona.shortName : 'Vuarbit 1994';
}

/**
 * Strictly safe DOM HUD telemetry & keybind overlay (DOM APIs only, no raw HTML strings).
 */
export function createHud(rootElement, initialState) {
  let entered = false;

  const panel = makeEl('div', 'hud-panel');

  function makeRow(label) {
    const row = makeEl('div', 'hud-row');
    const k = makeEl('span', 'hud-label', label);
    const v = makeEl('span', 'hud-val', '-');
    row.replaceChildren(k, v);
    panel.appendChild(row);
    return { row, val: v };
  }

  const rPersona = makeRow('Preset');
  const rGlasses = makeRow('Glasses');
  const rZone = makeRow('Optical Zone');
  const rFocus = makeRow('Focus Dist');
  const rEffort = makeRow('Focus Effort');
  const rNystagmus = makeRow('Nystagmus');
  const rFatigue = makeRow('Fatigue');
  const rTinnitus = makeRow('Tinnitus');

  const controlsLegend = makeEl(
    'div',
    'hud-controls',
    'WASD Move/Adjust | E/Q/Wheel Lean/Near-Far | X Sit | F Pick | RMB Rotate | C/Space Focus | Z Glasses | R Rest | V Compare | M Mute | P Settings | H HUD | F11 Fullscreen',
  );

  const reticle = makeEl('div', 'hud-reticle');

  const overlay = makeEl('div', 'hud-overlay');
  const card = makeEl('div', 'hud-card');
  const cardTitle = makeEl('h1', null, 'Vuarbit');
  const line1 = makeEl(
    'p',
    null,
    'First-person childhood bilateral aphakia (+13 D / +17 D bifocal, zero accommodation) & nystagmus simulation.',
  );
  const line2 = makeEl(
    'p',
    null,
    'Explore the 1990s classroom, sit at the front-left desk (X), lean in or hold objects near an eye (F/E), or press P for presets.',
  );
  const cta = makeEl('p', 'hud-cta', 'Click anywhere to enter classroom (Esc releases cursor)');
  card.replaceChildren(cardTitle, line1, line2, cta);
  overlay.replaceChildren(card);

  const onOverlayClick = () => {
    entered = true;
    overlay.classList.add('is-hidden');
    const canvas = document.getElementById('sim-canvas');
    if (canvas && canvas.requestPointerLock) {
      Promise.resolve(canvas.requestPointerLock()).catch(() => {});
    }
  };
  overlay.addEventListener('click', onOverlayClick);

  rootElement.replaceChildren(panel, controlsLegend, reticle, overlay);

  function update(state) {
    if (state.pointerLocked) {
      entered = true;
    }

    panel.classList.toggle('is-hidden', !state.hudVisible);
    controlsLegend.classList.toggle('is-hidden', !state.hudVisible);
    reticle.classList.toggle('is-hidden', !state.pointerLocked || Boolean(state.settingsOpen));
    overlay.classList.toggle('is-hidden', entered);

    if (!state.hudVisible) return;

    const s = state.settings || {};
    const hasLens = s.lensProfile !== 'none';
    const hasSuppression = hasSuppressionMechanics(s);
    const hasNystagmus = (s.mlnScale || 0) > 0.005 || (s.albinism || 0) > 0.005;
    const hasTinnitus = (s.tinnitus ?? 1) > 0.005;

    rGlasses.row.classList.toggle('is-hidden', !hasLens && !state.compareNormal);
    rEffort.row.classList.toggle('is-hidden', !hasSuppression);
    rNystagmus.row.classList.toggle('is-hidden', !hasNystagmus);
    rFatigue.row.classList.toggle('is-hidden', !hasSuppression);
    rTinnitus.row.classList.toggle('is-hidden', !hasTinnitus && !state.muted);

    rPersona.val.textContent = personaLabel(state);
    rGlasses.val.textContent = glassesLabel(state);
    rZone.val.textContent = zoneLabel(state);
    const isClosed = state.eyelidClose > 0.8 || state.activeZone === 'closed';
    rFocus.val.textContent = isClosed ? '0.00 m (Closed)' : `${(state.focusDistM || 0).toFixed(2)} m`;
    const effortPct = Math.round((state.focusStrength || 0) * 100);
    rEffort.val.textContent = isClosed || state.compareNormal
      ? 'Inactive'
      : state.focusing
        ? `ACTIVE (${effortPct}%, 2.4x fatigue)`
        : 'Relaxed';
    const occlPct = Math.round((state.occlusionLevel || 0) * 100);
    const nystPct = Math.round((state.mlnIntensity || 0) * 100);
    rNystagmus.val.textContent = (s.mlnScale || 0) > 0.005
      ? `${occlPct}% occl / ${nystPct}%`
      : `${nystPct}%`;
    rFatigue.val.textContent = `${Math.round((state.fatigue || 0) * 100)}%`;
    rTinnitus.val.textContent =
      state.muted || state.compareNormal
        ? 'MUTED'
        : hasTinnitus
          ? 'ON'
          : 'OFF';
  }

  function dispose() {
    overlay.removeEventListener('click', onOverlayClick);
    rootElement.replaceChildren();
  }

  update(initialState);
  return { update, dispose };
}
