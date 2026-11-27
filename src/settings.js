import {
  PERSONAS,
  QUALITY_PRESETS,
  SCENES,
  SETTING_SPECS,
  TIME_OF_DAY_PRESETS,
  formatSnellenAcuity,
  getPersonaById,
  getSceneById,
} from './personas.js';

const LENS_PROFILE_OPTIONS = [
  { value: 'aphakic_bifocal', label: 'Aphakic Bifocal (+13/+17 D)' },
  { value: 'single_vision', label: 'Single-Vision' },
  { value: 'bifocal', label: 'Bifocal (D-Segment)' },
  { value: 'progressive', label: 'Progressive (PAL)' },
  { value: 'none', label: 'None (No Glasses)' },
];

const FRAME_SHAPE_OPTIONS = [
  { value: 'auto', label: 'Auto (Match Lens)' },
  { value: 'round', label: 'Round' },
  { value: 'rect', label: 'Rectangular' },
  { value: 'rounded_rect', label: 'Rounded Rect' },
  { value: 'semi_rimless', label: 'Semi-Rimless' },
  { value: 'rimless', label: 'Rimless' },
];

const FRAME_COLOR_OPTIONS = [
  { value: 'auto', label: 'Auto (Match Lens)' },
  { value: 'amber', label: 'Amber Acetate' },
  { value: 'charcoal', label: 'Matte Charcoal' },
  { value: 'tortoise', label: 'Tortoiseshell' },
  { value: 'titanium', label: 'Brushed Titanium' },
  { value: 'gold', label: 'Satin Gold' },
  { value: 'navy', label: 'Deep Navy' },
  { value: 'burgundy', label: 'Burgundy' },
];

const DOMINANT_EYE_OPTIONS = [
  { value: 'OD', label: 'Right (OD)' },
  { value: 'OS', label: 'Left (OS)' },
];

const CVD_TYPE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'deutan', label: 'Deuteranopia (Red-Green)' },
  { value: 'protan', label: 'Protanopia (Red-Green)' },
  { value: 'tritan', label: 'Tritanopia (Blue-Yellow)' },
];

function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function formatPct(value) {
  return `${Math.round(value * 100)}%`;
}

function formatGlaucoma(value) {
  const pct = Math.round(value * 100);
  if (pct <= 0) return '0%';
  if (pct >= 98) return '100% Blind';
  if (pct >= 75) return `${pct}% Tunnel`;
  if (pct >= 45) return `${pct}% Mod.`;
  return `${pct}% Early`;
}

function formatAmd(value) {
  const pct = Math.round(value * 100);
  if (pct <= 0) return '0%';
  if (pct >= 95) return `${pct}% Dense`;
  if (pct >= 55) return `${pct}% Scotoma`;
  return `${pct}% Warp`;
}

function formatCataract(value) {
  const pct = Math.round(value * 100);
  if (pct <= 0) return '0%';
  if (pct >= 95) return `${pct}% Light`;
  if (pct >= 55) return `${pct}% Glare`;
  return `${pct}% Haze`;
}

function formatDr(value) {
  const pct = Math.round(value * 100);
  if (pct <= 0) return '0%';
  if (pct >= 95) return `${pct}% Heme`;
  if (pct >= 55) return `${pct}% Blotch`;
  return `${pct}% Mild`;
}

function formatRp(value) {
  const pct = Math.round(value * 100);
  if (pct <= 0) return '0%';
  if (pct >= 98) return '100% Blind';
  if (pct >= 65) return `${pct}% Tunnel`;
  return `${pct}% Ring`;
}

function formatDiopter(value, decimals = 1) {
  const sign = value > 0.001 ? '+' : '';
  return `${sign}${value.toFixed(decimals)} D`;
}

function formatMinusDiopter(value) {
  return value > 0.001 ? `-${value.toFixed(2)} D` : '0.00 D';
}

function formatAxis(value) {
  return `${Math.round(value)}°`;
}

function formatDeg(value) {
  const sign = value > 0.004 ? '+' : '';
  return `${sign}${value.toFixed(2)}°`;
}

const PRIMARY_GROUPS = [
  {
    title: 'Eye Conditions',
    controls: [
      { key: 'glaucoma', label: 'Glaucoma', kind: 'range', format: formatGlaucoma },
      { key: 'amd', label: 'Wet AMD', kind: 'range', format: formatAmd },
      { key: 'cataract', label: 'Cataracts', kind: 'range', format: formatCataract },
      { key: 'diabeticRetinopathy', label: 'Diabetic Retinop.', kind: 'range', format: formatDr },
      { key: 'retinitisPigmentosa', label: 'Retinitis Pigm.', kind: 'range', format: formatRp },
      { key: 'albinism', label: 'Ocular Albinism', kind: 'range', format: formatPct },
      { key: 'myopiaD', label: 'Myopia', kind: 'range', format: formatMinusDiopter },
      { key: 'presbyopiaD', label: 'Presbyopia', kind: 'range', format: (v) => formatDiopter(v, 2) },
      { key: 'astigmatismD', label: 'Astigmatism', kind: 'range', format: (v) => formatDiopter(v, 2) },
      { key: 'cvdType', label: 'Color Blindness', kind: 'select', options: CVD_TYPE_OPTIONS },
      { key: 'cvdSeverity', label: 'Color Shift', kind: 'range', format: formatPct },
    ],
  },
  {
    title: 'Vision & Symptoms',
    controls: [
      { key: '_acuityBoth', label: 'Visual Acuity', kind: 'acuityBoth', format: formatSnellenAcuity },
      { key: 'mlnScale', label: 'Nystagmus', kind: 'range', format: formatPct },
      { key: 'floaters', label: 'Floaters', kind: 'range', format: formatPct },
      { key: 'phosphenes', label: 'Phosphenes', kind: 'range', format: formatPct },
      { key: 'tinnitus', label: 'Tinnitus Volume', kind: 'range', format: formatPct },
    ],
  },
];

const ADVANCED_CONTROLS = [
  { key: 'lensProfile', label: 'Glasses / Lens', kind: 'select', options: LENS_PROFILE_OPTIONS },
  { key: 'frameShape', label: 'Frame Shape', kind: 'select', options: FRAME_SHAPE_OPTIONS },
  { key: 'frameColor', label: 'Frame Color', kind: 'select', options: FRAME_COLOR_OPTIONS },
  { key: 'lensPowerD', label: 'Lens Power', kind: 'range', format: (v) => formatDiopter(v, 2) },
  { key: 'nearAddD', label: 'Near Add', kind: 'range', format: (v) => formatDiopter(v, 2) },
  { key: 'lensCylD', label: 'Glasses Cylinder', kind: 'range', format: (v) => formatDiopter(v, 2) },
  { key: 'lensAxisDeg', label: 'Glasses Axis', kind: 'range', format: formatAxis },
  { key: 'astigmatismAxisDeg', label: 'Eye Astig. Axis', kind: 'range', format: formatAxis },
  { key: 'dominantEye', label: 'Dominant Eye', kind: 'select', options: DOMINANT_EYE_OPTIONS },
  { key: 'vodAcuity', label: 'Right Eye (OD)', kind: 'range', format: formatSnellenAcuity },
  { key: 'vosAcuity', label: 'Left Eye (OS)', kind: 'range', format: formatSnellenAcuity },
  { key: 'diplopiaH', label: 'Double Vision H', kind: 'range', format: formatDeg },
  { key: 'diplopiaV', label: 'Double Vision V', kind: 'range', format: formatDeg },
];

/**
 * Strictly CSP-safe visual settings drawer (DOM APIs only, CSS-class styled).
 */
export function createSettingsDrawer(rootElement, initialState, callbacks = {}) {
  const drawer = makeEl('aside', 'settings-drawer is-hidden');
  drawer.setAttribute('aria-label', 'Visual Settings');

  // Header
  const header = makeEl('div', 'settings-header');
  const titleWrap = makeEl('div', 'settings-title-wrap');
  const title = makeEl('h2', 'settings-title', 'Visual Settings');
  const statusBadge = makeEl('span', 'settings-badge', 'Vuarbit 1994');
  titleWrap.replaceChildren(title, statusBadge);

  const headerActions = makeEl('div', 'settings-header-actions');
  const compareBtn = makeEl('button', 'settings-btn', 'Compare (V)');
  compareBtn.type = 'button';
  compareBtn.setAttribute('aria-pressed', 'false');
  const resetBtn = makeEl('button', 'settings-btn', 'Reset');
  resetBtn.type = 'button';
  const closeBtn = makeEl('button', 'settings-btn settings-btn-close', 'Close (P)');
  closeBtn.type = 'button';
  headerActions.replaceChildren(compareBtn, resetBtn, closeBtn);
  header.replaceChildren(titleWrap, headerActions);

  // Scrollable body
  const body = makeEl('div', 'settings-body');

  const listeners = [];

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    listeners.push({ target, type, handler });
  }

  // Scene switcher section (extensible across P3-P5 environments)
  const sceneSection = makeEl('section', 'setting-group');
  const sceneHeading = makeEl('h3', 'setting-group-title', 'Scene');
  const sceneRow = makeEl('label', 'setting-row');
  const sceneLbl = makeEl('span', 'setting-label', 'Environment');
  const sceneSelect = makeEl('select', 'setting-select');
  for (const sc of SCENES) {
    const optionEl = makeEl('option', null, sc.label);
    optionEl.value = sc.id;
    sceneSelect.appendChild(optionEl);
  }
  listen(sceneSelect, 'change', () => {
    callbacks.onSceneChange?.(sceneSelect.value);
  });
  sceneRow.replaceChildren(sceneLbl, sceneSelect);
  const sceneDesc = makeEl('p', 'persona-desc', '');
  sceneSection.replaceChildren(sceneHeading, sceneRow, sceneDesc);
  body.appendChild(sceneSection);

  // Presets section (split cleanly into Vuarbit Profiles vs Eye Conditions)
  const presetSection = makeEl('section', 'setting-group');
  const presetHeading = makeEl('h3', 'setting-group-title', 'Presets');
  const vuarbitSub = makeEl('div', 'persona-sublabel', 'Profiles');
  const vuarbitGrid = makeEl('div', 'persona-grid');
  const condSub = makeEl('div', 'persona-sublabel', 'Eye Conditions');
  const condGrid = makeEl('div', 'persona-grid');
  const personaButtons = new Map();

  for (const persona of PERSONAS) {
    const btn = makeEl('button', 'persona-btn', persona.shortName);
    btn.type = 'button';
    btn.setAttribute('data-persona-id', persona.id);
    btn.setAttribute('aria-pressed', 'false');
    (persona.group === 'vuarbit' ? vuarbitGrid : condGrid).appendChild(btn);
    personaButtons.set(persona.id, btn);
  }

  const personaDesc = makeEl('p', 'persona-desc', '');
  presetSection.replaceChildren(presetHeading, vuarbitSub, vuarbitGrid, condSub, condGrid, personaDesc);
  body.appendChild(presetSection);

  const settingControls = new Map();
  let acuityBothCtrl = null;

  function buildControlRow(cfg) {
    const row = makeEl('label', 'setting-row');
    const lbl = makeEl('span', 'setting-label', cfg.label);

    if (cfg.kind === 'select') {
      const spec = SETTING_SPECS[cfg.key];
      const select = makeEl('select', 'setting-select');
      for (const opt of cfg.options) {
        const optionEl = makeEl('option', null, opt.label);
        optionEl.value = opt.value;
        select.appendChild(optionEl);
      }
      listen(select, 'change', () => {
        lastValues.set(cfg.key, select.value);
        callbacks.onSettingChange?.(cfg.key, select.value);
      });
      row.replaceChildren(lbl, select);
      settingControls.set(cfg.key, { kind: 'select', row, input: select, spec });
      return row;
    }

    const spec = cfg.kind === 'acuityBoth' ? SETTING_SPECS.vodAcuity : SETTING_SPECS[cfg.key];
    const controlWrap = makeEl('div', 'setting-control');
    const input = makeEl('input', 'setting-range');
    input.type = 'range';
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    const readout = makeEl('span', 'setting-value', '');

    listen(input, 'input', () => {
      const val = Number(input.value);
      readout.textContent = cfg.format(val);
      if (cfg.kind === 'acuityBoth') {
        callbacks.onSettingChange?.('vodAcuity', val);
        callbacks.onSettingChange?.('vosAcuity', val);
      } else {
        callbacks.onSettingChange?.(cfg.key, val);
      }
    });

    controlWrap.replaceChildren(input, readout);
    row.replaceChildren(lbl, controlWrap);
    const ctrl = { kind: cfg.kind, row, input, readout, format: cfg.format, spec };
    if (cfg.kind === 'acuityBoth') {
      acuityBothCtrl = ctrl;
    } else {
      settingControls.set(cfg.key, ctrl);
    }
    return row;
  }

  for (const group of PRIMARY_GROUPS) {
    const section = makeEl('section', 'setting-group');
    section.appendChild(makeEl('h3', 'setting-group-title', group.title));
    for (const cfg of group.controls) {
      section.appendChild(buildControlRow(cfg));
    }
    body.appendChild(section);
  }

  // Collapsed Optics & Binocular Details accordion (native <details>, CSP-safe)
  const advDetails = makeEl('details', 'setting-group setting-details');
  const advSummary = makeEl('summary', 'setting-details-summary', 'Optics & Binocular Details');
  const advBody = makeEl('div', 'setting-details-body');
  const glassesRow = makeEl('div', 'setting-row');
  const glassesLbl = makeEl('span', 'setting-label', 'Wear Glasses (Z)');
  const glassesToggleBtn = makeEl('button', 'settings-btn', 'OFF');
  glassesToggleBtn.type = 'button';
  glassesToggleBtn.setAttribute('aria-pressed', 'false');
  listen(glassesToggleBtn, 'click', () => {
    callbacks.onGlassesToggle?.();
  });
  glassesRow.replaceChildren(glassesLbl, glassesToggleBtn);
  advBody.appendChild(glassesRow);
  for (const cfg of ADVANCED_CONTROLS) {
    advBody.appendChild(buildControlRow(cfg));
  }
  advDetails.replaceChildren(advSummary, advBody);
  body.appendChild(advDetails);

  // Lighting section (Time of Day + Ceiling Lights)
  const lightSection = makeEl('section', 'setting-group');
  const lightHeading = makeEl('h3', 'setting-group-title', 'Lighting');
  const todRow = makeEl('label', 'setting-row');
  const todLbl = makeEl('span', 'setting-label', 'Time of Day (T)');
  const todSelect = makeEl('select', 'setting-select');
  for (const preset of Object.values(TIME_OF_DAY_PRESETS)) {
    const optionEl = makeEl('option', null, preset.label);
    optionEl.value = preset.id;
    todSelect.appendChild(optionEl);
  }
  listen(todSelect, 'change', () => {
    lastTimeOfDay = todSelect.value;
    callbacks.onTimeOfDayChange?.(todSelect.value);
  });
  todRow.replaceChildren(todLbl, todSelect);

  const lightsRow = makeEl('div', 'setting-row');
  const lightsLbl = makeEl('span', 'setting-label', 'Ceiling Lights (L)');
  const lightsBtn = makeEl('button', 'settings-btn', 'ON');
  lightsBtn.type = 'button';
  lightsBtn.setAttribute('aria-pressed', 'true');
  listen(lightsBtn, 'click', () => {
    callbacks.onLightsToggle?.();
  });
  lightsRow.replaceChildren(lightsLbl, lightsBtn);

  const glareRow = makeEl('div', 'setting-row is-hidden');
  const glareLbl = makeEl('span', 'setting-label', 'Glare Lamp');
  const glareBtn = makeEl('button', 'settings-btn', 'ON');
  glareBtn.type = 'button';
  glareBtn.setAttribute('aria-pressed', 'true');
  listen(glareBtn, 'click', () => {
    callbacks.onGlareLightToggle?.();
  });
  glareRow.replaceChildren(glareLbl, glareBtn);

  lightSection.replaceChildren(lightHeading, todRow, lightsRow, glareRow);
  body.appendChild(lightSection);

  // Graphics Quality section
  const qualitySection = makeEl('section', 'setting-group');
  const qualityHeading = makeEl('h3', 'setting-group-title', 'Graphics');
  const qualityRow = makeEl('label', 'setting-row');
  const qualityLbl = makeEl('span', 'setting-label', 'Resolution Scale');
  const qualitySelect = makeEl('select', 'setting-select');
  for (const preset of Object.values(QUALITY_PRESETS)) {
    const optionEl = makeEl('option', null, preset.label);
    optionEl.value = preset.id;
    qualitySelect.appendChild(optionEl);
  }
  listen(qualitySelect, 'change', () => {
    lastQuality = qualitySelect.value;
    callbacks.onQualityChange?.(qualitySelect.value);
  });
  qualityRow.replaceChildren(qualityLbl, qualitySelect);
  qualitySection.replaceChildren(qualityHeading, qualityRow);
  body.appendChild(qualitySection);

  drawer.replaceChildren(header, body);
  rootElement.appendChild(drawer);

  // Button handlers
  listen(compareBtn, 'click', () => {
    callbacks.onCompareToggle?.();
  });

  listen(resetBtn, 'click', () => {
    callbacks.onReset?.();
  });

  listen(closeBtn, 'click', () => {
    callbacks.onClose?.();
  });

  const onPresetClick = (e) => {
    const btn = e.target instanceof Element ? e.target.closest('[data-persona-id]') : null;
    if (!btn) return;
    const id = btn.getAttribute('data-persona-id');
    if (id) callbacks.onSelectPersona?.(id);
  };
  listen(vuarbitGrid, 'click', onPresetClick);
  listen(condGrid, 'click', onPresetClick);

  // Prevent camera look / wheel zoom / keybinds while interacting inside drawer
  listen(drawer, 'mousedown', (e) => e.stopPropagation());
  listen(drawer, 'click', (e) => e.stopPropagation());
  listen(drawer, 'wheel', (e) => e.stopPropagation(), { passive: true });
  listen(drawer, 'keydown', (e) => {
    if (
      e.code === 'KeyP' ||
      e.code === 'Escape' ||
      e.code === 'KeyV' ||
      e.code === 'KeyZ' ||
      e.code === 'KeyL' ||
      e.code === 'KeyT' ||
      e.code === 'KeyC'
    ) {
      return;
    }
    e.stopPropagation();
  });

  let lastOpen = null;
  let lastSceneId = null;
  let lastPersonaId = null;
  let lastCompare = null;
  let lastGlassesOn = null;
  let lastGlassesDisabled = null;
  let lastTimeOfDay = null;
  let lastLightsOn = null;
  let lastGlareLightOn = null;
  let lastQuality = null;
  let lastAcuityBoth = null;
  const lastValues = new Map();
  const lastDisabled = new Map();

  function setDisabled(ctrl, disabled) {
    const prev = lastDisabled.get(ctrl.input);
    if (prev === disabled) return;
    lastDisabled.set(ctrl.input, disabled);
    ctrl.input.disabled = disabled;
    ctrl.row.classList.toggle('is-disabled', disabled);
  }

  function sync(state, force = false) {
    const open = Boolean(state.settingsOpen);
    if (force || open !== lastOpen) {
      lastOpen = open;
      drawer.classList.toggle('is-hidden', !open);
    }
    if (!open && !force) return;

    const sceneId = state.sceneId || 'classroom';
    if (force || sceneId !== lastSceneId) {
      lastSceneId = sceneId;
      if (document.activeElement !== sceneSelect) {
        sceneSelect.value = sceneId;
      }
      const sc = getSceneById(sceneId);
      sceneDesc.textContent = sc ? sc.description : '';
      glareRow.classList.toggle('is-hidden', sceneId !== 'exam_room');
    }

    const comparing = Boolean(state.compareNormal);
    if (force || comparing !== lastCompare) {
      lastCompare = comparing;
      compareBtn.classList.toggle('is-active', comparing);
      compareBtn.setAttribute('aria-pressed', comparing ? 'true' : 'false');
    }

    const personaId = state.personaId || 'vuarbit_1994';
    if (force || personaId !== lastPersonaId) {
      lastPersonaId = personaId;
      const persona = personaId === 'custom' ? null : getPersonaById(personaId);
      statusBadge.textContent = persona ? persona.shortName : 'Custom';
      personaDesc.textContent = persona
        ? persona.description
        : 'Custom clinical parameter configuration.';
      for (const [id, btn] of personaButtons) {
        const active = id === personaId;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    }

    const s = state.settings || {};
    const lensDisabled = s.lensProfile === 'none';
    const addDisabled = s.lensProfile === 'none' || s.lensProfile === 'single_vision';
    const cylDisabled = s.lensProfile === 'none' || s.lensProfile === 'aphakic_bifocal';
    const lensAxisDisabled = cylDisabled || (s.lensCylD || 0) <= 0.05;
    const astigDisabled = (s.astigmatismD || 0) <= 0.05;
    const cvdDisabled = !s.cvdType || s.cvdType === 'none';

    const gOn = Boolean(state.glassesOn) && !lensDisabled;
    if (force || gOn !== lastGlassesOn || lensDisabled !== lastGlassesDisabled) {
      lastGlassesOn = gOn;
      lastGlassesDisabled = lensDisabled;
      glassesToggleBtn.disabled = lensDisabled;
      glassesToggleBtn.textContent = lensDisabled ? 'No Lens' : gOn ? 'ON' : 'OFF';
      glassesToggleBtn.classList.toggle('is-active', gOn);
      glassesToggleBtn.setAttribute('aria-pressed', gOn ? 'true' : 'false');
      glassesRow.classList.toggle('is-disabled', lensDisabled);
    }

    if (acuityBothCtrl) {
      const domKey = s.dominantEye === 'OS' ? 'vosAcuity' : 'vodAcuity';
      const domAcuity = Number.isFinite(s[domKey]) ? s[domKey] : SETTING_SPECS.vodAcuity.default;
      const active = document.activeElement === acuityBothCtrl.input;
      if (force || domAcuity !== lastAcuityBoth) {
        acuityBothCtrl.readout.textContent = acuityBothCtrl.format(domAcuity);
        if (!active) {
          acuityBothCtrl.input.value = String(domAcuity);
          lastAcuityBoth = domAcuity;
        }
      }
    }

    for (const [key, ctrl] of settingControls) {
      const rawVal = s[key] !== undefined ? s[key] : ctrl.spec.default;
      const prevVal = lastValues.get(key);

      if (ctrl.kind === 'select') {
        const active = document.activeElement === ctrl.input;
        if (force || (rawVal !== prevVal && !active)) {
          ctrl.input.value = String(rawVal);
          lastValues.set(key, rawVal);
        }
      } else {
        const numVal = Number.isFinite(rawVal) ? rawVal : ctrl.spec.default;
        const active = document.activeElement === ctrl.input;
        if (force || numVal !== prevVal) {
          ctrl.readout.textContent = ctrl.format(numVal);
          if (!active) {
            ctrl.input.value = String(numVal);
            lastValues.set(key, numVal);
          }
        }
      }

      if (key === 'lensPowerD' || key === 'frameShape' || key === 'frameColor') {
        setDisabled(ctrl, lensDisabled);
      } else if (key === 'nearAddD') {
        setDisabled(ctrl, addDisabled);
      } else if (key === 'lensCylD') {
        setDisabled(ctrl, cylDisabled);
      } else if (key === 'lensAxisDeg') {
        setDisabled(ctrl, lensAxisDisabled);
      } else if (key === 'astigmatismAxisDeg') {
        setDisabled(ctrl, astigDisabled);
      } else if (key === 'cvdSeverity') {
        setDisabled(ctrl, cvdDisabled);
      }
    }

    const tod = state.timeOfDay || 'sunny';
    if (force || (tod !== lastTimeOfDay && document.activeElement !== todSelect)) {
      lastTimeOfDay = tod;
      todSelect.value = tod;
    }

    const lightsOn = state.lightsOn !== false;
    if (force || lightsOn !== lastLightsOn) {
      lastLightsOn = lightsOn;
      lightsBtn.textContent = lightsOn ? 'ON' : 'OFF';
      lightsBtn.classList.toggle('is-active', lightsOn);
      lightsBtn.setAttribute('aria-pressed', lightsOn ? 'true' : 'false');
    }

    const glareOn = state.glareLightOn !== false;
    if (force || glareOn !== lastGlareLightOn) {
      lastGlareLightOn = glareOn;
      glareBtn.textContent = glareOn ? 'ON' : 'OFF';
      glareBtn.classList.toggle('is-active', glareOn);
      glareBtn.setAttribute('aria-pressed', glareOn ? 'true' : 'false');
    }

    const quality = state.qualityPreset || 'high';
    if (force || (quality !== lastQuality && document.activeElement !== qualitySelect)) {
      lastQuality = quality;
      qualitySelect.value = quality;
    }
  }

  function dispose() {
    for (const { target, type, handler } of listeners) {
      target.removeEventListener(type, handler);
    }
    listeners.length = 0;
    drawer.remove();
  }

  sync(initialState, true);
  return { sync, dispose };
}
