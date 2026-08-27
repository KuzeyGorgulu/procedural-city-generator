# Procedural City Generator

A deterministic procedural city simulation project. The codebase includes terrain, graph-first roads, and road-bounded blocks and parcels while preserving this contract:

```text
same seed + same generatorVersion = same world
```

## Run locally

Prerequisites: a current Node.js LTS release and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Enter a seed and choose **Generate**, or choose **Random seed**. The seed is stored in the URL, so reloads reproduce the same terrain, roads, blocks, and parcels. Drag to pan, use the mouse wheel to zoom, and use the view selector to inspect Parcels, Blocks, terrain, or the road graph.

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
- Phase 4 — Zoning and Buildings: next

Phase 3 adds deterministic half-edge face extraction, canonical road-bounded blocks, terrain-aware block validation, block-local parcel subdivision, explicit frontage metadata, urban queries/statistics, and Canvas block/parcel inspection. `GENERATOR_VERSION` is `phase-3.0`.

Zoning, buildings, coastline/world-edge blocks, cadastral realism, bridges, traffic, agents, and later simulation systems are intentionally not implemented.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for face traversal, canonicalization, parcel/frontage policy, RNG domains, and prior terrain/road architecture.
