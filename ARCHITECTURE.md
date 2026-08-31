# Phase 6 Architecture

## Goal and deterministic contract

Procedural City Generator has a deterministic physical city, a separately initialized synthetic population, and a deterministic traffic simulation. Phase 6 derives homes, households, citizens, workplace capacity, and employment assignments from Phase 5 buildings without adding people to the immutable generated `World` or connecting them to traffic demand.

The project contract remains:

```text
(normalized seed, generator version) -> world
(world identity, population version) -> population state
```

For identical inputs, `generateWorld` and `generatePopulation` return deeply identical, JSON-serializable data. Neither has a clock, browser, React, rendering, viewport, or ambient random-state dependency.

`GENERATOR_VERSION` remains `phase-5.0`: Phase 6 does not change physical city generation. Population has an independent `phase-6.0` model version and derived seed domain; traffic retains its independent `phase-4.0` simulation version. Under the existing root-seed convention, only a deliberate generated-world version change creates new physical geometry for the same textual seed. Historical generators and save migrations remain deferred until persistence requirements are known.

## Modules and boundaries

```text
src/
  core/                         seed, RNG, geometry-independent primitives
  generation/
    terrain/                    Phase 1 heightfield generation
    roads/
      config.ts                 explicit Phase 3.5 morphology constants
      pathfinder.ts             generation-only terrain-aware A*
      refineRoadPath.ts         terrain-validated canonical route shaping
      roadGraphBuilder.ts       graph construction and intersection handling
      generateRoads.ts          anchors, arterials, and secondary loops
    urban/
      config.ts                 explicit Phase 3 geometry and parcel limits
      extractBlocks.ts          deterministic half-edge face traversal
      generateParcels.ts        safe recursive polygon subdivision
      generateUrbanStructure.ts subsystem composition and block-local RNG
    development/
      frontage.ts               parcel frontage-to-road resolution
      developmentTestFixtures.ts shared deterministic development fixtures
    zoning/
      config.ts                 explicit suitability and zoning thresholds
      generateZoning.ts         parcel suitability, block tendency, land use
    buildings/
      config.ts                 setbacks, coverage, floors, and area ratios
      footprintGeometry.ts      strict footprint sampling and containment
      generateBuildings.ts      frontage-aligned building generation
    generateWorld.ts            deterministic subsystem composition
  world/
    types.ts                    serializable generated-world contracts
    terrainQueries.ts           public world-space terrain access
    roadGeometry.ts             segment and projection primitives
    roadQueries.ts              graph lookups, nearest road, statistics
    polygonGeometry.ts          canonical polygon geometry and validation
    urbanQueries.ts             block/parcel lookups, containment, statistics
    morphologyQueries.ts        derived coverage and spatial-spread metrics
  rendering/
    terrainRelief.ts            pure fixed-light hillshade helpers
    canvasRenderer.ts           Canvas world visualization
    trafficRenderer.ts          stateless vehicle and selected-route drawing
    viewport.ts                 camera transforms
  population/
    types.ts                    serializable household/citizen/job contracts
    config.ts                   centralized capacity and demographic constants
    capacity.ts                 housing and workplace capacity derivation
    accessibility.ts            road access, components, network travel times
    households.ts               household composition and citizen generation
    employment.ts               reachable deterministic job assignment
    metrics.ts                  aggregate population metrics
    queries.ts                  citizen, household, workplace, occupancy lookup
    generatePopulation.ts       pure population-layer composition
  simulation/traffic/
    trafficNetwork.ts           read-only road-to-routing adapter
    routing.ts                  deterministic travel-time A*
    spawning.ts                 bounded seeded trip demand
    trafficSimulation.ts        pure fixed-tick movement and interaction
    trafficController.ts        clock, accumulator, controls, subscriptions
    trafficMetrics.ts           reusable aggregate traffic metrics
    vehicleQueries.ts           route-derived vehicle poses and progress
  app/, ui/, utils/             application and browser boundaries
```

Road and urban generation depend on terrain exclusively through `sampleTerrain` and terrain traversal queries. They do not read the heightfield arrays, import Canvas code, or depend on viewport state. Temporary graph mutation, A* state, route refinement, and half-edge traversal state are confined to generation; `World` receives only plain serializable arrays and objects.

## Road graph representation

`World.roads` is a `RoadGraph` containing:

```text
RoadNode { id, position }
RoadEdge { id, from, to, type, length }
RoadGraph { nodes, edges }
```

Every edge is a straight at-grade segment. Bends, snapped attachments, and geometric crossings are nodes. Edge endpoints reference node IDs, and length is the finite Euclidean world-space distance between them. This representation is directly usable for connectivity/routing and supplies planar segment geometry for future block extraction.

The two road classes are:

- `arterial`: the long-distance connected skeleton, with stronger slope and turn avoidance.
- `secondary`: shorter local loops attached to the arterial structure, intended to seed future block-forming connectivity.

Node and edge IDs use deterministic zero-padded generation counters such as `road-node-0000` and `road-edge-0000`. Edge splitting may leave unused counter values, but the resulting IDs remain stable for a seed/version pair. Random UUIDs are never used.

## RNG domains

The world root RNG is keyed by generator version and normalized seed. Roads receive an independent named domain:

```text
roads/v2
  anchors-v2
  morphology-v1/arterials
    anchor-##-##
      segment-###
  secondary-expansion-v1
    pair-priority-v1
    loop/<attachment-pair>
      morphology/side-<side>
        segment-###
urban/v1
  parcels-v1/block-####
    target-area
    subdivision-v1
zoning/v1
  block/<block-id>
    tendency
  parcel/<parcel-id>
    core-exception
    mixed-retention
    transition-exception
buildings/v1
  parcel/<parcel-id>
    footprint/coverage
    floor-jitter
```

Terrain remains under `terrain/v1`. Block extraction is deterministic and consumes no randomness. Each block's parcels use a block-local stream; because forks derive from immutable stream keys, generating another block or consuming an unrelated domain cannot shift existing parcel geometry. Zoning and buildings receive independent root domains and stable block/parcel forks. Their RNG consumption cannot perturb terrain, roads, parcels, each other, or traffic.

Population initialization derives a separate seed from `(generated-world version, normalized world seed, population version)`:

```text
population/phase-6.0
  households
    building/<building-id>/occupancy
    building/<building-id>/dwelling/<index>/size
  citizens
    household/<household-id>/composition
  employment
    preferences/home/<building-id>/workplace/<workplace-id>
    citizen/<citizen-id>/assignment-priority
    citizen/<citizen-id>/participation
    citizen/<citizen-id>/workplace-choice
```

Named entity streams derive from immutable parent IDs. Household composition changes cannot shift employment randomness, and no population RNG is consumed by the static world or traffic simulation.

## Regional anchors and arterial strategy

Arterial candidates are inspected on an explicit 100-unit world grid inside a 150-unit boundary margin. Candidates must be land with normalized slope at or below `0.5`. A primary anchor is chosen near the centroid of viable candidates. The usable world is then divided into a 3-by-2 set of broad regions; each viable region contributes its best low-slope representative when separation permits. Deterministic farthest-point selection fills the remaining budget of nine anchors with a 300-unit minimum separation.

All anchor pairs are ranked by distance with stable index tie-breaks. A deterministic disjoint-set spanning pass routes the shortest feasible links that join different anchor components. This avoids making every early regional connection radiate from the primary anchor while retaining regional connectivity. Failed pairs are skipped in favor of later feasible links rather than forcing a route through impassable terrain.

## Canonical road geometry refinement

Collinear A* steps are first simplified without introducing shortcuts. Direction changes are then rounded with short quadratic samples, and long straight runs receive one shallow deterministic bow. Arterial and secondary roads use separate radius and offset settings. The result is still a chain of straight canonical graph edges, not a renderer-only spline.

Every new chord is checked with the same terrain traversal policy and 25-unit sampling interval used by routing. If neither lateral direction is passable, the segment falls back to a collinear subdivision. No emitted chain segment exceeds the configured 180-unit cap, endpoints remain unchanged, and `RoadGraphBuilder` continues resolving every at-grade crossing into shared nodes.

## Terrain cost and deterministic A*

A* uses a 50-world-unit, eight-neighbor generation grid. Every candidate move is sampled through `sampleTerrain` at intervals no greater than 25 world units.

Water is fully impassable in Phase 2. Any sample with slope above `0.82` is also impassable. Remaining movement cost is:

```text
distance * (1 + slopePenalty * meanSquaredSlope) + turnPenalty
```

Arterials use slope penalty `12` and turn penalty `14`; secondaries use slope penalty `7` and turn penalty `6`. The stronger slope signal makes broad corridors respond more visibly to relief, while the lower turn penalties let A* choose useful gradual changes that the canonical refinement pass can shape. Slope comes from Phase 1 finite differences and is never generated independently.

Search state includes incoming direction so turn cost remains correct. The open-set comparator is explicit and stable: total cost, heuristic, grid index, then direction index. Equal tentative costs prefer the lower prior state index, and neighbor order is fixed. The search never relies on object enumeration or unstable heap behavior.

## Secondary-road strategy

Secondary attachment candidates include arterial nodes plus deterministic samples along long arterial edges. Nearby pairs 200–520 units apart receive stable pair-local priorities. The first attempt is chosen near the network center; later attempts maximize distance from successful loop midpoints with a bounded seeded jitter. This farthest-covered policy spends the loop budget across distinct arterial regions rather than wherever a global random ordering happens to succeed.

Each successful feature offsets both attachments by 105–205 units and routes three terrain-aware sections, producing a closed loop back to the arterial network. Up to fourteen loops are emitted with 190-unit midpoint spacing and a hard 180-pair attempt cap. A loop is added only if all three sections succeed; partial disconnected fragments are never emitted. The assembled loop receives the same canonical corner and long-run refinement as arterials.

## Snapping, intersections, and duplicates

`RoadGraphBuilder` applies explicit geometric policy:

- Endpoints within 8 units of a node snap to that node.
- Endpoints within 8 units of a segment snap to its projection and split that edge.
- Non-parallel at-grade crossings create a shared node and split both edge chains.
- Existing nodes lying on a new collinear segment split that candidate, preventing hidden overlap.
- Duplicate unordered endpoint pairs and segments shorter than 2 units are rejected.
- Intersection calculations use a deterministic `1e-7` tolerance.

Phase 2 has no grade separation, so geometric crossings cannot remain unrelated lines. Bridges are intentionally absent; water disconnects a route.

## Connectivity and queries

Arterials attach incrementally to the existing primary network. Secondary loops attach at both ends and remain part of that network. Candidate routes that cannot connect are omitted. Representative seeds produce one connected component; graph tests enforce meaningful connectivity and validate every reference, coordinate, ID, length, type, and crossing.

The public query layer provides node lookup, incident edges, degree, neighboring nodes, nearest point on a road, and derived statistics. Statistics include node/edge count, road length by class, component count, intersection count, and dead-end count. They are derived rather than duplicated in canonical world data.

## Urban world schema

`World.urban` contains plain serializable arrays. Coordinates and lengths use world-space meters; polygon, footprint, gross-floor, and usable-floor areas use square meters.

```text
UrbanStructure { blocks, parcels, zoning, buildings }
CityBlock {
  id, polygon, area, perimeter,
  boundaryRoadEdgeIds, parcelIds
}
Parcel {
  id, blockId, polygon, area, perimeter,
  frontageEdgeIndices
}
ParcelZoning {
  parcelId, blockId, zone, intensity, suitability
}
Building {
  id, parcelId, blockId, zone, use, footprint,
  footprintArea, floorCount, height,
  grossFloorArea, usableFloorArea,
  primaryFrontageEdgeIndex, frontageRoadEdgeId
}
```

Polygon rings use world-space coordinates, positive signed-area winding, and no repeated closing vertex. Equivalent rings are rotated to the lowest `(y, x)` vertex after duplicate and collinear-point cleanup. Blocks are sorted by centroid Y, centroid X, area, and canonical polygon key before receiving `block-####` IDs. Parcels receive block-scoped, centroid-sorted IDs such as `parcel-block-0003-002`.

`boundaryRoadEdgeIds` records the canonical road edges traversed around each block. `frontageEdgeIndices` records parcel boundary segments that overlap the original road-bounded block perimeter by at least four world units. Phase 5 resolves those sides back to canonical road-edge IDs without changing the parcel contract or introducing driveways and entrances.

## Deterministic face extraction

Every road edge becomes two directed half-edges. Outgoing half-edges are sorted by angle, destination Y/X, destination node ID, edge ID, and half-edge key, using the configured `1e-7` geometry epsilon. Traversal chooses the clockwise predecessor of the reverse half-edge, which enumerates each face exactly once under the selected coordinate convention.

Bounded faces have positive signed area. The unbounded exterior walk has negative signed area and is rejected explicitly; zero-area walks created by dangling trees are rejected as degenerate. This rule does not depend on discovery order or on choosing the largest face. Equivalent cycles are canonicalized and deduplicated.

The canonical `RoadGraph` is never changed. Temporary face rings collapse only redundant consecutive and collinear degree-two points; genuine degree-two bends remain polygon vertices. Coastlines, water edges, and world bounds are never introduced into the half-edge graph, so they cannot close a Phase 3 block.

## Block validation and terrain policy

Candidate blocks must have finite, simple, positive-area polygons with at least three vertices. The configured accepted area is `3,000` through `600,000` square world units. Self-intersections and degenerate rings are rejected.

Land validity is sampled on a deterministic 50-unit grid plus the polygon centroid when it lies inside the ring, exclusively through `sampleTerrain`. At least 70% of samples must be land. The road polygon is retained as-is; Phase 3 does not clip it against the coastline. A block that cannot subsequently produce a valid, frontaged parcel set is treated as unsuitable and omitted rather than storing invalid parcel geometry.

## Parcel subdivision

Each block is recursively clipped by an axis-aligned line. The longest bounding-box axis is tried first, followed by the alternate axis. Candidate cuts include a block-local seeded offset around the midpoint, fixed fallback ratios, and existing vertex coordinates, which helps decompose simple concave rings.

A split is accepted only when both children:

- are simple, finite polygons of at least `3,000` square units;
- meet a `0.1` minimum bounding-box aspect ratio;
- remain inside the parent polygon;
- conserve parent area within a `1e-6` relative tolerance; and
- retain at least one frontage segment on the original block boundary.

Subdivision targets a deterministic block-local area from `9,000` through `15,000` square units, permits final parcels up to `50,000`, and stops after eight levels. Unsafe cuts are skipped. The binary clipping construction gives exact coverage and non-overlapping interiors; final validation rejects a block if any resulting parcel violates size, shape, centroid containment, frontage, or land-centroid rules. Terrain is checked through `sampleTerrain`.

## Development suitability and zoning

Every valid parcel receives one `ParcelZoning` record. Its `DevelopmentSuitability` exposes a normalized score, developable flag, mean slope and elevation, water proximity, accessibility, centrality, and explicit constraints. Constraints identify invalid geometry, excessive water or slope, undersized or narrow parcels, and missing usable road frontage instead of silently pretending all parcels can support buildings.

Suitability samples canonical terrain queries at parcel centroids, vertices, and edge midpoints. It measures water around the centroid, frontage overlap with canonical roads, arterial access and nearby graph intersections, distance from the generated urban center, parcel area, and bounding-box shape. These inputs are deterministic and independent of the viewport.

Zoning is parcel-level but starts from a stable block profile, so adjacent parcels normally form coherent districts rather than independent color noise. The supported zones are residential, commercial, industrial, mixed-use, civic, and green/open space. Central accessible blocks favor commercial or mixed use, peripheral arterial-accessible large parcels can become industrial, and steep, water-exposed, constrained, or selected open-space blocks become green. A civic block designates its largest parcel as civic while neighboring parcels transition to mixed or residential uses. A deterministic lowest-suitability block fallback guarantees a coherent open-space district when no environmental or seeded profile selected one.

Development intensity is low, medium, or high and is derived from zone, centrality, accessibility, and suitability. It is coarse metadata for building massing and future capacity, not a legal planning code.

## Frontage-aligned building generation

Green and undevelopable parcels produce no building. Each remaining parcel gets at most one deterministic rectangular footprint. The frontage adapter resolves and orders viable parcel sides against the block's canonical boundary road edges. For each frontage, the generator establishes tangent and inward vectors, ray-casts toward the opposite parcel boundary, applies zone-specific front/side/rear setbacks, and tries a bounded 4-by-4 sequence of width/depth scales. Failed candidates are skipped; generation never loops indefinitely.

Footprints must be finite, simple, positive-area polygons of at least 180 square meters. Boundary and interior samples at four-meter spacing must remain inside the parcel. Terrain samples at ten-meter spacing must all be land and average no more than `0.5` normalized slope. These checks deliberately favor missing a difficult building over emitting invalid, underwater, or out-of-parcel geometry.

Coverage ranges, setbacks, floor ranges, and usable-area ratios differ by use. Floor count also responds deterministically to development intensity, centrality, access, and suitability. Height is `floorCount * 3.2` meters; gross floor area is footprint area times floors; usable floor area applies a use-specific circulation/service allowance. Stable building IDs derive from parcel IDs, and every record retains its primary parcel frontage index and canonical road-edge ID for future entrances and trip demand.

## Population state and version boundary

`PopulationState` is plain serializable data containing population version/seed, households, citizens, workplaces, building occupancy summaries, and aggregate metrics. It references stable Phase 5 building IDs but stores no building geometry and never becomes part of `World`.

A household records its home building and member citizen IDs. A citizen records age, life stage, workforce eligibility, labor-force participation, household/home IDs, employment status, and optional workplace/work-building IDs. A workplace is one abstract capacity pool per eligible building; it stores total capacity, filled jobs, worker IDs, and derived road access. No individual Job objects, companies, or schedules are created.

## Housing and workplace capacity

All assumptions are centralized in `population/config.ts`. One dwelling requires 95 square meters of residential usable floor area and has a defensive maximum resident capacity of five. Residential buildings allocate all usable area to housing. Mixed-use buildings partition usable area exactly once: 55% residential and 45% employment. Commercial, industrial, civic, and mixed-use employment areas use 55, 125, 65, and 70 square meters per worker respectively. Pure residential buildings have no job capacity, and pure commercial/industrial buildings have no housing capacity.

Each residential-capable building receives a deterministic occupancy target from 76% through 91% of dwelling capacity. One occupied dwelling creates one household. Household size follows a bounded weighted distribution: 22% one person, 32% two, 21% three, 20% four, and 5% five. Every citizen object represents one resident; there is no hidden population scaling factor.

## Households, citizens, and demographics

Household IDs derive from building ID and dwelling index. Citizen IDs derive from household ID and member index, so identities remain stable without UUIDs, clocks, or global random indices. Household composition is coarse but internally safe: single homes contain adults or older adults; pairs may contain adults, older adults, or one adult with a dependent; larger households contain one or two working-age adults, dependents, and occasional older relatives.

Numeric age maps to child (0–12), teen (13–17), working-age (18–64), or older-adult (65+). Only working-age citizens are workforce eligible. Non-working-age citizens use the explicit `not-working-age` employment status. No names, income, health, personality, social relationships, education, or emotional attributes are generated.

## Road access and employment allocation

The Phase 4 `TrafficNetwork` is reused as a read-only routing adapter. Each building resolves its canonical frontage road edge to the nearest endpoint node and a deterministic connected-component ID. A network-time Dijkstra pass runs once per home building, producing travel-time costs to workplace access nodes without retaining thousands of route objects.

Workplace preference lists rank reachable jobs by network travel time with a bounded stable pair-specific jitter. Each participating worker chooses among up to six nearby workplaces with remaining capacity; later ranked jobs provide a bounded fallback when those fill. This balances geographical plausibility and deterministic variation without an all-citizens-by-all-workplaces search. The labor-force participation target is 82%. A working-age citizen outside that deterministic participation draw is `not-in-labor-force`. A participant without a valid job because of capacity or connectivity is `unemployed`; an assigned participant is `employed`. Cross-component assignments are never made.

Employment creates assignments only. It does not create commute routes, vehicles, schedules, or traffic demand, and Phase 4 traffic remains synthetic.

## Occupancy indices and population metrics

Every Phase 5 building receives a `BuildingOccupancy` summary with residential/employment area shares, dwelling and resident capacity, occupied homes, residents, household IDs, job capacity, filled jobs, occupancy ratios, and optional road access/component IDs. These summaries support building-level rendering and future simulation without scanning citizens every frame.

Population metrics expose population, households, average household size, residential buildings used, dwelling/resident capacity, housing occupancy, working-age population, labor-force population, employed, unemployed, and not-in-labor-force populations, participation/employment/unemployment rates, job capacity, filled/vacant jobs, residents by zone, and filled jobs by building use. Employment and unemployment rates use labor-force participants as their denominator. Query functions provide citizen, household, workplace, building occupancy, building residents, and building workers by stable ID.

## Urban queries and statistics

The public query layer provides ID lookup, parcels and buildings by block, zoning and buildings by parcel, point containment, polygon centroids, and derived counts/areas. Urban statistics include block, parcel, and building counts, total gross floor area, and counts by zone. No spatial index is introduced at the current scale. Statistics are derived rather than duplicated in canonical world data.

`getMorphologyStatistics` adds lightweight tuning diagnostics without changing the world schema. It samples viable land through `sampleTerrain`, measures the fraction within 220 units of a road, compares road and block-centroid extents with viable-land extent, and reports long arterial edges. The configured 200-unit sample grid is deliberately coarse: these values support broad multi-seed regression checks, not gameplay or GIS analysis.

## Rendering and debug views

Canvas renders terrain, the selected aggregate layer, and finally roads and traffic. Population occupancy colors residential-capable buildings by occupied-dwelling ratio; Jobs/employment colors workplace buildings by filled-job ratio and marks capacity through the outline. Both consume `BuildingOccupancy`, never individual citizens. Buildings mode presents zone-colored footprints over subdued parcels. Zoning, Development suitability, Blocks, Parcels, Elevation, Slope, Water/Land, and Road graph remain available.

Elevation colors receive fixed-light hillshade derived from each cell's elevation gradient. The pure helper approximates a surface normal with explicit vertical exaggeration, ambient light, and a northwestern light vector. This derived brightness is deterministic and rendering-only: it does not modify elevation, slope, terrain queries, routing, or canonical world data. The stronger elevation view remains subtle beneath roads and urban overlays.

React memoizes one population initialization per generated world and displays only aggregate metrics. It does not store per-citizen UI state or update population each frame. Rendering never changes world or population data and is not consulted during generation or allocation.

## Static world and dynamic simulation boundary

`World` remains the plain, JSON-serializable physical city: terrain, roads, blocks, parcels, zoning, and buildings. `PopulationState` is a separate, currently static initialization layer containing identity, capacity, home/job assignments, occupancy summaries, and metrics. `TrafficSimulationState` is separate dynamic data containing clock and vehicle state. Neither population nor traffic becomes part of `World`; both only read canonical IDs and geometry through derived adapters.

The traffic controller is independent of React and Canvas. React owns controls and publishes throttled aggregate traffic metrics; it does not store per-frame vehicle arrays. Canvas subscribes to controller notifications and consumes aggregate population plus current traffic state for drawing. Neither rendering nor viewport state participates in traffic updates, population allocation, or physical-world generation.

## Traffic routing graph

`buildTrafficNetwork` adapts each valid canonical `RoadEdge` into stable forward and reverse `TrafficArc` records. Arcs reference the original edge ID and carry connectivity, road class, length, nominal speed, and travel-time cost. The source `RoadGraph` remains authoritative and is neither copied as new geometry nor mutated. The directional arc representation allows a future policy to omit illegal directions without changing generated roads.

Current road edges are straight canonical segments, so a vehicle pose is interpolated between the referenced endpoint nodes. If generated roads later store polyline geometry, the pose query is the single movement-facing boundary that must adopt cumulative polyline interpolation.

Trip endpoints prefer nodes on road edges bounding valid Phase 3 blocks. If fewer than two such nodes exist, the adapter safely falls back to all connected road nodes. This associates synthetic Phase 4 demand with developed city areas without inventing buildings, driveways, or citizen assignments.

## Deterministic routing and traffic RNG

Traffic routing uses A* with the initial explainable cost:

```text
arc cost = road edge length / nominal road-class speed
```

The Euclidean travel-time heuristic is admissible under the configured maximum speed. Outgoing arcs and heap ties have explicit stable ordering. Invalid node IDs and disconnected destinations return no route; an identical origin and destination returns a valid empty route. Spawning rejects unusable or too-short routes with fixed attempt and serial budgets rather than retrying indefinitely.

The simulation seed is derived from `(generator version, normalized world seed, traffic simulation version)`. Each vehicle serial and trip attempt receives a named RNG fork. Traffic consumes no ambient randomness and cannot shift terrain, road, block, or parcel RNG streams. For equal world seed, traffic version, target population, inputs, and tick count, complete traffic state is reproducible.

## Fixed-timestep clock and controls

`TrafficSimulationController` accumulates scaled real time and advances pure `stepTrafficSimulation` updates in fixed 0.05-second ticks. Render frames may arrive at different rates without changing tick results. A frame-delta clamp and bounded catch-up prevent an inactive browser tab from causing an unbounded update burst.

The controller exposes play, pause, toggle, reset, 0.5x/1x/2x/4x speed, and bounded target-population changes. Reset pauses, clears accumulated real time, and recreates the exact initial state for the current world seed and population target.

## Vehicle movement and traffic interaction

A `Vehicle` has a stable serial ID, origin and destination nodes, immutable planned route, current route-arc index and progress, current and desired speed, movement state, elapsed trip time, and distance travelled. Position and orientation are queries derived from the current arc rather than independent free-space physics.

Each tick groups vehicles by directed arc and sorts them once by progress. Followers use a minimum distance and time-gap target speed, then accelerate or brake toward that target. This avoids an all-pairs scan and prevents same-direction vehicles from collapsing onto one point.

Vehicles approaching a graph node of degree three or greater request deterministic intersection admission. At most one request per intersection wins each tick, ordered by stable vehicle ID, and only when the outgoing arc has entrance clearance. Other requesters stop short in a queued state. This is intentionally a minimal right-of-way foundation, not lanes or signal control.

Vehicles advance through any number of route arcs allowed by their tick distance and complete at their destination. Completed vehicles contribute trip-time totals and are replaced through the same deterministic bounded demand process. Missing or malformed route references fail safely instead of crashing the simulation.

## Traffic metrics and rendering

`getTrafficMetrics` exposes active vehicle count, completed trips, average current speed, average active-trip progress, average completed travel time, and per-directed-arc occupancy with source road-edge IDs. These are simulation queries available to future systems; the UI only formats their output.

The traffic renderer draws simple oriented vehicle markers after roads and urban overlays, transformed by the same world camera. Queued vehicles receive a distinct color. Selecting a vehicle draws its graph route. Pan, zoom, view mode, and render frequency cannot mutate the generated world or traffic state.

## Future simulation compatibility

Future phases can query stable citizen/household/workplace identities, home and work buildings, household composition, workforce eligibility, building capacity and occupancy, exact road access, network reachability, routing arcs, vehicle state, and segment occupancy without reconstructing Canvas geometry.

Schedules can assign home/work activities directly from Phase 6 references. A later trip-demand layer can request routes between stored building access nodes and deliberately translate selected citizen trips into traffic or transit demand. Congestion, travel time, noise, stress, and later behavioral systems can consume those explicit interfaces instead of scraping UI state.

## Intentionally deferred

Phase 6 does not implement daily schedules, activities, commute trips, population-driven traffic, schools as institutions, companies, professions, salaries, income, land value, rents, taxes, economic production, shopping, leisure, citizen movement, pedestrians, public transport, parking, migration, birth/death, relationships, health, personality, emotions, stress, noise, or pollution feedback. Existing physical-city limitations such as one building per parcel, no detailed architecture, bridges, grade separation, lanes, and coastline-generated blocks also remain. Opposing Phase 4 vehicles still share the visual road centerline. These are intentional scope boundaries.
