import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { computeOcclusionFromDistance, TIME_OF_DAY_PRESETS } from '../state.js';
import {
  CAR_CRUISE_SPEED_MPS,
  CAR_FAR_CLIP,
  ONCOMING_CLOSING_SPEED_MPS,
  ROAD_LOOP_LEN_M,
  ROAD_Z_MIN,
  computeLeadCarZ,
  computeRoadLighting,
  wrapLoopZ,
} from './car_math.js';
import {
  createInstrumentClusterTexture,
  createRoadAsphaltTexture,
  createRoadSignTexture,
  createRoadsideGroundTexture,
  createWetStreakTexture,
} from './car_assets.js';

// shortcut: procedural cabin/traffic geometry + additive wet-road specular planes (no SSR/glTF), upgrade if custom vehicle meshes are added

function buildTrafficCar({ bodyColor, facingViewer, headlightMat, headlightHaloMat, taillightMat, wetHeadTex, wetTailTex }) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.36, metalness: 0.42 });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#1b1e24', roughness: 0.72 });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#1a2430', roughness: 0.2, metalness: 0.5 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#16181c', roughness: 0.85 });

  // Compact 1990s European sedan/hatchback body (1.72 m wide x 4.10 m long)
  const lower = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.54, 4.10), bodyMat);
  lower.position.y = 0.52;
  lower.castShadow = true;
  lower.receiveShadow = true;

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.52, 2.05), bodyMat);
  cabin.position.set(0, 1.03, facingViewer ? -0.15 : 0.15);
  cabin.castShadow = true;

  const windFront = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.42, 0.04), glassMat);
  windFront.position.set(0, 1.01, facingViewer ? 0.88 : -0.88);
  windFront.rotation.x = facingViewer ? -0.32 : 0.32;

  const windRear = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.40, 0.04), glassMat);
  windRear.position.set(0, 1.01, facingViewer ? -1.16 : 1.16);
  windRear.rotation.x = facingViewer ? 0.30 : -0.30;

  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.18, 0.16), trimMat);
  bumperF.position.set(0, 0.34, 2.04);
  const bumperR = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.18, 0.16), trimMat);
  bumperR.position.set(0, 0.34, -2.04);

  const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.20, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const wx of [-0.82, 0.82]) {
    for (const wz of [-1.28, 1.28]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(wx, 0.28, wz);
      group.add(w);
    }
  }

  group.add(lower, cabin, windFront, windRear, bumperF, bumperR);

  const wetStreaks = [];
  const headZ = facingViewer ? 2.06 : -2.06;
  const tailZ = facingViewer ? -2.06 : 2.06;

  // Twin headlights (facingViewer = oncoming cars shining straight toward passenger!)
  if (facingViewer) {
    for (const lx of [-0.60, 0.60]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.04), headlightMat);
      lamp.position.set(lx, 0.60, headZ);
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28), headlightHaloMat);
      halo.position.set(lx, 0.60, headZ + 0.03);
      group.add(lamp, halo);

      // Elongated wet-road headlight specular streak ahead of oncoming vehicle
      const streakMat = new THREE.MeshBasicMaterial({
        map: wetHeadTex,
        color: '#fff2d8',
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const streak = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 8.5), streakMat);
      streak.rotation.x = -Math.PI / 2;
      streak.position.set(lx, 0.015, headZ + 4.3);
      group.add(streak);
      wetStreaks.push(streakMat);
    }
  } else {
    // Lead car twin crimson taillights + license plate + wet-road crimson reflection streaks
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.46, 0.11),
      new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.55 })
    );
    plate.position.set(0, 0.50, tailZ + 0.01);
    group.add(plate);

    for (const lx of [-0.62, 0.62]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.04), taillightMat);
      lamp.position.set(lx, 0.62, tailZ);
      group.add(lamp);

      const streakMat = new THREE.MeshBasicMaterial({
        map: wetTailTex,
        color: '#ff2b1a',
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const streak = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 7.2), streakMat);
      streak.rotation.x = -Math.PI / 2;
      streak.position.set(lx, 0.015, tailZ + 3.6);
      group.add(streak);
      wetStreaks.push(streakMat);
    }
  }

  return { group, wetStreaks };
}

function buildCabinInterior(dashTex, addFocusMesh) {
  const cabin = new THREE.Group();
  const dashMat = new THREE.MeshStandardMaterial({ color: '#1f2329', roughness: 0.84 });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#2b3038', roughness: 0.78 });
  const pillarMat = new THREE.MeshStandardMaterial({ color: '#383d44', roughness: 0.86 });
  const roofMat = new THREE.MeshStandardMaterial({ color: '#45494e', roughness: 0.92 });
  const hoodMat = new THREE.MeshStandardMaterial({ color: '#2b445e', roughness: 0.34, metalness: 0.45 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: '#aeb7c2', metalness: 0.75, roughness: 0.25 });
  // CRITICAL: transparent glass MUST have depthWrite: false so tDepthOD reads true outdoor road/traffic distances!
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#c9dff0',
    transparent: true,
    opacity: 0.055,
    roughness: 0.12,
    depthWrite: false,
  });

  // Lower cabin floor/footwell & door sills
  const floorPan = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.06, 1.45), dashMat);
  floorPan.position.set(0, 0.32, 0.0);

  // Sculpted upper & lower dashboard
  const dashUpper = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.14, 0.46), dashMat);
  dashUpper.position.set(0, 0.87, -0.52);
  dashUpper.receiveShadow = true;

  const dashFront = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.36, 0.28), trimMat);
  dashFront.position.set(0, 0.66, -0.44);

  // Center console & 90s radio vents
  const centerConsole = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.44, 0.56), dashMat);
  centerConsole.position.set(0, 0.58, -0.22);

  // Driver instrument binnacle (left side, X = -0.36) + glowing analog dials
  const binnacle = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.18, 0.24), dashMat);
  binnacle.position.set(-0.36, 0.97, -0.46);
  const dashFaceMat = new THREE.MeshStandardMaterial({
    map: dashTex,
    emissiveMap: dashTex,
    emissive: '#ffffff',
    emissiveIntensity: 0.2,
    roughness: 0.35,
  });
  const dashFace = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.12), dashFaceMat);
  dashFace.position.set(-0.36, 0.95, -0.338);
  dashFace.rotation.x = -0.18;

  // Steering wheel & column (left side, X = -0.36)
  const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.018, 10, 24), dashMat);
  wheelRim.position.set(-0.36, 0.92, -0.18);
  wheelRim.rotation.x = -0.34;
  const wheelHub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 14), trimMat);
  wheelHub.position.set(-0.36, 0.92, -0.19);
  wheelHub.rotation.x = Math.PI * 0.5 - 0.34;
  const wheelSpoke = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.028, 0.02), trimMat);
  wheelSpoke.position.set(-0.36, 0.91, -0.185);
  wheelSpoke.rotation.x = -0.34;

  // Subtle driver silhouette seated on left (X = -0.36) so vehicle has a driver
  const driverJacketMat = new THREE.MeshStandardMaterial({ color: '#27313d', roughness: 0.88 });
  const driverSkinMat = new THREE.MeshStandardMaterial({ color: '#c6997a', roughness: 0.78 });
  const driverHairMat = new THREE.MeshStandardMaterial({ color: '#2f241c', roughness: 0.9 });
  const driverTorso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, 0.22), driverJacketMat);
  driverTorso.position.set(-0.38, 0.92, 0.18);
  const driverHead = new THREE.Mesh(new THREE.SphereGeometry(0.095, 14, 12), driverSkinMat);
  driverHead.position.set(-0.38, 1.22, 0.18);
  const driverHair = new THREE.Mesh(new THREE.SphereGeometry(0.098, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), driverHairMat);
  driverHair.position.set(-0.38, 1.23, 0.19);

  // Sloped left & right A-pillars framing the windshield (positive X rot leans top backward toward roof header)
  const pillarGeo = new THREE.BoxGeometry(0.075, 0.74, 0.085);
  const pillarL = new THREE.Mesh(pillarGeo, pillarMat);
  pillarL.position.set(-0.73, 1.18, -0.46);
  pillarL.rotation.x = 0.56;
  const pillarR = new THREE.Mesh(pillarGeo, pillarMat);
  pillarR.position.set(0.73, 1.18, -0.46);
  pillarR.rotation.x = 0.56;

  // Roof headliner & windshield upper header (casts authentic enclosed interior shade in bright sunlight)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.50, 0.06, 1.18), roofMat);
  roof.position.set(0, 1.49, 0.32);
  roof.castShadow = true;
  const header = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.07, 0.14), roofMat);
  header.position.set(0, 1.47, -0.25);
  header.castShadow = true;

  // Interior rearview mirror hanging from upper center header
  const mirrorStem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 8), dashMat);
  mirrorStem.position.set(0, 1.41, -0.34);
  const mirrorCase = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.065, 0.025), dashMat);
  mirrorCase.position.set(0, 1.36, -0.34);
  const mirrorGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.20, 0.052),
    new THREE.MeshStandardMaterial({ color: '#6b7785', metalness: 0.85, roughness: 0.14 })
  );
  mirrorGlass.position.set(0, 1.36, -0.326);

  // Passenger & driver side door panels (below window sills so side windows stay wide open!)
  const doorR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.56, 1.15), trimMat);
  doorR.position.set(0.76, 0.62, 0.08);
  const doorL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.56, 1.15), trimMat);
  doorL.position.set(-0.76, 0.62, 0.08);

  // Right exterior passenger side mirror (visible when glancing right!)
  const sideMirrorArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.035, 0.05), dashMat);
  sideMirrorArm.position.set(0.84, 0.94, -0.38);
  const sideMirrorCase = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.11, 0.07), hoodMat);
  sideMirrorCase.position.set(0.95, 0.96, -0.38);
  sideMirrorCase.rotation.y = -0.18;
  const sideMirrorGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(0.145, 0.088),
    new THREE.MeshStandardMaterial({ color: '#788898', metalness: 0.88, roughness: 0.12 })
  );
  sideMirrorGlass.position.set(0.95, 0.96, -0.342);
  sideMirrorGlass.rotation.y = -0.18;

  // Metallic car hood/bonnet visible through lower windshield + resting wipers
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.08, 1.24), hoodMat);
  hood.position.set(0, 0.81, -1.32);
  hood.rotation.x = 0.05;
  hood.receiveShadow = true;

  const wiper1 = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.012, 0.018), dashMat);
  wiper1.position.set(-0.26, 0.89, -0.68);
  wiper1.rotation.z = 0.06;
  const wiper2 = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.012, 0.018), dashMat);
  wiper2.position.set(0.28, 0.89, -0.67);
  wiper2.rotation.z = 0.05;

  // Subtle depthWrite:false windshield & side-window glass (never registered in focusTargets!)
  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 0.72), glassMat);
  windshield.position.set(0, 1.18, -0.46);
  windshield.rotation.x = 0.56;
  const sideWindowR = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.56), glassMat);
  sideWindowR.position.set(0.75, 1.19, 0.10);
  sideWindowR.rotation.y = -Math.PI / 2;

  cabin.add(
    floorPan,
    addFocusMesh(dashUpper),
    addFocusMesh(dashFront),
    centerConsole,
    binnacle,
    dashFace,
    wheelRim,
    wheelHub,
    wheelSpoke,
    driverTorso,
    driverHead,
    driverHair,
    addFocusMesh(pillarL),
    addFocusMesh(pillarR),
    roof,
    header,
    mirrorStem,
    mirrorCase,
    mirrorGlass,
    addFocusMesh(doorR),
    doorL,
    sideMirrorArm,
    sideMirrorCase,
    sideMirrorGlass,
    addFocusMesh(hood),
    wiper1,
    wiper2,
    windshield,
    sideWindowR
  );

  // Subtle chrome door handle on passenger interior
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.024, 0.09), chromeMat);
  handle.position.set(0.71, 0.80, -0.06);
  cabin.add(handle);

  return { cabin, dashFaceMat };
}

function buildTree(variant) {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#4c3a2b', roughness: 0.92 });
  const pineMat = new THREE.MeshStandardMaterial({ color: variant === 0 ? '#244028' : '#2e4f30', roughness: 0.88 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#395a33', roughness: 0.86 });

  if (variant === 0) {
    // Tall Italian cypress silhouette (classic roadside vertical landmark)
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 1.6, 6), trunkMat);
    trunk.position.y = 0.8;
    const foliage = new THREE.Mesh(new THREE.ConeGeometry(0.72, 6.2, 8), pineMat);
    foliage.position.y = 4.4;
    foliage.castShadow = true;
    group.add(trunk, foliage);
  } else if (variant === 1) {
    // Broad conifer
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.20, 2.0, 6), trunkMat);
    trunk.position.y = 1.0;
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.7, 3.4, 7), pineMat);
    c1.position.y = 3.2;
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.25, 2.8, 7), pineMat);
    c2.position.y = 4.9;
    c1.castShadow = true;
    group.add(trunk, c1, c2);
  } else {
    // Deciduous roadside tree
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.20, 2.5, 6), trunkMat);
    trunk.position.y = 1.25;
    const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(1.65, 1), leafMat);
    crown.position.y = 3.7;
    crown.scale.set(1.0, 0.88, 1.0);
    crown.castShadow = true;
    group.add(trunk, crown);
  }
  return group;
}

/**
 * Build P4 Car Passenger Scene: seated cabin + looping outdoor road with daylight/night glare & motion.
 */
export function createCarPassengerScene(renderer = null) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#b9d6ef');
  scene.fog = new THREE.Fog('#b9d6ef', 52, 132);

  let envRT = null;
  if (renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    envRT = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.28;
    roomEnv.dispose();
    pmrem.dispose();
  }

  const focusTargets = [];
  const addFocusMesh = (mesh) => {
    focusTargets.push(mesh);
    return mesh;
  };

  // --- SKY DOME & HDR SUN DISK ---
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 4;
  skyCanvas.height = 128;
  const skyCtx = skyCanvas.getContext('2d');
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const paintSky = (topHex, midHex, horizonHex) => {
    const g = skyCtx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0.0, topHex);
    g.addColorStop(0.45, midHex);
    g.addColorStop(0.56, horizonHex);
    g.addColorStop(1.0, horizonHex);
    skyCtx.fillStyle = g;
    skyCtx.fillRect(0, 0, 4, 128);
    skyTex.needsUpdate = true;
  };
  paintSky('#3e84d6', '#8ec0ec', '#e5eef8');

  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(128, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false })
  );
  scene.add(skyDome);

  const sunDiskMat = new THREE.MeshStandardMaterial({
    color: '#fffef5',
    emissive: '#fff4d4',
    emissiveIntensity: 16.0,
    roughness: 0.1,
    fog: false,
  });
  const sunDisk = new THREE.Mesh(new THREE.SphereGeometry(4.0, 16, 12), sunDiskMat);
  sunDisk.position.set(-26, 22, -110);
  scene.add(sunDisk);

  // --- LIGHTS ---
  const hemiLight = new THREE.HemisphereLight('#d9eaff', '#5d5548', 0.9);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight('#fff2dc', 2.8);
  sunLight.position.set(-22, 20, -40);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 65;
  sunLight.shadow.camera.left = -16;
  sunLight.shadow.camera.right = 16;
  sunLight.shadow.camera.top = 16;
  sunLight.shadow.camera.bottom = -16;
  sunLight.shadow.bias = -0.0006;
  scene.add(sunLight);

  // Own car low-beam headlights (illuminate asphalt & signs ahead at dusk/night even when L Road Lights are OFF)
  const ownBeamTargets = [];
  const ownBeams = [-0.62, 0.62].map((bx) => {
    const spot = new THREE.SpotLight('#fff6e5', 0, 56, Math.PI * 0.24, 0.58, 1.35);
    spot.position.set(bx, 0.68, -1.85);
    const tgt = new THREE.Object3D();
    tgt.position.set(bx * 0.6, 0.0, -24.0);
    scene.add(tgt);
    spot.target = tgt;
    scene.add(spot);
    ownBeamTargets.push(tgt);
    return spot;
  });

  // 2 shared overhead streetlight pools tracking the 2 nearest poles ahead + 1 oncoming headlight flash light
  const streetPools = [0, 1].map(() => {
    const pl = new THREE.PointLight('#ffbe66', 0, 26, 1.5);
    pl.position.set(0.9, 5.5, -20);
    scene.add(pl);
    return pl;
  });
  const oncomingFlashLight = new THREE.PointLight('#fff4de', 0, 34, 1.6);
  oncomingFlashLight.position.set(-3.9, 0.85, -30);
  scene.add(oncomingFlashLight);

  // --- SCROLLING ASPHALT ROAD & ROADSIDE GROUND ---
  const roadTileM = 16.0;
  const roadLenM = 224.0;
  const roadTex = createRoadAsphaltTexture(roadLenM / roadTileM);
  const roadMat = new THREE.MeshStandardMaterial({
    map: roadTex,
    roughness: 0.62,
    metalness: 0.04,
  });
  // Road width 8.4 m centered at X = -1.95 -> right lane centered at X = 0.0, oncoming lane at X = -3.90
  const roadMesh = new THREE.Mesh(new THREE.PlaneGeometry(8.4, roadLenM), roadMat);
  roadMesh.rotation.x = -Math.PI / 2;
  roadMesh.position.set(-1.95, 0, -92);
  roadMesh.receiveShadow = true;
  scene.add(addFocusMesh(roadMesh));

  const groundTex = createRoadsideGroundTexture(4, roadLenM / roadTileM);
  const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.94 });
  const groundRight = new THREE.Mesh(new THREE.PlaneGeometry(42, roadLenM), groundMat);
  groundRight.rotation.x = -Math.PI / 2;
  groundRight.position.set(23.25, -0.02, -92);
  groundRight.receiveShadow = true;
  const groundLeft = new THREE.Mesh(new THREE.PlaneGeometry(42, roadLenM), groundMat);
  groundLeft.rotation.x = -Math.PI / 2;
  groundLeft.position.set(-27.15, -0.02, -92);
  groundLeft.receiveShadow = true;
  scene.add(groundRight, groundLeft);

  // --- PASSENGER CABIN ---
  const dashTex = createInstrumentClusterTexture();
  const { cabin, dashFaceMat } = buildCabinInterior(dashTex, addFocusMesh);
  scene.add(cabin);

  // --- SHARED VEHICLE & STREETLIGHT HDR MATERIALS ---
  const headlightMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    emissive: '#fff6e0',
    emissiveIntensity: 0.6,
    roughness: 0.1,
  });
  const headlightHaloMat = new THREE.MeshBasicMaterial({
    map: createWetStreakTexture('#fff5dc'),
    color: '#fff5dc',
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const taillightMat = new THREE.MeshStandardMaterial({
    color: '#991b1b',
    emissive: '#ff2214',
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });
  const streetLampMat = new THREE.MeshStandardMaterial({
    color: '#d4d8de',
    emissive: '#ffbe66',
    emissiveIntensity: 0.0,
    roughness: 0.2,
  });
  const wetHeadTex = createWetStreakTexture('#fff2d4');
  const wetTailTex = createWetStreakTexture('#ff2414');
  const wetStreetTex = createWetStreakTexture('#ffb854');

  // --- LOOPING STREETLIGHTS (8 poles spaced every 20 m along right shoulder) ---
  const poleMat = new THREE.MeshStandardMaterial({ color: '#5b6470', metalness: 0.6, roughness: 0.42 });
  const streetlights = [];
  for (let i = 0; i < 8; i += 1) {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, 6.2, 8), poleMat);
    pole.position.set(3.2, 3.1, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.08, 0.08), poleMat);
    arm.position.set(2.05, 6.05, 0);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.26), poleMat);
    head.position.set(1.05, 5.98, 0);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.20), streetLampMat);
    bulb.position.set(1.05, 5.91, 0);

    const wetMat = new THREE.MeshBasicMaterial({
      map: wetStreetTex,
      color: '#ffba58',
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const wetPool = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 9.5), wetMat);
    wetPool.rotation.x = -Math.PI / 2;
    wetPool.position.set(0.6, 0.012, 0);

    group.add(pole, arm, head, bulb, wetPool);
    const z0 = ROAD_Z_MIN + i * (ROAD_LOOP_LEN_M / 8);
    group.position.z = z0;
    scene.add(group);
    streetlights.push({ group, z: z0, wetMat });
  }

  // --- LOOPING ROADSIDE SIGNS (6 Italian signs for +13 D ring scotoma pop-in & acuity in motion) ---
  const signKinds = ['speed_70', 'dir_north', 'warning_curve', 'speed_50', 'dir_south', 'speed_70'];
  const signTextures = Object.fromEntries(
    ['speed_70', 'speed_50', 'warning_curve', 'dir_north', 'dir_south'].map((k) => [k, createRoadSignTexture(k)])
  );
  const signBackMat = new THREE.MeshStandardMaterial({ color: '#8b939c', roughness: 0.65 });
  const roadSigns = [];
  for (let i = 0; i < signKinds.length; i += 1) {
    const kind = signKinds[i];
    const isDir = kind.startsWith('dir_');
    const isRound = kind.startsWith('speed_');
    const group = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 2.35, 8), poleMat);
    post.position.set(0, 1.18, 0);
    const faceMat = new THREE.MeshStandardMaterial({
      map: signTextures[kind],
      roughness: 0.38,
      metalness: 0.08,
    });
    const signGeo = isRound
      ? new THREE.CircleGeometry(0.39, 28)
      : new THREE.PlaneGeometry(isDir ? 1.55 : 0.78, 0.78);
    const board = new THREE.Mesh(signGeo, faceMat);
    board.position.set(0, 2.22, 0.02);
    const back = new THREE.Mesh(signGeo, signBackMat);
    back.position.set(0, 2.22, -0.02);
    back.rotation.y = Math.PI;
    group.add(post, addFocusMesh(board), back);
    const z0 = ROAD_Z_MIN + 11 + i * (ROAD_LOOP_LEN_M / signKinds.length);
    group.position.set(2.95, 0, z0);
    scene.add(group);
    roadSigns.push({ group, z: z0 });
  }

  // --- LOOPING REFLECTIVE DELINEATOR POSTS (10 pairs along both shoulders) ---
  const postWhiteMat = new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.5 });
  const reflectorRedMat = new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#dc2626', emissiveIntensity: 0.35, roughness: 0.25 });
  const reflectorWhiteMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', emissive: '#e2e8f0', emissiveIntensity: 0.30, roughness: 0.25 });
  const delineators = [];
  for (let i = 0; i < 10; i += 1) {
    const group = new THREE.Group();
    for (const [px, refMat] of [
      [2.45, reflectorRedMat],
      [-6.35, reflectorWhiteMat],
    ]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.85, 0.04), postWhiteMat);
      p.position.set(px, 0.425, 0);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.14, 0.048), refMat);
      strip.position.set(px, 0.68, 0);
      group.add(p, strip);
    }
    const z0 = ROAD_Z_MIN + i * (ROAD_LOOP_LEN_M / 10);
    group.position.z = z0;
    scene.add(group);
    delineators.push({ group, z: z0 });
  }

  // --- LOOPING ROADSIDE TREES (24 trees on both sides for peripheral optic flow) ---
  const trees = [];
  for (let i = 0; i < 24; i += 1) {
    const sideRight = i % 2 === 0;
    const tree = buildTree(i % 3);
    const lateralJitter = ((i * 37) % 10) * 0.72;
    const x = sideRight ? 5.2 + lateralJitter : -(8.0 + lateralJitter);
    const z0 = ROAD_Z_MIN + (i / 24) * ROAD_LOOP_LEN_M;
    const scale = 0.85 + ((i * 19) % 7) * 0.08;
    tree.scale.setScalar(scale);
    tree.position.set(x, 0, z0);
    scene.add(tree);
    trees.push({ group: tree, z: z0 });
  }

  // --- TRAFFIC: LEAD CAR (our lane) & 3 ONCOMING CARS (left lane) ---
  const leadCar = buildTrafficCar({
    bodyColor: '#8d2d2d',
    facingViewer: false,
    headlightMat,
    headlightHaloMat,
    taillightMat,
    wetHeadTex,
    wetTailTex,
  });
  leadCar.group.position.set(0.0, 0, computeLeadCarZ(0));
  scene.add(addFocusMesh(leadCar.group));

  const oncomingColors = ['#c9ced6', '#2e4a62', '#3d454d'];
  const oncomingCars = oncomingColors.map((col, idx) => {
    const car = buildTrafficCar({
      bodyColor: col,
      facingViewer: true,
      headlightMat,
      headlightHaloMat,
      taillightMat,
      wetHeadTex,
      wetTailTex,
    });
    const z0 = ROAD_Z_MIN + 18 + idx * (ROAD_LOOP_LEN_M / oncomingColors.length);
    car.group.position.set(-3.90, 0, z0);
    scene.add(addFocusMesh(car.group));
    return { ...car, z: z0 };
  });

  // Seated-only passenger pose (right front passenger seat)
  const seatPose = {
    position: new THREE.Vector3(0.36, 1.16, 0.20),
    yaw: 0.0,
    pitch: -0.02,
  };
  const standPose = {
    position: seatPose.position.clone(),
    yaw: seatPose.yaw,
    pitch: seatPose.pitch,
  };

  // Zero-GC update scratch objects
  let simTime = 0;
  let lastTimeOfDay = null;
  let lastLightsOn = null;
  let currentRoadLight = computeRoadLighting('sunny', true);
  let envRayFrame = 0;
  let cachedEnvOcclOD = 0;
  let cachedEnvOcclOS = 0;
  const raycaster = new THREE.Raycaster();
  const forward = new THREE.Vector3();
  const sunDir = new THREE.Vector3(-0.24, 0.20, -0.95).normalize();
  const toOncoming = new THREE.Vector3();
  const eyeOD = new THREE.Vector3();
  const eyeOS = new THREE.Vector3();
  const localEyeOD = new THREE.Vector3(0.029, 0, 0);
  const localEyeOS = new THREE.Vector3(-0.029, 0, 0);

  function updateScene(dt, state, camera) {
    const step = Math.min(dt || 0, 0.1);
    const paused = Boolean(state.settingsOpen);

    if (!paused) {
      simTime += step;

      // Scroll seamless asphalt & grassy shoulders directly toward cabin
      const uvDelta = (CAR_CRUISE_SPEED_MPS * step) / roadTileM;
      roadTex.offset.y = (roadTex.offset.y + uvDelta) % 1.0;
      groundTex.offset.y = (groundTex.offset.y + uvDelta) % 1.0;

      const worldDz = CAR_CRUISE_SPEED_MPS * step;
      for (const s of streetlights) {
        s.z = wrapLoopZ(s.z + worldDz);
        s.group.position.z = s.z;
      }
      for (const sg of roadSigns) {
        sg.z = wrapLoopZ(sg.z + worldDz);
        sg.group.position.z = sg.z;
      }
      for (const d of delineators) {
        d.z = wrapLoopZ(d.z + worldDz);
        d.group.position.z = d.z;
      }
      for (const tr of trees) {
        tr.z = wrapLoopZ(tr.z + worldDz);
        tr.group.position.z = tr.z;
      }

      const oncomingDz = ONCOMING_CLOSING_SPEED_MPS * step;
      for (const oc of oncomingCars) {
        oc.z = wrapLoopZ(oc.z + oncomingDz);
        oc.group.position.z = oc.z;
      }

      leadCar.group.position.z = computeLeadCarZ(simTime);
      leadCar.group.position.y = Math.sin(simTime * 5.2) * 0.008;
    }

    const todId = TIME_OF_DAY_PRESETS[state.timeOfDay] ? state.timeOfDay : 'sunny';
    const lightsOn = state.lightsOn !== false;
    const todPreset = TIME_OF_DAY_PRESETS[todId];

    if (todId !== lastTimeOfDay || lightsOn !== lastLightsOn) {
      lastTimeOfDay = todId;
      lastLightsOn = lightsOn;
      currentRoadLight = computeRoadLighting(todId, lightsOn);

      scene.background.set(currentRoadLight.fogColor);
      scene.fog.color.set(currentRoadLight.fogColor);
      scene.fog.near = currentRoadLight.fogNear;
      scene.fog.far = currentRoadLight.fogFar;
      paintSky(currentRoadLight.skyTop, currentRoadLight.skyMid, currentRoadLight.skyHorizon);

      sunDisk.visible = currentRoadLight.sunVisible;
      sunDisk.position.set(
        currentRoadLight.sunPos[0],
        currentRoadLight.sunPos[1],
        currentRoadLight.sunPos[2]
      );
      sunDiskMat.emissiveIntensity = currentRoadLight.sunEmissive;
      sunDir.copy(sunDisk.position).normalize();

      hemiLight.color.set(todPreset.hemiSky);
      hemiLight.groundColor.set(todPreset.hemiGround);
      hemiLight.intensity = todPreset.hemiInt + (currentRoadLight.streetlightsOn ? 0.18 : 0.02);

      sunLight.color.set(todPreset.sunColor);
      sunLight.intensity = todPreset.sunInt * 0.85;
      sunLight.position.set(
        currentRoadLight.sunPos[0] * 0.4,
        Math.max(4.0, currentRoadLight.sunPos[1] * 0.8),
        currentRoadLight.sunPos[2] * 0.35
      );

      roadMat.roughness = currentRoadLight.roadRoughness;
      roadMat.metalness = currentRoadLight.roadMetalness;

      headlightMat.emissiveIntensity = currentRoadLight.headlightEmissive;
      headlightHaloMat.opacity = currentRoadLight.wetness * 0.65;
      taillightMat.emissiveIntensity = currentRoadLight.taillightEmissive;
      dashFaceMat.emissiveIntensity = currentRoadLight.dashEmissive;
      streetLampMat.emissiveIntensity = currentRoadLight.streetlightEmissive;

      for (const b of ownBeams) {
        b.intensity = currentRoadLight.ownBeamIntensity;
      }

      const wetHeadOp = currentRoadLight.wetness * 0.62;
      const wetTailOp = currentRoadLight.wetness * 0.52;
      const wetStreetOp = currentRoadLight.streetlightsOn ? currentRoadLight.wetness * 0.34 : 0.0;
      for (const oc of oncomingCars) {
        for (const sm of oc.wetStreaks) sm.opacity = wetHeadOp;
      }
      for (const sm of leadCar.wetStreaks) sm.opacity = wetTailOp;
      for (const s of streetlights) s.wetMat.opacity = wetStreetOp;

      reflectorRedMat.emissiveIntensity = todId === 'night' || todId === 'dusk' ? 1.8 : 0.2;
      reflectorWhiteMat.emissiveIntensity = todId === 'night' || todId === 'dusk' ? 1.4 : 0.15;
      scene.environmentIntensity = 0.04 + todPreset.outdoorLux * 0.28 + (currentRoadLight.streetlightsOn ? 0.08 : 0.0);
    }

    // Track 2 closest streetlights ahead so warm sodium light sweeps smoothly over hood & dashboard
    let near1Z = -999;
    let near2Z = -999;
    for (const s of streetlights) {
      if (s.z < 4.0 && s.z > -55.0) {
        if (s.z > near1Z) {
          near2Z = near1Z;
          near1Z = s.z;
        } else if (s.z > near2Z) {
          near2Z = s.z;
        }
      }
    }
    streetPools[0].position.z = near1Z > -900 ? near1Z : -25;
    streetPools[0].intensity = near1Z > -900 ? currentRoadLight.streetlightPoolIntensity : 0;
    streetPools[1].position.z = near2Z > -900 ? near2Z : -45;
    streetPools[1].intensity = near2Z > -900 ? currentRoadLight.streetlightPoolIntensity : 0;

    // Track nearest approaching oncoming car to wash warm headlight glare across hood/cabin
    let closestOncomingZ = -999;
    for (const oc of oncomingCars) {
      if (oc.z < -1.0 && oc.z > -46.0 && oc.z > closestOncomingZ) {
        closestOncomingZ = oc.z;
      }
    }
    if (closestOncomingZ > -900 && currentRoadLight.headlightEmissive > 2.0) {
      oncomingFlashLight.position.z = closestOncomingZ + 2.2;
      const prox = Math.max(0, 1.0 - Math.abs(closestOncomingZ) / 46.0);
      oncomingFlashLight.intensity = prox * prox * currentRoadLight.headlightEmissive * 0.85;
    } else {
      oncomingFlashLight.intensity = 0;
    }

    if (!camera) return;
    camera.updateMatrixWorld(true);
    camera.getWorldDirection(forward);

    // Gaze-dependent eyelid light (sun glare + oncoming headlights + overhead streetlights)
    const sunAlign = currentRoadLight.sunVisible ? Math.max(0, forward.dot(sunDir)) : 0;
    let oncomingGlare = 0;
    if (closestOncomingZ > -900 && currentRoadLight.headlightEmissive > 2.0) {
      toOncoming.set(-3.90 - camera.position.x, 0.60 - camera.position.y, closestOncomingZ - camera.position.z);
      const dist = toOncoming.length();
      if (dist > 0.5) {
        const align = Math.max(0, forward.dot(toOncoming.divideScalar(dist)));
        oncomingGlare = Math.pow(align, 3.0) * Math.max(0, 1.0 - dist / 45.0) * 0.65;
      }
    }
    const streetFlux = currentRoadLight.streetlightsOn ? 0.16 : 0.0;
    state.eyelidLight = Math.min(
      1,
      Math.max(0.02, 0.03 + todPreset.outdoorLux * (0.18 + sunAlign * 0.78) + streetFlux + oncomingGlare)
    );

    // Per-eye cabin occlusion (A-pillar / dashboard if leaning very close)
    eyeOD.copy(localEyeOD).applyMatrix4(camera.matrixWorld);
    eyeOS.copy(localEyeOS).applyMatrix4(camera.matrixWorld);
    if (state.eyelidClose <= 0.8 && !state.compareNormal) {
      if (envRayFrame % 2 === 0) {
        const evalEyeRayOccl = (eyePos) => {
          raycaster.set(eyePos, forward);
          raycaster.near = 0.01;
          raycaster.far = 0.25;
          const hits = raycaster.intersectObjects(focusTargets, true);
          return hits.length > 0 ? computeOcclusionFromDistance(hits[0].distance) : 0;
        };
        cachedEnvOcclOD = evalEyeRayOccl(eyeOD);
        cachedEnvOcclOS = evalEyeRayOccl(eyeOS);
      }
      envRayFrame += 1;
      state.occlOD = cachedEnvOcclOD;
      state.occlOS = cachedEnvOcclOS;
    } else {
      cachedEnvOcclOD = 0;
      cachedEnvOcclOS = 0;
      state.occlOD = 0;
      state.occlOS = 0;
    }

    if (state.eyelidClose > 0.8) {
      state.focusDistM = 0;
      return;
    }
    raycaster.set(camera.position, forward);
    raycaster.near = 0.05;
    raycaster.far = CAR_FAR_CLIP;
    const hits = raycaster.intersectObjects(focusTargets, true);
    if (hits.length > 0) {
      state.focusDistM = Math.min(CAR_FAR_CLIP, Math.max(0.15, hits[0].distance));
    } else {
      state.focusDistM = 24.0;
    }
  }

  function dispose() {
    const geos = new Set();
    const mats = new Set();
    const texs = new Set([skyTex, wetHeadTex, wetTailTex, wetStreetTex]);
    const mapKeys = ['map', 'roughnessMap', 'metalnessMap', 'bumpMap', 'normalMap', 'emissiveMap', 'alphaMap'];
    scene.traverse((obj) => {
      if (obj.geometry) geos.add(obj.geometry);
      if (!obj.material) return;
      const list = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of list) {
        if (!mat) continue;
        mats.add(mat);
        for (const key of mapKeys) {
          if (mat[key]?.dispose) texs.add(mat[key]);
        }
      }
    });
    for (const g of geos) g.dispose();
    for (const t of texs) t.dispose();
    for (const m of mats) m.dispose();
    envRT?.dispose();
    scene.environment = null;
    scene.background = null;
    scene.fog = null;
    void ownBeamTargets;
  }

  return {
    id: 'car_passenger',
    defaultMode: 'seated',
    canStand: false,
    farClip: CAR_FAR_CLIP,
    seatPanBounds: { minX: -0.10, maxX: 0.10, minZ: -0.14, maxZ: 0.08 },
    bounds: { minX: -1.0, maxX: 1.0, minZ: -1.0, maxZ: 1.0 },
    scene,
    deskPos: new THREE.Vector3(0.36, 0.85, -0.35),
    seatPose,
    standPose,
    pickables: [],
    colliders: [],
    updateScene,
    dispose,
  };
}
