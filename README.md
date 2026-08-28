# Procedural City Generator

A deterministic procedural city simulation project. The codebase includes terrain, terrain-shaped graph-first roads, and road-bounded blocks and parcels while preserving this contract:

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
- Phase 3.5 — City Morphology Refinement: complete
- Phase 4 — Zoning and Buildings: next

Phase 3.5 distributes arterial anchors across viable regions, connects them without a single center-out spoke pattern, spreads secondary loops by uncovered region, and refines long routes into terrain-validated canonical graph chains with gradual bends. Elevation rendering now adds deterministic fixed-light hillshade, and lightweight morphology queries report viable-land road coverage and urban spread. `GENERATOR_VERSION` is `phase-3.5`.

Zoning, buildings, coastline/world-edge blocks, cadastral realism, bridges, traffic, agents, and later simulation systems are intentionally not implemented.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for road morphology, terrain relief, coverage diagnostics, face traversal, canonicalization, parcel/frontage policy, and RNG domains.
