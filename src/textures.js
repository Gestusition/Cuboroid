import * as THREE from 'three';
import { seededRandom } from './noise.js';

const SIZE = 64;

function makeTexture(base, flecks = [], seed = 1, options = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const random = seededRandom(seed);

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const cells = options.cells ?? 150;
  for (let i = 0; i < cells; i += 1) {
    const color = flecks[Math.floor(random() * flecks.length)] ?? base;
    const size = options.chunky ? 3 + Math.floor(random() * 6) : 1 + Math.floor(random() * 4);
    const x = Math.floor(random() * SIZE);
    const y = Math.floor(random() * SIZE);
    ctx.globalAlpha = 0.25 + random() * 0.55;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, size, size);
  }

  if (options.lines) {
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = options.lines;
    ctx.lineWidth = 2;
    for (let y = 8; y < SIZE; y += 14) {
      ctx.beginPath();
      ctx.moveTo(0, y + Math.floor(random() * 3));
      ctx.lineTo(SIZE, y + Math.floor(random() * 3));
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function standard(texture, options = {}) {
  return new THREE.MeshStandardMaterial({
    map: texture,
    roughness: options.roughness ?? 0.92,
    metalness: options.metalness ?? 0,
    color: options.color ?? 0xffffff,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    alphaTest: options.alphaTest ?? 0
  });
}

export function createBlockMaterials() {
  const grassTop = standard(makeTexture('#557d35', ['#87ad49', '#315929', '#a6bd55'], 10, { cells: 240 }));
  const grassSide = standard(makeTexture('#66543a', ['#7b6849', '#4e3e2d', '#8aa54a'], 11, { cells: 210 }));
  const dirt = standard(makeTexture('#604a35', ['#7a5b3d', '#453526', '#8d6a46'], 12, { cells: 220 }));
  const stone = standard(makeTexture('#606568', ['#81878a', '#41474b', '#9ba0a1'], 13, { chunky: true }));
  const sand = standard(makeTexture('#c5a66a', ['#ead28e', '#9f814f', '#d8bd79'], 14, { cells: 190 }));
  const bark = standard(makeTexture('#59412f', ['#79573b', '#38291f', '#9a7047'], 15, { lines: '#2d211a' }));
  const rings = standard(makeTexture('#a47b4c', ['#c39a60', '#7c5938'], 16, { cells: 100 }));
  const leavesTexture = makeTexture('#385b2b', ['#507b35', '#263f22', '#739345'], 17, { chunky: true, cells: 250 });
  const leaves = standard(leavesTexture, { transparent: true, opacity: 0.92 });
  const brick = standard(makeTexture('#594d4a', ['#83716b', '#393435', '#a09086'], 18, { chunky: true }));
  const crystal = standard(makeTexture('#32b8bd', ['#81ffff', '#176f7d', '#d7ffff'], 19, { chunky: true }), {
    color: 0x78e9ef,
    roughness: 0.2,
    metalness: 0.05,
    emissive: 0x0c5d73,
    emissiveIntensity: 2.2
  });
  const snow = standard(makeTexture('#dfe9e7', ['#ffffff', '#b9d0d1', '#d0dfe1'], 20, { cells: 170 }));
  const cobble = standard(makeTexture('#626665', ['#888d8b', '#404544', '#777b79'], 21, { chunky: true, cells: 190 }));
  const planks = standard(makeTexture('#9a6b3f', ['#bd8950', '#68472f', '#d4a15f'], 22, { lines: '#533722', cells: 100 }));
  const coal = standard(makeTexture('#4c5050', ['#171919', '#777b79', '#292c2d'], 23, { chunky: true, cells: 170 }));
  const iron = standard(makeTexture('#696b68', ['#b18469', '#8b5d45', '#9b9c93'], 24, { chunky: true, cells: 170 }));
  const cactus = standard(makeTexture('#34754a', ['#61a263', '#1f5139', '#91ba6f'], 25, { lines: '#b7d58b', cells: 110 }));
  const hay = standard(makeTexture('#c39d32', ['#eed15a', '#896c20', '#dbb740'], 26, { lines: '#775d1b', cells: 160 }));
  const farmland = standard(makeTexture('#493326', ['#6b4930', '#2f211b', '#805537'], 27, { lines: '#241712', cells: 140 }));
  const glass = standard(makeTexture('#99d3d1', ['#dff9f5', '#6fa9ad'], 28, { cells: 25 }), {
    transparent: true,
    opacity: 0.43,
    roughness: 0.08
  });
  const drygrass = standard(makeTexture('#96943d', ['#c2b955', '#686c31', '#aaa64a'], 29, { cells: 220 }));
  const podzol = standard(makeTexture('#4e402d', ['#6d5635', '#2f3225', '#7d6841'], 30, { cells: 220 }));

  return {
    grass: [grassSide, grassSide, grassTop, dirt, grassSide, grassSide],
    dirt,
    stone,
    sand,
    wood: [bark, bark, rings, rings, bark, bark],
    leaves,
    brick,
    crystal,
    snow,
    cobble,
    planks,
    coal,
    iron,
    cactus,
    hay,
    farmland,
    glass,
    drygrass,
    podzol
  };
}

export function createSpriteTexture(type = 'glow') {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  gradient.addColorStop(0, type === 'sun' ? 'rgba(255,252,220,1)' : 'rgba(166,255,226,1)');
  gradient.addColorStop(0.16, type === 'sun' ? 'rgba(255,196,92,.95)' : 'rgba(75,237,190,.8)');
  gradient.addColorStop(0.5, type === 'sun' ? 'rgba(245,117,54,.3)' : 'rgba(56,192,163,.18)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
