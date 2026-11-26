import * as THREE from 'three';

let sharedPersonGeos = null;

function getSharedPersonGeos() {
  if (sharedPersonGeos) return sharedPersonGeos;
  sharedPersonGeos = {
    torso: new THREE.BoxGeometry(0.32, 0.44, 0.18),
    shoulderCap: new THREE.BoxGeometry(0.35, 0.11, 0.19),
    collar: new THREE.CylinderGeometry(0.064, 0.074, 0.032, 10),
    neck: new THREE.CylinderGeometry(0.044, 0.050, 0.075, 10),
    head: new THREE.SphereGeometry(0.102, 14, 12),
    eye: new THREE.SphereGeometry(0.011, 8, 6),
    nose: new THREE.BoxGeometry(0.015, 0.024, 0.018),
    brow: new THREE.BoxGeometry(0.026, 0.006, 0.008),
    hairCap: new THREE.SphereGeometry(0.108, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
    hairBackShort: new THREE.BoxGeometry(0.16, 0.08, 0.055),
    hairBobSide: new THREE.BoxGeometry(0.042, 0.155, 0.11),
    hairBobBack: new THREE.BoxGeometry(0.18, 0.165, 0.065),
    hairPonytailBand: new THREE.TorusGeometry(0.024, 0.007, 6, 12),
    hairPonytail: new THREE.ConeGeometry(0.036, 0.18, 8),
    hairPartSide: new THREE.BoxGeometry(0.072, 0.045, 0.062),
    sleeve: new THREE.BoxGeometry(0.082, 0.18, 0.082),
    forearm: new THREE.BoxGeometry(0.066, 0.15, 0.066),
    hand: new THREE.SphereGeometry(0.030, 8, 6),
    standLeg: new THREE.BoxGeometry(0.125, 0.84, 0.135),
    thigh: new THREE.BoxGeometry(0.115, 0.105, 0.34),
    shin: new THREE.BoxGeometry(0.102, 0.42, 0.105),
    shoe: new THREE.BoxGeometry(0.105, 0.055, 0.17),
  };
  return sharedPersonGeos;
}

const sharedEyeMat = new THREE.MeshStandardMaterial({ color: '#241e1a', roughness: 0.5 });
const sharedShoeMat = new THREE.MeshStandardMaterial({ color: '#332e2b', roughness: 0.82 });
const sharedBandMat = new THREE.MeshStandardMaterial({ color: '#c44646', roughness: 0.65 });

/**
 * Create a stylized 1990s student or teacher figure with local forward along -Z.
 * Casts shadows only on torso and head to keep the 2048 shadow map fast.
 */
export function createStylizedPerson(shirtColor, pantsColor, hairColor, seated = false, opts = {}) {
  const {
    hairStyle = 'short',
    scale = 1,
    collarColor = '#e6e2d8',
    skinColor = '#e1b594',
  } = opts;

  const geos = getSharedPersonGeos();
  const group = new THREE.Group();
  if (scale !== 1) group.scale.setScalar(scale);

  const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.72 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.82 });
  const collarMat = new THREE.MeshStandardMaterial({ color: collarColor, roughness: 0.78 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.86 });
  const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.88 });

  const baseY = seated ? 0.0 : 0.41;

  // Torso (shadow-casting) + shoulder cap & shirt collar
  const torso = new THREE.Mesh(geos.torso, shirtMat);
  torso.position.set(0, baseY + 0.70, 0);
  torso.castShadow = true;
  group.add(torso);

  const shoulderCap = new THREE.Mesh(geos.shoulderCap, shirtMat);
  shoulderCap.position.set(0, baseY + 0.875, 0);
  group.add(shoulderCap);

  const collar = new THREE.Mesh(geos.collar, collarMat);
  collar.position.set(0, baseY + 0.932, -0.005);
  group.add(collar);

  const neck = new THREE.Mesh(geos.neck, skinMat);
  neck.position.set(0, baseY + 0.955, 0);
  group.add(neck);

  // Head pivot + shadow-casting head + face cues on -Z + hair variant
  const headPivot = new THREE.Group();
  headPivot.position.set(0, baseY + 0.965, 0);

  const head = new THREE.Mesh(geos.head, skinMat);
  head.position.set(0, 0.09, 0);
  head.castShadow = true;
  headPivot.add(head);

  const lEye = new THREE.Mesh(geos.eye, sharedEyeMat);
  lEye.position.set(-0.035, 0.100, -0.095);
  const rEye = new THREE.Mesh(geos.eye, sharedEyeMat);
  rEye.position.set(0.035, 0.100, -0.095);
  const lBrow = new THREE.Mesh(geos.brow, hairMat);
  lBrow.position.set(-0.035, 0.118, -0.094);
  const rBrow = new THREE.Mesh(geos.brow, hairMat);
  rBrow.position.set(0.035, 0.118, -0.094);
  const nose = new THREE.Mesh(geos.nose, skinMat);
  nose.position.set(0, 0.080, -0.101);
  headPivot.add(lEye, rEye, lBrow, rBrow, nose);

  const hairCap = new THREE.Mesh(geos.hairCap, hairMat);
  hairCap.position.set(0, 0.098, 0.012);
  hairCap.rotation.x = 0.26;
  headPivot.add(hairCap);

  if (hairStyle === 'bob') {
    const lSide = new THREE.Mesh(geos.hairBobSide, hairMat);
    lSide.position.set(-0.088, 0.055, 0.015);
    const rSide = new THREE.Mesh(geos.hairBobSide, hairMat);
    rSide.position.set(0.088, 0.055, 0.015);
    const back = new THREE.Mesh(geos.hairBobBack, hairMat);
    back.position.set(0, 0.050, 0.075);
    headPivot.add(lSide, rSide, back);
  } else if (hairStyle === 'ponytail') {
    const band = new THREE.Mesh(geos.hairPonytailBand, sharedBandMat);
    band.position.set(0, 0.092, 0.108);
    const tail = new THREE.Mesh(geos.hairPonytail, hairMat);
    tail.position.set(0, 0.020, 0.132);
    tail.rotation.x = 2.75;
    headPivot.add(band, tail);
  } else if (hairStyle === 'parted') {
    const lPart = new THREE.Mesh(geos.hairPartSide, hairMat);
    lPart.position.set(-0.044, 0.156, -0.052);
    lPart.rotation.z = 0.22;
    const rPart = new THREE.Mesh(geos.hairPartSide, hairMat);
    rPart.position.set(0.044, 0.156, -0.052);
    rPart.rotation.z = -0.22;
    const back = new THREE.Mesh(geos.hairBackShort, hairMat);
    back.position.set(0, 0.072, 0.076);
    headPivot.add(lPart, rPart, back);
  } else {
    const back = new THREE.Mesh(geos.hairBackShort, hairMat);
    back.position.set(0, 0.076, 0.076);
    headPivot.add(back);
  }
  group.add(headPivot);

  // Arms: sleeve + forearm + hand
  const buildArm = (xPos) => {
    const arm = new THREE.Group();
    arm.position.set(xPos, baseY + 0.885, 0);
    const sleeve = new THREE.Mesh(geos.sleeve, shirtMat);
    sleeve.position.set(0, -0.08, 0);
    const forearm = new THREE.Mesh(geos.forearm, skinMat);
    forearm.position.set(0, -0.22, 0);
    const hand = new THREE.Mesh(geos.hand, skinMat);
    hand.position.set(0, -0.305, 0);
    arm.add(sleeve, forearm, hand);
    group.add(arm);
    return arm;
  };
  const leftArm = buildArm(-0.205);
  const rightArm = buildArm(0.205);

  // Legs + shoes (no castShadow on legs per shadow budget)
  if (!seated) {
    const lLeg = new THREE.Mesh(geos.standLeg, pantsMat);
    lLeg.position.set(-0.085, 0.47, 0);
    const rLeg = new THREE.Mesh(geos.standLeg, pantsMat);
    rLeg.position.set(0.085, 0.47, 0);
    const lShoe = new THREE.Mesh(geos.shoe, sharedShoeMat);
    lShoe.position.set(-0.085, 0.028, -0.022);
    const rShoe = new THREE.Mesh(geos.shoe, sharedShoeMat);
    rShoe.position.set(0.085, 0.028, -0.022);
    group.add(lLeg, rLeg, lShoe, rShoe);
  } else {
    const lThigh = new THREE.Mesh(geos.thigh, pantsMat);
    lThigh.position.set(-0.082, 0.495, -0.13);
    const rThigh = new THREE.Mesh(geos.thigh, pantsMat);
    rThigh.position.set(0.082, 0.495, -0.13);
    const lShin = new THREE.Mesh(geos.shin, pantsMat);
    lShin.position.set(-0.082, 0.24, -0.255);
    const rShin = new THREE.Mesh(geos.shin, pantsMat);
    rShin.position.set(0.082, 0.24, -0.255);
    const lShoe = new THREE.Mesh(geos.shoe, sharedShoeMat);
    lShoe.position.set(-0.082, 0.028, -0.28);
    const rShoe = new THREE.Mesh(geos.shoe, sharedShoeMat);
    rShoe.position.set(0.082, 0.028, -0.28);
    group.add(lThigh, rThigh, lShin, rShin, lShoe, rShoe);
  }

  return { group, headPivot, leftArm, rightArm, torso };
}

// 15 deterministic 1994 Italian 2ª Media student profiles (zero personal names)
const STUDENT_PROFILES = [
  { shirt: '#4b739c', collar: '#dce4ec', pants: '#353e4a', hair: '#2c231c', skin: '#e1b594', hairStyle: 'short', scale: 0.99, yaw: -0.04, deskItem: 'closed_blue' },
  { shirt: '#9c4146', collar: '#ece6da', pants: '#2f3d52', hair: '#4a3122', skin: '#e6be9e', hairStyle: 'ponytail', scale: 0.96, yaw: 0.05, deskItem: 'open_green' },
  { shirt: '#3b6b58', collar: '#d9e3dc', pants: '#453e38', hair: '#1f1a17', skin: '#d9aa86', hairStyle: 'parted', scale: 1.01, yaw: -0.02, deskItem: 'open_blue' },
  { shirt: '#c49038', collar: '#ede7d5', pants: '#2d3746', hair: '#6d4c33', skin: '#eac5a6', hairStyle: 'bob', scale: 0.95, yaw: 0.03, deskItem: 'open_red' },
  { shirt: '#596387', collar: '#e2e5ee', pants: '#3b3b40', hair: '#2a211b', skin: '#dfb390', hairStyle: 'short', scale: 1.02, yaw: -0.06, deskItem: 'textbook_teal' },
  { shirt: '#b85c44', collar: '#efe8db', pants: '#364459', hair: '#7d5b3a', skin: '#ecc8aa', hairStyle: 'ponytail', scale: 0.97, yaw: 0.04, deskItem: 'open_yellow' },
  { shirt: '#345e7d', collar: '#dfe6ec', pants: '#4d463f', hair: '#201b18', skin: '#d8a883', hairStyle: 'short', scale: 1.00, yaw: -0.03, deskItem: 'open_blue' },
  { shirt: '#735078', collar: '#ece3ee', pants: '#2f3742', hair: '#3b281e', skin: '#e3b898', hairStyle: 'bob', scale: 0.94, yaw: 0.06, deskItem: 'open_green' },
  { shirt: '#4f7a5a', collar: '#e8ece2', pants: '#3a3f4a', hair: '#543b29', skin: '#e4ba98', hairStyle: 'parted', scale: 1.01, yaw: -0.05, deskItem: 'textbook_ochre' },
  { shirt: '#85423d', collar: '#ebe3dc', pants: '#2c394d', hair: '#251e19', skin: '#ddb08b', hairStyle: 'short', scale: 0.98, yaw: 0.02, deskItem: 'open_red' },
  { shirt: '#55758a', collar: '#e5ebf0', pants: '#443c35', hair: '#8c6a43', skin: '#edd0b4', hairStyle: 'ponytail', scale: 0.96, yaw: -0.04, deskItem: 'open_yellow' },
  { shirt: '#a86b3a', collar: '#efe8dc', pants: '#2f3a47', hair: '#31231b', skin: '#e0b392', hairStyle: 'parted', scale: 1.02, yaw: 0.05, deskItem: 'closed_red' },
  { shirt: '#3d5875', collar: '#e0e6ed', pants: '#3e3f45', hair: '#473022', skin: '#e5bc9c', hairStyle: 'bob', scale: 0.95, yaw: -0.03, deskItem: 'open_blue' },
  { shirt: '#6a7846', collar: '#eaece1', pants: '#333d4b', hair: '#1e1916', skin: '#d6a682', hairStyle: 'short', scale: 1.00, yaw: 0.04, deskItem: 'textbook_navy' },
  { shirt: '#9c4e66', collar: '#f0e5e9', pants: '#343c47', hair: '#5c3f2b', skin: '#e8c1a1', hairStyle: 'ponytail', scale: 0.97, yaw: -0.05, deskItem: 'open_green' },
];

function createFallbackCanvasTex(width, height, drawFn) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  drawFn(canvas.getContext('2d'), width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSharedOpenPageTexture(makeCanvasTexture) {
  const builder = makeCanvasTexture || createFallbackCanvasTex;
  return builder(512, 384, (ctx, w, h) => {
    ctx.fillStyle = '#e7e2d3';
    ctx.fillRect(0, 0, w, h);

    // Center spine shadow
    const grad = ctx.createLinearGradient(w * 0.47, 0, w * 0.53, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, 'rgba(38,32,24,0.28)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(w * 0.47, 0, w * 0.06, h);

    // Subtle quadretti grid
    ctx.strokeStyle = 'rgba(54, 108, 76, 0.25)';
    ctx.lineWidth = 1;
    for (let x = 16; x < w; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 16; y < h; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Generic pencil handwriting lines (no names)
    ctx.strokeStyle = 'rgba(46, 52, 66, 0.65)';
    ctx.lineWidth = 2;
    for (let row = 0; row < 8; row += 1) {
      const y = 44 + row * 36;
      const len = 110 + ((row * 37) % 75);
      ctx.beginPath();
      ctx.moveTo(28, y);
      ctx.lineTo(28 + len, y + ((row % 3) - 1) * 1.5);
      ctx.stroke();
      if (row < 5) {
        ctx.beginPath();
        ctx.moveTo(w * 0.54, y);
        ctx.lineTo(w * 0.54 + len * 0.9, y);
        ctx.stroke();
      }
    }
  });
}

// Seat keys that MUST remain empty: Vuarbit (0,0,1) + 4 absent/empty seats
const EMPTY_SEAT_KEYS = new Set(['0,0,1', '1,1,2', '2,0,0', '3,1,0', '3,1,2']);

// 6 backpacks tucked beside occupied seats, strictly inside desk-row collider bounds
const BACKPACK_PLACEMENTS = [
  { r: 0, c: 0, s: 0, xOffset: -0.245, zOffset: -0.02, rotY: 0.10, main: '#254a7c', trim: '#c94b3b' },
  { r: 0, c: 1, s: 0, xOffset: -0.245, zOffset: 0.02, rotY: -0.08, main: '#2f6b53', trim: '#d49d3a' },
  { r: 1, c: 0, s: 1, xOffset: 0.245, zOffset: -0.01, rotY: -0.10, main: '#9b3838', trim: '#2c3c54' },
  { r: 1, c: 1, s: 0, xOffset: -0.245, zOffset: 0.03, rotY: 0.09, main: '#424756', trim: '#3b7fa8' },
  { r: 2, c: 1, s: 2, xOffset: 0.245, zOffset: -0.02, rotY: -0.10, main: '#3c5c85', trim: '#e0a63a' },
  { r: 3, c: 0, s: 1, xOffset: 0.245, zOffset: 0.01, rotY: 0.08, main: '#69446e', trim: '#d97254' },
];

/**
 * Populate 15 seated classmates, varied 1990s desk items, and 6 tucked backpacks.
 */
export function populateClassmates({
  scene,
  addFocusMesh = (m) => m,
  rowsZ = [-1.45, -0.05, 1.35, 2.75],
  deskColumns = [
    { x: -2.25, seats: 2 },
    { x: 1.45, seats: 3 },
  ],
  makeCanvasTexture,
} = {}) {
  const seatWidth = 0.66;
  const classmates = [];

  // Shared desk-item & backpack geometries and textures
  const openPageTex = createSharedOpenPageTexture(makeCanvasTexture);
  const openPageMat = new THREE.MeshStandardMaterial({
    map: openPageTex,
    color: '#ffffff',
    roughness: 0.92,
  });

  const openCoverGeo = new THREE.BoxGeometry(0.32, 0.005, 0.23);
  const openPagesGeo = new THREE.BoxGeometry(0.30, 0.007, 0.215);
  const closedBookGeo = new THREE.BoxGeometry(0.21, 0.016, 0.27);
  const textbookGeo = new THREE.BoxGeometry(0.20, 0.026, 0.26);
  const penGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.14, 6);
  const caseGeo = new THREE.BoxGeometry(0.16, 0.034, 0.058);

  const packBodyGeo = new THREE.BoxGeometry(0.115, 0.34, 0.22);
  const packPocketGeo = new THREE.BoxGeometry(0.026, 0.16, 0.16);
  const packStrapGeo = new THREE.BoxGeometry(0.018, 0.26, 0.04);

  const coverColors = {
    blue: new THREE.MeshStandardMaterial({ color: '#396ba6', roughness: 0.72 }),
    green: new THREE.MeshStandardMaterial({ color: '#387856', roughness: 0.72 }),
    red: new THREE.MeshStandardMaterial({ color: '#a83c3c', roughness: 0.72 }),
    yellow: new THREE.MeshStandardMaterial({ color: '#c49635', roughness: 0.72 }),
    teal: new THREE.MeshStandardMaterial({ color: '#316a73', roughness: 0.74 }),
    ochre: new THREE.MeshStandardMaterial({ color: '#b87635', roughness: 0.74 }),
    navy: new THREE.MeshStandardMaterial({ color: '#27426b', roughness: 0.74 }),
  };
  const penMats = [
    new THREE.MeshStandardMaterial({ color: '#dfa62c', roughness: 0.5 }),
    new THREE.MeshStandardMaterial({ color: '#2b558c', roughness: 0.45 }),
    new THREE.MeshStandardMaterial({ color: '#b53a3a', roughness: 0.45 }),
  ];
  const caseMats = [
    new THREE.MeshStandardMaterial({ color: '#2b4a70', roughness: 0.88 }),
    new THREE.MeshStandardMaterial({ color: '#9c3e3e', roughness: 0.88 }),
    new THREE.MeshStandardMaterial({ color: '#3b6652', roughness: 0.88 }),
  ];
  const strapMat = new THREE.MeshStandardMaterial({ color: '#222428', roughness: 0.9 });

  const seatPosMap = new Map();
  let profileIdx = 0;

  for (let r = 0; r < rowsZ.length; r += 1) {
    const rowZ = rowsZ[r];
    for (let c = 0; c < deskColumns.length; c += 1) {
      const col = deskColumns[c];
      const totalWidth = col.seats * seatWidth;
      for (let s = 0; s < col.seats; s += 1) {
        const key = `${r},${c},${s}`;
        const cx = col.x - totalWidth / 2 + (s + 0.5) * seatWidth;
        const cz = rowZ + 0.42;
        seatPosMap.set(key, { cx, cz, rowZ });

        if (EMPTY_SEAT_KEYS.has(key)) continue;

        const profile = STUDENT_PROFILES[profileIdx % STUDENT_PROFILES.length];
        const idx = profileIdx;
        profileIdx += 1;

        const person = createStylizedPerson(profile.shirt, profile.pants, profile.hair, true, {
          hairStyle: profile.hairStyle,
          scale: profile.scale,
          collarColor: profile.collar,
          skinColor: profile.skin,
        });
        person.group.position.set(cx, 0, cz);
        person.group.rotation.y = profile.yaw;
        scene.add(addFocusMesh(person.group));

        // Desk items on y = 0.73; keep Vuarbit's deskmate (0,0,0) strictly at x <= -2.30
        const isVuarbitNeighbor = key === '0,0,0';
        const itemX = isVuarbitNeighbor ? Math.min(cx - 0.02, -2.56) : cx + ((idx % 3) - 1) * 0.02;
        const itemZ = rowZ + 0.06;
        const itemYaw = isVuarbitNeighbor ? 0.04 : ((idx % 5) - 2) * 0.05;

        if (profile.deskItem.startsWith('open_')) {
          const colKey = profile.deskItem.slice(5);
          const nbGroup = new THREE.Group();
          nbGroup.position.set(itemX, 0.733, itemZ);
          nbGroup.rotation.y = itemYaw;
          const cov = new THREE.Mesh(openCoverGeo, coverColors[colKey] || coverColors.blue);
          const pg = new THREE.Mesh(openPagesGeo, openPageMat);
          pg.position.set(0, 0.004, 0);
          nbGroup.add(cov, pg);
          scene.add(nbGroup);

          const pen = new THREE.Mesh(penGeo, penMats[idx % penMats.length]);
          pen.rotation.z = Math.PI / 2;
          pen.rotation.y = 1.2 + (idx % 4) * 0.18;
          pen.position.set(isVuarbitNeighbor ? -2.38 : itemX + 0.18, 0.734, itemZ - 0.02);
          scene.add(pen);
        } else if (profile.deskItem.startsWith('closed_')) {
          const colKey = profile.deskItem.slice(7);
          const book = new THREE.Mesh(closedBookGeo, coverColors[colKey] || coverColors.blue);
          book.position.set(itemX, 0.738, itemZ - 0.02);
          book.rotation.y = itemYaw;
          scene.add(book);

          const pen = new THREE.Mesh(penGeo, penMats[idx % penMats.length]);
          pen.rotation.z = Math.PI / 2;
          pen.rotation.y = 0.35;
          pen.position.set(isVuarbitNeighbor ? -2.41 : itemX + 0.14, 0.734, itemZ + 0.05);
          scene.add(pen);
        } else {
          const colKey = profile.deskItem.slice(9);
          const tb = new THREE.Mesh(textbookGeo, coverColors[colKey] || coverColors.teal);
          tb.position.set(itemX - 0.03, 0.743, itemZ - 0.04);
          tb.rotation.y = itemYaw;
          scene.add(tb);
        }

        // Occasional zippered pencil case near top-left of desk half (x <= -2.30 for Vuarbit neighbor)
        if (idx % 3 === 1) {
          const pc = new THREE.Mesh(caseGeo, caseMats[idx % caseMats.length]);
          pc.position.set(isVuarbitNeighbor ? -2.66 : itemX - 0.13, 0.747, rowZ - 0.14);
          pc.rotation.y = 0.18 - (idx % 3) * 0.12;
          scene.add(pc);
        }

        // Precompute animation parameters (zero per-frame allocations)
        const dxBoard = 0 - cx;
        const dzBoard = -3.6 - cz;
        const rawBoardYaw = Math.atan2(-dxBoard, -dzBoard) - profile.yaw;
        const boardYawOffset = Math.max(-0.45, Math.min(0.45, rawBoardYaw * 0.7));

        classmates.push({
          ...person,
          phase: idx * 1.37,
          breathFreq: 2.15 + (idx % 4) * 0.16,
          writeFreq: 4.4 + (idx % 5) * 0.35,
          glancePeriod: 10.5 + (idx % 4) * 2.1,
          glanceOffset: (idx * 3.1) % 12.0,
          boardYawOffset,
        });
      }
    }
  }

  // Place 6 closed backpacks tucked beside occupied seats strictly inside desk-row collider bounds
  for (let i = 0; i < BACKPACK_PLACEMENTS.length; i += 1) {
    const bp = BACKPACK_PLACEMENTS[i];
    const seat = seatPosMap.get(`${bp.r},${bp.c},${bp.s}`);
    if (!seat) continue;

    const pack = new THREE.Group();
    pack.position.set(seat.cx + bp.xOffset, 0.17, seat.cz + bp.zOffset);
    pack.rotation.y = bp.rotY;

    const bodyMat = new THREE.MeshStandardMaterial({ color: bp.main, roughness: 0.88 });
    const trimMat = new THREE.MeshStandardMaterial({ color: bp.trim, roughness: 0.85 });

    const body = new THREE.Mesh(packBodyGeo, bodyMat);
    const pocket = new THREE.Mesh(packPocketGeo, trimMat);
    pocket.position.set(bp.xOffset > 0 ? 0.056 : -0.056, -0.04, 0);
    const strap = new THREE.Mesh(packStrapGeo, strapMat);
    strap.position.set(bp.xOffset > 0 ? -0.056 : 0.056, 0.02, 0);

    pack.add(body, pocket, strap);
    scene.add(pack);
  }

  function updateClassmates(simTime) {
    for (let i = 0; i < classmates.length; i += 1) {
      const c = classmates[i];

      // Smooth phase-offset breathing
      c.torso.scale.y = 1 + Math.sin(simTime * c.breathFreq + c.phase) * 0.014;

      // Subtle writing hand motion on desk
      c.rightArm.rotation.x = 1.16 + Math.sin(simTime * c.writeFreq + c.phase) * 0.042;
      c.rightArm.rotation.y = Math.cos(simTime * (c.writeFreq * 0.74) + c.phase) * 0.048;
      c.leftArm.rotation.x = 1.15 + Math.sin(simTime * 0.9 + c.phase) * 0.012;
      c.leftArm.rotation.y = -0.16;

      // Occasional natural glance up toward teacher/blackboard vs down at notebook
      const cycle = ((simTime + c.glanceOffset) % c.glancePeriod) / c.glancePeriod;
      let lookUp = 0;
      if (cycle > 0.16 && cycle < 0.44) {
        const u = (cycle - 0.16) / 0.28;
        lookUp = 0.5 - 0.5 * Math.cos(u * Math.PI * 2);
      }
      c.headPivot.rotation.x = -0.28 + lookUp * 0.33 + Math.sin(simTime * 1.05 + c.phase) * 0.022;
      c.headPivot.rotation.y = lookUp * c.boardYawOffset + Math.sin(simTime * 0.55 + c.phase) * 0.028;
    }
  }

  return { classmates, updateClassmates };
}
