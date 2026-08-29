# Procedural City Generator

A deterministic procedural city simulation project. The codebase includes terrain, terrain-shaped graph-first roads, road-bounded blocks and parcels, and a fixed-timestep traffic foundation while preserving this world-generation contract:

```text
same seed + same generatorVersion = same world
```

## Run locally

Prerequisites: a current Node.js LTS release and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Enter a seed and choose **Generate**, or choose **Random seed**. The seed is stored in the URL, so reloads reproduce the same terrain, roads, blocks, parcels, and initial traffic state. Drag to pan, use the mouse wheel to zoom, and use the view selector to inspect Parcels, Blocks, terrain, or the road graph.

Traffic starts paused. Use **Play traffic**, **Pause traffic**, **Reset**, the speed selector, and the target vehicle selector to control the fixed-timestep simulation. Click a vehicle to highlight its planned route. Reset reproduces the initial traffic population for the current world seed and selected target count.

## Checks

```bash
npm test
npm run lint
npm run build
```

## Current status

- Phase 0 — Foundation: complete
- Phase 1 — Terrain: complete
- Phase 2 — Roads: complete
- Phase 3 — Urban Structure: complete
- Phase 3.5 — City Morphology Refinement: complete
- Phase 4 — Traffic Simulation Foundation: complete

Phase 4 derives a traffic-routing adapter from the existing roads, finds deterministic travel-time routes, spawns a modest seeded vehicle population near developed blocks, and advances it with a fixed simulation tick. Vehicles follow canonical road geometry, use basic headway and deterministic intersection admission, and expose reusable occupancy and trip metrics. World generation remains at `GENERATOR_VERSION` `phase-3.5`; traffic uses its own `phase-4.0` simulation seed domain so it cannot perturb generated terrain or city geometry.

Zoning, buildings, coastline/world-edge blocks, cadastral realism, bridges, citizens, commuting demand, congestion-aware rerouting, public transport, traffic signals, parking, economy, and emotional/environmental feedback are intentionally not implemented.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for generation architecture plus traffic routing, deterministic simulation, movement, interaction, metrics, and rendering boundaries.
