import * as THREE from 'three';

export class PlayerController {
  constructor(camera, world, canvas, survival) {
    this.camera = camera;
    this.world = world;
    this.canvas = canvas;
    this.survival = survival;
    this.velocity = new THREE.Vector3();
    this.position = new THREE.Vector3();
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.eyeHeight = 1.62;
    this.height = 1.8;
    this.radius = 0.32;
    this.onGround = false;
    this.enabled = false;
    this.bobTime = 0;
    this.baseFov = 72;
    this.mode = survival.mode;
    this.flying = this.mode === 'creative';
    this.lastGroundVelocity = 0;
    this.inWater = false;
    this.spaceReleased = true;
    this.lastSpaceTap = 0;
    this.lastStepIndex = 0;
    // Minecraft-style fall damage: track highest Y since last ground contact
    this.fallStartY = 0;
    this.isFalling = false;
    this.bindEvents();
  }

  bindEvents() {
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Space' && !this.keys.has('Space') && this.mode === 'creative') {
        const now = performance.now();
        if (now - this.lastSpaceTap < 280) this.flying = !this.flying;
        this.lastSpaceTap = now;
      }
      this.keys.add(event.code);
      if (event.code === 'Space') event.preventDefault();
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    document.addEventListener('mousemove', (event) => {
      if (!this.enabled || document.pointerLockElement !== this.canvas) return;
      this.yaw -= event.movementX * 0.002;
      this.pitch -= event.movementY * 0.002;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI / 2 + 0.03, Math.PI / 2 - 0.03);
    });
  }

  spawn(position) {
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = -0.1;
    this.fallStartY = position.y - this.eyeHeight;
    this.isFalling = false;
    this.syncCamera();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.keys.clear();
      this.velocity.x = 0;
      this.velocity.z = 0;
    }
  }

  getAabb(position = this.position) {
    const feet = position.y - this.eyeHeight;
    return {
      minX: position.x - this.radius,
      maxX: position.x + this.radius,
      minY: feet,
      maxY: feet + this.height,
      minZ: position.z - this.radius,
      maxZ: position.z + this.radius
    };
  }

  collides(position) {
    const box = this.getAabb(position);
    for (let x = Math.floor(box.minX + 0.5); x <= Math.floor(box.maxX + 0.5); x += 1) {
      for (let y = Math.floor(box.minY + 0.5); y <= Math.floor(box.maxY + 0.5); y += 1) {
        for (let z = Math.floor(box.minZ + 0.5); z <= Math.floor(box.maxZ + 0.5); z += 1) {
          if (!this.world.isSolid(x, y, z)) continue;
          if (
            box.maxX > x - 0.5 &&
            box.minX < x + 0.5 &&
            box.maxY > y - 0.5 &&
            box.minY < y + 0.5 &&
            box.maxZ > z - 0.5 &&
            box.minZ < z + 0.5
          ) return true;
        }
      }
    }
    return false;
  }

  intersectsBlock(x, y, z) {
    const box = this.getAabb();
    return (
      box.maxX > x - 0.5 &&
      box.minX < x + 0.5 &&
      box.maxY > y - 0.5 &&
      box.minY < y + 0.5 &&
      box.maxZ > z - 0.5 &&
      box.minZ < z + 0.5
    );
  }

  moveAxis(axis, amount) {
    if (!amount) return;
    const proposed = this.position.clone();
    proposed[axis] += amount;
    if (!this.collides(proposed)) {
      this.position[axis] = proposed[axis];
      return;
    }

    if (axis === 'y') {
      if (amount < 0) {
        const wasOnGround = this.onGround;
        this.onGround = true;
        const impact = -this.velocity.y;
        
        // Landing sound
        if (!wasOnGround && impact > 3.0) {
          const feet = this.position.y - this.eyeHeight;
          const blockX = Math.round(this.position.x);
          const blockY = Math.floor(feet - 0.1);
          const blockZ = Math.round(this.position.z);
          const blockType = this.world.getBlock(blockX, blockY, blockZ) || 'grass';
          if (window.audio) {
            window.audio.playLand(blockType, impact);
          }
        }
        
        // Minecraft-style fall damage: based on distance fallen, not velocity
        if (this.isFalling && !this.inWater && this.mode !== 'creative') {
          const feetY = this.position.y - this.eyeHeight;
          const fallDistance = this.fallStartY - feetY;
          if (fallDistance > 3) {
            const damage = Math.floor(fallDistance - 3);
            this.survival.damage(damage);
          }
        }
        this.isFalling = false;
      }
      this.velocity.y = 0;
    } else {
      this.velocity[axis] = 0;
    }
  }

  update(delta) {
    if (!this.enabled) {
      this.syncCamera();
      return;
    }

    const sprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    this.inWater = this.position.y - this.eyeHeight < this.world.waterLevel + 0.55 &&
      this.world.terrainHeight(Math.round(this.position.x), Math.round(this.position.z)) < this.world.waterLevel;
    const speed = this.mode === 'creative' && this.flying ? (sprinting ? 15 : 9) : sprinting ? 7.4 : 4.6;
    const input = new THREE.Vector2(
      Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA')),
      Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS'))
    );
    if (input.lengthSq() > 1) input.normalize();

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const targetX = (input.x * cos - input.y * sin) * speed;
    const targetZ = (-input.x * sin - input.y * cos) * speed;
    const acceleration = this.onGround ? 16 : 5;
    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, targetX, acceleration, delta);
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, targetZ, acceleration, delta);

    if (this.flying) {
      const vertical = Number(this.keys.has('Space')) - Number(this.keys.has('ControlLeft') || this.keys.has('ControlRight'));
      this.velocity.y = THREE.MathUtils.damp(this.velocity.y, vertical * speed, 12, delta);
      this.onGround = false;
    } else if (this.inWater) {
      this.velocity.y = THREE.MathUtils.damp(this.velocity.y, this.keys.has('Space') ? 3.4 : -0.7, 4, delta);
      this.velocity.x *= 0.94;
      this.velocity.z *= 0.94;
    } else if (this.keys.has('Space') && this.onGround) {
      this.velocity.y = 8.2;
      this.onGround = false;
      this.survival.exert(0.2);
    }
    if (!this.flying && !this.inWater) this.velocity.y -= 23 * delta;

    // Track fall start position (highest Y since leaving ground)
    const feetY = this.position.y - this.eyeHeight;
    if (this.onGround) {
      this.fallStartY = feetY;
      this.isFalling = false;
    } else if (feetY > this.fallStartY) {
      // Going up (jumping) - update start position
      this.fallStartY = feetY;
    } else if (!this.isFalling && this.velocity.y < 0) {
      // Started falling
      this.isFalling = true;
    }
    // Water resets fall tracking
    if (this.inWater || this.flying) {
      this.fallStartY = feetY;
      this.isFalling = false;
    }

    this.onGround = false;

    this.moveAxis('x', this.velocity.x * delta);
    this.moveAxis('z', this.velocity.z * delta);
    this.lastGroundVelocity = this.velocity.y;
    this.moveAxis('y', this.velocity.y * delta);

    const moving = input.lengthSq() > 0.01 && this.onGround;
    if (moving) {
      this.bobTime += delta * (sprinting ? 12 : 8);
      const stepIndex = Math.floor(this.bobTime / Math.PI);
      if (stepIndex !== this.lastStepIndex) {
        this.lastStepIndex = stepIndex;
        this.playStepSound(sprinting);
      }
    } else {
      this.bobTime = THREE.MathUtils.damp(this.bobTime, 0, 5, delta);
      this.lastStepIndex = 0;
    }

    const targetFov = sprinting && input.y > 0 ? 78 : this.baseFov;
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 5, delta);
    this.camera.updateProjectionMatrix();

    if (moving) this.survival.exert(delta * (sprinting ? 0.16 : 0.025));
    if (this.position.y < -30) {
      this.survival.damage(20);
      this.spawn(this.world.spawn);
    }
    this.syncCamera(moving ? Math.sin(this.bobTime) * 0.035 : 0);
  }

  playStepSound(sprinting) {
    const feet = this.position.y - this.eyeHeight;
    const blockX = Math.round(this.position.x);
    const blockY = Math.floor(feet - 0.1);
    const blockZ = Math.round(this.position.z);
    const blockType = this.world.getBlock(blockX, blockY, blockZ) || 'grass';
    if (window.audio) {
      window.audio.playStep(blockType, sprinting);
    }
  }

  syncCamera(bob = 0) {
    this.camera.position.set(this.position.x, this.position.y + bob, this.position.z);
    this.camera.rotation.set(this.pitch + Math.abs(Math.cos(this.bobTime * 0.5)) * bob * 0.4, this.yaw, 0, 'YXZ');
  }
}
