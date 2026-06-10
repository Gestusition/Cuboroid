# Cuboroid

> ⚠️ **Alpha Release** — This is an experimental, Minecraft-inspired voxel project built entirely in the browser. Expect bugs, missing features, and frequent changes.

A browser-based voxel survival game powered by [Three.js](https://threejs.org/) and deployed on GitHub Pages. Cuboroid explores procedural world generation, survival mechanics, and real-time 3D rendering — all without any native downloads.

## 🎮 Features

- **Infinite procedural world** with chunk loading/unloading around the player
- **6 biomes** — Plains, Forest, Desert, Taiga, Savanna, and Mountains
- **World structures** — Caves, ores, villages, farms, ruins, and desert temples
- **Day/night cycle** with dynamic sun, moon, stars, fog, and water
- **NPCs & Mobs** — Villagers that work by day and return home at night, hostile enemies that spawn at night, passive sheep and wild boars
- **Survival & Creative modes**
- **Survival mechanics** — Health, hunger, saturation, XP, nutrition, and fall damage
- **Inventory system** — 27-slot inventory, 9-slot hotbar, tool durability, and crafting recipes
- **Player actions** — Block breaking/placing, swimming, sprinting, jumping, and Creative flight
- **Procedural audio** — Synthesized footsteps, block interactions, mob sounds, and ambient music
- **Local save system** — World, inventory, and player state saved in the browser

## 🚀 Getting Started

```bash
npm install
npm run dev
```

## 🎹 Controls

| Key | Action |
|-----|--------|
| `W A S D` | Move |
| `Space` | Jump / Swim |
| `Shift` | Sprint |
| `Double Space` | Toggle flight (Creative) |
| `Ctrl` | Descend while flying |
| `Left Click` | Break block / Attack mob |
| `Right Click` | Place block / Eat food / Trade with villager |
| `1-9` or `Scroll` | Hotbar selection |
| `E` | Inventory & Crafting |
| `H` | Photo mode |
| `Esc` | Pause |

## 📦 Deployment

This project auto-deploys to GitHub Pages via GitHub Actions on every push to `main`. To set it up in your own fork, go to **Settings > Pages > Source** and select **GitHub Actions**.

## 📝 License

[MIT](LICENSE)
