# AGENTS.md — Vuarbit Architecture & Guardrails

## Module Ownership & Contracts

- `src/state.js` (pure ES module, zero DOM/Three.js imports):
  - `createSimState()`, `updateSimState(state, dt)`, `computeOcclusionFromDistance(distMeters)`, `computeDiplopiaOffsetDeg(distMeters)`.
- `src/scene.js`:
  - `createClassroomScene()` -> `{ scene, deskPos, seatPose, standPose, pickables, updateScene(dt, state, camera) }`.
- `src/controls.js`:
  - `createControls(domElement, state, sceneApi)` -> `{ update(dt, camera), dispose() }`.
- `src/optics.js` & `src/shaders/vision.frag.glsl`:
  - `createOpticsRenderer(renderer, scene, waveformData)` -> `{ odCamera, render(dt, state), resize(w, h), dispose() }`.
  - Dual `WebGLRenderTarget`s (OD `+0.029 m`, OS `-0.029 m`) with `THREE.DepthTexture` (`near = 0.04`, `far = 30.0`), MLN oscillopsia perturbation restored post-render.
- `src/audio.js`:
  - `createTinnitusAudio()` -> `{ start(), update(state), dispose() }`.
- `src/hud.js`:
  - `createHud(rootElement, state)` -> `{ update(state), dispose() }`.
- `src/main.js`:
  - Bootstraps renderer, waveform JSON load (with fallback), simulation loop, and resize/cleanup handlers.
- `scripts/analyze_nystagmus.py`:
  - CLI `--video <path> --out public/data/nystagmus_waveform.json` extracting inner-canthus-stabilized 60 fps MLN metrics.

## Strict Rules

1. **Privacy**: Everything in tracked files and UI is anonymized as **Vuarbit**. Never commit real names, clinic names, local filesystem paths, raw video recordings, or personal images.
2. **Security**: Strict CSP (`default-src 'self'; script-src 'self'; style-src 'self'; ...`). Build all HUD DOM strictly via `document.createElement`, `textContent`, and `replaceChildren`; disallow raw HTML injection or dynamic script evaluation.
3. **Ponytail**: Keep implementations lean, readable, and single-purpose. Mark deliberate simplifications with `// shortcut: <limit>, <when to upgrade>`.
