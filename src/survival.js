export class SurvivalSystem {
  constructor(mode = 'survival') {
    this.mode = mode;
    this.health = 20;
    this.hunger = 20;
    this.saturation = 5;
    this.exhaustion = 0;
    this.experience = 0;
    this.level = 0;
    this.tick = 0;
    this.onChange = null;
    this.onDeath = null;
    this.load();
  }

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem(`cuboroid-survival-${this.mode}`));
      if (saved) Object.assign(this, saved);
    } catch {
      // Ignore invalid local data and start with clean stats.
    }
  }

  save() {
    localStorage.setItem(`cuboroid-survival-${this.mode}`, JSON.stringify({
      health: this.health,
      hunger: this.hunger,
      saturation: this.saturation,
      experience: this.experience,
      level: this.level
    }));
  }

  exert(amount) {
    if (this.mode !== 'survival') return;
    this.exhaustion += amount;
    while (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else this.hunger = Math.max(0, this.hunger - 1);
      this.changed();
    }
  }

  damage(amount) {
    if (this.mode !== 'survival') return;
    this.health = Math.max(0, this.health - amount);
    if (window.audio && amount > 0) {
      window.audio.playHurt('player');
    }
    this.changed();
    if (this.health <= 0) this.onDeath?.();
  }

  heal(amount) {
    this.health = Math.min(20, this.health + amount);
    this.changed();
  }

  eat(food) {
    if (this.mode !== 'survival' || this.hunger >= 20) return false;
    this.hunger = Math.min(20, this.hunger + food);
    this.saturation = Math.min(8, this.saturation + food * 0.45);
    this.changed();
    return true;
  }

  addExperience(amount) {
    this.experience += amount;
    const needed = 8 + this.level * 5;
    if (this.experience >= needed) {
      this.experience -= needed;
      this.level += 1;
      if (window.audio) {
        window.audio.playLevelUp();
      }
    } else {
      if (window.audio && amount > 0) {
        window.audio.playXpOrb();
      }
    }
    this.changed();
  }

  update(delta) {
    if (this.mode !== 'survival') return;
    this.tick += delta;
    if (this.tick < 2) return;
    this.tick = 0;
    if (this.hunger >= 18 && this.health < 20) {
      this.heal(1);
      this.exert(1.5);
    } else if (this.hunger <= 0) {
      this.damage(1);
    }
    this.save();
  }

  changed() {
    this.save();
    this.onChange?.();
  }
}
