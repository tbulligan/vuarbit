# TODO — Vuarbit (Prioritized Roadmap)

## P1 — Richer Scene Fidelity (Classroom & Desk Assets)
- [x] Populate remaining classmates across the 4×2 + 4×3 desk grid.
- [x] Upgrade procedural or low-poly glTF models and props (open backpack, school bell, coat rack, higher-detail classroom & desk items).
- [x] Optional RMB drag to rotate held objects for close-up inspection.
- [x] Optional subtle player head/torso shadow caster on desk/floor.

## P2 — Persona & Visual Settings Menu (`P`)
- [x] Safe DOM settings drawer (`P` key) separating **Named Personas** from custom clinical parameters (in-memory + `Reset`, `Esc` close, pointer-lock gating).
  - [x] Presets: `Vuarbit 1994 (Childhood Aphakia)`, `Normal Vision`, `Primary Open-Angle Glaucoma`, `Macular Degeneration (Wet AMD)`, `Ocular Albinism`, `Nuclear & Cortical Cataracts`, `Deuteranopia (Red-Green CVD)`.
  - [x] Visual condition parameters: lens profile (`Aphakic Bifocal` / `None`), lens power & near add, OD/OS acuity (`VOD`/`VOS`), dominant eye (`OD`/`OS`), diplopia H/V offset, MLN intensity, phosphenes, floaters, tinnitus.
  - [x] SoTA shader clinical conditions (0–100% sliders): glaucoma (Crabb 2013 arcuate/peripheral perceptual filling-in), Wet AMD (retinal-locked static Amsler metamorphopsia + perceptual central scotoma), ocular albinism (linear-HDR iris transillumination glare + foveal hypoplasia + 3.8 Hz infantile nystagmus), cataracts (linear-HDR Beer-Lambert brunescence + forward glare scatter), Machado (2009) CVD (`Protan`/`Deutan`/`Tritan`).
  - [x] Lightweight graphics DPR quality preset (`High 1.75x` / `Balanced 1.25x` / `Performance 1.0x`).

## P3 — Second Scene: 2026 Work Desk (Pseudophakic IOL + 3 Pairs of Glasses)
- Scene switcher (`1994 Classroom` ↔ `2026 Work Desk`) paired with a `Vuarbit 2026 (IOL)` persona to contrast childhood `+13 D` aphakia against adult IOL vision.
- Modern work desk scene (monitors/laptop, code/text documents, smartphone, desk lamp, window daylight).
- Pseudophakic IOL optical profile (no high-plus magnification/ring scotoma, fixed IOL focal plane, mild IOL halos/dysphotopsia) + cycle keybind across 3 task-specific glasses (distance, computer/intermediate, near reading).

## P4 — Input & Display Expansion
- Mobile touch controls and WebXR / stereo VR headset dual-eye rendering mode.
