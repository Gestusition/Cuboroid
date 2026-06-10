import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VoxelWorld, BLOCKS, BIOMES } from './world.js';
import { PlayerController } from './player.js';
import { Inventory, ITEMS, RECIPES } from './inventory.js';
import { SurvivalSystem } from './survival.js';
import { EntitySystem } from './entities.js';
import { createSpriteTexture } from './textures.js';
import { seededRandom } from './noise.js';
import { audio } from './audio.js';
import './styles.css';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#game-canvas');
const loading = $('#loading');
const loadingStatus = $('#loading-status');
const landing = $('#landing');
const hud = $('#hud');
const pause = $('#pause');
const inventoryScreen = $('#inventory-screen');
const deathScreen = $('#death-screen');
const interactionLabel = $('#interaction-label');
const toast = $('#toast');
const hotbarElement = $('#hotbar');
const inventoryGrid = $('#inventory-grid');
const recipeList = $('#recipe-list');

let selectedMode = 'survival';
let started = false;
let inventoryOpen = false;
let photoMode = false;
let toastTimer;
let player;
let inventory;
let survival;
let entities;
let currentTarget = null;
let currentEntityTarget = null;
let leftMouseDown = false;
let breakProgress = 0;
let breakKey = '';
let worldTime = Number(localStorage.getItem('cuboroid-world-time') || 0.29);
let dayCount = Number(localStorage.getItem('cuboroid-day-count') || 1);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.55));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa98264);
scene.fog = new THREE.FogExp2(0x9b836e, 0.0055);
const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.06, 520);
scene.add(camera);

const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.55));
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.27, 0.65, 0.86);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

loadingStatus.textContent = 'Chunk çekirdeği hazırlanıyor...';
const world = new VoxelWorld(scene, { seed: 48271, viewDistance: 8 });
world.generateInitial();
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
raycaster.far = 6.5;
const particles = [];
const animated = [];

const sky = createSky();
const lighting = createLighting();
const water = createWater();
const stars = createStars();
createClouds();
const selectionOutline = createSelectionOutline();
const viewModel = createViewModel();

// GameAudio is now imported from audio.js

function createSky() {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x397b94) },
      horizonColor: { value: new THREE.Color(0xf0b879) },
      bottomColor: { value: new THREE.Color(0x5c6b68) },
      sunDirection: { value: new THREE.Vector3() },
      night: { value: 0 }
    },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 bottomColor;
      uniform vec3 sunDirection;
      uniform float night;
      varying vec3 vDirection;
      void main() {
        float h = vDirection.y * .5 + .5;
        vec3 color = mix(bottomColor, horizonColor, smoothstep(.05, .5, h));
        color = mix(color, topColor, smoothstep(.45, 1., h));
        float halo = pow(max(dot(vDirection, sunDirection), 0.), 14.);
        color += vec3(1., .46, .13) * halo * (1. - night) * .65;
        color *= 1. - night * .72;
        color += vec3(.015, .025, .08) * night;
        gl_FragColor = vec4(color, 1.);
      }
    `
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 20), material);
  scene.add(mesh);
  return { mesh, material };
}

function createLighting() {
  const hemisphere = new THREE.HemisphereLight(0xaed0df, 0x4c3528, 1.6);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xffc985, 4.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -50;
  sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 100;
  sun.shadow.bias = -0.00045;
  sun.shadow.normalBias = 0.025;
  scene.add(sun);
  const moon = new THREE.DirectionalLight(0x8eabff, 0.2);
  scene.add(moon);
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createSpriteTexture('sun'),
    color: 0xffd38a,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }));
  sunSprite.scale.set(18, 18, 1);
  scene.add(sunSprite);
  return { hemisphere, sun, moon, sunSprite };
}

function createWater() {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, night: { value: 0 } },
    vertexShader: `
      uniform float time; varying float vWave; varying vec3 vPos;
      void main() {
        vec3 p = position;
        vWave = sin(p.x * .24 + time) * .08 + cos(p.y * .31 - time * .7) * .06;
        p.z += vWave; vPos = p;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
      }
    `,
    fragmentShader: `
      uniform float time; uniform float night; varying float vWave; varying vec3 vPos;
      void main() {
        float glint = pow(sin((vPos.x + vPos.y) * .8 + time) * .5 + .5, 8.);
        vec3 day = mix(vec3(.035,.19,.25), vec3(.18,.55,.56), .55 + vWave * 2.);
        vec3 color = mix(day, vec3(.015,.035,.09), night * .8);
        color += glint * vec3(.7,.55,.3) * (1. - night) * .22;
        gl_FragColor = vec4(color, .72);
      }
    `
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(600, 600, 70, 70), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = world.waterLevel + 0.48;
  mesh.renderOrder = 2;
  scene.add(mesh);
  return { mesh, material };
}

function createStars() {
  const random = seededRandom(621);
  const positions = [];
  for (let i = 0; i < 900; i += 1) {
    const direction = new THREE.Vector3(random() - 0.5, random() * 0.65 + 0.12, random() - 0.5).normalize().multiplyScalar(135);
    positions.push(direction.x, direction.y, direction.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xdbe7ff,
    size: 0.42,
    transparent: true,
    opacity: 0,
    depthWrite: false
  });
  const points = new THREE.Points(geometry, material);
  scene.add(points);
  return { points, material };
}

function createClouds() {
  const random = seededRandom(780);
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0xffe3c8, roughness: 1, transparent: true, opacity: 0.32, depthWrite: false });
  for (let c = 0; c < 40; c += 1) {
    const cloud = new THREE.Group();
    for (let i = 0; i < 3 + Math.floor(random() * 5); i += 1) {
      const piece = new THREE.Mesh(geometry, material);
      piece.position.set(i * 2.2, random(), (random() - 0.5) * 3);
      piece.scale.set(2 + random() * 3.5, 0.7 + random(), 2 + random() * 3);
      cloud.add(piece);
    }
    cloud.position.set((random() - 0.5) * 260, 31 + random() * 18, (random() - 0.5) * 260);
    group.add(cloud);
  }
  scene.add(group);
  animated.push({
    update(_time, delta) {
      for (const cloud of group.children) {
        cloud.position.x += delta * 0.55;
        if (cloud.position.x > 160) cloud.position.x = -160;
      }
      if (player) {
        group.position.x = Math.round(player.position.x / 160) * 160;
        group.position.z = Math.round(player.position.z / 160) * 160;
      }
    }
  });
}

function createSelectionOutline() {
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.025, 1.025, 1.025)),
    new THREE.LineBasicMaterial({ color: 0xffe3a0, transparent: true, opacity: 0.95, depthTest: false })
  );
  outline.renderOrder = 10;
  outline.visible = false;
  scene.add(outline);
  return outline;
}

function createViewModel() {
  const group = new THREE.Group();
  const hand = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.55, 0.22),
    new THREE.MeshBasicMaterial({ color: 0xc18a63 })
  );
  hand.position.set(0.2, -0.18, 0.08);
  hand.rotation.z = -0.22;
  const item = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.34, 0.34),
    new THREE.MeshBasicMaterial({ color: 0x638f3c })
  );
  item.position.set(0, 0.15, -0.02);
  item.rotation.set(0.25, 0.55, 0.1);
  group.add(hand, item);
  group.position.set(0.62, -0.48, -1.05);
  group.rotation.set(-0.18, -0.22, -0.08);
  group.scale.setScalar(0.43);
  group.visible = false;
  group.userData.item = item;
  camera.add(group);
  return group;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 1700);
}

function dayState() {
  const sunAngle = worldTime * Math.PI * 2 - Math.PI / 2;
  const sunHeight = Math.sin(sunAngle);
  const daylight = THREE.MathUtils.smoothstep(sunHeight, -0.16, 0.22);
  const night = 1 - daylight;
  return { sunAngle, sunHeight, daylight, night };
}

function updateDayNight(delta) {
  const previous = worldTime;
  worldTime = (worldTime + delta / 420) % 1;
  if (worldTime < previous) dayCount += 1;
  const { sunAngle, sunHeight, daylight, night } = dayState();
  const sunDirection = new THREE.Vector3(Math.cos(sunAngle), sunHeight, Math.sin(sunAngle) * 0.55).normalize();
  sky.mesh.position.copy(camera.position);
  sky.material.uniforms.sunDirection.value.copy(sunDirection);
  sky.material.uniforms.night.value = night;
  lighting.sun.position.copy(sunDirection).multiplyScalar(58).add(player?.position || world.spawn);
  lighting.moon.position.copy(sunDirection).multiplyScalar(-55).add(player?.position || world.spawn);
  lighting.sun.intensity = Math.max(0, daylight * 4.3);
  lighting.moon.intensity = night * 1.05;
  lighting.hemisphere.intensity = 0.48 + daylight * 1.25;
  lighting.sunSprite.position.copy(sunDirection).multiplyScalar(125).add(camera.position);
  lighting.sunSprite.visible = sunHeight > -0.12;
  stars.material.opacity = THREE.MathUtils.damp(stars.material.opacity, night * 0.9, 2, delta);
  stars.points.position.copy(camera.position);
  water.material.uniforms.night.value = night;
  scene.fog.color.lerpColors(new THREE.Color(0x26354b), new THREE.Color(0xa78a70), daylight);
  renderer.toneMappingExposure = 0.78 + daylight * 0.34;
  bloomPass.strength = 0.18 + night * 0.25;
  const totalMinutes = Math.floor(worldTime * 1440);
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  $('#clock').textContent = `${hours}:${minutes} · ${dayCount}. GÜN`;
  $('#day-label').textContent = night > 0.65 ? 'GECE' : sunHeight < 0.25 ? 'ALACAKARANLIK' : 'GÜNDÜZ';
  $('.sun-icon').textContent = night > 0.65 ? '◐' : '☼';
  if (Math.floor(performance.now()) % 1000 < 18) {
    localStorage.setItem('cuboroid-world-time', worldTime);
    localStorage.setItem('cuboroid-day-count', dayCount);
  }
}

function setupModePicker() {
  document.querySelectorAll('.mode-card').forEach((button) => {
    button.addEventListener('click', () => {
      selectedMode = button.dataset.mode;
      document.querySelectorAll('.mode-card').forEach((item) => item.classList.toggle('active', item === button));
    });
  });
}

function setupAudioSettings() {
  const sfxSlider = $('#volume-sfx');
  const musicSlider = $('#volume-music');
  const sfxVal = $('#val-sfx');
  const musicVal = $('#val-music');

  if (sfxSlider && musicSlider) {
    const savedSFX = Math.round(audio.sfxVolume * 100);
    const savedMusic = Math.round(audio.musicVolume * 100);

    sfxSlider.value = savedSFX;
    musicSlider.value = savedMusic;
    sfxVal.textContent = `${savedSFX}%`;
    musicVal.textContent = `${savedMusic}%`;

    sfxSlider.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      sfxVal.textContent = `${val}%`;
      audio.setSFXVolume(val / 100);
    });

    musicSlider.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      musicVal.textContent = `${val}%`;
      audio.setMusicVolume(val / 100);
    });
  }
}

function startGame() {
  if (!started) {
    started = true;
    survival = new SurvivalSystem(selectedMode);
    inventory = new Inventory(selectedMode);
    player = new PlayerController(camera, world, canvas, survival);
    entities = new EntitySystem(scene, world);
    entities.onDeath = (entity) => {
      if (entity.type === 'boar') inventory.add('meat', 1);
      if (entity.type === 'sheep') inventory.add('wool', 1);
      renderInventory();
    };
    player.spawn(world.spawn);
    window.Cuboroid = { world, player, inventory, survival, entities };
    survival.onChange = updateStats;
    survival.onDeath = die;
    landing.classList.add('is-hidden');
    hud.classList.remove('is-hidden');
    document.body.classList.add('playing');
    viewModel.visible = true;
    renderInventory();
    updateStats();
    audio.start();
    showToast(selectedMode === 'creative' ? 'Creative: çift Space ile uç' : 'Survival: ilk geceye hazırlan');
  }
  canvas.requestPointerLock();
}

function updateStats() {
  if (!survival) return;
  $('#health-fill').style.width = `${survival.health * 5}%`;
  $('#hunger-fill').style.width = `${survival.hunger * 5}%`;
  $('#health-value').textContent = Math.ceil(survival.health);
  $('#hunger-value').textContent = Math.ceil(survival.hunger);
  $('#level-value').textContent = survival.level;
  $('#xp-fill').style.width = `${Math.min(100, survival.experience / (8 + survival.level * 5) * 100)}%`;
  $('.survival-bars').style.display = survival.mode === 'creative' ? 'none' : '';
}

function renderInventory() {
  if (!inventory) return;
  inventoryGrid.innerHTML = '';
  inventory.slots.forEach((slot, index) => {
    const element = document.createElement('div');
    element.className = `inventory-slot${index === inventory.selected ? ' selected' : ''}`;
    if (slot) {
      const item = ITEMS[slot.id] || { name: slot.id, color: '#aaa' };
      element.title = `${item.name}${slot.durability ? ` · ${slot.durability}` : ''}`;
      element.innerHTML = `<i class="block-icon" style="--block-color:${item.color}"></i><span class="item-count">${slot.count > 1 ? slot.count : ''}</span>`;
    }
    element.addEventListener('click', () => {
      inventory.selected = index;
      inventory.save();
      renderInventory();
      renderHotbar();
    });
    inventoryGrid.append(element);
  });
  recipeList.innerHTML = '';
  RECIPES.forEach((recipe) => {
    const button = document.createElement('button');
    button.className = 'recipe';
    button.disabled = !inventory.canCraft(recipe);
    const costs = Object.entries(recipe.ingredients).map(([id, count]) => `${count} ${ITEMS[id]?.name || id}`).join(' + ');
    button.innerHTML = `<div><strong>${recipe.name}</strong><span>${costs}</span></div><b>+</b>`;
    button.addEventListener('click', () => {
      if (inventory.craft(recipe)) {
        audio.playCraft();
        showToast(`${recipe.name} üretildi`);
        renderInventory();
        renderHotbar();
      }
    });
    recipeList.append(button);
  });
  renderHotbar();
}

function renderHotbar() {
  if (!inventory) return;
  hotbarElement.innerHTML = '';
  for (let index = 0; index < 9; index += 1) {
    const slot = inventory.slots[index];
    const element = document.createElement('div');
    element.className = `hotbar-slot${index === inventory.selected ? ' active' : ''}`;
    element.innerHTML = `<span class="slot-number">${index + 1}</span>`;
    if (slot) {
      const item = ITEMS[slot.id] || { name: slot.id, color: '#aaa' };
      element.title = item.name;
      element.innerHTML += `<i class="block-icon" style="--block-color:${item.color}"></i><span class="item-count">${slot.count > 1 ? slot.count : ''}</span>`;
    }
    hotbarElement.append(element);
  }
  const held = ITEMS[selectedItem()?.id];
  viewModel.userData.item.material.color.set(held?.color || 0x5f4634);
}

function toggleInventory(force) {
  if (!started) return;
  inventoryOpen = force ?? !inventoryOpen;
  inventoryScreen.classList.toggle('is-hidden', !inventoryOpen);
  if (inventoryOpen) {
    document.exitPointerLock();
    renderInventory();
  } else {
    canvas.requestPointerLock();
  }
}

function selectedItem() {
  return inventory?.slots[inventory.selected] || null;
}

function updateTarget() {
  if (!started || inventoryOpen || document.pointerLockElement !== canvas) {
    currentTarget = null;
    currentEntityTarget = null;
    selectionOutline.visible = false;
    interactionLabel.classList.remove('visible');
    return;
  }
  raycaster.setFromCamera(new THREE.Vector2(), camera);
  const blockHit = raycaster.intersectObjects(world.meshes, false)[0];
  const entityMeshes = entities.entities.flatMap((entity) => entity.mesh.children);
  const entityHit = raycaster.intersectObjects(entityMeshes, false)[0];
  currentEntityTarget = entityHit && entityHit.distance < 4.5 ? entities.entities.find((entity) => entity.mesh.children.includes(entityHit.object)) : null;
  if (currentEntityTarget && (!blockHit || entityHit.distance < blockHit.distance)) {
    currentTarget = null;
    selectionOutline.visible = false;
    interactionLabel.textContent = currentEntityTarget.type === 'villager' ? 'KÖYLÜ · SAĞ TIK: TAKAS' : 'GÖLGE YARATIĞI';
    interactionLabel.classList.add('visible');
    return;
  }
  if (!blockHit || blockHit.distance > 6.5) {
    currentTarget = null;
    selectionOutline.visible = false;
    interactionLabel.classList.remove('visible');
    return;
  }
  const block = world.getBlockFromIntersection(blockHit);
  if (!block) return;
  currentEntityTarget = null;
  currentTarget = { ...block, normal: blockHit.face.normal.clone() };
  selectionOutline.position.set(block.x, block.y, block.z);
  selectionOutline.visible = true;
  interactionLabel.textContent = BLOCKS[block.type].name.toLocaleUpperCase('tr-TR');
  interactionLabel.classList.add('visible');
}

function toolSpeed(block) {
  if (survival.mode === 'creative') return 100;
  const item = selectedItem();
  const tool = ITEMS[item?.id];
  if (!BLOCKS[block.type].tool) return 1;
  return tool?.tool === BLOCKS[block.type].tool ? tool.power || 1 : 0.35;
}

function updateBreaking(delta) {
  if (!leftMouseDown || !currentTarget || inventoryOpen) {
    breakProgress = 0;
    breakKey = '';
    selectionOutline.scale.setScalar(1);
    return;
  }
  const key = `${currentTarget.x},${currentTarget.y},${currentTarget.z}`;
  if (key !== breakKey) {
    breakKey = key;
    breakProgress = 0;
  }
  const block = BLOCKS[currentTarget.type];
  breakProgress += delta * toolSpeed(currentTarget);

  // Play digging crunch sound at intervals
  const digInterval = 0.16;
  const currentStep = Math.floor(breakProgress / digInterval);
  if (currentStep !== currentTarget._lastDigStep) {
    currentTarget._lastDigStep = currentStep;
    audio.playDig(currentTarget.type);
  }

  const required = survival.mode === 'creative' ? 0.02 : block.hardness;
  const ratio = Math.min(1, breakProgress / required);
  selectionOutline.scale.setScalar(1 + Math.sin(ratio * Math.PI * 5) * 0.025);
  selectionOutline.material.color.setHSL(0.12 - ratio * 0.08, 0.75, 0.68);
  if (breakProgress >= required) breakBlock();
}

function breakBlock() {
  const block = currentTarget;
  if (!block || block.y <= -7) return;
  world.removeBlock(block.x, block.y, block.z);
  const drop = BLOCKS[block.type].drop;
  if (survival.mode === 'creative' || inventory.add(drop, 1)) {
    if (block.type === 'leaves' && Math.random() < 0.2) inventory.add(Math.random() < 0.55 ? 'apple' : 'berry', 1);
  }
  const item = selectedItem();
  if (ITEMS[item?.id]?.tool) inventory.useSelected();
  survival.exert(0.08);
  spawnBlockParticles(block);
  audio.playBreak(block.type);
  renderInventory();
  currentTarget = null;
  breakProgress = 0;
}

function placeOrUse() {
  const slot = selectedItem();
  if (!slot) return;
  const item = ITEMS[slot.id];
  if (currentEntityTarget?.type === 'villager') {
    if (inventory.count('coal') >= 3) {
      inventory.remove('coal', 3);
      inventory.add('bread', 2);
      showToast('Köylü: 3 kömür karşılığında 2 ekmek');
      const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      audio.playMobAmbient('villager', currentEntityTarget.mesh.position, player.position, cameraRight);
      renderInventory();
    } else showToast('Köylü 3 kömür istiyor');
    return;
  }
  if (item?.food && survival.eat(item.food)) {
    inventory.useSelected();
    audio.playEat(item);
    showToast(`${item.name} yedin`);
    renderInventory();
    return;
  }
  if (!currentTarget || !item?.placeable) return;
  const position = {
    x: currentTarget.x + Math.round(currentTarget.normal.x),
    y: currentTarget.y + Math.round(currentTarget.normal.y),
    z: currentTarget.z + Math.round(currentTarget.normal.z)
  };
  if (world.getBlock(position.x, position.y, position.z) || player.intersectsBlock(position.x, position.y, position.z)) return;
  if (world.setBlock(position.x, position.y, position.z, slot.id)) {
    inventory.useSelected();
    audio.playPlace(slot.id);
    renderInventory();
  }
}

function attackEntity() {
  if (!currentEntityTarget) return;
  const item = selectedItem();
  const damage = item?.tool === 'weapon' ? item.power : 1;
  currentEntityTarget.health -= damage;
  currentEntityTarget.mesh.position.add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(0.7));
  if (item?.tool) inventory.useSelected();
  const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  audio.playHit('player', currentEntityTarget, player.position, cameraRight);
  renderInventory();
}

function spawnBlockParticles(block) {
  const geometry = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  const material = new THREE.MeshStandardMaterial({ color: BLOCKS[block.type].color, roughness: 1 });
  for (let i = 0; i < 11; i += 1) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(block.x + (Math.random() - 0.5) * 0.7, block.y + (Math.random() - 0.5) * 0.7, block.z + (Math.random() - 0.5) * 0.7);
    mesh.userData.velocity = new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 3, (Math.random() - 0.5) * 3);
    mesh.userData.life = 0.6;
    scene.add(mesh);
    particles.push(mesh);
  }
}

function updateParticles(delta) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.userData.life -= delta;
    particle.userData.velocity.y -= delta * 9;
    particle.position.addScaledVector(particle.userData.velocity, delta);
    particle.scale.setScalar(Math.max(0, particle.userData.life / 0.6));
    if (particle.userData.life <= 0) {
      scene.remove(particle);
      particles.splice(i, 1);
    }
  }
}

function updateViewModel(time, delta) {
  if (!player || !viewModel.visible) return;
  const moving = player.velocity.lengthSq() > 0.4;
  const bob = moving ? Math.sin(time * 8) * 0.025 : 0;
  const targetRotation = leftMouseDown ? -0.95 : -0.18;
  viewModel.rotation.x = THREE.MathUtils.damp(viewModel.rotation.x, targetRotation + bob, 12, delta);
  viewModel.rotation.z = -0.08 + Math.cos(time * 8) * (moving ? 0.025 : 0);
  viewModel.position.y = -0.48 + Math.abs(bob);
}

function updateWorldUi() {
  if (!player) return;
  const biome = world.getBiome(Math.round(player.position.x), Math.round(player.position.z));
  $('#biome-name').textContent = BIOMES[biome].name.toLocaleUpperCase('tr-TR');
  const village = world.getVillageCentersNear(Math.floor(player.position.x / 16), Math.floor(player.position.z / 16))
    .find((center) => Math.hypot(center.x - player.position.x, center.z - player.position.z) < 24);
  if (village) {
    $('#objective-text').textContent = 'Yerleşim keşfedildi · Köylülerle takas et';
    $('.objective-index').textContent = '✓';
  }
}

function die() {
  document.exitPointerLock();
  deathScreen.classList.remove('is-hidden');
}

function respawn() {
  survival.health = 20;
  survival.hunger = 16;
  survival.changed();
  player.spawn(world.spawn);
  deathScreen.classList.add('is-hidden');
  canvas.requestPointerLock();
}

function togglePhotoMode() {
  photoMode = !photoMode;
  hud.classList.toggle('photo-mode', photoMode);
}

function updateCinematicCamera(time) {
  const target = new THREE.Vector3(world.spawn.x, world.terrainHeight(world.spawn.x, world.spawn.z) + 4, world.spawn.z);
  const angle = time * 0.035;
  camera.position.set(target.x + Math.cos(angle) * 34, target.y + 13 + Math.sin(time * 0.2), target.z + Math.sin(angle) * 34);
  camera.lookAt(target);
}

setupModePicker();
setupAudioSettings();
$('#enter-button').addEventListener('click', startGame);
$('#resume-button').addEventListener('click', () => canvas.requestPointerLock());
$('#photo-button').addEventListener('click', togglePhotoMode);
$('#save-button').addEventListener('click', () => {
  world.saveEdits();
  inventory?.save();
  survival?.save();
  showToast('Dünya kaydedildi');
});
$('#inventory-close').addEventListener('click', () => toggleInventory(false));
$('#respawn-button').addEventListener('click', respawn);

canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener('mousedown', (event) => {
  if (document.pointerLockElement !== canvas) return;
  if (event.button === 0) {
    if (currentEntityTarget) attackEntity();
    else leftMouseDown = true;
  }
  if (event.button === 2) placeOrUse();
});
window.addEventListener('mouseup', (event) => {
  if (event.button === 0) leftMouseDown = false;
});
canvas.addEventListener('wheel', (event) => {
  if (!inventory) return;
  inventory.selected = (inventory.selected + (event.deltaY > 0 ? 1 : 8)) % 9;
  inventory.save();
  renderInventory();
}, { passive: true });

document.addEventListener('keydown', (event) => {
  if (event.code === 'Enter' && !started) startGame();
  if (event.code === 'KeyE' && started && !deathScreen.classList.contains('is-hidden')) return;
  if (event.code === 'KeyE' && started) toggleInventory();
  if (event.code === 'KeyH' && started) togglePhotoMode();
  if (/^Digit[1-9]$/.test(event.code) && inventory) {
    inventory.selected = Number(event.code.at(-1)) - 1;
    inventory.save();
    renderInventory();
  }
});

document.addEventListener('pointerlockchange', () => {
  if (!player) return;
  const locked = document.pointerLockElement === canvas;
  player.setEnabled(locked);
  if (!inventoryOpen && deathScreen.classList.contains('is-hidden')) pause.classList.toggle('is-hidden', locked);
});

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  updateDayNight(delta);
  water.material.uniforms.time.value = time;
  if (started) {
    player.update(delta);
    world.update(player.position);
    survival.update(delta);
    entities.update(delta, time, worldTime, player, survival);
    water.mesh.position.x = Math.round(player.position.x / 16) * 16;
    water.mesh.position.z = Math.round(player.position.z / 16) * 16;
    updateTarget();
    updateBreaking(delta);
    updateWorldUi();
  } else updateCinematicCamera(time);
  animated.forEach((item) => item.update(time, delta));
  updateViewModel(time, delta);
  updateParticles(delta);
  composer.render();
}

loadingStatus.textContent = 'Biyomlar ve yerleşimler kuruluyor...';
requestAnimationFrame(() => requestAnimationFrame(() => {
  loading.classList.add('is-hidden');
  animate();
}));
