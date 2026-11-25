# Vuarbit

First-person WebGL2 visual & auditory simulation of childhood bilateral aphakia, zero accommodation, manifest latent nystagmus (MLN), residual astigmatism/HOAs, binocular diplopia, coarse phosphenes, and high-frequency tinnitus inside a mid-1990s Italian middle-school classroom.

## Clinical & Optical Model (Anonymized)

- **Bilateral Aphakia & Straight-Cut Executive Bifocal**:
  - Upper distance half (`+13.0 D`): ~1.26x magnification, pincushion distortion, high-plus eccentric chromatic/prismatic dispersion ($\Delta = c \times D$), and a fixed focal plane at `3.8 m` (zero accommodation).
  - Lower near half (`+15.75 D`, straight horizontal split across lens center): fixed focal plane at `0.36 m` for the 0.5 cm dark-green squared workbook and held desk objects.
  - Outside the warm amber translucent rims (or with glasses removed via `Z`), unmagnified jack-in-the-box ring scotoma and heavy uncorrected `+13 D` blur.
- **Residual Astigmatism & Corneal HOAs**: Directional blur along `123°` (OD) and `180°` (OS) with asymmetric coma/trefoil highlight scatter on sunlit windows and chalk.
- **Per-Pixel Diplopia & Binocular Rivalry**: Dominant OD paired with amblyopic OS (`VOS 0.15`) shifted up and left at exact per-pixel metric offsets (`~1 cm L / 0.5 cm U @ 0.1 m`, `~2 cm L / 1 cm U @ 0.4 m`, `~5 cm L / 1.5 cm U @ 3 m+`), while solid foreground near objects stay corporeal.
- **Manifest Latent Nystagmus (MLN) at ~5.5 Hz**: Video-derived waveform when unoccluded + instant gaze-shift burst while moving the mouse (stops immediately when gaze stops), shifting into a mechanical Point A → Point B sawtooth jerk when **one** eye is asymmetrically occluded (`<= 0.25 m`, not both eyes) with velocity-coupled motion smear.
- **Conscious Focus Effort (`C` / `Space`) & Two-Speed Fatigue**: Active cortical concentration partially suppresses diplopia and unoccluded MLN, while accelerating central fatigue `2.4x` (and breaking down near exhaustion).
- **Full-FOV Floaters & CRT Static**: Persistent unsaturated CRT-static snow and drifting vitreous floaters across the full field of view, plus warm gaze-dependent closed eyelids with diffuse bright glare.
- **Tinnitus**: Continuous `E7` (`2637.02 Hz`) + `C9` (`8372.02 Hz`) dual sine tone rising gently with fatigue (closing eyes yields no instant drop; loudness eases only as fatigue recovers).

## Controls

| Key / Input | Action |
| --- | --- |
| Click canvas | Lock cursor for mouse look & enable Web Audio |
| `WASD` / Arrows | Walk (standing) or move held object in view (seated) |
| `E` / `Q` or Mouse Wheel | Lean forward/back, or move held object closer / further (auto-centers onto right eye's reading section without clipping glasses/desk) |
| `X` | Sit at front-left desk / stand up |
| `F` | Pick up / put down pencil, eraser, or pencil case |
| `C` / hold `Space` | Conscious Focus suppression (reduces diplopia & unoccluded MLN, 2.4x faster fatigue) |
| `Z` | Toggle amber executive bifocal glasses ON / OFF |
| `R` | Close / rest eyes (opaque eyelids + diffuse bright glare; eases fatigue) |
| `V` | Toggle Normal Vision comparison mode (and reset fatigue) |
| `M` | Mute / unmute tinnitus |
| `H` | Toggle HUD telemetry |

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
