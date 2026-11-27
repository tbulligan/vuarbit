import {
  PERSONAS,
  QUALITY_PRESETS,
  SCENES,
  SETTING_SPECS,
  TIME_OF_DAY_PRESETS,
  formatSnellenAcuity,
  getPersonaById,
  getSceneById,
  resolveIolGlassesOptics,
} from './personas.js';
import { LANGUAGE_OPTIONS, normalizeLanguage, t } from './i18n.js';

const LENS_PROFILE_OPTIONS = [
  { value: 'aphakic_bifocal', key: 'opt.lens.aphakic_bifocal' },
  { value: 'pseudophakic_iol', key: 'opt.lens.pseudophakic_iol' },
  { value: 'single_vision', key: 'opt.lens.single_vision' },
  { value: 'bifocal', key: 'opt.lens.bifocal' },
  { value: 'progressive', key: 'opt.lens.progressive' },
  { value: 'none', key: 'opt.lens.none' },
];

const FRAME_SHAPE_OPTIONS = [
  { value: 'auto', key: 'opt.shape.auto' },
  { value: 'round', key: 'opt.shape.round' },
  { value: 'rect', key: 'opt.shape.rect' },
  { value: 'rounded_rect', key: 'opt.shape.rounded_rect' },
  { value: 'semi_rimless', key: 'opt.shape.semi_rimless' },
  { value: 'rimless', key: 'opt.shape.rimless' },
];

const FRAME_COLOR_OPTIONS = [
  { value: 'auto', key: 'opt.color.auto' },
  { value: 'amber', key: 'opt.color.amber' },
  { value: 'charcoal', key: 'opt.color.charcoal' },
  { value: 'tortoise', key: 'opt.color.tortoise' },
  { value: 'titanium', key: 'opt.color.titanium' },
  { value: 'gold', key: 'opt.color.gold' },
  { value: 'navy', key: 'opt.color.navy' },
  { value: 'burgundy', key: 'opt.color.burgundy' },
];

const DOMINANT_EYE_OPTIONS = [
  { value: 'OD', key: 'opt.eye.OD' },
  { value: 'OS', key: 'opt.eye.OS' },
];

const CVD_TYPE_OPTIONS = [
  { value: 'none', key: 'opt.cvd.none' },
  { value: 'deutan', key: 'opt.cvd.deutan' },
  { value: 'protan', key: 'opt.cvd.protan' },
  { value: 'tritan', key: 'opt.cvd.tritan' },
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

function formatGlaucoma(value, lang) {
  const pct = Math.round(value * 100);
  if (pct <= 0) return '0%';
  if (pct >= 98) return `100% ${t(lang, 'stage.blind')}`;
  if (pct >= 75) return `${pct}% ${t(lang, 'stage.tunnel')}`;
  if (pct >= 45) return `${pct}% ${t(lang, 'stage.mod')}`;
  return `${pct}% ${t(lang, 'stage.early')}`;
}

function formatAmd(value, lang) {
  const pct = Math.round(value * 100);
  if (pct <= 0) return '0%';
  if (pct >= 95) return `${pct}% ${t(lang, 'stage.dense')}`;
  if (pct >= 55) return `${pct}% ${t(lang, 'stage.scotoma')}`;
  return `${pct}% ${t(lang, 'stage.warp')}`;
}

function formatCataract(value, lang) {
  const pct = Math.round(value * 100);
  if (pct <= 0) return '0%';
  if (pct >= 95) return `${pct}% ${t(lang, 'stage.light')}`;
  if (pct >= 55) return `${pct}% ${t(lang, 'stage.glare')}`;
  return `${pct}% ${t(lang, 'stage.haze')}`;
}

function formatDr(value, lang) {
  const pct = Math.round(value * 100);
  if (pct <= 0) return '0%';
  if (pct >= 95) return `${pct}% ${t(lang, 'stage.heme')}`;
  if (pct >= 55) return `${pct}% ${t(lang, 'stage.blotch')}`;
  return `${pct}% ${t(lang, 'stage.mild')}`;
}

function formatRp(value, lang) {
  const pct = Math.round(value * 100);
  if (pct <= 0) return '0%';
  if (pct >= 98) return `100% ${t(lang, 'stage.blind')}`;
  if (pct >= 65) return `${pct}% ${t(lang, 'stage.tunnel')}`;
  return `${pct}% ${t(lang, 'stage.ring')}`;
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
    titleKey: 'settings.section.conditions',
    controls: [
      { key: 'glaucoma', labelKey: 'param.glaucoma', kind: 'range', format: formatGlaucoma },
      { key: 'amd', labelKey: 'param.amd', kind: 'range', format: formatAmd },
      { key: 'cataract', labelKey: 'param.cataract', kind: 'range', format: formatCataract },
      { key: 'diabeticRetinopathy', labelKey: 'param.diabeticRetinopathy', kind: 'range', format: formatDr },
      { key: 'retinitisPigmentosa', labelKey: 'param.retinitisPigmentosa', kind: 'range', format: formatRp },
      { key: 'albinism', labelKey: 'param.albinism', kind: 'range', format: formatPct },
      { key: 'myopiaD', labelKey: 'param.myopiaD', kind: 'range', format: formatMinusDiopter },
      { key: 'presbyopiaD', labelKey: 'param.presbyopiaD', kind: 'range', format: (v) => formatDiopter(v, 2) },
      { key: 'astigmatismD', labelKey: 'param.astigmatismD', kind: 'range', format: (v) => formatDiopter(v, 2) },
      { key: 'cvdType', labelKey: 'param.cvdType', kind: 'select', options: CVD_TYPE_OPTIONS },
      { key: 'cvdSeverity', labelKey: 'param.cvdSeverity', kind: 'range', format: formatPct },
    ],
  },
  {
    titleKey: 'settings.section.symptoms',
    controls: [
      { key: '_acuityBoth', labelKey: 'param.acuityBoth', kind: 'acuityBoth', format: formatSnellenAcuity },
      { key: 'mlnScale', labelKey: 'param.mlnScale', kind: 'range', format: formatPct },
      { key: 'floaters', labelKey: 'param.floaters', kind: 'range', format: formatPct },
      { key: 'phosphenes', labelKey: 'param.phosphenes', kind: 'range', format: formatPct },
      { key: 'tinnitus', labelKey: 'param.tinnitus', kind: 'range', format: formatPct },
    ],
  },
];

const ADVANCED_CONTROLS = [
  { key: 'lensProfile', labelKey: 'param.lensProfile', kind: 'select', options: LENS_PROFILE_OPTIONS },
  { key: 'frameShape', labelKey: 'param.frameShape', kind: 'select', options: FRAME_SHAPE_OPTIONS },
  { key: 'frameColor', labelKey: 'param.frameColor', kind: 'select', options: FRAME_COLOR_OPTIONS },
  { key: 'lensPowerD', labelKey: 'param.lensPowerD', kind: 'range', format: (v) => formatDiopter(v, 2) },
  { key: 'nearAddD', labelKey: 'param.nearAddD', kind: 'range', format: (v) => formatDiopter(v, 2) },
  { key: 'lensCylD', labelKey: 'param.lensCylD', kind: 'range', format: (v) => formatDiopter(v, 2) },
  { key: 'lensAxisDeg', labelKey: 'param.lensAxisDeg', kind: 'range', format: formatAxis },
  { key: 'astigmatismAxisDeg', labelKey: 'param.astigmatismAxisDeg', kind: 'range', format: formatAxis },
  { key: 'dominantEye', labelKey: 'param.dominantEye', kind: 'select', options: DOMINANT_EYE_OPTIONS },
  { key: 'vodAcuity', labelKey: 'param.vodAcuity', kind: 'range', format: formatSnellenAcuity },
  { key: 'vosAcuity', labelKey: 'param.vosAcuity', kind: 'range', format: formatSnellenAcuity },
  { key: 'diplopiaH', labelKey: 'param.diplopiaH', kind: 'range', format: formatDeg },
  { key: 'diplopiaV', labelKey: 'param.diplopiaV', kind: 'range', format: formatDeg },
];

/**
 * Strictly CSP-safe visual settings drawer (DOM APIs only, CSS-class styled, live EN/IT/NL i18n).
 */
export function createSettingsDrawer(rootElement, initialState, callbacks = {}) {
  let currentLang = normalizeLanguage(initialState?.language);
  const translatables = [];
  const bindText = (el, key) => {
    translatables.push({ el, key });
    el.textContent = t(currentLang, key);
    return el;
  };

  const drawer = makeEl('aside', 'settings-drawer is-hidden');
  drawer.setAttribute('aria-label', t(currentLang, 'settings.ariaLabel'));

  // Header
  const header = makeEl('div', 'settings-header');
  const titleWrap = makeEl('div', 'settings-title-wrap');
  const title = bindText(makeEl('h2', 'settings-title'), 'settings.title');
  const statusBadge = makeEl('span', 'settings-badge', 'Vuarbit Frut');
  titleWrap.replaceChildren(title, statusBadge);

  const headerActions = makeEl('div', 'settings-header-actions');
  const compareBtn = bindText(makeEl('button', 'settings-btn'), 'settings.compareBtn');
  compareBtn.type = 'button';
  compareBtn.setAttribute('aria-pressed', 'false');
  const resetBtn = bindText(makeEl('button', 'settings-btn'), 'settings.resetBtn');
  resetBtn.type = 'button';
  const closeBtn = bindText(makeEl('button', 'settings-btn settings-btn-close'), 'settings.closeBtn');
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

  // Scene & Language section
  const sceneSection = makeEl('section', 'setting-group');
  const sceneHeading = bindText(makeEl('h3', 'setting-group-title'), 'settings.section.scene');
  const sceneRow = makeEl('label', 'setting-row');
  const sceneLbl = bindText(makeEl('span', 'setting-label'), 'settings.label.environment');
  const sceneSelect = makeEl('select', 'setting-select');
  for (const sc of SCENES) {
    const optionEl = bindText(makeEl('option', null), `scene.${sc.id}.label`);
    optionEl.value = sc.id;
    sceneSelect.appendChild(optionEl);
  }
  listen(sceneSelect, 'change', () => {
    callbacks.onSceneChange?.(sceneSelect.value);
  });
  sceneRow.replaceChildren(sceneLbl, sceneSelect);

  const langRow = makeEl('label', 'setting-row');
  const langLbl = bindText(makeEl('span', 'setting-label'), 'settings.label.language');
  const langSelect = makeEl('select', 'setting-select');
  for (const opt of LANGUAGE_OPTIONS) {
    const optionEl = makeEl('option', null, opt.label);
    optionEl.value = opt.value;
    langSelect.appendChild(optionEl);
  }
  listen(langSelect, 'change', () => {
    callbacks.onLanguageChange?.(langSelect.value);
  });
  langRow.replaceChildren(langLbl, langSelect);

  const sceneDesc = makeEl('p', 'persona-desc', '');
  sceneSection.replaceChildren(sceneHeading, sceneRow, langRow, sceneDesc);
  body.appendChild(sceneSection);

  // Presets section (Profiles vs Eye Conditions)
  const presetSection = makeEl('section', 'setting-group');
  const presetHeading = bindText(makeEl('h3', 'setting-group-title'), 'settings.section.presets');
  const vuarbitSub = bindText(makeEl('div', 'persona-sublabel'), 'settings.sub.profiles');
  const vuarbitGrid = makeEl('div', 'persona-grid');
  const condSub = bindText(makeEl('div', 'persona-sublabel'), 'settings.sub.conditions');
  const condGrid = makeEl('div', 'persona-grid');
  const personaButtons = new Map();

  for (const persona of PERSONAS) {
    const btn = bindText(makeEl('button', 'persona-btn'), `persona.${persona.id}.short`);
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
    const lbl = bindText(makeEl('span', 'setting-label'), cfg.labelKey);

    if (cfg.kind === 'select') {
      const spec = SETTING_SPECS[cfg.key];
      const select = makeEl('select', 'setting-select');
      for (const opt of cfg.options) {
        const optionEl = bindText(makeEl('option', null), opt.key);
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
      readout.textContent = cfg.format(val, currentLang);
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
    section.appendChild(bindText(makeEl('h3', 'setting-group-title'), group.titleKey));
    for (const cfg of group.controls) {
      section.appendChild(buildControlRow(cfg));
    }
    body.appendChild(section);
  }

  // Collapsed Optics & Binocular Details accordion
  const advDetails = makeEl('details', 'setting-group setting-details');
  const advSummary = bindText(makeEl('summary', 'setting-details-summary'), 'settings.section.optics');
  const advBody = makeEl('div', 'setting-details-body');
  const glassesRow = makeEl('div', 'setting-row');
  const glassesLbl = bindText(makeEl('span', 'setting-label'), 'settings.label.wearGlasses');
  const glassesToggleBtn = makeEl('button', 'settings-btn', t(currentLang, 'settings.off'));
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

  // Lighting section
  const lightSection = makeEl('section', 'setting-group');
  const lightHeading = bindText(makeEl('h3', 'setting-group-title'), 'settings.section.lighting');
  const todRow = makeEl('label', 'setting-row');
  const todLbl = bindText(makeEl('span', 'setting-label'), 'settings.label.timeOfDay');
  const todSelect = makeEl('select', 'setting-select');
  for (const preset of Object.values(TIME_OF_DAY_PRESETS)) {
    const optionEl = bindText(makeEl('option', null), `opt.tod.${preset.id}`);
    optionEl.value = preset.id;
    todSelect.appendChild(optionEl);
  }
  listen(todSelect, 'change', () => {
    lastTimeOfDay = todSelect.value;
    callbacks.onTimeOfDayChange?.(todSelect.value);
  });
  todRow.replaceChildren(todLbl, todSelect);

  const lightsRow = makeEl('div', 'setting-row');
  const lightsLbl = makeEl('span', 'setting-label', t(currentLang, 'settings.label.ceilingLights'));
  const lightsBtn = makeEl('button', 'settings-btn', t(currentLang, 'settings.on'));
  lightsBtn.type = 'button';
  lightsBtn.setAttribute('aria-pressed', 'true');
  listen(lightsBtn, 'click', () => {
    callbacks.onLightsToggle?.();
  });
  lightsRow.replaceChildren(lightsLbl, lightsBtn);

  const glareRow = makeEl('div', 'setting-row is-hidden');
  const glareLbl = bindText(makeEl('span', 'setting-label'), 'settings.label.glareLamp');
  const glareBtn = makeEl('button', 'settings-btn', t(currentLang, 'settings.on'));
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
  const qualityHeading = bindText(makeEl('h3', 'setting-group-title'), 'settings.section.graphics');
  const qualityRow = makeEl('label', 'setting-row');
  const qualityLbl = bindText(makeEl('span', 'setting-label'), 'settings.label.resScale');
  const qualitySelect = makeEl('select', 'setting-select');
  for (const preset of Object.values(QUALITY_PRESETS)) {
    const optionEl = bindText(makeEl('option', null), `opt.quality.${preset.id}`);
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

  listen(compareBtn, 'click', () => callbacks.onCompareToggle?.());
  listen(resetBtn, 'click', () => callbacks.onReset?.());
  listen(closeBtn, 'click', () => callbacks.onClose?.());

  const onPresetClick = (e) => {
    const btn = e.target instanceof Element ? e.target.closest('[data-persona-id]') : null;
    if (!btn) return;
    const id = btn.getAttribute('data-persona-id');
    if (id) callbacks.onSelectPersona?.(id);
  };
  listen(vuarbitGrid, 'click', onPresetClick);
  listen(condGrid, 'click', onPresetClick);

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
  let lastLang = null;
  let lastSceneId = null;
  let lastSceneLoading = null;
  let lastPersonaId = null;
  let lastCompare = null;
  let lastGlassesOn = null;
  let lastGlassesSlot = null;
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

  function applyStaticTranslations(lang) {
    drawer.setAttribute('aria-label', t(lang, 'settings.ariaLabel'));
    for (const item of translatables) {
      item.el.textContent = t(lang, item.key);
    }
  }

  function sync(state, force = false) {
    const open = Boolean(state.settingsOpen);
    if (force || open !== lastOpen) {
      lastOpen = open;
      drawer.classList.toggle('is-hidden', !open);
    }
    if (!open && !force) return;

    const lang = normalizeLanguage(state.language);
    const langChanged = lang !== lastLang;
    if (force || langChanged) {
      lastLang = lang;
      currentLang = lang;
      applyStaticTranslations(lang);
      if (document.activeElement !== langSelect) {
        langSelect.value = lang;
      }
    }
    const refresh = force || langChanged;

    const sceneId = state.sceneId || 'classroom';
    const sceneLoading = Boolean(state.sceneLoading);
    if (refresh || sceneLoading !== lastSceneLoading) {
      lastSceneLoading = sceneLoading;
      sceneSelect.disabled = sceneLoading;
    }
    if (refresh || sceneId !== lastSceneId) {
      lastSceneId = sceneId;
      if (document.activeElement !== sceneSelect) {
        sceneSelect.value = sceneId;
      }
      const sc = getSceneById(sceneId);
      sceneDesc.textContent = sc ? t(lang, `scene.${sc.id}.desc`) : '';
      glareRow.classList.toggle('is-hidden', sceneId !== 'exam_room');
      lightsLbl.textContent = t(
        lang,
        sceneId === 'car_passenger' ? 'settings.label.roadLights' : 'settings.label.ceilingLights'
      );
    }

    const comparing = Boolean(state.compareNormal);
    if (refresh || comparing !== lastCompare) {
      lastCompare = comparing;
      compareBtn.classList.toggle('is-active', comparing);
      compareBtn.setAttribute('aria-pressed', comparing ? 'true' : 'false');
    }

    const personaId = state.personaId || 'vuarbit_frut';
    if (refresh || personaId !== lastPersonaId) {
      lastPersonaId = personaId;
      const persona = personaId === 'custom' ? null : getPersonaById(personaId);
      statusBadge.textContent = persona ? t(lang, `persona.${persona.id}.short`) : t(lang, 'settings.custom');
      personaDesc.textContent = persona
        ? t(lang, `persona.${persona.id}.desc`)
        : t(lang, 'settings.customDesc');
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
    const isIol = s.lensProfile === 'pseudophakic_iol';
    const gSlot = isIol ? (gOn ? state.glassesSlot || 'distance' : 'off') : '';
    if (refresh || gOn !== lastGlassesOn || gSlot !== lastGlassesSlot || lensDisabled !== lastGlassesDisabled) {
      lastGlassesOn = gOn;
      lastGlassesSlot = gSlot;
      lastGlassesDisabled = lensDisabled;
      glassesToggleBtn.disabled = lensDisabled;
      if (lensDisabled) {
        glassesToggleBtn.textContent = t(lang, 'settings.noLens');
      } else if (isIol) {
        if (!gOn || gSlot === 'off') {
          glassesToggleBtn.textContent = t(lang, 'settings.off');
        } else {
          const iol = resolveIolGlassesOptics(s, gSlot, gOn);
          const sign = iol.lensPowerD > 0.001 ? '+' : '';
          glassesToggleBtn.textContent = `${t(lang, `hud.glasses.slot.${iol.slot}`)} (${sign}${iol.lensPowerD.toFixed(1)} D)`;
        }
      } else {
        glassesToggleBtn.textContent = gOn ? t(lang, 'settings.on') : t(lang, 'settings.off');
      }
      glassesToggleBtn.classList.toggle('is-active', gOn);
      glassesToggleBtn.setAttribute('aria-pressed', gOn ? 'true' : 'false');
      glassesRow.classList.toggle('is-disabled', lensDisabled);
    }

    if (acuityBothCtrl) {
      const domKey = s.dominantEye === 'OS' ? 'vosAcuity' : 'vodAcuity';
      const domAcuity = Number.isFinite(s[domKey]) ? s[domKey] : SETTING_SPECS.vodAcuity.default;
      const active = document.activeElement === acuityBothCtrl.input;
      if (refresh || domAcuity !== lastAcuityBoth) {
        acuityBothCtrl.readout.textContent = acuityBothCtrl.format(domAcuity, lang);
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
        if (refresh || (rawVal !== prevVal && !active)) {
          ctrl.input.value = String(rawVal);
          lastValues.set(key, rawVal);
        }
      } else {
        const numVal = Number.isFinite(rawVal) ? rawVal : ctrl.spec.default;
        const active = document.activeElement === ctrl.input;
        if (refresh || numVal !== prevVal) {
          ctrl.readout.textContent = ctrl.format(numVal, lang);
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
    if (refresh || (tod !== lastTimeOfDay && document.activeElement !== todSelect)) {
      lastTimeOfDay = tod;
      todSelect.value = tod;
    }

    const lightsOn = state.lightsOn !== false;
    if (refresh || lightsOn !== lastLightsOn) {
      lastLightsOn = lightsOn;
      lightsBtn.textContent = lightsOn ? t(lang, 'settings.on') : t(lang, 'settings.off');
      lightsBtn.classList.toggle('is-active', lightsOn);
      lightsBtn.setAttribute('aria-pressed', lightsOn ? 'true' : 'false');
    }

    const glareOn = state.glareLightOn !== false;
    if (refresh || glareOn !== lastGlareLightOn) {
      lastGlareLightOn = glareOn;
      glareBtn.textContent = glareOn ? t(lang, 'settings.on') : t(lang, 'settings.off');
      glareBtn.classList.toggle('is-active', glareOn);
      glareBtn.setAttribute('aria-pressed', glareOn ? 'true' : 'false');
    }

    const quality = state.qualityPreset || 'high';
    if (refresh || (quality !== lastQuality && document.activeElement !== qualitySelect)) {
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
