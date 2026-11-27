# Vuarbit

First-person WebGL2 visual & auditory simulation of childhood bilateral aphakia, zero accommodation, manifest latent nystagmus (MLN), residual astigmatism/HOAs, binocular diplopia, coarse phosphenes, and high-frequency tinnitus inside a mid-1990s Italian middle-school classroom.

## Clinical & Optical Model (Anonymized)

- **Bilateral Aphakia & Executive Bifocal**:
  - Upper distance half (`+13.0 D`): ~1.24x magnification, strong pincushion distortion, off-axis peripheral lens blur, high-plus eccentric chromatic dispersion ($\Delta = c \times D$), and a fixed focal plane at `3.8 m` (zero accommodation).
  - Lower near half (`+17.0 D` / `+4.0 D` add, horizontal split with 1994 split-line image jump): tight zero-accommodation focal sweet spot around `0.22 m` (`~19–26 cm`) for the 0.5 cm dark-green squared workbook and held desk objects.
  - Outside the warm amber translucent rims (or with glasses removed via `Z`), roving jack-in-the-box ring scotoma dead-band and heavy uncorrected `+13 D` blur.
- **Residual Astigmatism & Corneal HOAs**: Directional blur along `123°` (OD) and `180°` (OS) with elongated astigmatic light streaks, spherical-aberration halos, asymmetric coma flare, and sunlit-window veiling glare.
- **Diplopia & Visual Acuity (`VOD 0.7` / `VOS 0.15`)**: Dominant OD (`VOD 0.7` subtle softness & contrast rolloff with glasses, smooth quarter-res `+13 D` Gaussian blur without glasses) paired with a strictly-left (`-1.53°`, `~1 cm` / 2 workbook squares seated) and up (`+0.31°`, `~0.2 cm`) OS image — crisper when Relaxed ("two sharp images"), softened and deprioritized in Focused mode while staying present, with on-demand stereo rendering when an obstacle covers the dominant eye.
- **Manifest Latent Nystagmus (MLN) & Alexander's Law**: Decelerating slow-phase drift + fast corrective snap at `2.5 Hz` relaxed (`~20 beats / 8 s`), slowing to tight irregular beats (`~1.1 Hz` mean, `~9 beats / 8 s`) in Focused mode; panning toward the fast-phase side (right for OD) restores relaxed frequency and amplitude while panning left/vertical keeps focused frequency with relaxed amplitude; asymmetric monocular occlusion ramps gradually from `16.5 cm` down to `6 cm`.
- **Eye-Before-Head Gaze, Prentice Prism & Nose-Slip**: Quick mouse glances lead with eye-in-head movement before head catch-up, sweeping the blurred frames, bifocal split line, ring scotoma, and Prentice's rule prism (`Δ = c × D`). Heavy `+13/+17 D` glasses slowly slide `0–14 mm` down the nose when craning/looking down; hold `Space` to slide them smoothly back up (and pin them steady at `0 mm`), and hold `Shift` to slide them down into a variable-focus `~10–22 cm` near loupe (making fine print like the eraser sleeve legible).
- **Focused Mode (`C`) & Two-Speed Fatigue (~10x time)**: Starts in `Focused` (and resumes `Focused` after `R` Rest or `V` Compare) — effortful stillness + OD selection curbs MLN and softens OS competition while accelerating central fatigue `2.0x` (and breaking down near exhaustion).
- **Full-FOV Floaters & Edge-Preserving Phosphenes**: Drifting vitreous floaters across the full field of view, plus warm gaze-dependent closed eyelids and luminous cortical photopsia flashes you "see beyond" on sharp text.
- **Tinnitus**: Continuous `E7` (`2637.02 Hz`, panned right) + `C9` (`8372.02 Hz`, centered intracranially) dual sine tone rising gently with fatigue (closing eyes yields no instant drop; loudness eases only as fatigue recovers).

## Controls

| Key / Input | Action |
| --- | --- |
| Click canvas | Lock cursor for mouse look & enable Web Audio |
| `WASD` / Arrows | Walk (standing), pan torso over desk (seated), or move held object in view |
| `E` / `Q` or Mouse Wheel | Lean forward/back (scroll up = lean in), or move held object closer / further (scroll down = pull closer, auto-centers onto right eye's reading section) |
| `X` | Sit at front-left desk / stand up |
| `F` | Pick up / put down desk items (pencil, eraser, pencil case, ruler, sharpener) |
| `RMB` drag | Rotate held object for close-up inspection |
| `C` | Toggle `Focused` / `Relaxed` mode (starts `Focused`, resumes after `R`/`V`; curbs MLN & softens OS competition, 2.0x faster fatigue) |
| `Space` (hold) | Smoothly slide glasses up nose (`14–0 mm`, reverse of `Shift`) and pin them steady at `0 mm` |
| `Shift` (hold) | Smoothly slide glasses down nose (`0–14 mm`) as a variable-focus `10–22 cm` aphakic near loupe |
| `Z` | Toggle amber executive bifocal glasses ON / OFF |
| `L` | Toggle ceiling fluorescent lights ON / OFF |
| `T` | Cycle Time of Day (Sunny / Overcast / Dusk / Night) |
| `P` | Open / close Visual Settings & Presets drawer |
| `R` | Close / rest eyes (opaque eyelids + diffuse bright glare; eases fatigue) |
| `V` | Toggle Normal Vision comparison mode (and reset fatigue) |
| `M` | Mute / unmute tinnitus |
| `H` | Toggle HUD telemetry |
| `F11` | Toggle browser fullscreen |

## Setup & Running (micromamba + Vite)

```bash
micromamba env create -f environment.yml
micromamba run -n vuarbit npm install
micromamba run -n vuarbit npm run dev
```

Build and run checks:

```bash
micromamba run -n vuarbit npm test
micromamba run -n vuarbit npm run build
```

## GitHub Pages Deployment

`vite.config.js` configures `base: './'` so `dist/` serves cleanly from any subpath (including `https://<user>.github.io/vuarbit/`). Deploy the contents of `dist/` to GitHub Pages with no server-side dependencies.
