# Procedural City Generator

A deterministic procedural city simulation project. The current milestone generates a physical city, initializes a capacity-backed synthetic population, and runs a separate fixed-timestep traffic simulation.

```text
same normalized seed + same generatorVersion = same generated world
same world + same populationVersion = same population state
same world + same traffic inputs + same tick count = same traffic state
```

## Run locally

Prerequisites: a current Node.js LTS release and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Enter a seed and choose **Generate**, or choose **Random seed**. The seed is stored in the URL, so reloads reproduce the same physical city, population, employment assignments, and initial traffic state. Drag to pan and use the mouse wheel to zoom.

The view selector exposes Population occupancy, Jobs/employment, Buildings, Zoning, Development suitability, Parcels, Blocks, Elevation, Slope, Water/Land, and Road graph. The population metrics row reports residents, households, occupied homes, housing occupancy, working-age residents, labor-force participation, employment, unemployment, and job capacity. Traffic controls remain independent.

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
- Phase 6 - Population, Homes & Jobs: complete

The immutable generated world remains at `phase-5.0`. Phase 6 adds a separate `phase-6.0` population model derived from the normalized world seed, generated-world version, and its own RNG domain. Population initialization never changes terrain, roads, parcels, zoning, buildings, or synthetic traffic.

Housing and jobs are derived from building usable floor area. Residential buildings use all usable area for homes; mixed-use buildings partition it 55/45 between residential and employment capacity. One dwelling represents 95 square meters of residential usable area. Per-seed building occupancy ranges from 76–91%, and household sizes use a bounded one-to-five-person distribution. Commercial, industrial, civic, and mixed-use job capacities use documented use-specific area-per-worker assumptions.

Employment assignments use canonical building road frontage and the Phase 4 routing graph as a read-only accessibility service. Network travel times are computed per home building, with bounded deterministic choice among nearby reachable workplaces. Working-age citizens who do not enter the deterministic participation pool are `not-in-labor-force`; participants who cannot obtain a reachable job are `unemployed`; assigned participants are `employed`. Disconnected participating workers remain safely unemployed.

Each citizen agent represents one resident; no hidden population scale factor is used. Daily schedules, commute trips, population-driven traffic, schools, businesses, economy, movement, and emotional behavior remain intentionally deferred.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for complete contracts, RNG domains, capacity constants, allocation behavior, metrics, and current limitations.
