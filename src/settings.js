import { PERSONAS, QUALITY_PRESETS, SETTING_SPECS, getPersonaById } from './personas.js';

const PERSONA_BUTTON_LABELS = {
  vuarbit_1994: 'Vuarbit 1994',
  normal: 'Normal Vision',
  glaucoma: 'Glaucoma',
  amd: 'Wet AMD',
  albinism: 'Ocular Albinism',
  cataracts: 'Cataracts',
  deuteranopia: 'Deuteranopia',
};

const LENS_PROFILE_OPTIONS = [
  { value: 'aphakic_bifocal', label: 'Aphakic Bifocal' },
  { value: 'none', label: 'None (Emmetropic)' },
];

const DOMINANT_EYE_OPTIONS = [
  { value: 'OD', label: 'OD' },
  { value: 'OS', label: 'OS' },
];

const CVD_TYPE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'deutan', label: 'Deuteranopia' },
  { value: 'protan', label: 'Protanopia' },
  { value: 'tritan', label: 'Tritanopia' },
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

function formatScale(value) {
  return `${value.toFixed(2)}x`;
}

function formatDiopter(value, decimals = 1) {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)} D`;
}

function formatDeg(value) {
  const sign = value > 0.004 ? '+' : '';
  return `${sign}${value.toFixed(2)}°`;
}

const PARAMETER_GROUPS = [
  {
    title: 'Optics & Binocularity',
    controls: [
      { key: 'lensProfile', label: 'Lens Profile', kind: 'select', options: LENS_PROFILE_OPTIONS },
      { key: 'lensPowerD', label: 'Distance Power', kind: 'range', format: (v) => formatDiopter(v, 1) },
      { key: 'nearAddD', label: 'Near Add', kind: 'range', format: (v) => formatDiopter(v, 2) },
      { key: 'dominantEye', label: 'Dominant Eye', kind: 'select', options: DOMINANT_EYE_OPTIONS },
      { key: 'vodAcuity', label: 'OD Acuity', kind: 'range', format: (v) => v.toFixed(2) },
      { key: 'vosAcuity', label: 'OS Acuity', kind: 'range', format: (v) => v.toFixed(2) },
      { key: 'diplopiaH', label: 'Diplopia Horiz', kind: 'range', format: formatDeg },
      { key: 'diplopiaV', label: 'Diplopia Vert', kind: 'range', format: formatDeg },
    ],
  },
  {
    title: 'Ocular & Entoptic',
    controls: [
      { key: 'mlnScale', label: 'MLN Scale', kind: 'range', format: formatScale },
      { key: 'phosphenes', label: 'Phosphenes', kind: 'range', format: formatScale },
      { key: 'floaters', label: 'Floaters', kind: 'range', format: formatScale },
      { key: 'tinnitus', label: 'Tinnitus', kind: 'range', format: formatScale },
    ],
  },
  {
    title: 'Clinical Conditions',
    controls: [
      { key: 'glaucoma', label: 'Glaucoma', kind: 'range', format: formatPct },
      { key: 'amd', label: 'Wet AMD', kind: 'range', format: formatPct },
      { key: 'albinism', label: 'Ocular Albinism', kind: 'range', format: formatPct },
      { key: 'cataract', label: 'Cataracts', kind: 'range', format: formatPct },
    ],
  },
  {
    title: 'Color Vision (Machado 2009)',
    controls: [
      { key: 'cvdType', label: 'CVD Type', kind: 'select', options: CVD_TYPE_OPTIONS },
      { key: 'cvdSeverity', label: 'CVD Severity', kind: 'range', format: formatPct },
    ],
  },
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
  const resetBtn = makeEl('button', 'settings-btn', 'Reset');
  resetBtn.type = 'button';
  const closeBtn = makeEl('button', 'settings-btn settings-btn-close', 'Close (P)');
  closeBtn.type = 'button';
  headerActions.replaceChildren(resetBtn, closeBtn);
  header.replaceChildren(titleWrap, headerActions);

  // Scrollable body
  const body = makeEl('div', 'settings-body');

  // Named Personas section
  const personaSection = makeEl('section', 'setting-group');
  const personaHeading = makeEl('h3', 'setting-group-title', 'Named Personas');
  const personaGrid = makeEl('div', 'persona-grid');
  const personaButtons = new Map();

  for (const persona of PERSONAS) {
    const label = PERSONA_BUTTON_LABELS[persona.id] || persona.shortName;
    const btn = makeEl('button', 'persona-btn', label);
    btn.type = 'button';
    btn.setAttribute('data-persona-id', persona.id);
    btn.setAttribute('aria-pressed', 'false');
    personaGrid.appendChild(btn);
    personaButtons.set(persona.id, btn);
  }

  const personaDesc = makeEl('p', 'persona-desc', '');
  personaSection.replaceChildren(personaHeading, personaGrid, personaDesc);
  body.appendChild(personaSection);

  // Clinical Parameters sections
  const settingControls = new Map();
  const listeners = [];

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    listeners.push({ target, type, handler });
  }

  for (const group of PARAMETER_GROUPS) {
    const section = makeEl('section', 'setting-group');
    const heading = makeEl('h3', 'setting-group-title', group.title);
    section.appendChild(heading);

    for (const cfg of group.controls) {
      const spec = SETTING_SPECS[cfg.key];
      const row = makeEl('label', 'setting-row');
      const lbl = makeEl('span', 'setting-label', cfg.label);

      if (cfg.kind === 'select') {
        const select = makeEl('select', 'setting-select');
        for (const opt of cfg.options) {
          const optionEl = makeEl('option', null, opt.label);
          optionEl.value = opt.value;
          select.appendChild(optionEl);
        }
        listen(select, 'change', () => {
          callbacks.onSettingChange?.(cfg.key, select.value);
        });
        row.replaceChildren(lbl, select);
        settingControls.set(cfg.key, { kind: 'select', row, input: select, spec });
      } else {
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
          callbacks.onSettingChange?.(cfg.key, val);
        });

        controlWrap.replaceChildren(input, readout);
        row.replaceChildren(lbl, controlWrap);
        settingControls.set(cfg.key, {
          kind: 'range',
          row,
          input,
          readout,
          format: cfg.format,
          spec,
        });
      }

      section.appendChild(row);
    }

    body.appendChild(section);
  }

  // Graphics Quality section
  const qualitySection = makeEl('section', 'setting-group');
  const qualityHeading = makeEl('h3', 'setting-group-title', 'Graphics Quality');
  const qualityRow = makeEl('label', 'setting-row');
  const qualityLbl = makeEl('span', 'setting-label', 'Resolution Scale');
  const qualitySelect = makeEl('select', 'setting-select');
  for (const preset of Object.values(QUALITY_PRESETS)) {
    const optionEl = makeEl('option', null, preset.label);
    optionEl.value = preset.id;
    qualitySelect.appendChild(optionEl);
  }
  listen(qualitySelect, 'change', () => {
    callbacks.onQualityChange?.(qualitySelect.value);
  });
  qualityRow.replaceChildren(qualityLbl, qualitySelect);
  qualitySection.replaceChildren(qualityHeading, qualityRow);
  body.appendChild(qualitySection);

  drawer.replaceChildren(header, body);
  rootElement.appendChild(drawer);

  // Button handlers
  listen(resetBtn, 'click', () => {
    callbacks.onReset?.();
  });

  listen(closeBtn, 'click', () => {
    callbacks.onClose?.();
  });

  listen(personaGrid, 'click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('[data-persona-id]') : null;
    if (!btn) return;
    const id = btn.getAttribute('data-persona-id');
    if (id) callbacks.onSelectPersona?.(id);
  });

  // Prevent camera look / wheel zoom / keybinds while interacting inside drawer
  listen(drawer, 'mousedown', (e) => e.stopPropagation());
  listen(drawer, 'click', (e) => e.stopPropagation());
  listen(drawer, 'wheel', (e) => e.stopPropagation(), { passive: true });
  listen(drawer, 'keydown', (e) => {
    if (e.code === 'KeyP' || e.code === 'Escape') return;
    e.stopPropagation();
  });

  let lastOpen = null;
  let lastPersonaId = null;
  let lastQuality = null;
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
    const cvdDisabled = !s.cvdType || s.cvdType === 'none';

    for (const [key, ctrl] of settingControls) {
      const rawVal = s[key] !== undefined ? s[key] : ctrl.spec.default;
      const prevVal = lastValues.get(key);

      if (ctrl.kind === 'select') {
        if (force || rawVal !== prevVal || ctrl.input.value !== String(rawVal)) {
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
        } else if (!active && ctrl.input.value !== String(numVal) && prevVal === undefined) {
          ctrl.input.value = String(numVal);
        }
      }

      if (key === 'lensPowerD' || key === 'nearAddD') {
        setDisabled(ctrl, lensDisabled);
      } else if (key === 'cvdSeverity') {
        setDisabled(ctrl, cvdDisabled);
      }
    }

    const quality = state.qualityPreset || 'high';
    if (force || quality !== lastQuality) {
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
