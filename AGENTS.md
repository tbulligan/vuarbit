# AGENTS.md — Vuarbit Architecture & Guardrails

## Session Workflow Rules

1. **Model & Swarm Check**: At the start of each request, verify whether the current model/swarm selection fits the task; if not, stop immediately and tell the user what to change.
2. **Clarify Before Editing**: Check prompt clarity and completeness before acting; ask concise clarifying questions first if anything is ambiguous or has conflicting interpretations.
3. **Commit Often, Review Milestones**: Commit small verified milestones frequently; run `/ponytail-review` before pushing or after multi-file architectural changes.

## Module Ownership & Contracts

- `src/personas.js` (pure ES module, zero DOM/Three.js imports):
  - `PERSONAS`, `SETTING_SPECS`, `QUALITY_PRESETS`, `getPersonaById(id)`, `createDefaultVisualSettings()`, `sanitizeVisualSettings(partial)`, `applyPersona(state, id)`, `updateVisualSetting(state, key, value)`, `computeAcuityBlurUV(acuityDecimal)`, `formatSnellenAcuity(acuityDecimal)`, `hasSuppressionMechanics(settings)`.
- `src/state.js` (pure ES module, zero DOM/Three.js imports):
  - Re-exports `src/personas.js` API; `createSimState()`, `updateSimState(state, dt)`, `computeOcclusionFromDistance(distMeters)`, `computeDiplopiaOffsetDeg(distMeters, settings)`, `computeMlnAngleDeg(...)`, `computeMlnFreqScale(...)`, `computeHeldRestOffset(zMeters, glassesOn, dominantEye)`, `computeMaxYaw(...)`, `computeDecompensation(fatigue)`.
- `src/scene.js` (owns helpers `src/scene/{classmates,props,player_shadow}.js`):
  - `createClassroomScene()` -> `{ scene, deskPos, seatPose, standPose, pickables, colliders, updateScene(dt, state, camera) }`.
- `src/controls.js`:
  - `createControls(domElement, state, sceneApi)` -> `{ update(dt, camera), dispose() }`.
- `src/optics.js` & `src/shaders/vision.frag.glsl`:
  - `createOpticsRenderer(renderer, scene, waveformData)` -> `{ odCamera, render(dt, state), resize(w, h), setQuality(presetId), dispose() }`.
  - Single 4x MSAA full-res OD `WebGLRenderTarget` (`±0.029 m` by dominant eye) with `THREE.DepthTexture` (`near = 0.02`, `far = 30.0`), quarter-res separable Gaussian blur targets (`rtBlurH`/`rtBlurV`), constant-angle dominant-derived diplopia, 5.5 Hz MLN + 3.8 Hz albinism nystagmus, and linear-HDR clinical condition shaders (Crabb 2013 glaucoma, retinal-locked Wet AMD, cataracts, ocular albinism, Machado 2009 CVD).
- `src/audio.js`:
  - `createTinnitusAudio()` -> `{ start(), update(state), dispose() }`.
- `src/hud.js`:
  - `createHud(rootElement, state)` -> `{ update(state), dispose() }`.
- `src/settings.js`:
  - `createSettingsDrawer(rootElement, initialState, callbacks)` -> `{ sync(state), dispose() }` (strictly safe DOM, zero inline styles).
- `src/main.js`:
  - Bootstraps renderer, waveform JSON load (with fallback), simulation loop, and resize/cleanup handlers.
- `scripts/analyze_nystagmus.py`:
  - CLI `--video <path> --out public/data/nystagmus_waveform.json` extracting inner-canthus-stabilized 60 fps MLN metrics.

## Strict Rules

1. **Privacy**: Everything in tracked files and UI is anonymized as **Vuarbit**. Never commit real names, clinic names, local filesystem paths, raw video recordings, or personal images.
2. **Security**: Strict CSP (`default-src 'self'; script-src 'self'; style-src 'self'; ...`). Build all HUD DOM strictly via `document.createElement`, `textContent`, and `replaceChildren`; disallow raw HTML injection or dynamic script evaluation.
3. **Ponytail**: Keep implementations lean, readable, and single-purpose. Mark deliberate simplifications with `// shortcut: <limit>, <when to upgrade>`.
