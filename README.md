# Procedural City Generator

A deterministic procedural city simulation project. The current milestone generates terrain, a terrain-shaped road graph, road-bounded blocks and parcels, spatially coherent zoning, frontage-aligned buildings, and a separate fixed-timestep traffic simulation.

```text
same normalized seed + same generatorVersion = same generated world
same world + same traffic inputs + same tick count = same traffic state
```

## Run locally

Prerequisites: a current Node.js LTS release and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Enter a seed and choose **Generate**, or choose **Random seed**. The seed is stored in the URL, so reloads reproduce the same terrain, roads, urban structure, zoning, buildings, and initial traffic state. Drag to pan and use the mouse wheel to zoom.

The view selector exposes Buildings, Zoning, Development suitability, Parcels, Blocks, Elevation, Slope, Water/Land, and Road graph. Traffic starts paused. Use **Play traffic**, **Pause traffic**, **Reset**, the speed selector, and the target-vehicle selector to control it. Click a vehicle to highlight its planned route.

## Checks

```bash
npm test
npm run lint
npm run build
```

## Current status

- Phase 0 - Foundation: complete
- Phase 1 - Terrain: complete
- Phase 2 - Roads: complete
- Phase 3 - Urban Structure: complete
- Phase 3.5 - City Morphology Refinement: complete
- Phase 4 - Traffic Simulation Foundation: complete
- Phase 5 - Zoning & Buildings: complete

Phase 5 extends the static generation pipeline from parcels into explicit parcel zoning and building records. Zoning considers developability, terrain, water proximity, road access, centrality, parcel size/shape, and block-level land-use tendencies. Buildings use bounded frontage-aligned footprint attempts, zone-specific setbacks and coverage, strict parcel/terrain checks, and deterministic floor and floor-area metadata. World units are treated as meters; polygon and floor areas are square meters.

The generated-world version is now `phase-5.0`. Phase 4 traffic remains dynamic state outside `World`, retains its independent simulation seed domain, and only reads generated roads and urban data. Viewport or simulation interaction cannot alter generated geometry.

One simple rectangular building is generated at most per suitable parcel. Detailed architecture, lots with multiple structures, occupancy, residents, workplaces, trip purposes, lanes, and other population/economic systems are intentionally deferred.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the complete generation and simulation boundaries, deterministic RNG domains, data contracts, and current limitations.
