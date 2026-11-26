# Vuarbit

First-person WebGL2 visual & auditory simulation of childhood bilateral aphakia, zero accommodation, manifest latent nystagmus (MLN), residual astigmatism/HOAs, binocular diplopia, coarse phosphenes, and high-frequency tinnitus inside a mid-1990s Italian middle-school classroom.

## Clinical & Optical Model (Anonymized)

- **Bilateral Aphakia & Executive Bifocal**:
  - Upper distance half (`+13.0 D`): ~1.24x magnification, strong pincushion distortion, off-axis peripheral lens blur, high-plus eccentric chromatic dispersion ($\Delta = c \times D$), and a fixed focal plane at `3.8 m` (zero accommodation).
  - Lower near half (`+17.0 D` / `+4.0 D` add, horizontal split with 1994 split-line image jump): tight zero-accommodation focal sweet spot around `0.22 m` (`~19–26 cm`) for the 0.5 cm dark-green squared workbook and held desk objects.
  - Outside the warm amber translucent rims (or with glasses removed via `Z`), roving jack-in-the-box ring scotoma dead-band and heavy uncorrected `+13 D` blur.
- **Residual Astigmatism & Corneal HOAs**: Directional blur along `123°` (OD) and `180°` (OS) with elongated astigmatic light streaks, spherical-aberration halos, asymmetric coma flare, and sunlit-window veiling glare.
- **Diplopia & Visual Acuity (`VOD 0.7` / `VOS 0.15`)**: Dominant OD (`VOD 0.7` subtle softness & contrast rolloff with glasses, smooth quarter-res `+13 D` Gaussian blur without glasses) paired with amblyopic OS (`VOS 0.15`) shifted strictly left (`-1.53°`, `~1 cm` / 2 workbook squares when seated) and up (`+0.31°`, `~0.2 cm` seated), with perceptual contrast preservation and partial Focus suppression.
- **Manifest Latent Nystagmus (MLN) at ~5.5 Hz**: Video-derived waveform when unoccluded + instant gaze-shift burst while moving the mouse (stops immediately when gaze stops), shifting into a mechanical Point A → Point B sawtooth jerk when **one** eye is asymmetrically occluded (`<= 0.25 m`, not both eyes) with velocity-coupled motion smear.
- **Conscious Focus Effort (`C` / `Space`) & Two-Speed Fatigue**: Active cortical concentration partially suppresses diplopia and unoccluded MLN, while accelerating central fatigue `2.4x` (and breaking down near exhaustion).
- **Full-FOV Floaters & Flashing Phosphenes**: Drifting vitreous floaters across the full field of view, plus warm gaze-dependent closed eyelids with diffuse bright glare and plentiful rapid (`35–95 ms`) non-grid photopsia flashes.
- **Tinnitus**: Continuous `E7` (`2637.02 Hz`) + `C9` (`8372.02 Hz`) dual sine tone rising gently with fatigue (closing eyes yields no instant drop; loudness eases only as fatigue recovers).

## Controls

| Key / Input | Action |
| --- | --- |
| Click canvas | Lock cursor for mouse look & enable Web Audio |
| `WASD` / Arrows | Walk (standing), pan torso over desk (seated), or move held object in view |
| `E` / `Q` or Mouse Wheel | Lean forward/back (scroll up = lean in), or move held object closer / further (scroll down = pull closer, auto-centers onto right eye's reading section) |
| `X` | Sit at front-left desk / stand up |
| `F` | Pick up / put down desk items (pencil, eraser, pencil case, ruler, sharpener) |
| `RMB` drag | Rotate held object for close-up inspection |
| `C` / hold `Space` | Conscious Focus suppression (reduces diplopia & unoccluded MLN, 2.4x faster fatigue) |
| `Z` | Toggle amber executive bifocal glasses ON / OFF |
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
