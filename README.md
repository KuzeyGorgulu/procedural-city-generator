# Procedural City Generator

A deterministic procedural city simulation project. The current milestone generates a physical city, initializes a capacity-backed synthetic population, derives daily routines and commute plans, executes real citizen trips through a separate fixed-timestep traffic simulation, models explainable environmental and commute-related wellbeing, and closes its first controlled feedback loop through adaptive commute departure timing.

```text
same normalized seed + same generatorVersion = same generated world
same world + same populationVersion = same population state
same world + same population state + same mobilityVersion = same daily plans and commute demand
same world + same traffic inputs + same tick count = same traffic state
same world + same population + same wellbeingVersion = same environmental wellbeing baseline
same baseline + same completed commute events = same updated wellbeing state
same behavior input + same round outcomes = same next-round departure offsets
```

## Run locally

Prerequisites: a current Node.js LTS release and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Enter a seed and choose **Generate**, or choose **Random seed**. The seed is stored in the URL, so reloads reproduce the same physical city, population, employment assignments, daily plans, commute routes, and initial traffic state. Drag to pan and use the mouse wheel to zoom.

The view selector exposes Wellbeing, Population occupancy, Jobs/employment, Buildings, Zoning, Development suitability, Parcels, Blocks, Elevation, Slope, Water/Land, and Road graph. The Wellbeing view colors residential buildings by happiness, calm, stress, or tension. The compact wellbeing row reports aggregate scores; selecting a population commute vehicle exposes the associated citizen's environmental factors, completed-commute effect, planned departure, current effective departure, and learned next-round shift. The population metrics row reports residents, households, occupied homes, housing occupancy, working-age residents, labor-force participation, employment, unemployment, and job capacity. The traffic controls can run the original synthetic demand or deterministic morning/evening population commute waves. The Phase 9 controls compare adaptive and baseline demand, promote a completed wave to the next commute round, replay the frozen current run, or reset all adaptations to zero-offset Round 0.

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
- Phase 7 - Daily Routines & Population-Driven Mobility: complete
- Phase 8 - Wellbeing & Environmental Exposure Foundation: complete
- Phase 9 - Adaptive Commute Behavior & Feedback Loop: complete

The immutable generated world remains at `phase-5.0`, population remains at `phase-6.0`, mobility remains at `phase-7.0`, traffic retains its compatible `phase-4.0` engine boundary, and wellbeing remains `phase-8.0`. Phase 9 adds a separate `phase-9.0` behavior model. It never writes adaptive values into mobility plans or changes terrain, roads, parcels, zoning, buildings, population assignments, homes, jobs, schedules, or routes.

Housing and jobs are derived from building usable floor area. Residential buildings use all usable area for homes; mixed-use buildings partition it 55/45 between residential and employment capacity. One dwelling represents 95 square meters of residential usable area. Per-seed building occupancy ranges from 76–91%, and household sizes use a bounded one-to-five-person distribution. Commercial, industrial, civic, and mixed-use job capacities use documented use-specific area-per-worker assumptions.

Employment assignments use canonical building road frontage and the Phase 4 routing graph as a read-only accessibility service. Network travel times are computed per home building, with bounded deterministic choice among nearby reachable workplaces. Working-age citizens who do not enter the deterministic participation pool are `not-in-labor-force`; participants who cannot obtain a reachable job are `unemployed`; assigned participants are `employed`. Disconnected participating workers remain safely unemployed.

Each citizen record represents one resident; no hidden population scale factor is used. Every employed citizen receives a stable home-to-work and work-to-home trip template. Work times use clustered, bounded per-citizen RNG domains. Children, teenagers, unemployed citizens, and people outside the labor force remain home in this deliberately narrow routine model.

Commute templates retain daily planned minutes and immutable routes. Running a commute wave creates separate runtime states (`scheduled`, `queued`, `active`, `completed`, or `unreachable`) and admits eligible trips in planned-departure/ID order. Waiting trips are never silently dropped. A centralized maximum of 96 active population vehicles and four admissions per fixed tick bounds traffic work; backlog and maximum queue size remain observable. Runtime metrics include eligibility, queueing, completion, reachability, estimated distance/time, actual travel time, and queue wait time.

Environmental exposure is computed once per physical building and shared by resident/worker profiles. Phase 8 uses zoning-backed green proximity, nearby gross floor area, distance and road-class weighted road-noise proxies, existing household/building occupancy, and workplace exposure. Centralized weights produce bounded 0-100 stress, tension, calm, and happiness scores. Density only contributes above a documented comfort threshold; these are relative gameplay proxies, not medical or scientific claims.

Completed commute events apply once per scenario and citizen/trip ID. Expected route duration represents chronic burden; excess travel time and queue wait represent acute friction, with tension responding most and happiness changing most slowly. Resetting traffic or changing demand mode restores the deterministic environmental baseline. Simulation FPS, wall-clock time, viewport actions, and React render frequency do not affect wellbeing outcomes.

Phase 9 models lightweight experimental **commute rounds**, not calendar days. Round 0 has zero offsets and reproduces the immutable Phase 7 departures. A completed trip creates one idempotent behavior event; unexpected delay and queue wait dominate its adaptation pressure, with smaller chronic-distance, acute-tension, and stress contributions. A poor commute learns an integer-minute earlier departure gradually, capped at 25 minutes earlier and at six newly learned minutes per round. Smooth pressure at or below the recovery threshold moves an existing offset three minutes toward baseline; an explicit deadband keeps near-normal outcomes stable.

Current and learned-next offsets are separate fields. Demand for Round N is frozen before traffic starts, so a completion cannot change any queued trip in the same wave. Only **Advance next round** promotes the learned offset for that morning or evening purpose and builds a new effective-departure catalog. **Reset current run** replays the same frozen inputs; **Reset adaptations** clears both purpose-specific rounds and all offsets. Disabling adaptive departures ignores stored offsets and exactly restores planned Phase 7 departure minutes. Synthetic traffic creates no wellbeing provenance, behavior events, or round advancement.

Route choice, schedule flexibility beyond commute departure, personality, driving-style changes, relocation, job switching, schools, shopping/leisure trips, pedestrians, public transport, businesses, economy, migration, health simulation, social behavior, and city growth remain intentionally deferred.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for complete contracts, RNG domains, capacity constants, allocation behavior, metrics, and current limitations.
