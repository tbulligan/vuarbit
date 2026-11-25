# Vuarbit

First-person WebGL2 visual & auditory simulation of childhood bilateral aphakia, zero accommodation, manifest latent nystagmus (MLN), residual astigmatism/HOAs, binocular diplopia, and high-frequency tinnitus inside a mid-1990s Italian middle-school classroom.

## Clinical & Optical Model (Anonymized)

- **Bilateral Aphakia & Round-Frame Blended Bifocal**:
  - Upper distance zone (`+13.0 D`): ~1.26x magnification, pincushion distortion, Prentice's Rule eccentric prismatic shift, and a fixed focal plane at `3.8 m` (zero accommodation).
  - Lower round/blended bifocal segment (`+2.75 D` add -> `+15.75 D`, lower ~38% arc): slight prismatic jump, curved demarcation, and a fixed focal plane at `0.36 m` for desk work.
  - Outside the warm amber translucent rims (or with glasses removed via `Z`), unmagnified aphakic ring scotoma and heavy uncorrected `+13 D` blur.
- **Residual Astigmatism & Corneal HOAs**: Directional blur along `123°` (OD) and `180°` (OS) with asymmetric coma/trefoil highlight scatter on sunlit windows and chalk.
- **Diplopia**: Dominant OD paired with low-acuity amblyopic OS (`VOS 0.15`) shifted up and left by convergence/distance-dependent angular offset plus eccentric Prentice divergence.
- **Manifest Latent Nystagmus (MLN)**: Driven by a detrended 60 fps waveform (`public/data/nystagmus_waveform.json`), ramping sharply when either eye is occluded (`<= 0.25 m` near desk or held objects) and during rapid head turns.
- **CRT-Static Snow & Vitreous Floaters**: Persistent unsaturated RGB grain and drifting micro-specks visible with eyes open and closed.
- **Tinnitus**: Continuous `E7` (`2637.02 Hz`) + `C9` (`8372.02 Hz`) dual sine tone rising with visual fatigue and easing when resting eyes (`R`).

## Controls

| Key / Input | Action |
| --- | --- |
| Click canvas | Lock cursor for mouse look & enable Web Audio |
| `WASD` / Arrows | Walk (standing) or move held object in view (seated) |
| `E` / `Q` | Lean forward/back, or move held object closer (`0.06 m`) / further (`0.65 m`) |
| `X` | Sit at front-left desk / stand up |
| `F` | Pick up / put down pencil or eraser |
| `Z` | Toggle amber bifocal glasses ON / OFF |
| `R` | Close / rest eyes (relieves fatigue, CRT static remains) |
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
