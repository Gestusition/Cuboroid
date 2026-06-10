export const ITEMS = {
  grass: { name: 'Çim', color: '#638f3c', placeable: true },
  dirt: { name: 'Toprak', color: '#79563a', placeable: true },
  stone: { name: 'Taş', color: '#777d80', placeable: true },
  sand: { name: 'Kum', color: '#d1b775', placeable: true },
  wood: { name: 'Kütük', color: '#765238', placeable: true },
  leaves: { name: 'Yaprak', color: '#3f6b31', placeable: true },
  cobble: { name: 'Kırıktaş', color: '#6e7371', placeable: true },
  planks: { name: 'Tahta', color: '#a87543', placeable: true },
  brick: { name: 'Taş Tuğla', color: '#6f6260', placeable: true },
  glass: { name: 'Cam', color: '#a9dcda', placeable: true },
  coal: { name: 'Kömür', color: '#333636' },
  iron: { name: 'Ham Demir', color: '#9a745e' },
  crystal: { name: 'Kristal', color: '#5deaf1', placeable: true },
  snow: { name: 'Kar', color: '#e5eeee', placeable: true },
  cactus: { name: 'Kaktüs', color: '#3e8051', placeable: true },
  hay: { name: 'Saman', color: '#d0aa36', placeable: true },
  meat: { name: 'Pişmiş Et', color: '#9f4f3c', food: 7 },
  wool: { name: 'Yün', color: '#e1ded1' },
  apple: { name: 'Elma', color: '#c94135', food: 4 },
  bread: { name: 'Ekmek', color: '#d4a55a', food: 6 },
  berry: { name: 'Orman Meyvesi', color: '#8d3d69', food: 2 },
  wooden_pickaxe: { name: 'Tahta Kazma', color: '#ad794a', tool: 'pickaxe', power: 2, durability: 60 },
  stone_pickaxe: { name: 'Taş Kazma', color: '#7c817f', tool: 'pickaxe', power: 3, durability: 132 },
  wooden_axe: { name: 'Tahta Balta', color: '#ad794a', tool: 'axe', power: 2, durability: 60 },
  stone_axe: { name: 'Taş Balta', color: '#7c817f', tool: 'axe', power: 3, durability: 132 },
  sword: { name: 'Taş Kılıç', color: '#aeb6b5', tool: 'weapon', power: 5, durability: 160 }
};

export const RECIPES = [
  { id: 'planks', name: 'Tahta x4', output: ['planks', 4], ingredients: { wood: 1 } },
  { id: 'bread', name: 'Ekmek', output: ['bread', 1], ingredients: { hay: 1 } },
  { id: 'wooden_pickaxe', name: 'Tahta Kazma', output: ['wooden_pickaxe', 1], ingredients: { planks: 5 } },
  { id: 'wooden_axe', name: 'Tahta Balta', output: ['wooden_axe', 1], ingredients: { planks: 4 } },
  { id: 'stone_pickaxe', name: 'Taş Kazma', output: ['stone_pickaxe', 1], ingredients: { cobble: 3, planks: 2 } },
  { id: 'stone_axe', name: 'Taş Balta', output: ['stone_axe', 1], ingredients: { cobble: 3, planks: 2 } },
  { id: 'sword', name: 'Taş Kılıç', output: ['sword', 1], ingredients: { cobble: 2, planks: 1 } },
  { id: 'brick', name: 'Taş Tuğla x4', output: ['brick', 4], ingredients: { stone: 4 } }
];

export class Inventory {
  constructor(mode = 'survival') {
    this.mode = mode;
    this.size = 27;
    this.slots = Array.from({ length: this.size }, () => null);
    this.selected = 0;
    this.load();
    if (!this.slots.some(Boolean)) this.seed();
  }

  seed() {
    if (this.mode === 'creative') {
      Object.keys(ITEMS).filter((id) => ITEMS[id].placeable).slice(0, 18).forEach((id, index) => {
        this.slots[index] = { id, count: 64 };
      });
    } else {
      this.slots[0] = { id: 'wooden_pickaxe', count: 1, durability: 60 };
      this.slots[1] = { id: 'apple', count: 3 };
    }
  }

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(`cuboroid-inventory-${this.mode}`));
      if (saved?.slots) {
        this.slots = saved.slots;
        this.selected = saved.selected || 0;
      }
    } catch {
      // A corrupt local save should not block a new world.
    }
  }

  save() {
    localStorage.setItem(`cuboroid-inventory-${this.mode}`, JSON.stringify({ slots: this.slots, selected: this.selected }));
  }

  count(id) {
    return this.slots.reduce((total, slot) => total + (slot?.id === id ? slot.count : 0), 0);
  }

  add(id, count = 1) {
    if (!ITEMS[id]) return false;
    let remaining = count;
    for (const slot of this.slots) {
      if (slot?.id === id && slot.count < 64 && !ITEMS[id]?.tool) {
        const amount = Math.min(64 - slot.count, remaining);
        slot.count += amount;
        remaining -= amount;
        if (!remaining) break;
      }
    }
    while (remaining > 0) {
      const index = this.slots.findIndex((slot) => !slot);
      if (index < 0) break;
      const amount = ITEMS[id]?.tool ? 1 : Math.min(64, remaining);
      this.slots[index] = { id, count: amount, ...(ITEMS[id]?.durability ? { durability: ITEMS[id].durability } : {}) };
      remaining -= amount;
    }
    this.save();
    return remaining === 0;
  }

  remove(id, count = 1) {
    if (this.mode === 'creative') return true;
    if (this.count(id) < count) return false;
    let remaining = count;
    for (let i = this.slots.length - 1; i >= 0; i -= 1) {
      const slot = this.slots[i];
      if (slot?.id !== id) continue;
      const amount = Math.min(slot.count, remaining);
      slot.count -= amount;
      remaining -= amount;
      if (slot.count <= 0) this.slots[i] = null;
      if (!remaining) break;
    }
    this.save();
    return true;
  }

  useSelected(amount = 1) {
    const slot = this.slots[this.selected];
    if (!slot || this.mode === 'creative') return;
    if (ITEMS[slot.id]?.durability) {
      slot.durability -= amount;
      if (slot.durability <= 0) this.slots[this.selected] = null;
    } else {
      slot.count -= amount;
      if (slot.count <= 0) this.slots[this.selected] = null;
    }
    this.save();
  }

  canCraft(recipe) {
    return Object.entries(recipe.ingredients).every(([id, count]) => this.mode === 'creative' || this.count(id) >= count);
  }

  craft(recipe) {
    if (!this.canCraft(recipe)) return false;
    for (const [id, count] of Object.entries(recipe.ingredients)) this.remove(id, count);
    this.add(recipe.output[0], recipe.output[1]);
    return true;
  }
}
