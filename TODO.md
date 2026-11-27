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
  - [x] Optional Frame customization dropdown (shape & color) in Optics Details for users representing their own eyewear.

## P3 — Second Scene: Optometry Exam Room (Diagnostic & Calibration)
- [x] Scene switcher architecture (`1994 Classroom` ↔ `Exam Room`, extensible to later scenes).
- [x] Compact clinical exam room with angular-calibrated targets: 4 m backlit ETDRS/Snellen acuity chart, Pelli-Robson contrast chart, Amsler grid (Wet AMD metamorphopsia), Ishihara plates (CVD), handheld near Jaeger reading card (bifocal/presbyopia), and point-light glare source (astigmatism/cataract/IOL halos).
- [x] Validates MAR acuity and pathology calibration across all presets without breaking 1994 classroom immersion.

## P4 — Third Scene: Car Passenger (Outdoor / Night & Daylight Motion)
- Seated cabin camera (dashboard, windshield, side mirror/window) with head look & posture lean.
- Looping outdoor road environment (`T` Time of Day: bright sun glare, overcast, dusk, night oncoming headlights, streetlights, taillights, wet-road speculars, passing road signs/trees/cars).
- Unlocks clinical optics impossible indoors: aphakic `+13 D` ring scotoma ("jack-in-the-box" passing objects), astigmatism/cataract headlight starbursts & disability glare, RP nyctalopia, glaucoma/RP peripheral field loss in motion, and traffic-depth diplopia.

## P5 — Fourth Scene: 2026 Open Office (Work Desk + Pseudophakic IOL)
- Compact open office (~10×10 m bay) combining near/intermediate/distance depths: work desk (dual monitors/laptop, smartphone, printed docs, desk lamp), coworkers, whiteboard, glass meeting room, and tall daylight windows.
- `Vuarbit 2026 (IOL)` persona + pseudophakic IOL optical profile (removes `+13 D` magnification/ring scotoma, adds fixed focal plane & mild IOL halos/dysphotopsia — also testable in P3/P4) + 3-glasses cycle keybind (distance, intermediate/monitor, near reading).

## P6 — Optional Guided Prompts & Input/Display Expansion
- Lightweight, opt-in diegetic classroom prompts (off by default, no arcade timers/scores) guiding first-time visitors through real failure modes: copying blackboard line to workbook (bifocal switch), finding dropped desk item (ring scotoma), reading classmate expression across room (acuity/glare).
- Mobile touch controls and WebXR / stereo VR headset dual-eye rendering mode.
