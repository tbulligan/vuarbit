import * as THREE from 'three';
import {
  applyLookDelta,
  clamp,
  computeHeldRestOffset,
  computeMaxYaw,
  cycleTimeOfDay,
  hasSuppressionMechanics,
  toggleCompareNormal,
  toggleGlasses,
  updateHeldRotation,
} from './state.js';

/**
 * Pointer-lock mouse look, standing collision movement, seating toggle,
 * object pickup/manipulation, and clinical toggle keybinds.
 */
export function createControls(domElement, state, sceneApi) {
  const keys = new Set();
  const DEFAULT_BOUNDS = { minX: -3.8, maxX: 3.8, minZ: -4.15, maxZ: 4.2 };
  let activeSceneApi = sceneApi;
  let colliders = activeSceneApi.colliders || [];
  let bounds = activeSceneApi.bounds || DEFAULT_BOUNDS;
  const standPos = activeSceneApi.standPose.position.clone();
  let standEyeY = activeSceneApi.standPose.position.y || 1.40;
  let seatPos = activeSceneApi.seatPose.position;
  let pickableMeshes = activeSceneApi.pickables.map((p) => p.mesh);
  const playerRadius = 0.30;

  let dxAccum = 0;
  let dyAccum = 0;
  const MAX_EYE_YAW = 0.26;
  const MAX_EYE_PITCH = 0.21;
  const raycaster = new THREE.Raycaster();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const moveDir = new THREE.Vector3();
  const toItem = new THREE.Vector3();

  let seatPanX = 0;
  let seatPanZ = 0;

  function applySceneInitialPose(targetApi) {
    // Touch devices start seated in walk-capable scenes (Classroom) so users immediately explore blackboard + desk without thumbsticks
    const rawStartMode = targetApi.defaultMode || 'standing';
    const startMode = state.isTouchDevice && rawStartMode === 'standing' ? 'seated' : rawStartMode;
    state.mode = startMode;
    state.lean = 0;
    seatPanX = 0;
    seatPanZ = 0;
    standPos.copy(targetApi.standPose.position);
    standEyeY = targetApi.standPose.position.y || 1.40;
    seatPos = targetApi.seatPose.position;
    const pose = startMode === 'seated' ? targetApi.seatPose : targetApi.standPose;
    state.yaw = pose.yaw;
    state.pitch = pose.pitch;
    state.headYaw = state.yaw;
    state.headPitch = state.pitch;
    state.eyeYaw = 0;
    state.eyePitch = 0;
  }

  applySceneInitialPose(activeSceneApi);

  function placeBackHeldObject() {
    state.heldRot.yaw = 0;
    state.heldRot.pitch = 0;
    if (!state.holding) return;
    const item = activeSceneApi.pickables.find((p) => p.id === state.holding);
    if (item) {
      item.mesh.position.copy(item.restPosition);
      item.mesh.quaternion.copy(item.restQuaternion);
      item.mesh.updateMatrixWorld(true);
    }
    state.holding = null;
  }

  function setScene(nextSceneApi) {
    if (!nextSceneApi) return;
    placeBackHeldObject();
    activeSceneApi = nextSceneApi;
    colliders = activeSceneApi.colliders || [];
    bounds = activeSceneApi.bounds || DEFAULT_BOUNDS;
    pickableMeshes = activeSceneApi.pickables.map((p) => p.mesh);
    keys.clear();
    rmbDown = false;
    activeTouchId = null;
    wheelDeltaAccum = 0;
    dxAccum = 0;
    dyAccum = 0;
    applySceneInitialPose(activeSceneApi);
  }

  const MAX_PICKUP_DIST = 1.85;
  const PICKUP_NYSTAGMUS_MARGIN_RAD = 0.095; // ~5.4 deg margin around object silhouette (forgiving for MLN & bifocal jump, blocks ~20 deg off-axis)
  const MAX_PICKUP_CONE_RAD = 0.18; // ~10.3 deg cap
  const eyeOrigin = new THREE.Vector3();

  function findAimedPickable(camera) {
    if (!camera || activeSceneApi.pickables.length === 0) return null;
    if (state.eyesClosed || (state.eyelidClose || 0) > 0.15) return null;
    const horizDistToDesk = Math.hypot(
      standPos.x - activeSceneApi.deskPos.x,
      standPos.z - activeSceneApi.deskPos.z
    );
    if (state.mode !== 'seated' && horizDistToDesk > 1.65) {
      return null;
    }

    // Raycast from rendered dominant eye position (+-2.9 cm) so close-range desk aim matches screen reticle
    camera.getWorldDirection(forward);
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const domSign = state.compareNormal ? 0 : state.settings?.dominantEye === 'OS' ? -1 : 1;
    eyeOrigin.copy(camera.position).addScaledVector(right, 0.029 * domSign);

    raycaster.set(eyeOrigin, forward);
    raycaster.near = 0.02;
    raycaster.far = MAX_PICKUP_DIST;
    const hits = raycaster.intersectObjects(pickableMeshes, true);
    if (hits.length > 0) {
      const hitObj = hits[0].object;
      const direct = activeSceneApi.pickables.find((item) => {
        let cur = hitObj;
        while (cur) {
          if (cur === item.mesh) return true;
          cur = cur.parent;
        }
        return false;
      });
      if (direct) return direct;
    }

    const focusDist = state.focusDistM || 0;
    let chosen = null;
    let bestScore = Infinity;
    for (const item of activeSceneApi.pickables) {
      toItem.copy(item.mesh.position).sub(eyeOrigin);
      const dist = toItem.length();
      if (dist > MAX_PICKUP_DIST || dist < 1e-4) continue;
      if (focusDist > 0.02 && dist > focusDist + 0.25) continue;
      const itemRadius = Math.max(0.028, item.halfDepth || 0.035, item.occluderRadius || 0.025);
      const maxAngle = Math.min(MAX_PICKUP_CONE_RAD, Math.atan2(itemRadius, dist) + PICKUP_NYSTAGMUS_MARGIN_RAD);
      const angle = forward.angleTo(toItem.divideScalar(dist));
      if (angle > maxAngle) continue;
      const score = angle + dist * 0.05;
      if (score < bestScore) {
        bestScore = score;
        chosen = item;
      }
    }
    return chosen;
  }

  function tryTogglePickup(camera) {
    if (state.holding) {
      placeBackHeldObject();
      return;
    }

    const chosen = findAimedPickable(camera);
    if (chosen) {
      state.holding = chosen.id;
      const isAphakic = state.settings?.lensProfile === 'aphakic_bifocal';
      const initZ = !isAphakic && Number.isFinite(chosen.defaultHoldZ) ? chosen.defaultHoldZ : 0.22;
      // Start centered in dominant eye's lower bifocal reading sweet spot (~22cm for +17 D, or clinical distance for exam cards)
      state.heldOffset = computeHeldRestOffset(initZ, state.glassesOn, state.settings?.dominantEye, state.glassesSlide);
      state.heldRot.yaw = 0;
      state.heldRot.pitch = 0;
    }
  }

  function toggleSeatMode() {
    if (activeSceneApi.canStand === false) return;
    if (state.mode === 'standing') {
      state.mode = 'seated';
      state.lean = 0;
      seatPanX = 0;
      seatPanZ = 0;
      state.yaw = activeSceneApi.seatPose.yaw;
      state.pitch = activeSceneApi.seatPose.pitch;
      state.headYaw = state.yaw;
      state.headPitch = state.pitch;
      state.eyeYaw = 0;
      state.eyePitch = 0;
    } else {
      placeBackHeldObject();
      state.mode = 'standing';
      state.lean = 0;
      seatPanX = 0;
      seatPanZ = 0;
      standPos.copy(activeSceneApi.standPose.position);
      state.headYaw = state.yaw;
      state.headPitch = state.pitch;
      state.eyeYaw = 0;
      state.eyePitch = 0;
    }
  }

  function collidesAt(x, z) {
    if (x < bounds.minX + playerRadius || x > bounds.maxX - playerRadius) return true;
    if (z < bounds.minZ + playerRadius || z > bounds.maxZ - playerRadius) return true;
    for (const c of colliders) {
      if (
        x + playerRadius > c.minX &&
        x - playerRadius < c.maxX &&
        z + playerRadius > c.minZ &&
        z - playerRadius < c.maxZ
      ) {
        return true;
      }
    }
    return false;
  }

  let latestCamera = null;
  let wheelDeltaAccum = 0;
  let rmbDown = false;
  let activeTouchId = null;
  let lastTouchX = 0;
  let lastTouchY = 0;

  const onCanvasClick = () => {
    if (state.settingsOpen || state.isTouchDevice) return;
    if (document.pointerLockElement !== domElement && domElement.requestPointerLock) {
      Promise.resolve(domElement.requestPointerLock()).catch(() => {});
    }
  };

  const onTouchStart = (e) => {
    state.isTouchDevice = true;
    if (state.settingsOpen || e.touches.length !== 1) {
      activeTouchId = null;
      return;
    }
    const touch = e.touches[0];
    activeTouchId = touch.identifier;
    lastTouchX = touch.clientX;
    lastTouchY = touch.clientY;
  };

  const onTouchMove = (e) => {
    if (state.settingsOpen || activeTouchId === null) return;
    if (e.touches.length !== 1) {
      activeTouchId = null;
      return;
    }
    let touch = null;
    for (let i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === activeTouchId) {
        touch = e.touches[i];
        break;
      }
    }
    if (!touch) return;
    e.preventDefault();
    const dx = touch.clientX - lastTouchX;
    const dy = touch.clientY - lastTouchY;
    lastTouchX = touch.clientX;
    lastTouchY = touch.clientY;
    const touchSens = 0.0042;
    // Drag-to-pan viewport naturally; invert sign so gaze velocity & eye-in-head lead match turn direction
    applyLookDelta(state, -dx, -dy, touchSens);
    dxAccum += -dx * touchSens;
    dyAccum += dy * touchSens;
  };

  const onTouchEnd = (e) => {
    if (activeTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === activeTouchId) {
        activeTouchId = null;
        break;
      }
    }
  };

  const onMouseDown = (e) => {
    if (state.settingsOpen) return;
    if (e.button === 2) {
      rmbDown = true;
    }
  };

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && state.isTouchDevice) {
      state.isTouchDevice = false;
      activeTouchId = null;
    }
  };

  const onMouseUp = (e) => {
    if (e.button === 2) {
      rmbDown = false;
    }
  };

  const onContextMenu = (e) => {
    e.preventDefault();
  };

  const onPointerLockChange = () => {
    state.pointerLocked = document.pointerLockElement === domElement;
    if (!state.pointerLocked) {
      rmbDown = false;
    }
  };

  const onMouseMove = (e) => {
    if (!state.pointerLocked || state.settingsOpen) return;
    const dx = e.movementX || 0;
    const dy = e.movementY || 0;
    if (state.holding && rmbDown) {
      updateHeldRotation(state.heldRot, dx, dy);
      return;
    }
    const sens = 0.0021;
    applyLookDelta(state, dx, dy, sens);
    // Positive dxAccum = mouse moving right (panning right); positive dyAccum = mouse moving up
    dxAccum += dx * sens;
    dyAccum += -dy * sens;
  };

  const onWheel = (e) => {
    if (state.settingsOpen) return;
    if (Math.abs(e.deltaY) < 0.01) return;
    // Scroll up (<0) -> positive (lean in / push held away); drained smoothly across frames in update()
    wheelDeltaAccum = clamp(
      wheelDeltaAccum + Math.sign(-e.deltaY) * Math.min(1.5, Math.abs(e.deltaY) / 100),
      -3.0,
      3.0
    );
  };

  const onKeyDown = (e) => {
    const targetEl = e.target;
    if (
      targetEl instanceof HTMLElement &&
      ((targetEl.tagName === 'INPUT' && targetEl.type === 'text') || targetEl.tagName === 'TEXTAREA')
    ) {
      if (e.code === 'Escape') {
        targetEl.blur();
      }
      return;
    }

    if (!e.repeat && e.code === 'KeyP') {
      e.preventDefault();
      const opening = !state.settingsOpen;
      state.settingsOpen = opening;
      if (opening) {
        document.exitPointerLock?.();
        keys.clear();
        rmbDown = false;
        wheelDeltaAccum = 0;
        state.glassesPinned = false;
        state.glassesSlidingDown = false;
      } else if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      return;
    }

    if (!e.repeat && e.code === 'Escape' && state.settingsOpen) {
      state.settingsOpen = false;
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      return;
    }

    if (!e.repeat && e.code === 'KeyV') {
      if (state.settingsOpen) e.preventDefault();
      toggleCompareNormal(state);
      return;
    }

    if (!e.repeat && e.code === 'KeyZ') {
      if (state.settingsOpen) e.preventDefault();
      toggleGlasses(state);
      return;
    }

    if (!e.repeat && e.code === 'KeyL') {
      if (state.settingsOpen) e.preventDefault();
      state.lightsOn = state.lightsOn === false;
      return;
    }

    if (!e.repeat && e.code === 'KeyT') {
      if (state.settingsOpen) {
        e.preventDefault();
        if (document.activeElement?.tagName === 'SELECT') {
          document.activeElement.blur();
        }
      }
      state.timeOfDay = cycleTimeOfDay(state.timeOfDay);
      return;
    }

    if (!e.repeat && e.code === 'KeyF') {
      if (state.settingsOpen) e.preventDefault();
      state.focusing = !state.focusing;
      return;
    }

    if (!e.repeat && e.code === 'KeyM') {
      if (state.settingsOpen) e.preventDefault();
      state.muted = !state.muted;
      return;
    }

    if (state.settingsOpen) return;

    keys.add(e.code);
    if (e.code === 'Space') {
      e.preventDefault();
    }
    if (e.repeat) return;

    switch (e.code) {
      case 'KeyX':
        toggleSeatMode();
        break;
      case 'KeyG':
        tryTogglePickup(latestCamera);
        break;
      case 'KeyR':
        state.eyesClosed = !state.eyesClosed;
        if (state.eyesClosed) {
          state.focusing = false;
        } else {
          // Resume Focused if suppression applies; let updateSimState ramp focusStrength respecting current fatigue reserve
          state.focusing = hasSuppressionMechanics(state.settings);
        }
        break;
      case 'KeyH':
        state.hudVisible = !state.hudVisible;
        break;
      default:
        break;
    }
  };

  const onKeyUp = (e) => {
    keys.delete(e.code);
  };

  const onBlur = () => {
    keys.clear();
    rmbDown = false;
    activeTouchId = null;
    state.glassesPinned = false;
    state.glassesSlidingDown = false;
  };

  domElement.addEventListener('click', onCanvasClick);
  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('touchstart', onTouchStart, { passive: true });
  domElement.addEventListener('touchmove', onTouchMove, { passive: false });
  domElement.addEventListener('touchend', onTouchEnd, { passive: true });
  domElement.addEventListener('touchcancel', onTouchEnd, { passive: true });
  domElement.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  domElement.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('wheel', onWheel, { passive: true });
  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('mousemove', onMouseMove);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  function update(dt, camera) {
    latestCamera = camera;
    const step = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);

    // Signed directional gaze velocity (rad/s); crisp stop when mouse stops
    const instVx = step > 1e-4 ? dxAccum / step : 0;
    const instVy = step > 1e-4 ? dyAccum / step : 0;
    dxAccum = 0;
    dyAccum = 0;
    const instVel = Math.hypot(instVx, instVy);
    if (state.settingsOpen || instVel < 0.04) {
      state.gazeVel = 0;
      state.gazeVelX = 0;
      state.gazeVelY = 0;
    } else {
      state.gazeVel = instVel;
      state.gazeVelX = instVx;
      state.gazeVelY = instVy;
    }

    // Symmetric glasses slide control: Hold Shift slides down (near loupe); Hold Space slides up smoothly & pins at 0 mm
    const canAdjustGlasses = !state.settingsOpen && Boolean(state.glassesOn) && state.settings?.lensProfile !== 'none';
    const holdingSpace = canAdjustGlasses && keys.has('Space');
    const holdingShift = canAdjustGlasses && (keys.has('ShiftLeft') || keys.has('ShiftRight')) && !holdingSpace;
    state.glassesPinned = holdingSpace;
    state.glassesSlidingDown = holdingShift;
    if (holdingSpace) {
      state.glassesSlide = Math.max(0, (state.glassesSlide || 0) - 1.15 * step);
    } else if (holdingShift) {
      const maxSlide = state.settings?.lensProfile === 'aphakic_bifocal' ? 1.0 : 0.35;
      state.glassesSlide = clamp((state.glassesSlide || 0) + 1.15 * step, 0, maxSlide);
    }

    if (state.settingsOpen) {
      activeTouchId = null;
    }
    const suppressed = Boolean(state.settingsOpen);
    const fwdInput = suppressed
      ? 0
      : (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) -
        (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const strafeInput = suppressed
      ? 0
      : (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
        (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const leanIn = suppressed ? 0 : keys.has('KeyE') ? 1 : 0;
    const leanOut = suppressed ? 0 : keys.has('KeyQ') ? 1 : 0;
    // Exponentially drain wheel accumulator so discrete scroll detents glide continuously (~100ms)
    const wheelStep = suppressed ? 0 : wheelDeltaAccum * (1 - Math.exp(-14 * step));
    if (suppressed) {
      wheelDeltaAccum = 0;
    } else {
      wheelDeltaAccum -= wheelStep;
      if (Math.abs(wheelDeltaAccum) < 1e-4) wheelDeltaAccum = 0;
    }

    if (state.holding) {
      // Keep nearest rotated corner outside glasses (~4.8cm) or bare cornea (~4.2cm, clear of 2cm near clip)
      const heldItem = activeSceneApi.pickables.find((p) => p.id === state.holding);
      const halfDepth = heldItem?.halfDepth || 0.048;
      const minZ = (state.glassesOn ? 0.048 : 0.042) + halfDepth;

      // Distance-scaled precision speed: keeps constant gentle angular speed up close (10-15 cm) while staying brisk at arm's length
      const zDist = clamp(state.heldOffset.z, 0.07, 0.50);
      const xySpeed = 0.68 * zDist;
      const zSpeed = 0.20 + 0.45 * zDist;
      state.heldOffset.x = clamp(state.heldOffset.x + strafeInput * xySpeed * step, -0.22, 0.22);
      state.heldOffset.y = clamp(state.heldOffset.y + fwdInput * xySpeed * step, -0.18, 0.16);
      // Scroll down (wheelStep < 0) pulls held object closer; scroll up (wheelStep > 0) pushes it further away
      const zDelta = (leanIn - leanOut) * zSpeed * step - wheelStep * (0.014 + 0.045 * zDist);
      state.heldOffset.z = clamp(state.heldOffset.z - zDelta, minZ, 0.65);

      // Moving object closer (E or scroll down) guides its center directly into the lower dominant bifocal lens
      if (zDelta > 0 && strafeInput === 0 && fwdInput === 0) {
        const pullAlpha = 1 - Math.exp(-(leanIn > 0 ? 8.5 * step : Math.abs(wheelStep) * 0.48));
        const target = computeHeldRestOffset(
          state.heldOffset.z,
          state.glassesOn,
          state.settings?.dominantEye,
          state.glassesSlide
        );
        state.heldOffset.x += (target.x - state.heldOffset.x) * pullAlpha;
        state.heldOffset.y += (target.y - state.heldOffset.y) * pullAlpha;
      }
    } else {
      // Lean control via E/Q or mouse scroll wheel
      const leanDelta = (leanIn - leanOut) * 1.5 * step + wheelStep * 0.14;
      if (leanDelta !== 0) {
        state.lean = clamp(state.lean + leanDelta, -0.25, 1.0);
      }

      if (fwdInput !== 0 || strafeInput !== 0) {
        forward.set(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
        right.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
        moveDir
          .set(0, 0, 0)
          .addScaledVector(forward, fwdInput)
          .addScaledVector(right, strafeInput);
        if (moveDir.lengthSq() > 1e-6) {
          if (state.mode === 'seated') {
            // Smooth full-workbook torso panning while craned over desk (clamped directly on combined pose -> zero windup!)
            const panBounds = activeSceneApi.seatPanBounds || { minX: -0.34, maxX: 0.34, minZ: -0.48, maxZ: 0.12 };
            const leanScale = activeSceneApi.canStand === false ? 0.18 : 0.28;
            const panSpeed = 0.34 - 0.14 * clamp(state.lean, 0, 1);
            moveDir.normalize().multiplyScalar(panSpeed * step);
            const fwdLean = state.lean * leanScale;
            const fwdX = -Math.sin(state.yaw) * fwdLean;
            const fwdZ = -Math.cos(state.yaw) * fwdLean;
            seatPanX = clamp(seatPanX + moveDir.x, panBounds.minX - fwdX, panBounds.maxX - fwdX);
            seatPanZ = clamp(seatPanZ + moveDir.z, panBounds.minZ - fwdZ, panBounds.maxZ - fwdZ);
          } else if (state.mode === 'standing') {
            moveDir.normalize().multiplyScalar(2.4 * step);
            const nextX = standPos.x + moveDir.x;
            if (!collidesAt(nextX, standPos.z)) {
              standPos.x = nextX;
            }
            const nextZ = standPos.z + moveDir.z;
            if (!collidesAt(standPos.x, nextZ)) {
              standPos.z = nextZ;
            }
          }
        }
      }
    }

    const maxYaw = computeMaxYaw(state.mode, state.lean);
    if (Number.isFinite(maxYaw)) {
      state.yaw = clamp(state.yaw, -maxYaw, maxYaw);
    }

    // Eye-in-head gaze lead computed after final yaw/lean clamp so headYaw & eyeYaw never lag a clamped turn
    if (state.headYaw === undefined) state.headYaw = state.yaw;
    if (state.headPitch === undefined) state.headPitch = state.pitch;
    let rawEyeYaw = state.yaw - state.headYaw;
    let rawEyePitch = state.pitch - state.headPitch;
    if (Math.abs(rawEyeYaw) > MAX_EYE_YAW) {
      state.headYaw = state.yaw - Math.sign(rawEyeYaw) * MAX_EYE_YAW;
      rawEyeYaw = state.yaw - state.headYaw;
    }
    if (Math.abs(rawEyePitch) > MAX_EYE_PITCH) {
      state.headPitch = state.pitch - Math.sign(rawEyePitch) * MAX_EYE_PITCH;
      rawEyePitch = state.pitch - state.headPitch;
    }
    const yawFollowRate = 1.6 + 4.4 * clamp((Math.abs(rawEyeYaw) - 0.05) / 0.18, 0, 1);
    const pitchFollowRate = 1.1 + 3.0 * clamp((Math.abs(rawEyePitch) - 0.06) / 0.15, 0, 1);
    state.headYaw += rawEyeYaw * (1 - Math.exp(-yawFollowRate * step));
    state.headPitch += rawEyePitch * (1 - Math.exp(-pitchFollowRate * step));
    state.eyeYaw = clamp(state.yaw - state.headYaw, -MAX_EYE_YAW, MAX_EYE_YAW);
    state.eyePitch = clamp(state.pitch - state.headPitch, -MAX_EYE_PITCH, MAX_EYE_PITCH);

    if (camera) {
      camera.rotation.order = 'YXZ';
      camera.rotation.y = state.yaw;
      camera.rotation.x = state.pitch;
      camera.rotation.z = 0;

      if (state.mode === 'seated') {
        // Yaw-aligned slouch (E/Q/Scroll) + desk-aligned torso pan (WASD); keep seatPan clamped to live bounds (no windup)
        const panBounds = activeSceneApi.seatPanBounds || { minX: -0.34, maxX: 0.34, minZ: -0.48, maxZ: 0.12 };
        const fwdLean = state.lean * (activeSceneApi.canStand === false ? 0.18 : 0.28);
        const dropLean =
          activeSceneApi.canStand === false
            ? Math.max(0, state.lean) * 0.08 - Math.min(0, state.lean) * 0.03
            : Math.max(0, state.lean) * 0.24 - Math.min(0, state.lean) * 0.05;
        const fwdX = -Math.sin(state.yaw) * fwdLean;
        const fwdZ = -Math.cos(state.yaw) * fwdLean;
        seatPanX = clamp(seatPanX, panBounds.minX - fwdX, panBounds.maxX - fwdX);
        seatPanZ = clamp(seatPanZ, panBounds.minZ - fwdZ, panBounds.maxZ - fwdZ);
        camera.position.set(seatPos.x + fwdX + seatPanX, seatPos.y - dropLean, seatPos.z + fwdZ + seatPanZ);
      } else {
        const fwdLean = state.lean * 0.20;
        const dropLean = Math.max(0, state.lean) * 0.08;
        camera.position.set(
          standPos.x - Math.sin(state.yaw) * fwdLean,
          standEyeY - dropLean,
          standPos.z - Math.cos(state.yaw) * fwdLean
        );
      }
      camera.updateMatrixWorld(true);
      const resting = Boolean(state.eyesClosed) || (state.eyelidClose || 0) > 0.15;
      state.aimingPickable = !state.holding && !state.settingsOpen && !resting && Boolean(findAimedPickable(camera));
    }
  }

  function dispose() {
    domElement.removeEventListener('click', onCanvasClick);
    domElement.removeEventListener('pointerdown', onPointerDown);
    domElement.removeEventListener('touchstart', onTouchStart);
    domElement.removeEventListener('touchmove', onTouchMove);
    domElement.removeEventListener('touchend', onTouchEnd);
    domElement.removeEventListener('touchcancel', onTouchEnd);
    domElement.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    domElement.removeEventListener('contextmenu', onContextMenu);
    window.removeEventListener('wheel', onWheel);
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    document.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
  }

  return { update, setScene, toggleSeatMode, dispose };
}
