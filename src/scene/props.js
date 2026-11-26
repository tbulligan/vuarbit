import * as THREE from 'three';

function resolveMakeCanvasTexture(makeCanvasTexture) {
  if (typeof makeCanvasTexture === 'function') return makeCanvasTexture;
  return (width, height, drawFn, repeatX = 1, repeatY = 1) => {
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
  };
}

function createBookGroup({
  width,
  height,
  depth,
  coverColor,
  spineText,
  accentColor = '#e6dec8',
  makeTex,
}) {
  const group = new THREE.Group();
  const coverTex = makeTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = coverColor;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = accentColor;
    ctx.fillRect(0, h * 0.14, w, h * 0.14);
    ctx.fillRect(0, h * 0.78, w, h * 0.05);
    if (spineText) {
      ctx.fillStyle = '#1b1e24';
      ctx.font = 'bold 26px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(spineText, w * 0.5, h * 0.21);
    }
  });
  const coverMat = new THREE.MeshStandardMaterial({ map: coverTex, roughness: 0.72 });
  const pageMat = new THREE.MeshStandardMaterial({ color: '#e6e0d0', roughness: 0.92 });

  const outer = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), coverMat);
  outer.position.y = height * 0.5;
  outer.castShadow = true;
  outer.receiveShadow = true;

  const pages = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.94, height * 0.76, depth * 0.95),
    pageMat
  );
  pages.position.set(width * 0.025, height * 0.5, 0);

  group.add(outer, pages);
  return group;
}

function buildFlutedHexBarrelGeometry(radius, length) {
  const radialSegs = 24;
  const geo = new THREE.CylinderGeometry(radius, radius, length, radialSegs, 1, false);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const vx = pos.getX(i);
    const vz = pos.getZ(i);
    const r = Math.hypot(vx, vz);
    if (r < 1e-6) continue;
    const angle = Math.atan2(vz, vx);
    // 6 crisp hex corners with subtle concave flutes between corners
    const sector = (((angle / (Math.PI / 3)) % 1) + 1) % 1;
    const distFromCorner = Math.min(sector, 1 - sector);
    const scale = 1.02 - Math.sin(distFromCorner * Math.PI) * 0.11;
    pos.setX(i, vx * scale);
    pos.setZ(i, vz * scale);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildBeveledRulerGeometry(length, height, depth) {
  const geo = new THREE.BoxGeometry(length, height, depth, 1, 1, 4);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    if (vy > 0 && vz > depth * 0.18) {
      const t = (vz - depth * 0.18) / (depth * 0.32);
      pos.setY(i, height * (0.5 - 0.62 * Math.min(1, t)));
    }
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Build the 4 upgraded interactive desk pickables plus non-pickable temperino on Vuarbit's desk.
 */
export function createUpgradedPickables({ scene, addFocusMesh, makeCanvasTexture }) {
  const makeTex = resolveMakeCanvasTexture(makeCanvasTexture);
  const registerFocus = typeof addFocusMesh === 'function' ? addFocusMesh : (m) => m;

  // 1. Fluted hexagonal wooden pencil
  const pencilGroup = new THREE.Group();
  const pencilTex = makeTex(1024, 256, (ctx, w, h) => {
    ctx.fillStyle = '#e0a629';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c48617';
    for (let i = 0; i < 6; i += 1) {
      ctx.fillRect(0, (i / 6) * h, w, 6);
    }
    ctx.fillStyle = '#202228';
    ctx.font = 'bold 48px Georgia, serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('HB  2  ·  GRAFITE  ·  ITALIA', 140, h * 0.52);
    ctx.fillStyle = '#8b5e10';
    ctx.fillRect(58, h * 0.14, 12, h * 0.72);
    ctx.fillRect(w - 72, h * 0.14, 12, h * 0.72);
  });
  const pencilBody = new THREE.Mesh(
    buildFlutedHexBarrelGeometry(0.0043, 0.15),
    new THREE.MeshStandardMaterial({ map: pencilTex, roughness: 0.46 })
  );
  pencilBody.rotation.z = Math.PI / 2;
  pencilBody.castShadow = true;

  const woodCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.0042, 0.018, 12),
    new THREE.MeshStandardMaterial({ color: '#deb98b', roughness: 0.78 })
  );
  woodCone.rotation.z = -Math.PI / 2;
  woodCone.position.set(0.084, 0, 0);
  woodCone.castShadow = true;

  const graphiteTip = new THREE.Mesh(
    new THREE.ConeGeometry(0.0016, 0.007, 10),
    new THREE.MeshStandardMaterial({ color: '#26282e', roughness: 0.42 })
  );
  graphiteTip.rotation.z = -Math.PI / 2;
  graphiteTip.position.set(0.091, 0, 0);

  const ferruleMat = new THREE.MeshStandardMaterial({
    color: '#c9ccd1',
    metalness: 0.7,
    roughness: 0.28,
  });
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.0044, 0.0044, 0.014, 14), ferruleMat);
  ferrule.rotation.z = Math.PI / 2;
  ferrule.position.set(-0.081, 0, 0);
  ferrule.castShadow = true;

  const crimpGeo = new THREE.TorusGeometry(0.00445, 0.00042, 6, 14);
  for (const cx of [-0.085, -0.081, -0.077]) {
    const ring = new THREE.Mesh(crimpGeo, ferruleMat);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(cx, 0, 0);
    pencilGroup.add(ring);
  }

  const eraserCapMat = new THREE.MeshStandardMaterial({ color: '#db7786', roughness: 0.78 });
  const capEraser = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0040, 0.0040, 0.009, 14),
    eraserCapMat
  );
  capEraser.rotation.z = Math.PI / 2;
  capEraser.position.set(-0.092, 0, 0);
  capEraser.castShadow = true;

  const capDome = new THREE.Mesh(new THREE.SphereGeometry(0.0040, 12, 8), eraserCapMat);
  capDome.scale.set(0.6, 1, 1);
  capDome.position.set(-0.0965, 0, 0);

  pencilGroup.add(pencilBody, woodCone, graphiteTip, ferrule, capEraser, capDome);

  const pencilRestPos = new THREE.Vector3(-1.66, 0.736, -1.30);
  const pencilRestQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 1.25, 0));
  pencilGroup.position.copy(pencilRestPos);
  pencilGroup.quaternion.copy(pencilRestQuat);
  scene.add(registerFocus(pencilGroup));

  // 2. Layered red/blue rubber eraser with paper sleeve
  const eraserGroup = new THREE.Group();
  const redRubberTex = makeTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#c84b4b';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 320; i += 1) {
      ctx.fillRect((i * 73) % w, (i * 41) % h, 3, 3);
    }
  });
  const blueRubberTex = makeTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#36659e';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(230,240,255,0.11)';
    for (let i = 0; i < 360; i += 1) {
      ctx.fillRect((i * 59) % w, (i * 37) % h, 2, 2);
    }
  });
  const sleeveTex = makeTex(1024, 512, (ctx, w, h) => {
    ctx.fillStyle = '#f2ede0';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c44646';
    ctx.fillRect(0, 0, w * 0.14, h);
    ctx.fillStyle = '#36659e';
    ctx.fillRect(w * 0.86, 0, w * 0.14, h);
    ctx.strokeStyle = '#252932';
    ctx.lineWidth = 6;
    ctx.strokeRect(24, 24, w - 48, h - 48);
    ctx.fillStyle = '#1f232b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 54px Georgia, serif';
    ctx.fillText('GOMMA · MATITA / PENNA', w * 0.5, h * 0.44);
    ctx.font = 'bold 34px Georgia, serif';
    ctx.fillStyle = '#484d57';
    ctx.fillText('DOPPIO USO · ART. 40', w * 0.5, h * 0.66);
  });

  const redRubber = new THREE.Mesh(
    new THREE.BoxGeometry(0.032, 0.013, 0.024),
    new THREE.MeshStandardMaterial({ map: redRubberTex, roughness: 0.9 })
  );
  redRubber.position.set(-0.010, 0, 0);
  redRubber.castShadow = true;

  const blueRubber = new THREE.Mesh(
    new THREE.BoxGeometry(0.020, 0.013, 0.024),
    new THREE.MeshStandardMaterial({ map: blueRubberTex, roughness: 0.94 })
  );
  blueRubber.position.set(0.016, 0, 0);
  blueRubber.castShadow = true;

  const paperSleeve = new THREE.Mesh(
    new THREE.BoxGeometry(0.026, 0.0138, 0.0248),
    new THREE.MeshStandardMaterial({ map: sleeveTex, roughness: 0.72 })
  );
  paperSleeve.position.set(0.001, 0, 0);
  paperSleeve.castShadow = true;

  eraserGroup.add(redRubber, blueRubber, paperSleeve);

  const eraserRestPos = new THREE.Vector3(-1.67, 0.737, -1.43);
  const eraserRestQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.35, 0));
  eraserGroup.position.copy(eraserRestPos);
  eraserGroup.quaternion.copy(eraserRestQuat);
  scene.add(registerFocus(eraserGroup));

  // 3. Rounded stadium/cylindrical woven 1990s fabric pencil case
  const pencilCaseGroup = new THREE.Group();
  const fabricTex = makeTex(1024, 512, (ctx, w, h) => {
    ctx.fillStyle = '#244166';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.055)';
    for (let x = 0; x < w; x += 8) ctx.fillRect(x, 0, 3, h);
    ctx.fillStyle = 'rgba(10,16,28,0.14)';
    for (let y = 0; y < h; y += 8) ctx.fillRect(0, y, w, 3);

    // Red athletic band + contrast dashed stitching
    ctx.fillStyle = '#bf4438';
    ctx.fillRect(0, h * 0.42, w, h * 0.22);
    ctx.strokeStyle = '#ece6d6';
    ctx.lineWidth = 4;
    ctx.setLineDash([14, 10]);
    ctx.beginPath();
    ctx.moveTo(0, h * 0.42);
    ctx.lineTo(w, h * 0.42);
    ctx.moveTo(0, h * 0.64);
    ctx.lineTo(w, h * 0.64);
    ctx.stroke();
    ctx.setLineDash([]);

    // Sewn woven label patch
    ctx.fillStyle = '#eae4d4';
    ctx.fillRect(w * 0.34, h * 0.14, w * 0.32, h * 0.19);
    ctx.strokeStyle = '#244166';
    ctx.lineWidth = 3;
    ctx.strokeRect(w * 0.348, h * 0.155, w * 0.304, h * 0.16);
    ctx.fillStyle = '#244166';
    ctx.font = 'bold 44px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ASTUCCIO', w * 0.5, h * 0.235);
  });
  const zipperTeethTex = makeTex(512, 64, (ctx, w, h) => {
    ctx.fillStyle = '#1b2c46';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d3b25a';
    for (let x = 8; x < w - 8; x += 12) {
      ctx.fillRect(x, 12, 7, 18);
      ctx.fillRect(x + 6, 34, 7, 18);
    }
  });

  const fabricMat = new THREE.MeshStandardMaterial({ map: fabricTex, roughness: 0.9 });
  const endCapMat = new THREE.MeshStandardMaterial({ color: '#1f3758', roughness: 0.9 });
  const pipingMat = new THREE.MeshStandardMaterial({ color: '#ece6d6', roughness: 0.78 });
  const brassMat = new THREE.MeshStandardMaterial({
    color: '#d4b35a',
    metalness: 0.72,
    roughness: 0.28,
  });

  const caseBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.032, 0.166, 26, 1, true),
    fabricMat
  );
  caseBody.rotation.z = Math.PI / 2;
  caseBody.scale.set(0.66, 1, 1.06);
  caseBody.castShadow = true;
  caseBody.receiveShadow = true;

  const endCapGeo = new THREE.SphereGeometry(0.032, 18, 12);
  const pipingGeo = new THREE.TorusGeometry(0.032, 0.0022, 8, 24);
  for (const sx of [-0.083, 0.083]) {
    const cap = new THREE.Mesh(endCapGeo, endCapMat);
    cap.position.set(sx, 0, 0);
    cap.scale.set(0.28, 0.66, 1.06);
    cap.castShadow = true;
    pencilCaseGroup.add(cap);

    const pipe = new THREE.Mesh(pipingGeo, pipingMat);
    pipe.position.set(sx, 0, 0);
    pipe.rotation.y = Math.PI / 2;
    pipe.scale.set(1.06, 0.66, 1);
    pencilCaseGroup.add(pipe);
  }

  const zipperStrip = new THREE.Mesh(
    new THREE.BoxGeometry(0.162, 0.003, 0.011),
    new THREE.MeshStandardMaterial({ map: zipperTeethTex, metalness: 0.45, roughness: 0.4 })
  );
  zipperStrip.position.set(0, 0.0215, 0);

  const slider = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.006, 0.011), brassMat);
  slider.position.set(0.068, 0.0235, 0);
  const pullTab = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.0025, 0.008), brassMat);
  pullTab.position.set(0.081, 0.023, 0.004);
  pullTab.rotation.y = 0.35;
  pullTab.rotation.z = -0.18;

  pencilCaseGroup.add(caseBody, zipperStrip, slider, pullTab);

  const pencilCaseRestPos = new THREE.Vector3(-2.06, 0.751, -1.56);
  const pencilCaseRestQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.16, 0));
  pencilCaseGroup.position.copy(pencilCaseRestPos);
  pencilCaseGroup.quaternion.copy(pencilCaseRestQuat);
  scene.add(registerFocus(pencilCaseGroup));

  // 4. Beveled 15 cm translucent/cream school ruler
  const rulerGroup = new THREE.Group();
  const rulerTex = makeTex(2048, 512, (ctx, w, h) => {
    ctx.fillStyle = '#efe7d2';
    ctx.fillRect(0, 0, w, h);

    // Subtle acrylic sheen gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(255,255,255,0.22)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(180,168,140,0.18)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Precision metric ticks 0..15 cm mapped across 15.6 cm width (0.3 cm margin each side)
    const pxPerCm = w / 15.6;
    const x0 = 0.3 * pxPerCm;
    ctx.strokeStyle = '#191d24';
    ctx.fillStyle = '#191d24';
    ctx.font = 'bold 46px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    for (let mm = 0; mm <= 150; mm += 1) {
      const x = x0 + mm * (pxPerCm * 0.1);
      const isCm = mm % 10 === 0;
      const isHalf = mm % 5 === 0;
      const tickLen = isCm ? h * 0.34 : isHalf ? h * 0.24 : h * 0.15;
      ctx.lineWidth = isCm ? 4.0 : isHalf ? 2.8 : 1.8;
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x, h - tickLen);
      ctx.stroke();

      if (isCm) {
        ctx.fillText(String(mm / 10), x, h - tickLen - 12);
      }
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 34px Georgia, serif';
    ctx.fillStyle = '#2d3440';
    ctx.fillText('RIGHELLO  15 cm  ·  MM / CM', 95, h * 0.24);

    // Printed hang hole mark near right end
    ctx.strokeStyle = '#9b917c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(w - 58, h * 0.28, 22, 0, Math.PI * 2);
    ctx.stroke();
  });

  const rulerMesh = new THREE.Mesh(
    buildBeveledRulerGeometry(0.156, 0.0035, 0.028),
    new THREE.MeshStandardMaterial({
      map: rulerTex,
      roughness: 0.25,
      metalness: 0.04,
      transparent: true,
      opacity: 0.92,
    })
  );
  rulerMesh.castShadow = true;
  rulerMesh.receiveShadow = true;
  rulerGroup.add(rulerMesh);

  const rulerRestPos = new THREE.Vector3(-1.79, 0.733, -1.57);
  const rulerRestQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.08, 0));
  rulerGroup.position.copy(rulerRestPos);
  rulerGroup.quaternion.copy(rulerRestQuat);
  scene.add(registerFocus(rulerGroup));

  // 5. Non-pickable metallic pencil sharpener (temperino) on Vuarbit's desk
  const temperino = new THREE.Group();
  temperino.position.set(-1.63, 0.737, -1.53);
  temperino.rotation.y = 0.45;
  const aluMat = new THREE.MeshStandardMaterial({
    color: '#c2c7cf',
    metalness: 0.74,
    roughness: 0.3,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: '#e0e4ea',
    metalness: 0.88,
    roughness: 0.2,
  });
  const darkHoleMat = new THREE.MeshStandardMaterial({ color: '#1b1d22', roughness: 0.85 });

  const sharpShape = new THREE.Shape();
  sharpShape.moveTo(-0.012, -0.005);
  sharpShape.lineTo(0.012, -0.005);
  sharpShape.lineTo(0.012, 0.003);
  sharpShape.lineTo(-0.012, 0.007);
  sharpShape.closePath();
  const sharpGeo = new THREE.ExtrudeGeometry(sharpShape, {
    depth: 0.015,
    bevelEnabled: true,
    bevelThickness: 0.0008,
    bevelSize: 0.0008,
    bevelSegments: 1,
  });
  sharpGeo.translate(0, 0, -0.0075);
  const sharpBody = new THREE.Mesh(sharpGeo, aluMat);

  const sharpHole = new THREE.Mesh(new THREE.CylinderGeometry(0.0038, 0.0038, 0.004, 12), darkHoleMat);
  sharpHole.rotation.z = Math.PI / 2;
  sharpHole.position.set(-0.011, 0.001, 0);

  const sharpBlade = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.0008, 0.0055), steelMat);
  sharpBlade.position.set(0, 0.0055, 0.001);
  sharpBlade.rotation.z = -0.165;

  temperino.add(sharpBody, sharpHole, sharpBlade);
  scene.add(registerFocus(temperino));

  const pickables = [
    {
      id: 'pencil',
      name: 'Wooden Pencil',
      mesh: pencilGroup,
      restPosition: pencilRestPos.clone(),
      restQuaternion: pencilRestQuat.clone(),
      occluderRadius: 0.015,
      halfDepth: 0.048,
    },
    {
      id: 'eraser',
      name: 'Red/Blue Eraser',
      mesh: eraserGroup,
      restPosition: eraserRestPos.clone(),
      restQuaternion: eraserRestQuat.clone(),
      occluderRadius: 0.020,
      halfDepth: 0.026,
    },
    {
      id: 'pencilcase',
      name: 'Pencil Case',
      mesh: pencilCaseGroup,
      restPosition: pencilCaseRestPos.clone(),
      restQuaternion: pencilCaseRestQuat.clone(),
      occluderRadius: 0.044,
      halfDepth: 0.074,
    },
    {
      id: 'ruler',
      name: '15 cm Ruler',
      mesh: rulerGroup,
      restPosition: rulerRestPos.clone(),
      restQuaternion: rulerRestQuat.clone(),
      occluderRadius: 0.022,
      halfDepth: 0.046,
    },
  ];

  return { pickables };
}

/**
 * Populate upgraded 1994 Italian classroom props and room details.
 */
export function populateClassroomProps({ scene, addFocusMesh, colliders, makeCanvasTexture }) {
  const makeTex = resolveMakeCanvasTexture(makeCanvasTexture);
  const registerFocus = typeof addFocusMesh === 'function' ? addFocusMesh : (m) => m;

  // 1. Open School Backpack (zaino aperto) beside Vuarbit's chair & desk leg
  const backpack = new THREE.Group();
  backpack.position.set(-1.60, 0, -1.12);
  backpack.rotation.y = -Math.PI / 2 + 0.16;

  const packMainMat = new THREE.MeshStandardMaterial({ color: '#234370', roughness: 0.88 });
  const packAccentMat = new THREE.MeshStandardMaterial({ color: '#2c7066', roughness: 0.86 });
  const packTrimMat = new THREE.MeshStandardMaterial({ color: '#d49a35', roughness: 0.78 });
  const packDarkMat = new THREE.MeshStandardMaterial({ color: '#1b2029', roughness: 0.92 });
  const buckleMat = new THREE.MeshStandardMaterial({ color: '#2b2e35', roughness: 0.5 });

  const packBody = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.33, 0.14), packMainMat);
  packBody.position.set(0, 0.165, 0);
  packBody.castShadow = true;
  packBody.receiveShadow = true;

  const packCavity = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.04, 0.115), packDarkMat);
  packCavity.position.set(0, 0.315, 0);

  const packPocket = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.18, 0.045), packAccentMat);
  packPocket.position.set(0, 0.11, 0.09);
  packPocket.castShadow = true;

  const pocketZip = new THREE.Mesh(new THREE.BoxGeometry(0.165, 0.008, 0.008), packTrimMat);
  pocketZip.position.set(0, 0.175, 0.113);

  const packFlap = new THREE.Mesh(new THREE.BoxGeometry(0.245, 0.016, 0.16), packAccentMat);
  packFlap.position.set(0, 0.335, -0.10);
  packFlap.rotation.x = -1.18;
  packFlap.castShadow = true;

  const strapGeo = new THREE.BoxGeometry(0.022, 0.22, 0.008);
  const buckleGeo = new THREE.BoxGeometry(0.028, 0.024, 0.014);
  for (const sx of [-0.065, 0.065]) {
    const fStrap = new THREE.Mesh(strapGeo, packDarkMat);
    fStrap.position.set(sx, 0.15, 0.095);
    const buckle = new THREE.Mesh(buckleGeo, buckleMat);
    buckle.position.set(sx, 0.19, 0.10);
    const bStrap = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.26, 0.014), packDarkMat);
    bStrap.position.set(sx, 0.16, -0.075);
    backpack.add(fStrap, buckle, bStrap);
  }

  // Peeking textbooks + protractor
  const packBookSpecs = [
    { x: -0.04, rotZ: 0.10, rotY: 0.05, col: '#b84237', title: 'ARITMETICA' },
    { x: 0.015, rotZ: -0.04, rotY: -0.08, col: '#2d6ea3', title: 'GEOMETRIA' },
    { x: 0.055, rotZ: -0.12, rotY: 0.10, col: '#4a7a48', title: 'ANTOLOGIA' },
  ];
  for (const spec of packBookSpecs) {
    const bk = createBookGroup({
      width: 0.022,
      height: 0.17,
      depth: 0.12,
      coverColor: spec.col,
      spineText: spec.title,
      makeTex,
    });
    bk.position.set(spec.x, 0.24, 0);
    bk.rotation.set(0, spec.rotY, spec.rotZ);
    backpack.add(bk);
  }

  const protractor = new THREE.Mesh(
    new THREE.RingGeometry(0.028, 0.054, 18, 1, 0, Math.PI),
    new THREE.MeshStandardMaterial({
      color: '#88c5e8',
      transparent: true,
      opacity: 0.72,
      roughness: 0.22,
      side: THREE.DoubleSide,
    })
  );
  protractor.position.set(-0.02, 0.34, 0.048);
  protractor.rotation.z = 0.22;
  backpack.add(packBody, packCavity, packPocket, pocketZip, packFlap, protractor);
  scene.add(registerFocus(backpack));

  // 2. Wall-Mounted School Bell (campanella) on right wall beside door
  const bellGroup = new THREE.Group();
  bellGroup.position.set(3.74, 2.48, -2.42);
  bellGroup.rotation.y = -Math.PI / 2;

  const ironMat = new THREE.MeshStandardMaterial({ color: '#393f46', metalness: 0.5, roughness: 0.6 });
  const brassBellMat = new THREE.MeshStandardMaterial({
    color: '#c8b683',
    metalness: 0.8,
    roughness: 0.24,
  });
  const conduitMat = new THREE.MeshStandardMaterial({
    color: '#989ea6',
    metalness: 0.65,
    roughness: 0.38,
  });

  const bellBack = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.15, 0.03), ironMat);
  bellBack.position.set(0, 0, -0.045);

  const bellDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.082, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.56),
    brassBellMat
  );
  bellDome.rotation.x = Math.PI / 2;
  bellDome.position.set(0, 0.01, -0.022);
  bellDome.castShadow = true;

  const strikerRod = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.075, 8), conduitMat);
  strikerRod.position.set(0, -0.055, 0.015);
  const strikerBall = new THREE.Mesh(new THREE.SphereGeometry(0.013, 10, 8), brassBellMat);
  strikerBall.position.set(0, -0.09, 0.015);

  const conduit = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.65, 8), conduitMat);
  conduit.position.set(0, 0.395, -0.048);

  bellGroup.add(bellBack, bellDome, strikerRod, strikerBall, conduit);
  scene.add(registerFocus(bellGroup));

  // 3. Classroom Coat Rack (appendiabiti) along back wall
  const coatRack = new THREE.Group();
  coatRack.position.set(0, 1.48, 4.16);
  coatRack.rotation.y = Math.PI;

  const rackWoodMat = new THREE.MeshStandardMaterial({ color: '#8f6034', roughness: 0.68 });
  const rackRail = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.11, 0.028), rackWoodMat);
  rackRail.castShadow = true;
  rackRail.receiveShadow = true;
  coatRack.add(rackRail);

  const hookMat = new THREE.MeshStandardMaterial({ color: '#727880', metalness: 0.72, roughness: 0.34 });
  const hookStemGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.06, 8);
  const hookTipGeo = new THREE.SphereGeometry(0.01, 8, 6);
  const coatBodyGeo = new THREE.CylinderGeometry(0.11, 0.16, 0.54, 10);
  const coatSleeveGeo = new THREE.CylinderGeometry(0.042, 0.036, 0.42, 8);
  const coatCollarGeo = new THREE.TorusGeometry(0.062, 0.022, 6, 12);

  const coatSpecs = [
    { x: -2.02, col: '#2d7a74', yaw: 0.06, hScale: 1.04 },
    { x: -1.40, col: '#d49a2a', yaw: -0.05, hScale: 1.0 },
    { x: -0.78, col: '#8c2d3b', yaw: 0.04, hScale: 0.94 },
    { x: -0.18, col: '#3a5882', yaw: -0.06, hScale: 1.06, hasScarf: true },
    { x: 0.46, col: '#2f6346', yaw: 0.07, hScale: 0.98 },
    { x: 1.15, col: '#273652', yaw: -0.04, hScale: 1.05 },
    { x: 1.88, col: '#b85a32', yaw: 0.05, hScale: 0.95 },
  ];

  // Shared 9 hooks along the 4.6m rail
  for (let i = 0; i < 9; i += 1) {
    const hx = -2.05 + i * 0.51;
    const stem = new THREE.Mesh(hookStemGeo, hookMat);
    stem.rotation.x = Math.PI / 2;
    stem.position.set(hx, 0.01, 0.04);
    const tip = new THREE.Mesh(hookTipGeo, hookMat);
    tip.position.set(hx, 0.025, 0.07);
    coatRack.add(stem, tip);
  }

  let scarfPivot = null;
  for (const c of coatSpecs) {
    const coat = new THREE.Group();
    coat.position.set(c.x, -0.01, 0.085);
    coat.rotation.y = c.yaw;

    const cMat = new THREE.MeshStandardMaterial({ color: c.col, roughness: 0.88 });
    const torso = new THREE.Mesh(coatBodyGeo, cMat);
    torso.scale.set(1.1, c.hScale, 0.55);
    torso.position.set(0, -0.28 * c.hScale, 0);
    torso.castShadow = true;

    const lSleeve = new THREE.Mesh(coatSleeveGeo, cMat);
    lSleeve.position.set(-0.145, -0.26, 0.01);
    lSleeve.rotation.z = -0.18;

    const rSleeve = new THREE.Mesh(coatSleeveGeo, cMat);
    rSleeve.position.set(0.145, -0.26, 0.01);
    rSleeve.rotation.z = 0.16;

    const collar = new THREE.Mesh(coatCollarGeo, cMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0.01, 0);

    coat.add(torso, lSleeve, rSleeve, collar);

    if (c.hasScarf) {
      const scarfTex = makeTex(128, 256, (ctx, w, h) => {
        ctx.fillStyle = '#c43e38';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#e7dec5';
        for (let sy = 20; sy < h; sy += 44) {
          ctx.fillRect(0, sy, w, 14);
        }
      });
      const scarfMat = new THREE.MeshStandardMaterial({ map: scarfTex, roughness: 0.92 });
      scarfPivot = new THREE.Group();
      scarfPivot.position.set(0.02, 0.02, 0.04);

      const scarfLoop = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.02, 6, 12), scarfMat);
      scarfLoop.rotation.x = Math.PI / 2;
      const tailL = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.34, 0.016), scarfMat);
      tailL.position.set(-0.032, -0.18, 0.04);
      tailL.rotation.z = 0.05;
      const tailR = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.28, 0.016), scarfMat);
      tailR.position.set(0.035, -0.15, 0.045);
      tailR.rotation.z = -0.06;

      scarfPivot.add(scarfLoop, tailL, tailR);
      coat.add(scarfPivot);
    }

    coatRack.add(coat);
  }
  scene.add(registerFocus(coatRack));

  // 4. Proper tubular/wooden teacher chair at (0.77, 0, -3.53) facing +Z
  const teacherChair = new THREE.Group();
  teacherChair.position.set(0.77, 0, -3.53);
  const tSteelMat = new THREE.MeshStandardMaterial({ color: '#3b4048', metalness: 0.5, roughness: 0.45 });
  const tWoodMat = new THREE.MeshStandardMaterial({ color: '#b88852', roughness: 0.65 });

  const tSeat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.024, 0.40), tWoodMat);
  tSeat.position.set(0, 0.45, 0);
  tSeat.castShadow = true;
  tSeat.receiveShadow = true;

  const tBack = new THREE.Mesh(new THREE.BoxGeometry(0.41, 0.21, 0.022), tWoodMat);
  tBack.position.set(0, 0.76, -0.19);
  tBack.rotation.x = -0.08;
  tBack.castShadow = true;

  const tLegGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.45, 8);
  for (const [lx, lz] of [
    [-0.18, -0.17],
    [0.18, -0.17],
    [-0.18, 0.17],
    [0.18, 0.17],
  ]) {
    const leg = new THREE.Mesh(tLegGeo, tSteelMat);
    leg.position.set(lx, 0.225, lz);
    teacherChair.add(leg);
  }
  const tUprightGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.38, 8);
  for (const ux of [-0.15, 0.15]) {
    const up = new THREE.Mesh(tUprightGeo, tSteelMat);
    up.position.set(ux, 0.63, -0.18);
    teacherChair.add(up);
  }
  teacherChair.add(tSeat, tBack);
  scene.add(registerFocus(teacherChair));

  // 5. Cattedra top props (y = 0.78)
  const cattedraProps = new THREE.Group();

  // Open Registro di Classe with lined grid
  const registroGroup = new THREE.Group();
  registroGroup.position.set(0.62, 0.785, -2.91);
  registroGroup.rotation.y = 0.08;

  const regTex = makeTex(1024, 512, (ctx, w, h) => {
    ctx.fillStyle = '#ece6d4';
    ctx.fillRect(0, 0, w, h);
    const spine = ctx.createLinearGradient(w * 0.47, 0, w * 0.53, 0);
    spine.addColorStop(0, 'rgba(0,0,0,0)');
    spine.addColorStop(0.5, 'rgba(30,24,18,0.28)');
    spine.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = spine;
    ctx.fillRect(w * 0.47, 0, w * 0.06, h);

    ctx.strokeStyle = 'rgba(46, 86, 128, 0.36)';
    ctx.lineWidth = 1.5;
    for (let y = 78; y < h - 24; y += 22) {
      ctx.beginPath();
      ctx.moveTo(28, y);
      ctx.lineTo(w * 0.48, y);
      ctx.moveTo(w * 0.52, y);
      ctx.lineTo(w - 28, y);
      ctx.stroke();
    }
    for (const x of [90, 260, 320, 380, 440, 560, 660, 760, 860, 940]) {
      ctx.beginPath();
      ctx.moveTo(x, 60);
      ctx.lineTo(x, h - 24);
      ctx.stroke();
    }

    ctx.fillStyle = '#1b355c';
    ctx.font = 'bold 24px Georgia, serif';
    ctx.fillText('REGISTRO DI CLASSE · 2ª M', 34, 46);
    ctx.fillText('VALUTAZIONI E ASSENZE', w * 0.54, 46);

    ctx.font = '14px Georgia, serif';
    ctx.fillStyle = '#2d3340';
    for (let row = 1; row <= 18; row += 1) {
      const ry = 74 + row * 22;
      if (ry < h - 26) {
        ctx.fillText(`Alunno ${String(row).padStart(2, '0')}`, 102, ry);
      }
    }
    ctx.fillStyle = '#9e2a2b';
    ctx.font = 'italic 16px Georgia, serif';
    ctx.fillText('25/11: Proporzioni e Pitagora', w * 0.55, 118);
  });

  const regCover = new THREE.Mesh(
    new THREE.BoxGeometry(0.43, 0.008, 0.29),
    new THREE.MeshStandardMaterial({ color: '#1a4278', roughness: 0.65 })
  );
  regCover.castShadow = true;
  const regPages = new THREE.Mesh(
    new THREE.BoxGeometry(0.40, 0.011, 0.27),
    new THREE.MeshStandardMaterial({ map: regTex, roughness: 0.9 })
  );
  regPages.position.y = 0.005;
  registroGroup.add(regCover, regPages);
  cattedraProps.add(registroGroup);

  // Stack of 3 textbooks on cattedra
  const catBookSpecs = [
    { h: 0.032, y: 0.78, yaw: 0.04, col: '#2d5b8c', title: 'ARITMETICA' },
    { h: 0.028, y: 0.812, yaw: -0.08, col: '#9e3b36', title: 'GEOMETRIA' },
    { h: 0.026, y: 0.84, yaw: 0.11, col: '#3e6e48', title: 'ANTOLOGIA' },
  ];
  for (const b of catBookSpecs) {
    const bk = createBookGroup({
      width: 0.22,
      height: b.h,
      depth: 0.28,
      coverColor: b.col,
      spineText: b.title,
      makeTex,
    });
    bk.position.set(1.22, b.y, -3.05);
    bk.rotation.y = b.yaw;
    cattedraProps.add(bk);
  }

  // Chalk box (GESSI) + chalk sticks
  const chalkBoxTex = makeTex(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#d4aa5a';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#6b471a';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = '#25211c';
    ctx.font = 'bold 34px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GESSI', w * 0.5, h * 0.5);
  });
  const chalkBox = new THREE.Group();
  chalkBox.position.set(0.36, 0.78, -3.10);
  chalkBox.rotation.y = 0.22;
  const chalkBoxMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.10, 0.04, 0.072),
    new THREE.MeshStandardMaterial({ map: chalkBoxTex, roughness: 0.8 })
  );
  chalkBoxMesh.position.y = 0.02;
  chalkBoxMesh.castShadow = true;
  chalkBox.add(chalkBoxMesh);
  const chalkStickGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.055, 8);
  const chalkStickMat = new THREE.MeshStandardMaterial({ color: '#f4f4ee', roughness: 0.9 });
  for (let i = 0; i < 4; i += 1) {
    const stick = new THREE.Mesh(chalkStickGeo, chalkStickMat);
    stick.rotation.z = Math.PI / 2;
    stick.position.set(-0.01, 0.042, -0.018 + i * 0.012);
    chalkBox.add(stick);
  }
  cattedraProps.add(chalkBox);

  // Red grading pen on cattedra
  const redPen = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0045, 0.0045, 0.145, 8),
    new THREE.MeshStandardMaterial({ color: '#b82828', roughness: 0.35 })
  );
  redPen.rotation.set(0, -0.35, Math.PI / 2);
  redPen.position.set(0.88, 0.785, -2.84);
  cattedraProps.add(redPen);

  // Ceramic mug on cattedra
  const mugGroup = new THREE.Group();
  mugGroup.position.set(1.06, 0.78, -2.75);
  const mugMat = new THREE.MeshStandardMaterial({ color: '#2b594b', roughness: 0.32 });
  const mugBody = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.036, 0.088, 16), mugMat);
  mugBody.position.y = 0.044;
  mugBody.castShadow = true;
  const mugHandle = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.006, 8, 14), mugMat);
  mugHandle.position.set(0.038, 0.046, 0);
  const coffeeTop = new THREE.Mesh(
    new THREE.CircleGeometry(0.033, 14),
    new THREE.MeshStandardMaterial({ color: '#2b1b12', roughness: 0.2 })
  );
  coffeeTop.rotation.x = -Math.PI / 2;
  coffeeTop.position.y = 0.089;
  mugGroup.add(mugBody, mugHandle, coffeeTop);
  cattedraProps.add(mugGroup);

  scene.add(registerFocus(cattedraProps));

  // 6. Wooden blackboard pointer (bacchetta) on chalk tray
  const pointer = new THREE.Group();
  pointer.position.set(-0.05, 1.022, -4.02);
  const pointerStick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.0085, 0.78, 10),
    new THREE.MeshStandardMaterial({ color: '#9c6e3b', roughness: 0.62 })
  );
  pointerStick.rotation.z = Math.PI / 2;
  const pointerTip = new THREE.Mesh(
    new THREE.SphereGeometry(0.0045, 8, 6),
    new THREE.MeshStandardMaterial({ color: '#25262b', roughness: 0.8 })
  );
  pointerTip.position.set(-0.39, 0, 0);
  pointer.add(pointerStick, pointerTip);
  scene.add(registerFocus(pointer));

  // 7. Orario Scolastico on front-right wall (x = 2.55, y = 1.72, z = -4.12)
  const orarioTex = makeTex(1024, 768, (ctx, w, h) => {
    ctx.fillStyle = '#f5f1e4';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#243a5e';
    ctx.lineWidth = 8;
    ctx.strokeRect(18, 18, w - 36, h - 36);

    ctx.fillStyle = '#243a5e';
    ctx.font = 'bold 40px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('ORARIO SCOLASTICO · CLASSE 2ª M', w * 0.5, 76);

    const days = ['ORA', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB'];
    const hours = ['8:30', '9:30', '10:30', '11:30', '12:30'];
    const grid = [
      ['ITALIANO', 'MATEMAT.', 'INGLESE', 'ITALIANO', 'STORIA', 'GEOGRAF.'],
      ['STORIA', 'SCIENZE', 'MATEMAT.', 'FRANCESE', 'MATEMAT.', 'SCIENZE'],
      ['MATEMAT.', 'ITALIANO', 'ED. FIS.', 'TECNICA', 'ARTE', 'ITALIANO'],
      ['INGLESE', 'TECNICA', 'MUSICA', 'MATEMAT.', 'ITALIANO', 'MUSICA'],
      ['ARTE', 'GEOGRAF.', 'ITALIANO', 'SCIENZE', 'ED. FIS.', 'MATEMAT.'],
    ];

    const gx = 48;
    const gy = 110;
    const gw = w - 96;
    const gh = h - 150;
    const colW = gw / days.length;
    const rowH = gh / (hours.length + 1);

    ctx.fillStyle = '#dce5f0';
    ctx.fillRect(gx, gy, gw, rowH);

    ctx.strokeStyle = '#3c4b64';
    ctx.lineWidth = 2.5;
    for (let c = 0; c <= days.length; c += 1) {
      ctx.beginPath();
      ctx.moveTo(gx + c * colW, gy);
      ctx.lineTo(gx + c * colW, gy + gh);
      ctx.stroke();
    }
    for (let r = 0; r <= hours.length + 1; r += 1) {
      ctx.beginPath();
      ctx.moveTo(gx, gy + r * rowH);
      ctx.lineTo(gx + gw, gy + r * rowH);
      ctx.stroke();
    }

    ctx.textBaseline = 'middle';
    ctx.font = 'bold 26px Georgia, serif';
    ctx.fillStyle = '#1b2b44';
    days.forEach((d, c) => {
      ctx.fillText(d, gx + (c + 0.5) * colW, gy + rowH * 0.5);
    });

    hours.forEach((hr, r) => {
      const cy = gy + (r + 1.5) * rowH;
      ctx.font = 'bold 24px Georgia, serif';
      ctx.fillStyle = '#243a5e';
      ctx.fillText(hr, gx + colW * 0.5, cy);
      ctx.font = '20px Georgia, serif';
      ctx.fillStyle = '#22262e';
      grid[r].forEach((subj, c) => {
        ctx.fillText(subj, gx + (c + 1.5) * colW, cy);
      });
    });
  });

  const orarioGroup = new THREE.Group();
  orarioGroup.position.set(2.55, 1.72, -4.12);
  const orarioBoard = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 0.68, 0.018),
    new THREE.MeshStandardMaterial({ map: orarioTex, roughness: 0.82 })
  );
  const orarioFrame = new THREE.Mesh(
    new THREE.BoxGeometry(0.96, 0.72, 0.014),
    new THREE.MeshStandardMaterial({ color: '#7a5230', roughness: 0.72 })
  );
  orarioFrame.position.z = -0.005;
  orarioGroup.add(orarioFrame, orarioBoard);
  scene.add(registerFocus(orarioGroup));

  // 8. Sistema Metrico Decimale chart on back wall (x = 0.0, y = 2.28, z = 4.16)
  const metricTex = makeTex(1024, 700, (ctx, w, h) => {
    ctx.fillStyle = '#efe7cf';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#5c4932';
    ctx.lineWidth = 10;
    ctx.strokeRect(18, 18, w - 36, h - 36);

    ctx.fillStyle = '#2c241b';
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px Georgia, serif';
    ctx.fillText('SISTEMA METRICO DECIMALE', w * 0.5, 76);

    const sections = [
      { y: 150, title: 'LUNGHEZZA (Metro)', units: 'km · hm · dam · m · dm · cm · mm', col: '#2b5b8c' },
      { y: 270, title: 'MASSA (Chilogrammo)', units: 'kg · hg · dag · g · dg · cg · mg', col: '#8c3b32' },
      { y: 390, title: 'CAPACITÀ (Litro)', units: 'hl · dal · l · dl · cl · ml', col: '#2d6e4a' },
      { y: 510, title: 'SUPERFICIE & VOLUME', units: '1 m² = 100 dm²   |   1 m³ = 1000 dm³', col: '#5c4b32' },
    ];
    sections.forEach((s) => {
      ctx.fillStyle = s.col;
      ctx.font = 'bold 28px Georgia, serif';
      ctx.fillText(s.title, w * 0.5, s.y);
      ctx.fillStyle = '#22262d';
      ctx.font = '26px Georgia, serif';
      ctx.fillText(s.units, w * 0.5, s.y + 42);
      ctx.strokeStyle = 'rgba(92,73,50,0.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(80, s.y + 66);
      ctx.lineTo(w - 80, s.y + 66);
      ctx.stroke();
    });

    // Metric scale bar at bottom
    ctx.strokeStyle = '#22262d';
    ctx.lineWidth = 4;
    ctx.strokeRect(140, 610, w - 280, 26);
    for (let i = 0; i <= 10; i += 1) {
      const tx = 140 + ((w - 280) * i) / 10;
      ctx.beginPath();
      ctx.moveTo(tx, 610);
      ctx.lineTo(tx, 636);
      ctx.stroke();
    }
  });

  const metricChart = new THREE.Group();
  metricChart.position.set(0.0, 2.28, 4.16);
  metricChart.rotation.y = Math.PI;
  const chartSheet = new THREE.Mesh(
    new THREE.BoxGeometry(1.30, 0.88, 0.008),
    new THREE.MeshStandardMaterial({ map: metricTex, roughness: 0.85 })
  );
  const dowelGeo = new THREE.CylinderGeometry(0.014, 0.014, 1.38, 10);
  const dowelMat = new THREE.MeshStandardMaterial({ color: '#7a5230', roughness: 0.72 });
  const topDowel = new THREE.Mesh(dowelGeo, dowelMat);
  topDowel.rotation.z = Math.PI / 2;
  topDowel.position.set(0, 0.45, 0.008);
  const botDowel = new THREE.Mesh(dowelGeo, dowelMat);
  botDowel.rotation.z = Math.PI / 2;
  botDowel.position.set(0, -0.45, 0.008);
  metricChart.add(chartSheet, topDowel, botDowel);
  scene.add(registerFocus(metricChart));

  // 9. Wastebasket (cestino) with crumpled paper balls at (2.35, 0, -3.78)
  const wastebasket = new THREE.Group();
  wastebasket.position.set(2.35, 0, -3.78);
  const binMat = new THREE.MeshStandardMaterial({
    color: '#4f5761',
    roughness: 0.58,
    side: THREE.DoubleSide,
  });
  const binShell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.165, 0.125, 0.34, 18, 1, true),
    binMat
  );
  binShell.position.y = 0.17;
  binShell.castShadow = true;
  binShell.receiveShadow = true;

  const binBottom = new THREE.Mesh(new THREE.CircleGeometry(0.125, 16), binMat);
  binBottom.rotation.x = -Math.PI / 2;
  binBottom.position.y = 0.004;

  const binRim = new THREE.Mesh(new THREE.TorusGeometry(0.166, 0.009, 8, 20), binMat);
  binRim.rotation.x = Math.PI / 2;
  binRim.position.y = 0.34;

  wastebasket.add(binShell, binBottom, binRim);

  const paperBallGeo = new THREE.IcosahedronGeometry(0.036, 0);
  const paperBallMat = new THREE.MeshStandardMaterial({ color: '#ebe6d8', roughness: 0.94 });
  const ballOffsets = [
    [-0.04, 0.045, 0.02, 1.1, 0.85, 1.0],
    [0.045, 0.05, -0.03, 0.9, 1.15, 0.95],
    [0.0, 0.095, 0.035, 1.05, 0.9, 1.1],
    [-0.045, 0.10, -0.035, 0.95, 1.05, 0.88],
    [0.035, 0.135, 0.0, 1.1, 0.95, 1.0],
  ];
  for (const [bx, by, bz, sx, sy, sz] of ballOffsets) {
    const ball = new THREE.Mesh(paperBallGeo, paperBallMat);
    ball.position.set(bx, by, bz);
    ball.scale.set(sx, sy, sz);
    ball.rotation.set(bx * 12, by * 8, bz * 10);
    wastebasket.add(ball);
  }
  scene.add(registerFocus(wastebasket));

  if (Array.isArray(colliders)) {
    colliders.push({ minX: 2.15, maxX: 2.55, minZ: -3.98, maxZ: -3.58 });
  }

  // 10. Cabinet detail upgrade around (3.54, 0.875, 1.25), size 0.48 x 1.75 x 1.3
  const cabinetUpgrade = new THREE.Group();
  const cabTrimMat = new THREE.MeshStandardMaterial({ color: '#876542', roughness: 0.72 });
  const cabHandleMat = new THREE.MeshStandardMaterial({
    color: '#c8a852',
    metalness: 0.75,
    roughness: 0.28,
  });

  const panelGeo = new THREE.BoxGeometry(0.014, 1.56, 0.58);
  for (const pz of [0.93, 1.57]) {
    const panel = new THREE.Mesh(panelGeo, cabTrimMat);
    panel.position.set(3.295, 0.895, pz);
    cabinetUpgrade.add(panel);
  }
  const cabSeam = new THREE.Mesh(new THREE.BoxGeometry(0.016, 1.62, 0.02), cabTrimMat);
  cabSeam.position.set(3.293, 0.895, 1.25);
  const cabPlinth = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.07, 1.28), cabTrimMat);
  cabPlinth.position.set(3.294, 0.035, 1.25);
  cabinetUpgrade.add(cabSeam, cabPlinth);

  const handleGeo = new THREE.BoxGeometry(0.025, 0.11, 0.016);
  for (const hz of [1.18, 1.32]) {
    const handle = new THREE.Mesh(handleGeo, cabHandleMat);
    handle.position.set(3.276, 0.92, hz);
    cabinetUpgrade.add(handle);
  }

  // Upright ring binders on top of cabinet (y = 1.75)
  const binderSpecs = [
    { z: 0.84, col: '#2d5c8c', label: 'MATEM.' },
    { z: 0.92, col: '#b34136', label: 'SCIENZE' },
    { z: 1.00, col: '#3b6e49', label: 'STORIA' },
    { z: 1.08, col: '#c98f2e', label: '2ª M' },
  ];
  for (const b of binderSpecs) {
    const binder = createBookGroup({
      width: 0.25,
      height: 0.31,
      depth: 0.062,
      coverColor: b.col,
      spineText: b.label,
      makeTex,
    });
    binder.position.set(3.52, 1.75, b.z);
    cabinetUpgrade.add(binder);
  }

  // Horizontal atlases stacked on top of cabinet
  const atlasSpecs = [
    { y: 1.75, h: 0.036, yaw: 0.04, col: '#1f4d78', title: 'ATLANTE' },
    { y: 1.786, h: 0.032, yaw: -0.07, col: '#7d3330', title: 'GEOGRAFIA' },
  ];
  for (const a of atlasSpecs) {
    const atlas = createBookGroup({
      width: 0.26,
      height: a.h,
      depth: 0.34,
      coverColor: a.col,
      spineText: a.title,
      makeTex,
    });
    atlas.position.set(3.52, a.y, 1.54);
    atlas.rotation.y = a.yaw;
    cabinetUpgrade.add(atlas);
  }

  scene.add(registerFocus(cabinetUpgrade));

  function updateProps(simTime) {
    if (scarfPivot) {
      const t = Number.isFinite(simTime) ? simTime : 0;
      scarfPivot.rotation.z = Math.sin(t * 1.1) * 0.012;
    }
  }

  return { updateProps };
}
