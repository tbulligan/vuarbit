# TODO — Vuarbit (Prioritized Roadmap)

## P1 — Richer Scene Fidelity (Classroom & Desk Assets)
- [x] Populate remaining classmates across the 4×2 + 4×3 desk grid.
- [x] Upgrade procedural or low-poly glTF models and props (open backpack, school bell, coat rack, higher-detail classroom & desk items).
- [x] Optional RMB drag to rotate held objects for close-up inspection.
- [x] Optional subtle player head/torso shadow caster on desk/floor.

## P2 — Persona & Visual Settings Menu (`P`)
- [x] Safe DOM settings drawer (`P` key) separating **Presets** (`Profiles` & `Eye Conditions`) from custom clinical parameters (in-memory + `Reset`, `Compare (V)`, `Esc` close, pointer-lock gating).
  - [x] Presets (12): `Vuarbit 1994`, `Normal Vision`, `Glaucoma`, `Wet AMD`, `Cataracts`, `Diabetic Retinopathy`, `Retinitis Pigmentosa`, `Ocular Albinism`, `Deuteranopia`, `Myopia (-4 D)`, `Astigmatism`, `Presbyopia`.
  - [x] Unified lens & refractive engine with auto-matched frames: `Aphakic Bifocal` (round amber), `Single-Vision` / `Bifocal` (modern dark rectangular), `Progressive` (slim titanium), `None`; depth-accurate Myopia/Presbyopia vergence CoC, directional Astigmatism + axis, `VOD`/`VOS` MAR acuity with Snellen readouts, dominant eye (`OD`/`OS`), diplopia H/V, nystagmus, phosphenes, floaters, tinnitus.
  - [x] SoTA linear-HDR clinical conditions (0–100% calibrated through end-stage): Crabb (2013) glaucoma, retinal-locked Wet AMD, cataracts, Diabetic Retinopathy, Retinitis Pigmentosa, ocular albinism, Machado (2009) CVD (`Protan`/`Deutan`/`Tritan`).
  - [x] Environment lighting presets: Time of Day (`T`: Sunny / Overcast / Dusk / Night) + Ceiling Lights (`L`: ON / OFF) driving RP nyctalopia, pupil-dilated DoF/CoC & HOA streaks, mesopic contrast loss (Glaucoma/AMD/DR), albinism/cataract glare, and low-lux scotopic rod shift.
  - [x] Lightweight graphics DPR quality preset (`High 1.75x` / `Balanced 1.25x` / `Performance 1.0x`).
  - [ ] Optional Frame customization dropdown (shape & color) in Optics Details for users representing their own eyewear.

## P3 — Second Scene: 2026 Work Desk (Pseudophakic IOL + 3 Pairs of Glasses)
- Scene switcher (`1994 Classroom` ↔ `2026 Work Desk`) paired with a `Vuarbit 2026 (IOL)` persona to contrast childhood `+13 D` aphakia against adult IOL vision.
- Modern work desk scene (monitors/laptop, code/text documents, smartphone, desk lamp, window daylight).
- Pseudophakic IOL optical profile (no high-plus magnification/ring scotoma, fixed IOL focal plane, mild IOL halos/dysphotopsia) + cycle keybind across 3 task-specific glasses (distance, computer/intermediate, near reading).

## P4 — Input & Display Expansion
- Mobile touch controls and WebXR / stereo VR headset dual-eye rendering mode.
