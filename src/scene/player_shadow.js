import * as THREE from 'three';

function configureShadowMesh(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.visible = true;
  return mesh;
}

/**
 * Create an invisible shadow-casting player body aligned to the first-person camera.
 * Keeps meshes on layer 0 with visible=true and colorWrite/depthWrite/depthTest=false
 * so Three.js r170 WebGLShadowMap renders the silhouette without drawing into the camera view.
 */
export function createPlayerShadowCaster(scene) {
  const group = new THREE.Group();
  const shadowMat = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    depthTest: false,
  });

  const head = configureShadowMesh(
    new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 10), shadowMat)
  );
  head.position.set(0, -0.015, 0.055);

  const neck = configureShadowMesh(
    new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.052, 0.09, 8), shadowMat)
  );
  neck.position.set(0, -0.105, 0.068);

  const torso = configureShadowMesh(
    new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.46, 0.17), shadowMat)
  );
  torso.position.set(0, -0.35, 0.08);

  const legsGroup = new THREE.Group();
  legsGroup.position.set(0, -1.40, 0.09);
  const legGeo = new THREE.BoxGeometry(0.12, 0.84, 0.14);
  const leftLeg = configureShadowMesh(new THREE.Mesh(legGeo, shadowMat));
  leftLeg.position.set(-0.085, 0.42, 0);
  const rightLeg = configureShadowMesh(new THREE.Mesh(legGeo, shadowMat));
  rightLeg.position.set(0.085, 0.42, 0);
  legsGroup.add(leftLeg, rightLeg);

  group.add(head, neck, torso, legsGroup);
  if (scene) {
    scene.add(group);
  }

  function update(state, camera) {
    if (!camera || !state) return;
    group.position.copy(camera.position);
    group.rotation.y = state.yaw || 0;
    torso.rotation.x = -Math.max(0, state.lean || 0) * 0.35;

    const isStanding = state.mode === 'standing';
    legsGroup.visible = isStanding;
    if (isStanding) {
      legsGroup.position.y = -camera.position.y;
    }
  }

  return { group, update };
}
