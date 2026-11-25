function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function zoneLabel(state) {
  if (state.eyelidClose > 0.8 || state.activeZone === 'closed') return 'Resting (Closed)';
  if (state.compareNormal || state.activeZone === 'normal') return 'Normal Vision (Compare)';
  if (!state.glassesOn || state.activeZone === 'uncorrected') return 'Uncorrected (+13 D off)';
  if (state.activeZone === 'near') return 'Near Bifocal (+15.75 D)';
  return 'Distance (+13.0 D)';
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
    return v;
  }

  const valGlasses = makeRow('Glasses');
  const valZone = makeRow('Optical Zone');
  const valFocus = makeRow('Focus Dist');
  const valEffort = makeRow('Focus Effort');
  const valMln = makeRow('Occl / MLN');
  const valFatigue = makeRow('Fatigue');
  const valTinnitus = makeRow('Tinnitus');

  const controlsLegend = makeEl(
    'div',
    'hud-controls',
    'WASD Move/Adjust | E/Q/Wheel Lean/Near-Far | X Sit | F Pick | C/Space Focus | Z Glasses | R Rest | V Compare | M Mute | H HUD',
  );

  const reticle = makeEl('div', 'hud-reticle');

  const overlay = makeEl('div', 'hud-overlay');
  const card = makeEl('div', 'hud-card');
  const cardTitle = makeEl('h1', null, 'Vuarbit');
  const line1 = makeEl(
    'p',
    null,
    'First-person childhood bilateral aphakia (+13 D straight-cut executive bifocal, zero accommodation) & MLN simulation.',
  );
  const line2 = makeEl(
    'p',
    null,
    'Explore the 1990s classroom, sit at the front-left desk (X), lean in or hold objects near an eye (F/E) to trigger MLN.',
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
    reticle.classList.toggle('is-hidden', !state.pointerLocked);
    overlay.classList.toggle('is-hidden', entered);

    if (!state.hudVisible) return;

    valGlasses.textContent = state.compareNormal
      ? 'OFF (Normal Compare)'
      : state.glassesOn
        ? 'ON (+13 / +15.75 D)'
        : 'OFF (Uncorrected)';
    valZone.textContent = zoneLabel(state);
    const isClosed = state.eyelidClose > 0.8 || state.activeZone === 'closed';
    valFocus.textContent = isClosed ? '0.00 m (Closed)' : `${(state.focusDistM || 0).toFixed(2)} m`;
    const effortPct = Math.round((state.focusStrength || 0) * 100);
    valEffort.textContent = isClosed || state.compareNormal
      ? 'Inactive'
      : state.focusing
        ? `ACTIVE (${effortPct}%, 2.4x fatigue)`
        : 'Relaxed';
    const occlPct = Math.round((state.occlusionLevel || 0) * 100);
    const mlnPct = Math.round((state.mlnIntensity || 0) * 100);
    valMln.textContent = `${occlPct}% / ${mlnPct}%`;
    valFatigue.textContent = `${Math.round((state.fatigue || 0) * 100)}%`;
    valTinnitus.textContent = state.muted || state.compareNormal ? 'MUTED' : 'ON (E7 + C9)';
  }

  function dispose() {
    overlay.removeEventListener('click', onOverlayClick);
    rootElement.replaceChildren();
  }

  update(initialState);
  return { update, dispose };
}
