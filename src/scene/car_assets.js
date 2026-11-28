import * as THREE from 'three';

function makeCanvasTexture(width, height, drawFn, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  if (repeatX !== 1 || repeatY !== 1) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
  }
  return tex;
}

/**
 * Seamless 2-lane Friulian provincial asphalt road texture (8.4 m wide x 16 m longitudinal tile).
 */
export function createRoadAsphaltTexture(repeatY = 12) {
  return makeCanvasTexture(
    1024,
    1024,
    (ctx, w, h) => {
      ctx.fillStyle = '#26292e';
      ctx.fillRect(0, 0, w, h);

      let seed = 941125;
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };

      for (let i = 0; i < 6500; i += 1) {
        const v = 28 + Math.floor(rand() * 34);
        ctx.fillStyle = `rgb(${v}, ${v + 1}, ${v + 3})`;
        ctx.fillRect(rand() * w, rand() * h, 2 + rand() * 3, 2 + rand() * 4);
      }

      ctx.fillStyle = 'rgba(14, 16, 20, 0.34)';
      for (const tx of [0.18, 0.36, 0.64, 0.82]) {
        ctx.fillRect(w * tx - 38, 0, 76, h);
      }

      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(Math.round(w * 0.036), 0, 16, h);
      ctx.fillRect(Math.round(w * 0.964) - 16, 0, 16, h);

      const dashW = 18;
      const dashX = Math.round(w * 0.5 - dashW * 0.5);
      ctx.fillRect(dashX, 80, dashW, 240);
      ctx.fillRect(dashX, 592, dashW, 240);
    },
    1,
    repeatY
  );
}

/**
 * Procedural 1990s analog instrument cluster texture (speedometer @ 65 km/h + tachometer + odometer).
 */
export function createInstrumentClusterTexture() {
  return makeCanvasTexture(1024, 320, (ctx, w, h) => {
    ctx.fillStyle = '#0e1116';
    ctx.fillRect(0, 0, w, h);

    const drawDial = (cx, cy, r, maxLabel, needleAngle, ticks, unit) => {
      ctx.fillStyle = '#141920';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 5;
      ctx.stroke();

      for (let i = 0; i <= ticks; i += 1) {
        const frac = i / ticks;
        const ang = Math.PI * 0.78 + frac * Math.PI * 1.44;
        const inner = i % 2 === 0 ? r - 22 : r - 13;
        ctx.strokeStyle = frac > 0.82 ? '#ef4444' : '#e2e8f0';
        ctx.lineWidth = i % 2 === 0 ? 4 : 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner);
        ctx.lineTo(cx + Math.cos(ang) * (r - 6), cy + Math.sin(ang) * (r - 6));
        ctx.stroke();
      }

      ctx.fillStyle = '#86efac';
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(unit, cx, cy + r * 0.45);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 20px system-ui, sans-serif';
      ctx.fillText(maxLabel, cx, cy - r * 0.46);

      ctx.strokeStyle = '#ff6b2b';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(needleAngle) * (r - 18), cy + Math.sin(needleAngle) * (r - 18));
      ctx.stroke();

      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.fill();
    };

    drawDial(250, 165, 118, 'RPM x1000', Math.PI * 1.18, 14, '2.2');
    drawDial(640, 165, 124, 'km/h', Math.PI * 1.24, 18, '65');

    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(448, 92, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(390, 210, 116, 36);
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('084312', 448, 229);
  });
}

/**
 * Procedural 1990s center-console cassette stereo & HVAC control panel texture.
 */
export function createCenterConsoleTexture() {
  return makeCanvasTexture(512, 384, (ctx, w, h) => {
    ctx.fillStyle = '#16191f';
    ctx.fillRect(0, 0, w, h);

    // Top twin air vents
    ctx.fillStyle = '#0c0e12';
    ctx.fillRect(28, 20, 212, 76);
    ctx.fillRect(272, 20, 212, 76);
    ctx.strokeStyle = '#2b313a';
    ctx.lineWidth = 4;
    for (let y = 32; y <= 84; y += 13) {
      ctx.beginPath();
      ctx.moveTo(34, y);
      ctx.lineTo(234, y);
      ctx.moveTo(278, y);
      ctx.lineTo(478, y);
      ctx.stroke();
    }

    // 90s green-LCD car cassette stereo
    ctx.fillStyle = '#101318';
    ctx.fillRect(34, 124, 444, 114);
    ctx.strokeStyle = '#333b46';
    ctx.lineWidth = 3;
    ctx.strokeRect(34, 124, 444, 114);

    // Cassette slot
    ctx.fillStyle = '#07080a';
    ctx.fillRect(154, 142, 180, 28);
    ctx.strokeStyle = '#475569';
    ctx.strokeRect(154, 142, 180, 28);

    // Glowing green FM frequency readout (classic 90s radio)
    ctx.fillStyle = '#0c2618';
    ctx.fillRect(154, 182, 180, 38);
    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FM 98.4', 244, 202);

    // Volume/tuner knobs & preset buttons
    for (const kx of [86, 424]) {
      ctx.fillStyle = '#252b34';
      ctx.beginPath();
      ctx.arc(kx, 180, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Bottom 3 rotary HVAC dials (temp blue/red, fan, vents)
    const dialXs = [108, 256, 404];
    for (let i = 0; i < dialXs.length; i += 1) {
      const cx = dialXs[i];
      const cy = 312;
      if (i === 0) {
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(cx, cy, 42, Math.PI * 0.85, Math.PI * 1.5);
        ctx.stroke();
        ctx.strokeStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(cx, cy, 42, Math.PI * 1.5, Math.PI * 2.15);
        ctx.stroke();
      } else {
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx, cy, 42, Math.PI * 0.8, Math.PI * 2.2);
        ctx.stroke();
      }
      ctx.fillStyle = '#1f252e';
      ctx.beginPath();
      ctx.arc(cx, cy, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy - 24);
      ctx.stroke();
    }
  });
}

/**
 * Coherent Friuli (Udine -> Fagagna -> San Daniele del Friuli) Italian road sign textures.
 */
export function createRoadSignTexture(kind) {
  if (kind === 'speed_70' || kind === 'speed_50') {
    const num = kind === 'speed_70' ? '70' : '50';
    return makeCanvasTexture(512, 512, (ctx, w, h) => {
      const c = w * 0.5;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#d92626';
      ctx.lineWidth = 46;
      ctx.beginPath();
      ctx.arc(c, c, 224, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#111827';
      ctx.font = '900 210px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(num, c, c + 12);
    });
  }

  if (kind === 'warning_curve_left' || kind === 'warning_curve_right') {
    const isLeft = kind === 'warning_curve_left';
    return makeCanvasTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#d92626';
      ctx.lineWidth = 34;
      ctx.beginPath();
      ctx.moveTo(w * 0.5, 42);
      ctx.lineTo(w - 42, h - 54);
      ctx.lineTo(42, h - 54);
      ctx.closePath();
      ctx.stroke();

      ctx.save();
      if (isLeft) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 34;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(w * 0.44, h - 115);
      ctx.lineTo(w * 0.44, 285);
      ctx.quadraticCurveTo(w * 0.44, 210, w * 0.62, 185);
      ctx.stroke();
      ctx.restore();
    });
  }

  if (kind === 'chevron_left' || kind === 'chevron_right') {
    const isLeft = kind === 'chevron_left';
    return makeCanvasTexture(512, 256, (ctx, w, h) => {
      ctx.fillStyle = '#12151a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#facc15';
      const drawArrow = (cx) => {
        ctx.beginPath();
        if (isLeft) {
          ctx.moveTo(cx + 58, 22);
          ctx.lineTo(cx - 10, 22);
          ctx.lineTo(cx - 72, h * 0.5);
          ctx.lineTo(cx - 10, h - 22);
          ctx.lineTo(cx + 58, h - 22);
          ctx.lineTo(cx - 4, h * 0.5);
        } else {
          ctx.moveTo(cx - 58, 22);
          ctx.lineTo(cx + 10, 22);
          ctx.lineTo(cx + 72, h * 0.5);
          ctx.lineTo(cx + 10, h - 22);
          ctx.lineTo(cx - 58, h - 22);
          ctx.lineTo(cx + 4, h * 0.5);
        }
        ctx.closePath();
        ctx.fill();
      };
      drawArrow(w * 0.28);
      drawArrow(w * 0.72);
    });
  }

  if (kind === 'hamlet_fagagna') {
    // Classic white Italian centro abitato town-entry sign
    return makeCanvasTexture(768, 320, (ctx, w, h) => {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 16;
      ctx.strokeRect(16, 16, w - 32, h - 32);
      ctx.fillStyle = '#111827';
      ctx.font = '900 92px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FAGAGNA', w * 0.5, h * 0.44);
      ctx.fillStyle = '#374151';
      ctx.font = 'bold 34px system-ui, -apple-system, sans-serif';
      ctx.fillText('PROV. DI UDINE · SP 49', w * 0.5, h * 0.77);
    });
  }

  // Italian blue provincial directional signs (consistent northbound Udine -> San Daniele route)
  const lines =
    kind === 'dir_fagagna'
      ? ['SAN DANIELE  12 km', 'FAGAGNA       4 km']
      : ['SAN DANIELE   9 km', 'MAJANO       14 km'];
  return makeCanvasTexture(832, 384, (ctx, w, h) => {
    ctx.fillStyle = '#114d94';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 14;
    ctx.strokeRect(18, 18, w - 36, h - 36);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 58px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(lines[0], 54, h * 0.34);
    ctx.fillText(lines[1], 54, h * 0.68);
  });
}

/**
 * Julian & Carnic Prealps panoramic horizon ridge texture (painted dynamically per Time of Day).
 */
export function paintMountainHorizonCanvas(ctx, w, h, nearHex, farHex, fogHex = null) {
  ctx.clearRect(0, 0, w, h);

  // Far high Prealps peaks (Monte Festa / Chiampon / Matajur style jagged ridge)
  ctx.fillStyle = farHex;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 8) {
    const a = (x / w) * Math.PI * 2;
    const ridge =
      0.46 +
      0.16 * Math.sin(a * 2.0 + 0.5) +
      0.11 * Math.sin(a * 5.0 - 0.8) +
      0.07 * Math.cos(a * 11.0 + 1.2) +
      0.04 * Math.sin(a * 19.0);
    ctx.lineTo(x, h * (1.0 - Math.max(0.15, ridge)));
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  // Nearer Friulian moraine hills & wooded foothills
  ctx.fillStyle = nearHex;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 8) {
    const a = (x / w) * Math.PI * 2;
    const hill =
      0.28 +
      0.08 * Math.sin(a * 3.0 - 0.4) +
      0.05 * Math.cos(a * 7.0 + 0.9) +
      0.025 * Math.sin(a * 15.0);
    ctx.lineTo(x, h * (1.0 - Math.max(0.10, hill)));
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();

  // Softly blend lower horizon skirt into fogColor so distant road & props dissolve without pop-in
  if (fogHex) {
    const clean = fogHex.replace('#', '');
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    const fg = ctx.createLinearGradient(0, h * 0.72, 0, h);
    fg.addColorStop(0.0, `rgba(${r}, ${g}, ${b}, 0.0)`);
    fg.addColorStop(1.0, `rgba(${r}, ${g}, ${b}, 0.95)`);
    ctx.fillStyle = fg;
    ctx.fillRect(0, h * 0.72, w, h * 0.28);
  }
}

/**
 * Soft radial-elongated wet-road reflection glow texture (additive over damp asphalt at dusk/night).
 */
export function createWetStreakTexture(hexColor = '#ffffff') {
  return makeCanvasTexture(128, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const clean = hexColor.replace('#', '');
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    ctx.save();
    ctx.translate(w * 0.5, h * 0.5);
    ctx.scale(1.0, h / w);
    ctx.translate(-w * 0.5, -w * 0.5);
    const rg = ctx.createRadialGradient(w * 0.5, w * 0.5, 1, w * 0.5, w * 0.5, w * 0.5);
    rg.addColorStop(0.0, `rgba(${r}, ${g}, ${b}, 0.55)`);
    rg.addColorStop(0.28, `rgba(${r}, ${g}, ${b}, 0.24)`);
    rg.addColorStop(0.65, `rgba(${r}, ${g}, ${b}, 0.06)`);
    rg.addColorStop(1.0, `rgba(${r}, ${g}, ${b}, 0.0)`);
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, w);
    ctx.restore();
  });
}

/**
 * Procedural Friulian grassy hillside embankment texture.
 */
export function createRoadsideGroundTexture(repeatX = 4, repeatY = 12) {
  return makeCanvasTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#3a4c33';
      ctx.fillRect(0, 0, w, h);
      let seed = 77341;
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      for (let i = 0; i < 3200; i += 1) {
        const g = 60 + Math.floor(rand() * 34);
        const r = Math.floor(g * 0.78);
        const b = Math.floor(g * 0.60);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(rand() * w, rand() * h, 4 + rand() * 8, 3 + rand() * 6);
      }
    },
    repeatX,
    repeatY
  );
}
