# Elasticsearch vs MongoDB Search — Competitive Intelligence Briefing

A Solutions Architect competitive briefing presented as a 15-slide interactive deck. Covers the Elastic ecosystem in depth, search-specific feature parity, and the conditions where MongoDB has the right to win.

**Duration:** 15–20 min + Q&A  
**Audience:** Solutions Architects  
**Format:** Full-screen scroll-snap slides with reveal animations and SVG diagrams

---

## Slide-by-Slide Breakdown

### Section 01 — The Elastic Ecosystem

**Elastic Product Portfolio**
- Three core solutions: Search, Observability, Security
- Each bundles Elasticsearch with purpose-built tooling (App Search, APM, SIEM, Endpoint)
- Key takeaway: establish early if the customer needs search within an OLTP app (our sweet spot) or observability/security/log analytics (Elastic's home turf)

**The Elastic Stack**
- Five layers: Beats/Elastic Agent → Logstash → Elasticsearch → Kibana
- SVG architecture diagram showing the full stack flow
- Component details: Fleet, EDOT (OpenTelemetry), 200+ Logstash plugins, ES|QL, Lens dashboards
- 300+ pre-built integrations marketplace (AWS, GCP, Azure, Kubernetes, Okta, etc.)

### Section 02 — Search Deep Dive

**Lucene Index Architecture**
- Side-by-side SVG diagram: Inverted Index (Elastic) vs B-Tree Index (MongoDB)
- Immutable segments: updates = delete + re-insert, segments merge periodically
- Shard model: primary shard count fixed at index creation, changing requires full reindex

**Field Types & Mappings**
- Comprehensive table of 20+ Elastic field types across 8 categories (Text, Numeric, Structured, Vector/AI, Geo, Specialty, Join, Ranking)
- MongoDB analogies for each type
- Key pain point: changing a field type requires reindexing the entire index
- Nested type is expensive with hard limits (50 fields, 10K objects)

**Aggregation Framework**
- Four categories: Bucket, Metric, Pipeline, Matrix & ML
- Pill-style enumeration of every aggregation type
- Honest assessment: Elastic's aggregation system is genuinely broader for statistical analytics (moving averages, percentiles, t-tests, derivatives)

**ILM & Advanced Features**
- Index Lifecycle Management visual: Hot → Warm → Cold → Frozen → Delete
- Doc Values & columnar storage explained
- Global Ordinals, Norms, and Similarity scoring (BM25)
- Index Templates and Component Templates

**Vector Search — Head to Head**
- Side-by-side SVG vector space visualization
- Both use HNSW via Lucene — the difference is operational, not algorithmic
- Elastic: dense_vector, byte/bit types, up to 4096 dims, quantization (int8, int4, BBQ), ELSER sparse encoder, RRF hybrid, semantic_text
- MongoDB: $vectorSearch as aggregation stage, chains with $match/$project/$lookup, pre-filtering, vectors alongside transactional data — no separate cluster

### Section 03 — Where MongoDB Wins

**The Sidecar Problem**
- SVG architecture diagram: App → OLTP DB + Elasticsearch with CDC/ETL sync pipeline
- The cost: two systems to operate, monitor, scale, secure; CDC pipeline to maintain; two query languages; two cost centers; two failure domains
- MongoDB with Atlas Search eliminates this entirely

**MongoDB's Right to Win**
- 8 advantage cards:
  1. ACID Transactions — Elastic has zero multi-doc transactions
  2. Consistency by Default — Elastic writes invisible for ~1s
  3. Single API (MQL) — no need for ES DSL, ES|QL, or Painless scripting
  4. Operational Simplicity — no shard-count decisions, no reindexing to rescale
  5. Flexible Schema — Elastic requires strict mappings
  6. Native Nested Data — Elastic flattens arrays, nested type is expensive
  7. Write Performance — sub-ms writes vs immutable segment creation
  8. Enterprise Security — client-side FLE, PITR, live resharding

**Feature Comparison Matrix**
- 16-row table comparing capabilities: ACID, consistency, write latency, full-text search, vector search, hybrid search, statistical aggs, schema flexibility, nested data, change streams, failover, PITR, FLE, live resharding, observability/SIEM, integrations

### Section 04 — Competitive Positioning

**When to Compete, When to Concede**
- Elastic is the right choice for: log analytics, SIEM/endpoint security, write-once/read-many, infrastructure monitoring, statistical aggregations
- MongoDB is the right choice for: OLTP + search, eliminating sidecar architecture, ACID + search, single API, deeply nested documents, write-heavy workloads, vector search for RAG/AI, enterprise security

**Battlecard — Key Talking Points**
- "When Elastic is used next to a DB" objections: two systems, data drift, two query languages
- "When Elastic is used as a database" objections: no ACID, worse than eventual consistency, destructive schema changes, nested data tax, 30-second failover
- One-liner summary for quick positioning

---

## Presentation Features

- **Scroll-snap slide system** with smooth transitions between 15 slides
- **Progress indicator** with slide counter and clickable dots
- **Keyboard navigation** (arrow keys)
- **Reveal animations** with staggered delays per element
- **SVG diagrams**: Elastic Stack flow, Inverted Index vs B-Tree, ILM lifecycle, Vector space, Sidecar architecture
- **Scrollable slides** for content-heavy sections (Field Types, Comparison Matrix, Battlecard)

## Key Takeaway

> If the customer needs an OLTP database with great search and vector search, they should use MongoDB. If they need a log analytics / observability / SIEM platform with search built in, Elastic is strong. We win when search is part of an operational application — not a standalone analytics layer.
