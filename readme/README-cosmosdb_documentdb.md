# MongoDB Atlas vs Cosmos DB vs DocumentDB — The Imitation Game

A deep technical comparison of **MongoDB Atlas** against the wire-protocol compatibility layers: **Azure Cosmos DB** (vCore & RU) and **Amazon DocumentDB**.

## What This Page Covers

### Architecture & Storage Engine
- WiredTiger (Atlas) vs custom engines (Cosmos ARS, Aurora-style DocumentDB)
- BSON handling, concurrency models, compression, replication, upgrade paths
- **Interactive architecture topology diagrams** — toggle between single replica set and sharded (2-shard) views across all four platforms
- Expandable explainer: "What is wire protocol emulation?"

### Scalability
- Horizontal scaling: Atlas unlimited shards vs Cosmos vCore 10-shard cap vs DocumentDB Elastic Clusters
- The 20 GB logical partition ceiling (Cosmos DB RU)
- Immutable partition keys vs Atlas online resharding
- Geo-distribution and auto-scaling

### Platform Features
- Feature matrix across 10 capabilities: Full-Text Search, Vector Search, Embedding & Reranking Models, Time Series, Change Streams, Aggregation Pipeline, Queryable Encryption, Stream Processing, Charts, Online Archive
- Highlights the "platform gap" — what requires separate services on Cosmos DB / DocumentDB that Atlas provides natively

### API & Wire Protocol Compatibility
- What "8.0 compatible" actually means (and doesn't)
- Driver support, mongosh/Compass, mongodump/mongorestore, transactions, indexes
- Missing aggregation stages listed per platform
- **Interactive code comparison** — same query ($graphLookup, $facet, $vectorSearch, cross-collection transaction) shown across all four platforms with actual error outputs

### The Fine Print — Real Limitations
- 15 limitation cards split by platform: immutable partition keys, 20 GB ceilings, unindexed operators, missing stages, no CSFLE, vendor lock-in
- **Interactive "What Happens When" scenario picker** — click a scenario (e.g., "partition exceeds 20 GB", "you need $facet") and see the impact across all platforms

### Observability & Monitoring
- Query profiler, real-time panel, index recommendations, audit logging, alerting, third-party integrations

### Enterprise Readiness
- SLAs, compliance, backup & PIT restore, HA & failover
- **Multi-region & active-active**: Atlas zone-based sharding vs Cosmos RU multi-write vs DocumentDB single-region writes
- Multi-cloud, encryption (including CSFLE), network isolation
- Developer experience and migration tooling (including Relational Migrator)

### Workload Fit Picker
- 7 workload types: E-Commerce, IoT/Time Series, Content Management, Financial/Regulated, Real-time Analytics, AI/RAG, Multi-Cloud
- Click a workload to see a fit assessment for each platform with color-coded verdicts

### Migration Risk Assessment
- Risk analysis for migrating from each competitor to Atlas
- Visual risk bars: Cosmos vCore (Medium), Cosmos RU (High), DocumentDB (Medium)
- The fundamental asymmetry: migrating TO Atlas gains features; migrating FROM Atlas loses them

## Interactive Elements

- **Platform filter toggles** — show/hide Cosmos DB vCore, Cosmos DB RU, and DocumentDB across all tables, diagrams, charts, and code blocks. MongoDB Atlas always visible
- **1-shard / 2-shard architecture diagram toggle**
- **"What Happens When" scenario picker** with animated result cards
- **Code comparison carousel** with tabbed query examples
- **Workload fit picker** with 7 selectable workload types
- **Animated hero stat counters**
- **Radar chart** (10 dimensions) and **bar chart** (9 platform features) with Chart.js

## Key Takeaway

> If you're building on MongoDB's query language, build on MongoDB's engine. Everything else is an approximation.
