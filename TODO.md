# TODO — Vuarbit (Prioritized Roadmap)

## P1 — Richer Scene Fidelity (Classroom & Desk Assets)
- [x] Populate remaining classmates across the 4×2 + 4×3 desk grid.
- [x] Upgrade procedural or low-poly glTF models and props (open backpack, school bell, coat rack, higher-detail classroom & desk items).
- [x] Optional RMB drag to rotate held objects for close-up inspection.
- [x] Optional subtle player head/torso shadow caster on desk/floor.

## P2 — Persona & Visual Settings Menu (`P`)
- [x] Safe DOM settings drawer (`P` key) separating **Presets** (`Profiles` & `Eye Conditions`) from custom clinical parameters (in-memory + `Reset`, `Compare (V)`, `Esc` close, pointer-lock gating).
  - [x] Presets (12): `Vuarbit Frut` (childhood aphakia), `Normal Vision`, `Glaucoma`, `Wet AMD`, `Cataracts`, `Diabetic Retinopathy`, `Retinitis Pigmentosa`, `Ocular Albinism`, `Deuteranopia`, `Myopia (-4 D)`, `Astigmatism`, `Presbyopia`.
  - [x] Unified lens & refractive engine with auto-matched frames: `Aphakic Bifocal` (round amber), `Single-Vision` / `Bifocal` (modern dark rectangular), `Progressive` (slim titanium), `None`; depth-accurate Myopia/Presbyopia vergence CoC, directional Astigmatism + axis, `VOD`/`VOS` MAR acuity with Snellen readouts, dominant eye (`OD`/`OS`), diplopia H/V, nystagmus, phosphenes, floaters, tinnitus.
  - [x] SoTA linear-HDR clinical conditions (0–100% calibrated through end-stage): Crabb (2013) glaucoma, retinal-locked Wet AMD, cataracts, Diabetic Retinopathy, Retinitis Pigmentosa, ocular albinism, Machado (2009) CVD (`Protan`/`Deutan`/`Tritan`).
  - [x] Environment lighting presets: Time of Day (`T`: Sunny / Overcast / Dusk / Night) + Lights (`L`: ON / OFF) driving RP nyctalopia, pupil-dilated DoF/CoC & continuous HOA streaks, mesopic contrast loss (Glaucoma/AMD/DR), albinism/cataract glare, and area-luminance-gated scotopic rod shift.
  - [x] Lightweight graphics DPR quality preset (`High 1.75x` / `Balanced 1.25x` / `Performance 1.0x`).
  - [x] Optional Frame customization dropdown (shape & color) in Optics Details for users representing their own eyewear.
  - [x] Live localization (`EN` / `IT` / `NL`) across Settings, telemetry HUD, overlay, and Help bar.

## P3 — Second Scene: 1990s Optometry Exam Room (Diagnostic & Calibration)
- [x] Scene switcher architecture (`Classroom` ↔ `Car Passenger` ↔ `Exam Room`, extensible to later scenes).
- [x] Compact 1990s Italian clinical exam room with angular-calibrated targets: 4 m backlit ETDRS/Snellen acuity chart + duochrome bar, Pelli-Robson contrast chart, Amsler grid (Wet AMD metamorphopsia), Machado-calibrated Ishihara plates (CVD), pickable near Jaeger/Amsler/Ishihara cards, and Settings-toggleable HDR point-light glare source.
- [x] Validates MAR acuity and pathology calibration across all presets without breaking Classroom immersion.

## P4 — Third Scene: Car Passenger (Friuli Road — Outdoor / Night & Daylight Motion)
- [x] Seated 1990s LHD cabin camera (dashboard, 90s stereo/HVAC console, turning steering wheel & driver hands, windshield, side mirror/window) with head look & posture lean.
- [x] Curving & rolling Friuli moraine road (`Udine → Fagagna → San Daniele del Friuli`, Julian Prealps horizon silhouette, coherent Italian signage & bend chevrons, Friulian farmhouses, varied oncoming traffic, wet-road speculars, HDR oncoming headlights/streetlights/taillights/setting sun).
- [x] Unlocks outdoor clinical optics: aphakic `+13 D` ring scotoma ("jack-in-the-box" passing objects), bilateral OD/OS headlight starbursts & disability glare, RP nyctalopia (`L` rural unlit road), glaucoma/RP peripheral field loss in motion, and traffic-depth diplopia.

## P5 — Mobile Observer Mode, Code-Splitting & `Vuarbit Grant` (Adult IOL)
- Lean Mobile Observer Mode on touch devices: touch-drag look + compact action bar (`Settings`, `Compare`, `Glasses`, `Sit`) so phone visitors can immediately explore presets, Friuli Car, Exam Room, and seated Classroom without clunky FPS thumbsticks.
- Vite dynamic `import()` per-scene code-splitting so initial page load stays fast and lean (<500 kB) on mobile & desktop.
- `Vuarbit Grant` (adult in Friulian) persona + pseudophakic IOL optical profile (removes `+13 D` magnification/ring scotoma, adds fixed focal plane & mild IOL night halos/dysphotopsia — immediately testable in Friuli Car & Exam Room) + 3-glasses cycle (distance, intermediate, near).

## P6 — Fourth Scene: 1990s Home Study (Radiant CRT PC & Intermediate Distance)
- Autobiographical 1990s bedroom/study desk completing the 90s Friuli quartet (`Classroom` · `Car Passenger` · `Home Study` · `Exam Room`): curved 15" beige CRT monitor running glowing high-contrast text (`0.65 m` intermediate dead zone), warm desk lamp, bookshelf, pickable floppy/book/comic (`0.25 m`), and evening Friuli window (`3.5 m`).
- Unlocks radiant-screen optics impossible on paper: glowing light-on-dark halation, astigmatism/OS diplopia doubling glowing text lines, dark-room photopic screen vs scotopic room contrast, and `+13/+17 D` / presbyopia / IOL intermediate focus gap.
- Optional 90s dash pickable in Car Passenger (folded Friuli road map or cassette J-card).

## P7 — Optional Guided Prompts, Extra Daily Scenes & WebXR VR
- Lightweight, opt-in diegetic prompts (off by default, no arcade timers/scores) guiding first-time visitors through real failure modes (bifocal switch, ring scotoma, acuity/glare).
- Candidate daily scenes if desired: 1990s Italian grocery aisle (shelf prices vs near labels) or dusk pedestrian crossing.
- WebXR / stereo VR headset dual-eye rendering mode.
