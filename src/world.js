import * as THREE from 'three';
import { fbm, hash2, noise3 } from './noise.js';
import { createBlockMaterials } from './textures.js';

export const CHUNK_SIZE = 16;
export const WORLD_MIN_Y = -8;

export const BLOCKS = {
  grass: { name: 'Çim', color: '#638f3c', solid: true, hardness: 0.45, drop: 'grass' },
  dirt: { name: 'Toprak', color: '#79563a', solid: true, hardness: 0.4, drop: 'dirt' },
  stone: { name: 'Taş', color: '#777d80', solid: true, hardness: 1.5, drop: 'stone', tool: 'pickaxe' },
  sand: { name: 'Kum', color: '#d1b775', solid: true, hardness: 0.35, drop: 'sand' },
  wood: { name: 'Kütük', color: '#765238', solid: true, hardness: 1, drop: 'wood', tool: 'axe' },
  leaves: { name: 'Yaprak', color: '#3f6b31', solid: true, hardness: 0.18, drop: 'leaves' },
  brick: { name: 'Taş Tuğla', color: '#6f6260', solid: true, hardness: 1.8, drop: 'brick', tool: 'pickaxe' },
  crystal: { name: 'Yankı Kristali', color: '#5deaf1', solid: true, hardness: 2.2, drop: 'crystal', tool: 'pickaxe' },
  snow: { name: 'Kar', color: '#e5eeee', solid: true, hardness: 0.25, drop: 'snow' },
  cobble: { name: 'Kırıktaş', color: '#6e7371', solid: true, hardness: 1.4, drop: 'cobble', tool: 'pickaxe' },
  planks: { name: 'Tahta', color: '#a87543', solid: true, hardness: 0.8, drop: 'planks', tool: 'axe' },
  coal: { name: 'Kömür Cevheri', color: '#333636', solid: true, hardness: 1.8, drop: 'coal', tool: 'pickaxe' },
  iron: { name: 'Demir Cevheri', color: '#9a745e', solid: true, hardness: 2, drop: 'iron', tool: 'pickaxe' },
  cactus: { name: 'Kaktüs', color: '#3e8051', solid: true, hardness: 0.4, drop: 'cactus' },
  hay: { name: 'Saman Balyası', color: '#d0aa36', solid: true, hardness: 0.5, drop: 'hay' },
  farmland: { name: 'Tarla', color: '#543827', solid: true, hardness: 0.35, drop: 'dirt' },
  glass: { name: 'Cam', color: '#a9dcda', solid: true, hardness: 0.2, drop: 'glass' }
  ,
  drygrass: { name: 'Kuru Çim', color: '#96943d', solid: true, hardness: 0.45, drop: 'dirt' },
  podzol: { name: 'Orman Toprağı', color: '#4e402d', solid: true, hardness: 0.45, drop: 'dirt' }
};

export const BIOMES = {
  plains: { name: 'Zümrüt Ovalar', top: 'grass', fill: 'dirt', tint: 0x78a34a },
  forest: { name: 'Kadim Orman', top: 'podzol', fill: 'dirt', tint: 0x406c35 },
  desert: { name: 'Amber Çölü', top: 'sand', fill: 'sand', tint: 0xc8a75f },
  taiga: { name: 'Ayaz Tayga', top: 'snow', fill: 'dirt', tint: 0x9cb8aa },
  savanna: { name: 'Güneş Savanı', top: 'drygrass', fill: 'dirt', tint: 0x9e9b42 },
  mountains: { name: 'Sisli Zirveler', top: 'stone', fill: 'stone', tint: 0x7b8582 }
};

const DIRECTIONS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const blockKey = (x, y, z) => `${x},${y},${z}`;
const chunkKey = (x, z) => `${x},${z}`;
const floorDiv = (value, divisor) => Math.floor(value / divisor);

export class VoxelWorld {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.seed = options.seed ?? 48271;
    this.viewDistance = options.viewDistance ?? 2;
    this.waterLevel = 6;
    this.chunks = new Map();
    this.meshes = [];
    this.instanceLookup = new Map();
    this.materials = createBlockMaterials();
    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.group = new THREE.Group();
    this.group.name = 'Infinite Voxel World';
    this.scene.add(this.group);
    this.spawn = new THREE.Vector3(0, 18, 0);
    this.pending = [];
    this.lastPlayerChunk = '';
    this.onChunkCreated = null;
    this.forcedVillage = null;
    this.edits = this.loadEdits();
  }

  loadEdits() {
    try {
      return new Map(JSON.parse(localStorage.getItem('cuboroid-world-edits') || '[]'));
    } catch {
      return new Map();
    }
  }

  saveEdits() {
    localStorage.setItem('cuboroid-world-edits', JSON.stringify([...this.edits]));
  }

  getBiome(x, z) {
    const temperature = fbm(x * 0.004, z * 0.004, this.seed + 11, 4);
    const moisture = fbm(x * 0.004, z * 0.004, this.seed + 37, 4);
    const continental = fbm(x * 0.0022, z * 0.0022, this.seed + 71, 5);
    if (continental > 0.71) return 'mountains';
    if (temperature > 0.64 && moisture < 0.48) return 'desert';
    if (temperature > 0.6) return 'savanna';
    if (temperature < 0.39) return 'taiga';
    if (moisture > 0.58) return 'forest';
    return 'plains';
  }

  terrainHeight(x, z) {
    const biome = this.getBiome(x, z);
    const broad = fbm(x * 0.012, z * 0.012, this.seed + 101, 5);
    const detail = fbm(x * 0.055, z * 0.055, this.seed + 303, 3);
    const ridge = 1 - Math.abs(fbm(x * 0.008, z * 0.008, this.seed + 909, 4) * 2 - 1);
    let height = 5 + broad * 9 + detail * 2;
    if (biome === 'mountains') height += ridge * 16 + broad * 6;
    if (biome === 'desert') height = 6 + broad * 5 + detail;
    if (biome === 'plains') height = 7 + broad * 6 + detail;
    return Math.floor(height);
  }

  findSpawn() {
    for (let radius = 0; radius < 520; radius += 6) {
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 16) {
        const x = Math.round(Math.cos(angle) * radius);
        const z = Math.round(Math.sin(angle) * radius);
        const biome = this.getBiome(x, z);
        const height = this.terrainHeight(x, z);
        const slope = Math.max(
          Math.abs(height - this.terrainHeight(x + 2, z)),
          Math.abs(height - this.terrainHeight(x - 2, z)),
          Math.abs(height - this.terrainHeight(x, z + 2)),
          Math.abs(height - this.terrainHeight(x, z - 2))
        );
        if ((biome === 'plains' || biome === 'forest' || biome === 'savanna') && height > this.waterLevel + 1 && slope <= 2) {
          this.spawn.set(x, height + 2.15, z);
          this.forcedVillage = { x: x + 30, z: z - 20, biome: biome === 'forest' ? 'plains' : biome };
          return;
        }
      }
    }
    const height = this.terrainHeight(0, 0);
    this.spawn.set(0, height + 2.15, 0);
    this.forcedVillage = { x: 30, z: -20, biome: 'plains' };
  }

  generateInitial() {
    this.findSpawn();
    const cx = floorDiv(this.spawn.x, CHUNK_SIZE);
    const cz = floorDiv(this.spawn.z, CHUNK_SIZE);
    const immediateRadius = 3;
    for (let dz = -immediateRadius; dz <= immediateRadius; dz += 1) {
      for (let dx = -immediateRadius; dx <= immediateRadius; dx += 1) {
        this.createChunk(cx + dx, cz + dz);
      }
    }
    this.clearSpawnArea();
    this.lastPlayerChunk = chunkKey(cx, cz);
    const deferred = [];
    for (let dz = -this.viewDistance; dz <= this.viewDistance; dz += 1) {
      for (let dx = -this.viewDistance; dx <= this.viewDistance; dx += 1) {
        if (Math.abs(dx) <= immediateRadius && Math.abs(dz) <= immediateRadius) continue;
        deferred.push({ cx: cx + dx, cz: cz + dz, distance: Math.abs(dx) + Math.abs(dz) });
      }
    }
    deferred.sort((a, b) => a.distance - b.distance);
    this.pending.push(...deferred);
  }

  clearSpawnArea() {
    const centerX = Math.round(this.spawn.x);
    const centerZ = Math.round(this.spawn.z);
    const touched = new Set();
    for (let x = centerX - 3; x <= centerX + 3; x += 1) {
      for (let z = centerZ - 3; z <= centerZ + 3; z += 1) {
        const ground = this.terrainHeight(x, z);
        const cx = floorDiv(x, CHUNK_SIZE);
        const cz = floorDiv(z, CHUNK_SIZE);
        const chunk = this.getChunk(cx, cz);
        if (!chunk) continue;
        for (let y = ground + 1; y <= ground + 8; y += 1) chunk.blocks.delete(blockKey(x, y, z));
        touched.add(chunkKey(cx, cz));
      }
    }
    for (const key of touched) {
      const [cx, cz] = key.split(',').map(Number);
      this.rebuildChunk(cx, cz);
    }
  }

  getChunk(cx, cz) {
    return this.chunks.get(chunkKey(cx, cz));
  }

  getBlock(x, y, z) {
    const cx = floorDiv(x, CHUNK_SIZE);
    const cz = floorDiv(z, CHUNK_SIZE);
    return this.getChunk(cx, cz)?.blocks.get(blockKey(x, y, z));
  }

  isSolid(x, y, z) {
    const type = this.getBlock(x, y, z);
    return Boolean(type && BLOCKS[type]?.solid);
  }

  setBlock(x, y, z, type, playerEdit = true) {
    const cx = floorDiv(x, CHUNK_SIZE);
    const cz = floorDiv(z, CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return false;
    if (type) chunk.blocks.set(blockKey(x, y, z), type);
    else chunk.blocks.delete(blockKey(x, y, z));
    if (playerEdit) {
      this.edits.set(blockKey(x, y, z), type || null);
      this.saveEdits();
    }
    this.rebuildChunk(cx, cz);
    if (x % CHUNK_SIZE === 0) this.rebuildChunk(cx - 1, cz);
    if (x % CHUNK_SIZE === CHUNK_SIZE - 1 || x % CHUNK_SIZE === -1) this.rebuildChunk(cx + 1, cz);
    if (z % CHUNK_SIZE === 0) this.rebuildChunk(cx, cz - 1);
    if (z % CHUNK_SIZE === CHUNK_SIZE - 1 || z % CHUNK_SIZE === -1) this.rebuildChunk(cx, cz + 1);
    return true;
  }

  removeBlock(x, y, z) {
    return this.setBlock(x, y, z, null);
  }

  setGenerated(chunk, x, y, z, type) {
    const minX = chunk.cx * CHUNK_SIZE;
    const minZ = chunk.cz * CHUNK_SIZE;
    if (x < minX || x >= minX + CHUNK_SIZE || z < minZ || z >= minZ + CHUNK_SIZE) return;
    const edit = this.edits.get(blockKey(x, y, z));
    if (edit === null) return;
    chunk.blocks.set(blockKey(x, y, z), edit || type);
  }

  createChunk(cx, cz) {
    if (this.getChunk(cx, cz)) return;
    const chunk = {
      cx,
      cz,
      blocks: new Map(),
      group: new THREE.Group(),
      meshes: [],
      entities: [],
      biome: this.getBiome(cx * CHUNK_SIZE + 8, cz * CHUNK_SIZE + 8)
    };
    chunk.group.name = `Chunk ${cx},${cz}`;
    this.group.add(chunk.group);
    this.chunks.set(chunkKey(cx, cz), chunk);
    this.generateTerrain(chunk);
    this.generateFlora(chunk);
    this.generateLandmark(chunk);
    this.generateVillage(chunk);
    this.generateWildlife(chunk);
    for (const [editKey, editType] of this.edits) {
      const [x, y, z] = editKey.split(',').map(Number);
      if (floorDiv(x, CHUNK_SIZE) === cx && floorDiv(z, CHUNK_SIZE) === cz) {
        if (editType) chunk.blocks.set(editKey, editType);
        else chunk.blocks.delete(editKey);
      }
    }
    this.rebuildChunk(cx, cz);
    this.rebuildChunk(cx - 1, cz);
    this.rebuildChunk(cx + 1, cz);
    this.rebuildChunk(cx, cz - 1);
    this.rebuildChunk(cx, cz + 1);
    this.onChunkCreated?.(chunk);
  }

  generateTerrain(chunk) {
    const startX = chunk.cx * CHUNK_SIZE;
    const startZ = chunk.cz * CHUNK_SIZE;
    for (let x = startX; x < startX + CHUNK_SIZE; x += 1) {
      for (let z = startZ; z < startZ + CHUNK_SIZE; z += 1) {
        const biome = this.getBiome(x, z);
        const height = this.terrainHeight(x, z);
        const config = BIOMES[biome];
        for (let y = WORLD_MIN_Y; y <= height; y += 1) {
          const depth = height - y;
          const cave = y < height - 4 && y > WORLD_MIN_Y + 1 && noise3(x * 0.075, y * 0.085, z * 0.075, this.seed + 550) > 0.705;
          if (cave) continue;
          let type = 'stone';
          if (depth === 0) type = height <= this.waterLevel + 1 ? 'sand' : config.top;
          else if (depth < 4) type = config.fill;
          if (type === 'stone' && y < 8) {
            const ore = hash2(x * 13 + y, z * 17 - y, this.seed);
            if (ore > 0.986) type = y < 1 ? 'iron' : 'coal';
            if (y < -2 && ore < 0.008) type = 'crystal';
          }
          this.setGenerated(chunk, x, y, z, type);
        }
      }
    }
  }

  generateFlora(chunk) {
    const startX = chunk.cx * CHUNK_SIZE;
    const startZ = chunk.cz * CHUNK_SIZE;
    for (let x = startX - 3; x < startX + CHUNK_SIZE + 3; x += 1) {
      for (let z = startZ - 3; z < startZ + CHUNK_SIZE + 3; z += 1) {
        const biome = this.getBiome(x, z);
        const y = this.terrainHeight(x, z);
        const chance = hash2(x, z, this.seed + 800);
        if (Math.hypot(x - this.spawn.x, z - this.spawn.z) < 5) continue;
        if (this.forcedVillage && Math.hypot(x - this.forcedVillage.x, z - this.forcedVillage.z) < 22) continue;
        if (y <= this.waterLevel) continue;
        if (biome === 'desert' && chance > 0.985) {
          const h = 2 + Math.floor(hash2(x, z, this.seed + 2) * 3);
          for (let oy = 1; oy <= h; oy += 1) this.setGenerated(chunk, x, y + oy, z, 'cactus');
          continue;
        }
        const threshold = biome === 'forest' ? 0.91 : biome === 'taiga' ? 0.94 : biome === 'savanna' ? 0.972 : 0.984;
        if (!['forest', 'taiga', 'savanna', 'plains'].includes(biome) || chance < threshold) continue;
        const trunkHeight = 3 + Math.floor(hash2(x, z, this.seed + 22) * 3);
        for (let oy = 1; oy <= trunkHeight; oy += 1) this.setGenerated(chunk, x, y + oy, z, 'wood');
        const radius = biome === 'taiga' ? 2 : 2;
        for (let ox = -radius; ox <= radius; ox += 1) {
          for (let oz = -radius; oz <= radius; oz += 1) {
            for (let oy = -1; oy <= 2; oy += 1) {
              if (Math.abs(ox) + Math.abs(oz) + Math.max(oy, 0) > 4) continue;
              if (hash2(x + ox * 31, z + oz * 19, this.seed + oy) < 0.12) continue;
              this.setGenerated(chunk, x + ox, y + trunkHeight + oy, z + oz, 'leaves');
            }
          }
        }
      }
    }
  }

  getVillageCentersNear(cx, cz) {
    const centers = [];
    if (this.forcedVillage) {
      const forcedCx = floorDiv(this.forcedVillage.x, CHUNK_SIZE);
      const forcedCz = floorDiv(this.forcedVillage.z, CHUNK_SIZE);
      if (Math.abs(forcedCx - cx) <= 3 && Math.abs(forcedCz - cz) <= 3) centers.push(this.forcedVillage);
    }
    const regionSize = 5;
    const rx = floorDiv(cx, regionSize);
    const rz = floorDiv(cz, regionSize);
    for (let ox = -1; ox <= 1; ox += 1) {
      for (let oz = -1; oz <= 1; oz += 1) {
        const regionX = rx + ox;
        const regionZ = rz + oz;
        if (hash2(regionX, regionZ, this.seed + 404) < 0.62) continue;
        const vcx = regionX * regionSize + 1 + Math.floor(hash2(regionX, regionZ, this.seed + 405) * 3);
        const vcz = regionZ * regionSize + 1 + Math.floor(hash2(regionX, regionZ, this.seed + 406) * 3);
        const x = vcx * CHUNK_SIZE + 8;
        const z = vcz * CHUNK_SIZE + 8;
        const biome = this.getBiome(x, z);
        if (biome === 'plains' || biome === 'savanna' || biome === 'desert') centers.push({ x, z, biome });
      }
    }
    return centers;
  }

  generateVillage(chunk) {
    const centers = this.getVillageCentersNear(chunk.cx, chunk.cz);
    for (const village of centers) {
      const layout = [
        [-8, -7], [7, -7], [-8, 7], [8, 8], [0, 12]
      ];
      for (let i = 0; i < layout.length; i += 1) {
        const [ox, oz] = layout[i];
        this.stampHouse(chunk, village.x + ox, village.z + oz, i % 2 === 0, village.biome);
      }
      this.stampVillagePaths(chunk, village);
      const minX = chunk.cx * CHUNK_SIZE;
      const minZ = chunk.cz * CHUNK_SIZE;
      if (village.x >= minX && village.x < minX + CHUNK_SIZE && village.z >= minZ && village.z < minZ + CHUNK_SIZE) {
        chunk.entities.push({ type: 'villager', x: village.x, z: village.z, homeX: village.x - 8, homeZ: village.z - 7 });
        chunk.entities.push({ type: 'villager', x: village.x + 2, z: village.z + 1, homeX: village.x + 7, homeZ: village.z - 7 });
        chunk.entities.push({ type: 'villager', x: village.x - 2, z: village.z + 2, homeX: village.x - 8, homeZ: village.z + 7 });
      }
    }
  }

  generateWildlife(chunk) {
    const centerX = chunk.cx * CHUNK_SIZE + 8;
    const centerZ = chunk.cz * CHUNK_SIZE + 8;
    const biome = this.getBiome(centerX, centerZ);
    const chance = hash2(chunk.cx, chunk.cz, this.seed + 1200);
    if (chance < 0.72 || ['desert', 'mountains'].includes(biome)) return;
    const type = biome === 'taiga' ? 'sheep' : chance > 0.88 ? 'boar' : 'sheep';
    for (let i = 0; i < 2; i += 1) {
      const x = centerX + Math.floor(hash2(chunk.cx + i, chunk.cz, this.seed + 1201) * 10 - 5);
      const z = centerZ + Math.floor(hash2(chunk.cx, chunk.cz + i, this.seed + 1202) * 10 - 5);
      chunk.entities.push({ type, x, z, homeX: x, homeZ: z });
    }
  }

  generateLandmark(chunk) {
    const chance = hash2(chunk.cx, chunk.cz, this.seed + 1700);
    if (chance < 0.955) return;
    const centerX = chunk.cx * CHUNK_SIZE + 8;
    const centerZ = chunk.cz * CHUNK_SIZE + 8;
    const biome = this.getBiome(centerX, centerZ);
    const baseY = this.terrainHeight(centerX, centerZ) + 1;
    if (biome === 'desert') {
      for (let layer = 0; layer < 4; layer += 1) {
        const radius = 5 - layer;
        for (let x = centerX - radius; x <= centerX + radius; x += 1) {
          for (let z = centerZ - radius; z <= centerZ + radius; z += 1) {
            if (Math.abs(x - centerX) === radius || Math.abs(z - centerZ) === radius || layer === 3) {
              this.setGenerated(chunk, x, baseY + layer, z, 'sand');
            }
          }
        }
      }
      this.setGenerated(chunk, centerX, baseY, centerZ, 'crystal');
      return;
    }
    for (let x = centerX - 3; x <= centerX + 3; x += 1) {
      for (let z = centerZ - 3; z <= centerZ + 3; z += 1) {
        const edge = Math.abs(x - centerX) === 3 || Math.abs(z - centerZ) === 3;
        if (!edge || hash2(x, z, this.seed + 1701) < 0.28) continue;
        const height = 1 + Math.floor(hash2(x, z, this.seed + 1702) * 4);
        for (let y = 0; y < height; y += 1) this.setGenerated(chunk, x, baseY + y, z, y % 2 ? 'brick' : 'cobble');
      }
    }
    this.setGenerated(chunk, centerX, baseY, centerZ, 'crystal');
  }

  stampHouse(chunk, centerX, centerZ, rotate, biome) {
    const width = rotate ? 5 : 7;
    const depth = rotate ? 7 : 5;
    const baseY = this.terrainHeight(centerX, centerZ) + 1;
    const wall = biome === 'desert' ? 'sand' : 'planks';
    for (let x = centerX - Math.floor(width / 2); x <= centerX + Math.floor(width / 2); x += 1) {
      for (let z = centerZ - Math.floor(depth / 2); z <= centerZ + Math.floor(depth / 2); z += 1) {
        this.setGenerated(chunk, x, baseY - 1, z, 'cobble');
        const edge = x === centerX - Math.floor(width / 2) || x === centerX + Math.floor(width / 2) ||
          z === centerZ - Math.floor(depth / 2) || z === centerZ + Math.floor(depth / 2);
        for (let y = baseY; y <= baseY + 3; y += 1) {
          if (!edge) continue;
          const door = z === centerZ + Math.floor(depth / 2) && x === centerX && y < baseY + 2;
          const window = y === baseY + 2 && ((x === centerX && Math.abs(z - centerZ) === Math.floor(depth / 2)) ||
            (z === centerZ && Math.abs(x - centerX) === Math.floor(width / 2)));
          if (!door) this.setGenerated(chunk, x, y, z, window ? 'glass' : wall);
        }
      }
    }
    for (let x = centerX - Math.floor(width / 2) - 1; x <= centerX + Math.floor(width / 2) + 1; x += 1) {
      for (let z = centerZ - Math.floor(depth / 2) - 1; z <= centerZ + Math.floor(depth / 2) + 1; z += 1) {
        const roofY = baseY + 4 + Math.floor(Math.min(
          Math.abs(x - (centerX - Math.floor(width / 2) - 1)),
          Math.abs(x - (centerX + Math.floor(width / 2) + 1)),
          Math.abs(z - (centerZ - Math.floor(depth / 2) - 1)),
          Math.abs(z - (centerZ + Math.floor(depth / 2) + 1))
        ) * 0.35);
        this.setGenerated(chunk, x, roofY, z, biome === 'desert' ? 'sand' : 'wood');
      }
    }
    this.setGenerated(chunk, centerX + 1, baseY, centerZ, 'hay');
  }

  stampVillagePaths(chunk, village) {
    for (let d = -14; d <= 14; d += 1) {
      for (let width = -1; width <= 1; width += 1) {
        const x = village.x + d;
        const z = village.z + width;
        this.setGenerated(chunk, x, this.terrainHeight(x, z), z, 'dirt');
        const x2 = village.x + width;
        const z2 = village.z + d;
        this.setGenerated(chunk, x2, this.terrainHeight(x2, z2), z2, 'dirt');
      }
    }
    for (let x = village.x - 5; x <= village.x + 5; x += 1) {
      for (let z = village.z + 13; z <= village.z + 17; z += 1) {
        this.setGenerated(chunk, x, this.terrainHeight(x, z), z, 'farmland');
      }
    }
  }

  isExposed(x, y, z) {
    return DIRECTIONS.some(([dx, dy, dz]) => !this.getBlock(x + dx, y + dy, z + dz));
  }

  rebuildChunk(cx, cz) {
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return;
    for (const mesh of chunk.meshes) {
      chunk.group.remove(mesh);
      this.instanceLookup.delete(mesh.uuid);
      const index = this.meshes.indexOf(mesh);
      if (index >= 0) this.meshes.splice(index, 1);
    }
    chunk.meshes = [];
    const byType = new Map(Object.keys(BLOCKS).map((type) => [type, []]));
    for (const [key, type] of chunk.blocks) {
      const [x, y, z] = key.split(',').map(Number);
      if (this.isExposed(x, y, z)) byType.get(type)?.push({ x, y, z });
    }
    const matrix = new THREE.Matrix4();
    for (const [type, positions] of byType) {
      if (!positions.length || !this.materials[type]) continue;
      const mesh = new THREE.InstancedMesh(this.geometry, this.materials[type], positions.length);
      mesh.userData.blockType = type;
      mesh.castShadow = !['leaves', 'glass'].includes(type);
      mesh.receiveShadow = true;
      positions.forEach((position, index) => {
        matrix.makeTranslation(position.x, position.y, position.z);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.instanceLookup.set(mesh.uuid, positions);
      chunk.meshes.push(mesh);
      this.meshes.push(mesh);
      chunk.group.add(mesh);
    }
  }

  getBlockFromIntersection(intersection) {
    const positions = this.instanceLookup.get(intersection.object.uuid);
    if (!positions || intersection.instanceId == null) return null;
    return { ...positions[intersection.instanceId], type: intersection.object.userData.blockType };
  }

  update(position) {
    const cx = floorDiv(position.x, CHUNK_SIZE);
    const cz = floorDiv(position.z, CHUNK_SIZE);
    const currentKey = chunkKey(cx, cz);
    if (currentKey !== this.lastPlayerChunk) {
      this.lastPlayerChunk = currentKey;
      const needed = [];
      for (let dz = -this.viewDistance; dz <= this.viewDistance; dz += 1) {
        for (let dx = -this.viewDistance; dx <= this.viewDistance; dx += 1) {
          if (!this.getChunk(cx + dx, cz + dz)) needed.push({ cx: cx + dx, cz: cz + dz, distance: Math.abs(dx) + Math.abs(dz) });
        }
      }
      needed.sort((a, b) => a.distance - b.distance);
      this.pending.push(...needed);
    }
    const chunksPerFrame = 6;
    for (let i = 0; i < chunksPerFrame && this.pending.length; i++) {
      const next = this.pending.shift();
      this.createChunk(next.cx, next.cz);
    }
    for (const [key, chunk] of this.chunks) {
      const distance = Math.max(Math.abs(chunk.cx - cx), Math.abs(chunk.cz - cz));
      if (distance > this.viewDistance + 3) {
        for (const mesh of chunk.meshes) {
          this.instanceLookup.delete(mesh.uuid);
          const index = this.meshes.indexOf(mesh);
          if (index >= 0) this.meshes.splice(index, 1);
        }
        this.group.remove(chunk.group);
        this.chunks.delete(key);
      }
    }
  }

  getNearbyEntitySpawns() {
    return [...this.chunks.values()].flatMap((chunk) => chunk.entities.map((entity) => ({ ...entity, chunk: chunkKey(chunk.cx, chunk.cz) })));
  }
}
