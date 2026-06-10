import * as THREE from 'three';
import { hash2 } from './noise.js';

function box(width, height, depth, color) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness: 0.88 })
  );
}

function createHumanoid(kind) {
  const group = new THREE.Group();
  const villager = kind === 'villager';
  const hostile = kind === 'shadow';
  const bodyColor = villager ? 0x8f593b : hostile ? 0x263334 : 0xd7c09d;
  const skinColor = villager ? 0xb9825d : hostile ? 0x5c8d79 : 0xd4a77d;
  const body = box(0.62, 0.92, 0.36, bodyColor);
  body.position.y = 1.12;
  const head = box(0.56, 0.56, 0.56, skinColor);
  head.position.y = 1.87;
  const nose = box(0.16, 0.2, 0.18, villager ? 0x9b664a : skinColor);
  nose.position.set(0, 1.8, -0.35);
  const leftLeg = box(0.25, 0.7, 0.26, villager ? 0x3f352f : 0x23292a);
  const rightLeg = leftLeg.clone();
  leftLeg.position.set(-0.17, 0.36, 0);
  rightLeg.position.set(0.17, 0.36, 0);
  const leftArm = box(0.2, 0.8, 0.22, bodyColor);
  const rightArm = leftArm.clone();
  leftArm.position.set(-0.43, 1.12, 0);
  rightArm.position.set(0.43, 1.12, 0);
  group.add(body, head, nose, leftLeg, rightLeg, leftArm, rightArm);
  group.userData.parts = { leftLeg, rightLeg, leftArm, rightArm, head };
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return group;
}

function createAnimal(kind) {
  const group = new THREE.Group();
  const wool = kind === 'sheep';
  const body = box(1.05, 0.72, 0.55, wool ? 0xdad7c9 : 0x794734);
  body.position.y = 0.82;
  const head = box(0.48, 0.5, 0.46, wool ? 0x5a5149 : 0x6b3b2d);
  head.position.set(0, 0.88, -0.52);
  const legs = [];
  for (const x of [-0.35, 0.35]) {
    for (const z of [-0.2, 0.2]) {
      const leg = box(0.16, 0.55, 0.16, 0x443027);
      leg.position.set(x, 0.3, z);
      legs.push(leg);
      group.add(leg);
    }
  }
  group.add(body, head);
  group.userData.parts = { leftLeg: legs[0], rightLeg: legs[1], leftArm: legs[2], rightArm: legs[3], head };
  group.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });
  return group;
}

export class EntitySystem {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.entities = [];
    this.spawnedVillagers = new Set();
    this.hostileTimer = 0;
    this.onDeath = null;
  }

  syncVillagers() {
    for (const spawn of this.world.getNearbyEntitySpawns()) {
      const id = `${spawn.chunk}:${spawn.x},${spawn.z}`;
      if (this.spawnedVillagers.has(id)) continue;
      this.spawnedVillagers.add(id);
      this.spawn(spawn.type, spawn.x, spawn.z, { id, homeX: spawn.homeX, homeZ: spawn.homeZ });
    }
  }

  spawn(type, x, z, data = {}) {
    const mesh = ['sheep', 'boar'].includes(type) ? createAnimal(type) : createHumanoid(type);
    const y = this.world.terrainHeight(Math.round(x), Math.round(z)) + 0.5;
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    const entity = {
      type,
      mesh,
      home: new THREE.Vector3(data.homeX ?? x, y, data.homeZ ?? z),
      target: new THREE.Vector3(x, y, z),
      health: type === 'shadow' ? 12 : ['sheep', 'boar'].includes(type) ? 8 : 20,
      speed: type === 'shadow' ? 2.1 : ['sheep', 'boar'].includes(type) ? 0.8 : 1.05,
      state: 'idle',
      timer: Math.random() * 2,
      id: data.id,
      attackCooldown: 0
    };
    this.entities.push(entity);
    return entity;
  }

  chooseVillagerTarget(entity, dayPhase) {
    const isNight = dayPhase < 0.19 || dayPhase > 0.78;
    if (isNight) {
      entity.state = 'sleeping';
      entity.target.copy(entity.home);
      return;
    }
    entity.state = dayPhase < 0.3 ? 'commuting' : 'working';
    const angle = hash2(Math.floor(entity.timer * 10), entity.home.x, entity.home.z) * Math.PI * 2;
    const radius = 3 + hash2(entity.home.z, Math.floor(entity.timer * 8), entity.home.x) * 7;
    entity.target.set(entity.home.x + Math.cos(angle) * radius, entity.mesh.position.y, entity.home.z + Math.sin(angle) * radius);
  }

  spawnHostileNear(player) {
    const angle = Math.random() * Math.PI * 2;
    const distance = 14 + Math.random() * 14;
    const x = Math.round(player.position.x + Math.cos(angle) * distance);
    const z = Math.round(player.position.z + Math.sin(angle) * distance);
    if (this.world.getBiome(x, z) === 'desert' || this.world.terrainHeight(x, z) <= this.world.waterLevel) return;
    this.spawn('shadow', x, z);
  }

  damageAt(point, radius, amount) {
    let hit = null;
    for (const entity of this.entities) {
      if (entity.mesh.position.distanceTo(point) > radius) continue;
      entity.health -= amount;
      entity.mesh.position.addScaledVector(entity.mesh.position.clone().sub(point).setY(0).normalize(), 0.8);
      hit = entity;
      break;
    }
    return hit;
  }

  update(delta, time, dayPhase, player, survival) {
    this.syncVillagers();
    const isNight = dayPhase < 0.19 || dayPhase > 0.78;
    this.hostileTimer -= delta;
    const hostileCount = this.entities.filter((entity) => entity.type === 'shadow').length;
    if (isNight && this.hostileTimer <= 0 && hostileCount < 7 && survival.mode === 'survival') {
      this.hostileTimer = 5;
      this.spawnHostileNear(player);
    }

    for (let index = this.entities.length - 1; index >= 0; index -= 1) {
      const entity = this.entities[index];
      entity.timer -= delta;
      entity.attackCooldown -= delta;

      // Periodic ambient sounds
      if (Math.random() < delta * 0.055 && entity.state !== 'sleeping') {
        const dist = entity.mesh.position.distanceTo(player.position);
        if (dist < 35 && window.audio) {
          const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(player.camera.quaternion);
          window.audio.playMobAmbient(entity.type, entity.mesh.position, player.position, cameraRight);
        }
      }

      if (entity.health <= 0 || entity.mesh.position.distanceTo(player.position) > 90) {
        if (entity.health <= 0) {
          if (entity.type === 'shadow') survival.addExperience(4);
          if (window.audio) {
            const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(player.camera.quaternion);
            window.audio.playMobDeath(entity.type, entity.mesh.position, player.position, cameraRight);
          }
          this.onDeath?.(entity);
        }
        this.scene.remove(entity.mesh);
        this.entities.splice(index, 1);
        continue;
      }

      if (entity.type === 'villager') {
        if (entity.timer <= 0 || entity.mesh.position.distanceTo(entity.target) < 1) {
          entity.timer = 4 + Math.random() * 7;
          this.chooseVillagerTarget(entity, dayPhase);
        }
      } else if (entity.type === 'shadow') {
        if (!isNight) entity.health -= delta * 4;
        entity.target.copy(player.position);
        entity.state = 'hunting';
        if (entity.mesh.position.distanceTo(player.position) < 1.45 && entity.attackCooldown <= 0) {
          survival.damage(2);
          entity.attackCooldown = 1.2;
        }
      } else if (entity.timer <= 0 || entity.mesh.position.distanceTo(entity.target) < 0.8) {
        entity.timer = isNight ? 7 : 3 + Math.random() * 5;
        const radius = isNight ? 1 : 5;
        const angle = Math.random() * Math.PI * 2;
        entity.target.set(entity.home.x + Math.cos(angle) * radius, entity.mesh.position.y, entity.home.z + Math.sin(angle) * radius);
        entity.state = isNight ? 'sleeping' : 'grazing';
      }

      const direction = entity.target.clone().sub(entity.mesh.position);
      direction.y = 0;
      const distance = direction.length();
      if (distance > 0.25 && entity.state !== 'sleeping') {
        direction.normalize();
        const next = entity.mesh.position.clone().addScaledVector(direction, entity.speed * delta);
        const ground = this.world.terrainHeight(Math.round(next.x), Math.round(next.z)) + 0.5;
        if (Math.abs(ground - entity.mesh.position.y) < 1.6) {
          entity.mesh.position.x = next.x;
          entity.mesh.position.z = next.z;
          entity.mesh.position.y = THREE.MathUtils.damp(entity.mesh.position.y, ground, 10, delta);
          entity.mesh.rotation.y = Math.atan2(direction.x, direction.z);
        } else {
          entity.timer = 0;
        }
      }
      const swing = Math.sin(time * 7 * entity.speed) * (distance > 0.25 ? 0.55 : 0.08);
      const parts = entity.mesh.userData.parts;
      parts.leftLeg.rotation.x = swing;
      parts.rightLeg.rotation.x = -swing;
      parts.leftArm.rotation.x = -swing;
      parts.rightArm.rotation.x = swing;
      parts.head.rotation.y = Math.sin(time * 0.7 + index) * 0.12;
    }
  }
}
