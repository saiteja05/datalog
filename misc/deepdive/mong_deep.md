# Deep Dive: MongoDB Index Architecture and Storage Internals

## Executive Summary

This document provides a graduate-level (500) analysis of MongoDB's index storage internals, focusing on:
- How WiredTiger stores documents and indexes
- Primary (`_id`) vs secondary index mechanics
- MVCC implementation and its efficiency advantages
- Schema flexibility and index adaptations
- Time series collection optimizations

PostgreSQL is referenced minimally to highlight why MongoDB's design choices matter.

---

## Part 1: WiredTiger Storage Architecture

### 1.1 The B-tree Foundation

MongoDB uses WiredTiger as its storage engine. Unlike traditional databases that separate "heap" storage from indexes, WiredTiger uses B-trees for everything.

```
┌─────────────────────────────────────────────────────────────────┐
│                   WIREDTIGER ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   COLLECTION (Documents stored in B-tree):                      │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Key: RecordId (64-bit logical identifier)              │   │
│   │  Value: BSON document                                   │   │
│   │                                                          │   │
│   │  ┌──────────────────────────────────────────────────┐   │   │
│   │  │ RecordId: 1 → { _id: ObjectId("..."), name: "A" }│   │   │
│   │  │ RecordId: 2 → { _id: ObjectId("..."), name: "B" }│   │   │
│   │  │ RecordId: 3 → { _id: ObjectId("..."), name: "C" }│   │   │
│   │  └──────────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   INDEX (Separate B-tree per index):                            │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Key: indexed field value(s)                            │   │
│   │  Value: RecordId (pointer to collection B-tree)         │   │
│   │                                                          │   │
│   │  ┌──────────────────────────────────────────────────┐   │   │
│   │  │ "A" → RecordId: 1                                │   │   │
│   │  │ "B" → RecordId: 2                                │   │   │
│   │  │ "C" → RecordId: 3                                │   │   │
│   │  └──────────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 RecordId: The Stable Logical Identifier

This is a **critical design choice** that differentiates MongoDB from traditional RDBMS.

```
┌─────────────────────────────────────────────────────────────────┐
│                    RECORDID PROPERTIES                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   RecordId characteristics:                                     │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ • 64-bit logical identifier                             │   │
│   │ • Assigned at document insertion                        │   │
│   │ • NEVER changes during document lifetime                │   │
│   │ • Survives updates, compaction, rebalancing             │   │
│   │ • NOT a physical disk address                           │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Why this matters:                                             │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Traditional RDBMS (e.g., PostgreSQL):                   │   │
│   │   • Uses physical address (page, offset) in indexes     │   │
│   │   • UPDATE moves row → address changes                  │   │
│   │   • ALL indexes must be updated on every row move       │   │
│   │                                                          │   │
│   │ MongoDB:                                                │   │
│   │   • RecordId is logical, never changes                  │   │
│   │   • UPDATE modifies document in place                   │   │
│   │   • Only indexes on MODIFIED fields need updating       │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Result: Dramatically lower write amplification               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 Document Storage in B-tree Leaves

```
┌─────────────────────────────────────────────────────────────────┐
│                  B-TREE LEAF PAGE STRUCTURE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   WiredTiger leaf page:                                         │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Page Header                                             │   │
│   │ ┌─────────────────────────────────────────────────────┐ │   │
│   │ │ checksum │ flags │ memory_size │ entries │ ...     │ │   │
│   │ └─────────────────────────────────────────────────────┘ │   │
│   │                                                          │   │
│   │ Key-Value Entries (sorted by key):                      │   │
│   │ ┌─────────────────────────────────────────────────────┐ │   │
│   │ │ RecordId=1: {BSON document + version info}         │ │   │
│   │ │ RecordId=2: {BSON document + version info}         │ │   │
│   │ │ RecordId=3: {BSON document + version info}         │ │   │
│   │ │ ...                                                 │ │   │
│   │ └─────────────────────────────────────────────────────┘ │   │
│   │                                                          │   │
│   │ Version chains (for MVCC, in-memory during active txns):│   │
│   │ ┌─────────────────────────────────────────────────────┐ │   │
│   │ │ RecordId=1:                                         │ │   │
│   │ │   [ts=100→∞: current_doc]                          │ │   │
│   │ │   [ts=50→100: old_version] ← for in-flight reads   │ │   │
│   │ └─────────────────────────────────────────────────────┘ │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Key insight: Version information stored WITH the document,   │
│   not in a separate location. Visibility is self-contained.    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 2: Primary Index (`_id`) vs Secondary Indexes

### 2.1 The `_id` Index — Unique Primary Identifier

```
┌─────────────────────────────────────────────────────────────────┐
│                      _id INDEX STRUCTURE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Every collection has a mandatory _id index:                   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ db.users.createIndex({ _id: 1 })  // Implicit, always   │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Index B-tree structure:                                       │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    Root Page                             │   │
│   │              ┌──────┴──────┐                             │   │
│   │         Branch         Branch                            │   │
│   │        ┌──┴──┐        ┌──┴──┐                            │   │
│   │      Leaf  Leaf     Leaf  Leaf                           │   │
│   │                                                          │   │
│   │   Leaf entries:                                          │   │
│   │   ┌──────────────────────────────────────────────────┐   │   │
│   │   │ _id: ObjectId("507f1f77") → RecordId: 1          │   │   │
│   │   │ _id: ObjectId("507f1f78") → RecordId: 2          │   │   │
│   │   │ _id: ObjectId("507f1f79") → RecordId: 3          │   │   │
│   │   └──────────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Properties:                                                   │
│   • Unique constraint enforced                                  │
│   • Cannot be dropped                                           │
│   • Supports efficient point lookups by _id                     │
│   • ObjectId provides rough time-ordering (first 4 bytes = ts)  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Secondary Indexes

```
┌─────────────────────────────────────────────────────────────────┐
│                   SECONDARY INDEX MECHANICS                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   db.users.createIndex({ email: 1 })                            │
│                                                                  │
│   Creates separate B-tree:                                      │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Key: email value                                        │   │
│   │ Value: RecordId                                         │   │
│   │                                                          │   │
│   │   "alice@example.com" → RecordId: 1                     │   │
│   │   "bob@example.com"   → RecordId: 2                     │   │
│   │   "carol@example.com" → RecordId: 3                     │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Query execution:                                              │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ db.users.find({ email: "alice@example.com" })           │   │
│   │                                                          │   │
│   │ 1. Traverse email index B-tree                          │   │
│   │    → Find leaf: "alice@example.com" → RecordId: 1       │   │
│   │                                                          │   │
│   │ 2. Lookup RecordId=1 in collection B-tree               │   │
│   │    → Return full document                               │   │
│   │                                                          │   │
│   │ Total: ~4-6 page reads (index traverse + doc fetch)     │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Compound Indexes

```
┌─────────────────────────────────────────────────────────────────┐
│                     COMPOUND INDEX STRUCTURE                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   db.orders.createIndex({ customer_id: 1, order_date: -1 })     │
│                                                                  │
│   Index entries sorted by compound key:                         │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ (customer_id=1, order_date=2024-03-15) → RecordId: 100  │   │
│   │ (customer_id=1, order_date=2024-03-10) → RecordId: 95   │   │
│   │ (customer_id=1, order_date=2024-03-05) → RecordId: 88   │   │
│   │ (customer_id=2, order_date=2024-03-14) → RecordId: 99   │   │
│   │ (customer_id=2, order_date=2024-03-12) → RecordId: 97   │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Prefix rule — index supports queries on:                      │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ ✓ { customer_id: 1 }                    // Uses index   │   │
│   │ ✓ { customer_id: 1, order_date: ... }   // Uses index   │   │
│   │ ✗ { order_date: ... }                   // Cannot use   │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Sort optimization:                                            │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ db.orders.find({ customer_id: 1 })                      │   │
│   │           .sort({ order_date: -1 })                     │   │
│   │                                                          │   │
│   │ → Index already sorted! No in-memory sort needed.       │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.4 Covered Queries (Index-Only Execution)

```
┌─────────────────────────────────────────────────────────────────┐
│                      COVERED QUERIES                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Index: { email: 1, status: 1 }                                │
│                                                                  │
│   COVERED (no collection fetch needed):                         │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ db.users.find(                                          │   │
│   │   { email: "alice@example.com" },                       │   │
│   │   { email: 1, status: 1, _id: 0 }  // projection        │   │
│   │ )                                                       │   │
│   │                                                          │   │
│   │ All requested fields are IN the index.                  │   │
│   │ Result returned directly from index B-tree.             │   │
│   │ No RecordId lookup, no collection access.               │   │
│   │                                                          │   │
│   │ explain() shows: "stage": "IXSCAN" with no FETCH        │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   NOT COVERED (requires collection fetch):                      │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ db.users.find(                                          │   │
│   │   { email: "alice@example.com" },                       │   │
│   │   { email: 1, name: 1 }  // 'name' not in index         │   │
│   │ )                                                       │   │
│   │                                                          │   │
│   │ Must fetch document from collection to get 'name'.      │   │
│   │ explain() shows: "stage": "FETCH" after IXSCAN          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   MongoDB advantage: No visibility map needed.                  │
│   (Traditional RDBMS requires "all-visible" page status        │
│   for index-only scans; MongoDB's MVCC is self-contained.)     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 3: MVCC — Multi-Version Concurrency Control

### 3.1 WiredTiger's Timestamp-Based MVCC

```
┌─────────────────────────────────────────────────────────────────┐
│                  WIREDTIGER MVCC MODEL                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Core concept: Each document version has timestamps            │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ start_ts: When this version became valid                │   │
│   │ stop_ts:  When this version was superseded (or ∞)       │   │
│   │                                                          │   │
│   │ A read at timestamp T sees version where:               │   │
│   │   start_ts ≤ T < stop_ts                                │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Example — document update sequence:                           │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ T=50:  Insert { name: "Alice" }                         │   │
│   │        → Version 1: start_ts=50, stop_ts=∞              │   │
│   │                                                          │   │
│   │ T=100: Update to { name: "Alicia" }                     │   │
│   │        → Version 1: start_ts=50, stop_ts=100            │   │
│   │        → Version 2: start_ts=100, stop_ts=∞             │   │
│   │                                                          │   │
│   │ Reader at T=75:  sees Version 1 (Alice)                 │   │
│   │ Reader at T=150: sees Version 2 (Alicia)                │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   KEY ADVANTAGE: Visibility determined locally                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ • Timestamps stored WITH the document                   │   │
│   │ • No external "commit log" lookup required              │   │
│   │ • Single page read contains all visibility info         │   │
│   │                                                          │   │
│   │ Compare to traditional RDBMS:                           │   │
│   │ • Version info in separate "heap"                       │   │
│   │ • Must lookup external commit log (pg_xact)             │   │
│   │ • Additional I/O for visibility checks                  │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Version Chain in Memory

```
┌─────────────────────────────────────────────────────────────────┐
│                 IN-MEMORY VERSION CHAIN                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   During active transactions, versions are chained:             │
│                                                                  │
│   Collection B-tree leaf page (in cache):                       │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ RecordId=1:                                             │   │
│   │ ┌─────────────────────────────────────────────────────┐ │   │
│   │ │ CURRENT VERSION                                     │ │   │
│   │ │ start_ts=100, stop_ts=∞                             │ │   │
│   │ │ { _id: 1, name: "Alicia", email: "a@ex.com" }       │ │   │
│   │ └───────────────────────────┬─────────────────────────┘ │   │
│   │                             │ older version pointer     │   │
│   │                             ▼                           │   │
│   │ ┌─────────────────────────────────────────────────────┐ │   │
│   │ │ PREVIOUS VERSION                                    │ │   │
│   │ │ start_ts=50, stop_ts=100                            │ │   │
│   │ │ { _id: 1, name: "Alice", email: "a@ex.com" }        │ │   │
│   │ └───────────────────────────┬─────────────────────────┘ │   │
│   │                             │                           │   │
│   │                             ▼                           │   │
│   │                     (older versions...)                 │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Transaction reads at snapshot timestamp T:                    │
│   1. Access RecordId in collection B-tree                       │
│   2. Walk version chain to find: start_ts ≤ T < stop_ts         │
│   3. Return that version's document                             │
│                                                                  │
│   All in same B-tree page — no external lookups!                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Automatic Version Cleanup

```
┌─────────────────────────────────────────────────────────────────┐
│              AUTOMATIC VERSION GARBAGE COLLECTION                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Unlike traditional RDBMS, MongoDB has NO explicit "VACUUM"    │
│                                                                  │
│   EVICTION (cache pressure triggers):                           │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ 1. WiredTiger cache reaches threshold                   │   │
│   │ 2. Eviction thread selects dirty pages                  │   │
│   │ 3. RECONCILIATION process:                              │   │
│   │    a. Check oldest_timestamp (oldest active snapshot)   │   │
│   │    b. Discard versions where stop_ts < oldest_timestamp │   │
│   │       (No active transaction can see them)              │   │
│   │    c. Write clean page to disk                          │   │
│   │ 4. Old versions automatically removed                   │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   CHECKPOINT (periodic, ~60 seconds):                           │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ 1. Flush all dirty pages                                │   │
│   │ 2. Reconciliation cleans old versions during flush      │   │
│   │ 3. Write consistent checkpoint metadata                 │   │
│   │ 4. Old journal entries can be removed                   │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   ADVANTAGE:                                                    │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ • No "vacuum bloat" accumulation                        │   │
│   │ • No scheduled maintenance windows                      │   │
│   │ • Cleanup happens incrementally with normal operations  │   │
│   │ • Space reclaimed automatically                         │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.4 Transaction Timeout Protection

```
┌─────────────────────────────────────────────────────────────────┐
│            LONG-RUNNING TRANSACTION HANDLING                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Problem: Long transactions hold oldest_timestamp low          │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ • All versions since that timestamp must be retained    │   │
│   │ • Cache fills with old versions                         │   │
│   │ • Performance degrades                                  │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   MongoDB solution: Transaction lifetime limits                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ transactionLifetimeLimitSeconds: 60 (default)           │   │
│   │                                                          │   │
│   │ Transactions exceeding this limit are AUTO-ABORTED      │   │
│   │ → Protects system health over individual query          │   │
│   │ → Cache pressure self-regulates                         │   │
│   │                                                          │   │
│   │ For legitimate long operations:                         │   │
│   │ • Use maxTimeMS to set explicit limits                  │   │
│   │ • Batch large operations                                │   │
│   │ • Use change streams for continuous reads               │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Compare to traditional RDBMS:                                 │
│   • Long queries can block vacuum indefinitely                 │
│   • Table/index bloat accumulates                              │
│   • Manual intervention often required                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 3B: MVCC Deep Mechanics — The Three Core Operations

This section covers the precise mechanics of:
1. **Storing updates** — How new versions are created and linked
2. **Finding the correct version** — Runtime visibility determination
3. **Removing expired versions** — Garbage collection process

### 3B.1 How Updates Are Stored (Version Creation)

```
┌─────────────────────────────────────────────────────────────────┐
│           STEP-BY-STEP: STORING AN UPDATE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   OPERATION: db.users.updateOne(                                │
│     { _id: 1 },                                                 │
│     { $set: { name: "Alicia" } }                                │
│   )                                                             │
│                                                                  │
│   BEFORE STATE (RecordId=1 in collection B-tree):               │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ ON-DISK PAGE (leaf page of collection B-tree):          │   │
│   │ ┌─────────────────────────────────────────────────────┐ │   │
│   │ │ Key: RecordId=1                                     │ │   │
│   │ │ Value: { _id: 1, name: "Alice", email: "a@ex.com" } │ │   │
│   │ │ Timestamps: start_ts=50, stop_ts=∞                  │ │   │
│   │ └─────────────────────────────────────────────────────┘ │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────┐
│                    UPDATE EXECUTION STEPS                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   STEP 1: Acquire transaction timestamp                         │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ • Transaction assigned commit_ts = 100                  │   │
│   │ • This becomes the new version's start_ts               │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   STEP 2: Locate document in collection B-tree                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ • Use _id index: _id=1 → RecordId=1                     │   │
│   │ • Traverse collection B-tree to RecordId=1              │   │
│   │ • Load leaf page into WiredTiger cache (if not cached)  │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   STEP 3: Create update structure in memory                     │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ WiredTiger creates an UPDATE CHAIN structure:           │   │
│   │                                                          │   │
│   │ ┌─────────────────────────────────────────────────────┐ │   │
│   │ │ UPDATE ENTRY (new):                                 │ │   │
│   │ │   type: WT_UPDATE_STANDARD                          │ │   │
│   │ │   txnid: 100                                        │ │   │
│   │ │   start_ts: 100                                     │ │   │
│   │ │   stop_ts: ∞ (MAX_TIMESTAMP)                        │ │   │
│   │ │   data: { _id: 1, name: "Alicia", email: "a@ex.com"}│ │   │
│   │ │   next: → points to old version                     │ │   │
│   │ └─────────────────────────────────────────────────────┘ │   │
│   │              │                                           │   │
│   │              ▼                                           │   │
│   │ ┌─────────────────────────────────────────────────────┐ │   │
│   │ │ UPDATE ENTRY (old, modified):                       │ │   │
│   │ │   type: WT_UPDATE_STANDARD                          │ │   │
│   │ │   txnid: 50                                         │ │   │
│   │ │   start_ts: 50                                      │ │   │
│   │ │   stop_ts: 100 ← SET BY THIS UPDATE                 │ │   │
│   │ │   data: { _id: 1, name: "Alice", email: "a@ex.com" }│ │   │
│   │ │   next: NULL (or older version)                     │ │   │
│   │ └─────────────────────────────────────────────────────┘ │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   STEP 4: Attach update chain to B-tree page                    │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ • Update chain attached to the key (RecordId=1)         │   │
│   │ • Page marked DIRTY in cache                            │   │
│   │ • Original on-disk page UNCHANGED until reconciliation  │   │
│   │                                                          │   │
│   │ IN-MEMORY PAGE STATE:                                   │   │
│   │ ┌─────────────────────────────────────────────────────┐ │   │
│   │ │ RecordId=1:                                         │ │   │
│   │ │   on_disk_value: {name: "Alice"...}  // original    │ │   │
│   │ │   update_chain: ──→ [ts=100: "Alicia"] ──→          │ │   │
│   │ │                      [ts=50: "Alice", stop=100]     │ │   │
│   │ └─────────────────────────────────────────────────────┘ │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   STEP 5: Write to journal (Write-Ahead Log)                    │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ • Update operation logged to journal                    │   │
│   │ • Ensures durability before acknowledging to client     │   │
│   │ • Journal entry: {op: "u", ns: "db.users",              │   │
│   │                   key: RecordId=1, data: {...}}         │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   STEP 6: Update secondary indexes (if needed)                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Only if indexed field changed (name not indexed here):  │   │
│   │                                                          │   │
│   │ • _id index: NO CHANGE (RecordId=1 unchanged)           │   │
│   │ • email index: NO CHANGE (email not modified)           │   │
│   │                                                          │   │
│   │ If 'name' WAS indexed:                                  │   │
│   │ • Remove old: ("Alice", RecordId=1)                     │   │
│   │ • Insert new: ("Alicia", RecordId=1)                    │   │
│   │ • Same version chain mechanism in index B-tree          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────┐
│              MEMORY LAYOUT AFTER UPDATE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   WIREDTIGER CACHE:                                             │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                                                          │   │
│   │   Page (dirty):                                         │   │
│   │   ┌───────────────────────────────────────────────────┐ │   │
│   │   │ RecordId=1:                                       │ │   │
│   │   │   ┌─────────────────────────────────────────────┐ │ │   │
│   │   │   │ UPDATE CHAIN HEAD                           │ │ │   │
│   │   │   │ ┌─────────────────────────────────────────┐ │ │ │   │
│   │   │   │ │ V2: ts=[100,∞) "Alicia"                 │─┼─┼─┤   │
│   │   │   │ └─────────────────────────────────────────┘ │ │ │   │
│   │   │   │              │                               │ │ │   │
│   │   │   │              ▼                               │ │ │   │
│   │   │   │ ┌─────────────────────────────────────────┐ │ │ │   │
│   │   │   │ │ V1: ts=[50,100) "Alice"                 │ │ │ │   │
│   │   │   │ └─────────────────────────────────────────┘ │ │ │   │
│   │   │   │              │                               │ │ │   │
│   │   │   │              ▼                               │ │ │   │
│   │   │   │           (NULL or older)                   │ │ │   │
│   │   │   └─────────────────────────────────────────────┘ │ │   │
│   │   └───────────────────────────────────────────────────┘ │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   ON DISK (unchanged until checkpoint/eviction):                │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ RecordId=1: {name: "Alice"...} ts=[50,∞)               │   │
│   │ (Stale — will be updated during reconciliation)         │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3B.2 Finding the Correct Version at Runtime

```
┌─────────────────────────────────────────────────────────────────┐
│          STEP-BY-STEP: VERSION VISIBILITY RESOLUTION             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   QUERY: db.users.findOne({ _id: 1 })                           │
│   Reader's snapshot timestamp: T = 75                           │
│                                                                  │
│   VERSION CHAIN STATE:                                          │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ V2: start_ts=100, stop_ts=∞     {name: "Alicia"}        │   │
│   │  │                                                       │   │
│   │  ▼                                                       │   │
│   │ V1: start_ts=50, stop_ts=100    {name: "Alice"}         │   │
│   │  │                                                       │   │
│   │  ▼                                                       │   │
│   │ (end of chain)                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────┐
│                 VISIBILITY ALGORITHM                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   STEP 1: Establish read timestamp                              │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ • Transaction starts with snapshot at T=75              │   │
│   │ • This is the "read_ts" for all operations in this txn  │   │
│   │ • Snapshot isolation: see consistent view at T=75       │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   STEP 2: Navigate to document location                         │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ • Query planner selects _id index                       │   │
│   │ • Index lookup: _id=1 → RecordId=1                      │   │
│   │ • Navigate to collection B-tree, locate RecordId=1      │   │
│   │ • Load page into cache if not present                   │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   STEP 3: Get update chain head                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ • Check if in-memory update chain exists for this key   │   │
│   │ • If yes: start from update chain head                  │   │
│   │ • If no: use on-disk value directly                     │   │
│   │                                                          │   │
│   │ In our case: Update chain exists, head is V2 (Alicia)   │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   STEP 4: Walk chain to find visible version                    │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                                                          │   │
│   │ ITERATION 1: Check V2 (chain head)                      │   │
│   │ ┌─────────────────────────────────────────────────────┐ │   │
│   │ │ V2: start_ts=100, stop_ts=∞                         │ │   │
│   │ │                                                      │ │   │
│   │ │ Visibility test: start_ts ≤ read_ts < stop_ts ?     │ │   │
│   │ │                   100 ≤ 75 < ∞ ?                     │ │   │
│   │ │                   FALSE (100 > 75)                   │ │   │
│   │ │                                                      │ │   │
│   │ │ Result: V2 NOT visible, continue to next             │ │   │
│   │ └─────────────────────────────────────────────────────┘ │   │
│   │                                                          │   │
│   │ ITERATION 2: Check V1 (next in chain)                   │   │
│   │ ┌─────────────────────────────────────────────────────┐ │   │
│   │ │ V1: start_ts=50, stop_ts=100                        │ │   │
│   │ │                                                      │ │   │
│   │ │ Visibility test: start_ts ≤ read_ts < stop_ts ?     │ │   │
│   │ │                   50 ≤ 75 < 100 ?                    │ │   │
│   │ │                   TRUE!                              │ │   │
│   │ │                                                      │ │   │
│   │ │ Result: V1 IS visible, return this version          │ │   │
│   │ └─────────────────────────────────────────────────────┘ │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   STEP 5: Return visible version                                │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ • Return document: { _id: 1, name: "Alice", ... }       │   │
│   │ • Reader at T=75 sees pre-update state                  │   │
│   │ • Reader at T=150 would see V2 (Alicia)                 │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────┐
│              VISIBILITY PSEUDOCODE                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   function find_visible_version(key, read_ts):                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                                                          │   │
│   │   // Get the update chain for this key                  │   │
│   │   update_chain = get_update_chain(key)                  │   │
│   │                                                          │   │
│   │   // If no updates, check on-disk value                 │   │
│   │   if update_chain is NULL:                              │   │
│   │       ondisk = get_ondisk_value(key)                    │   │
│   │       if ondisk.start_ts <= read_ts < ondisk.stop_ts:   │   │
│   │           return ondisk.value                           │   │
│   │       return NOT_FOUND                                  │   │
│   │                                                          │   │
│   │   // Walk the update chain                              │   │
│   │   current = update_chain.head                           │   │
│   │                                                          │   │
│   │   while current is not NULL:                            │   │
│   │                                                          │   │
│   │       // Check if this version is visible               │   │
│   │       if current.start_ts <= read_ts:                   │   │
│   │           if read_ts < current.stop_ts:                 │   │
│   │               // VISIBLE! Return this version           │   │
│   │               return current.value                      │   │
│   │                                                          │   │
│   │       // Not visible, try next (older) version          │   │
│   │       current = current.next                            │   │
│   │                                                          │   │
│   │   // Fell off chain, check on-disk value                │   │
│   │   ondisk = get_ondisk_value(key)                        │   │
│   │   if ondisk.start_ts <= read_ts < ondisk.stop_ts:       │   │
│   │       return ondisk.value                               │   │
│   │                                                          │   │
│   │   return NOT_FOUND                                      │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   COMPLEXITY: O(number of versions for this key)                │
│   Typically: 1-3 versions in chain (short-lived txns)           │
│   Worst case: Long chain if many concurrent modifiers           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────┐
│              SPECIAL CASES IN VISIBILITY                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   CASE A: Uncommitted transaction (read-your-own-writes)        │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ • Transaction 100 updates document                      │   │
│   │ • Transaction 100 reads same document before commit     │   │
│   │ • Must see its own uncommitted changes                  │   │
│   │                                                          │   │
│   │ Solution: Check if update.txnid == my_txnid             │   │
│   │           If same transaction, version is visible       │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   CASE B: Aborted transaction cleanup                           │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ • Transaction 100 updates document                      │   │
│   │ • Transaction 100 aborts (rollback)                     │   │
│   │ • Version must be marked invisible to everyone          │   │
│   │                                                          │   │
│   │ Solution: Aborted versions marked with special flag     │   │
│   │           Visibility check skips aborted versions       │   │
│   │           Cleanup removes them during reconciliation    │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   CASE C: Deleted document                                      │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ • Document deleted at T=100                             │   │
│   │ • Creates tombstone version                             │   │
│   │                                                          │   │
│   │ Tombstone: { type: WT_UPDATE_TOMBSTONE,                 │   │
│   │             start_ts: 100, stop_ts: ∞ }                 │   │
│   │                                                          │   │
│   │ Reader at T=75: sees pre-delete version                 │   │
│   │ Reader at T=150: finds tombstone, returns NOT_FOUND     │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3B.3 Removing Expired Versions (Garbage Collection)

```
┌─────────────────────────────────────────────────────────────────┐
│           OVERVIEW: VERSION GARBAGE COLLECTION                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   WHEN CAN A VERSION BE REMOVED?                                │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                                                          │   │
│   │   A version is REMOVABLE when NO transaction can        │   │
│   │   possibly need it:                                     │   │
│   │                                                          │   │
│   │   Version: start_ts=50, stop_ts=100                     │   │
│   │                                                          │   │
│   │   Can be removed if:                                    │   │
│   │   oldest_active_read_ts > stop_ts                       │   │
│   │                                                          │   │
│   │   Example:                                              │   │
│   │   • oldest_active_read_ts = 150                         │   │
│   │   • Version stop_ts = 100                               │   │
│   │   • 150 > 100 → SAFE TO REMOVE                          │   │
│   │                                                          │   │
│   │   Why? Any active reader has snapshot ≥ 150             │   │
│   │   They would see newer version (stop_ts > 150)          │   │
│   │   No one will ever read the version with stop_ts=100    │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────┐
│              RECONCILIATION: THE CLEANUP PROCESS                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   TRIGGER: Page eviction from WiredTiger cache                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Cache is 80% full, need to evict pages to make room     │   │
│   │ Eviction thread selects a dirty page                    │   │
│   │ Must RECONCILE page before writing to disk              │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   STEP 1: Determine oldest required timestamp                   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                                                          │   │
│   │ oldest_ts = min(                                        │   │
│   │   oldest_active_transaction_read_ts,                    │   │
│   │   pinned_timestamp,        // for backup/restore        │   │
│   │   stable_timestamp         // for checkpoint            │   │
│   │ )                                                       │   │
│   │                                                          │   │
│   │ Example: oldest_ts = 120                                │   │
│   │                                                          │   │
│   │ Any version with stop_ts ≤ oldest_ts can be discarded   │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   STEP 2: Walk each key's update chain                          │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                                                          │   │
│   │ BEFORE RECONCILIATION (RecordId=1):                     │   │
│   │                                                          │   │
│   │ Update chain:                                           │   │
│   │ ┌─────────────────────────────────────────────────────┐ │   │
│   │ │ V3: ts=[200,∞)  "Alicia Jr"     ← KEEP (current)    │ │   │
│   │ │  │                                                   │ │   │
│   │ │  ▼                                                   │ │   │
│   │ │ V2: ts=[100,200) "Alicia"       ← KEEP (might need) │ │   │
│   │ │  │                                                   │ │   │
│   │ │  ▼                                                   │ │   │
│   │ │ V1: ts=[50,100)  "Alice"        ← REMOVE! (expired) │ │   │
│   │ │  │               stop_ts=100 < oldest_ts=120        │ │   │
│   │ │  ▼                                                   │ │   │
│   │ │ V0: ts=[1,50)    "Al"           ← REMOVE! (expired) │ │   │
│   │ │                  stop_ts=50 < oldest_ts=120         │ │   │
│   │ └─────────────────────────────────────────────────────┘ │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   STEP 3: Build reconciled page image                           │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                                                          │   │
│   │ For each key, determine what to write to disk:          │   │
│   │                                                          │   │
│   │ RecordId=1:                                             │   │
│   │ ┌─────────────────────────────────────────────────────┐ │   │
│   │ │ ON-DISK VALUE (newest visible at oldest_ts):        │ │   │
│   │ │   value: "Alicia"                                   │ │   │
│   │ │   start_ts: 100                                     │ │   │
│   │ │   stop_ts: 200                                      │ │   │
│   │ │                                                      │ │   │
│   │ │ Plus write remaining update chain entries:          │ │   │
│   │ │   V3: ts=[200,∞) "Alicia Jr"                        │ │   │
│   │ │   (V2 becomes on-disk value, chain shortened)       │ │   │
│   │ └─────────────────────────────────────────────────────┘ │   │
│   │                                                          │   │
│   │ AFTER RECONCILIATION:                                   │   │
│   │ ┌─────────────────────────────────────────────────────┐ │   │
│   │ │ On-disk: "Alicia" ts=[100,200)                      │ │   │
│   │ │ Update chain: V3 "Alicia Jr" ts=[200,∞) only        │ │   │
│   │ │                                                      │ │   │
│   │ │ V1 ("Alice") and V0 ("Al") GONE — reclaimed!        │ │   │
│   │ └─────────────────────────────────────────────────────┘ │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   STEP 4: Write reconciled page to disk                         │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ • Allocate new disk block (copy-on-write)               │   │
│   │ • Write compressed page data                            │   │
│   │ • Update parent page pointer                            │   │
│   │ • Old disk block added to free list                     │   │
│   │ • Memory freed for evicted page                         │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────┐
│              RECONCILIATION PSEUDOCODE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   function reconcile_page(page, oldest_ts):                     │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                                                          │   │
│   │   new_page = allocate_page()                            │   │
│   │                                                          │   │
│   │   for each (key, update_chain) in page:                 │   │
│   │                                                          │   │
│   │       // Find oldest version we must keep               │   │
│   │       keeper = NULL                                     │   │
│   │       current = update_chain.head                       │   │
│   │                                                          │   │
│   │       while current is not NULL:                        │   │
│   │           if current.stop_ts > oldest_ts:               │   │
│   │               // This version might still be needed     │   │
│   │               keeper = current                          │   │
│   │           current = current.next                        │   │
│   │                                                          │   │
│   │       // Check on-disk value too                        │   │
│   │       ondisk = page.get_ondisk(key)                     │   │
│   │       if ondisk.stop_ts > oldest_ts:                    │   │
│   │           keeper = ondisk                               │   │
│   │                                                          │   │
│   │       // Write only needed versions to new page         │   │
│   │       if keeper is not NULL:                            │   │
│   │           // Set keeper as new on-disk value            │   │
│   │           new_page.set_ondisk(key, keeper.value,        │   │
│   │                               keeper.start_ts,          │   │
│   │                               keeper.stop_ts)           │   │
│   │                                                          │   │
│   │           // Copy newer versions (if any) to chain      │   │
│   │           for each version newer than keeper:           │   │
│   │               new_page.add_to_chain(key, version)       │   │
│   │                                                          │   │
│   │       // Versions older than keeper are DISCARDED       │   │
│   │       // (not written to new_page = garbage collected)  │   │
│   │                                                          │   │
│   │   return new_page                                       │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────┐
│                 CHECKPOINT CLEANUP                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   PERIODIC CHECKPOINT (~60 seconds by default):                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                                                          │   │
│   │ 1. Advance stable_timestamp                             │   │
│   │    • MongoDB periodically advances stable_ts            │   │
│   │    • Represents durability boundary                     │   │
│   │                                                          │   │
│   │ 2. Force reconciliation of all dirty pages              │   │
│   │    • Every modified page gets reconciled                │   │
│   │    • Expired versions cleaned up globally               │   │
│   │                                                          │   │
│   │ 3. Write checkpoint metadata                            │   │
│   │    • Records consistent point-in-time snapshot          │   │
│   │    • Used for crash recovery                            │   │
│   │                                                          │   │
│   │ 4. Release old journal entries                          │   │
│   │    • Journal before checkpoint no longer needed         │   │
│   │    • Disk space reclaimed                               │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   RESULT:                                                       │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ • All pages reconciled with current oldest_ts           │   │
│   │ • Old versions systematically removed                   │   │
│   │ • Disk space reclaimed via copy-on-write                │   │
│   │ • NO explicit "VACUUM" command needed                   │   │
│   │ • Happens continuously in background                    │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────┐
│           GARBAGE COLLECTION BOTTLENECKS                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   PROBLEM: Long-running transactions block GC                   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                                                          │   │
│   │ Timeline:                                               │   │
│   │ T=0:   Long transaction starts, read_ts=0              │   │
│   │ T=100: Updates create versions [0,100), [100,∞)        │   │
│   │ T=200: More updates create [100,200), [200,∞)          │   │
│   │ ...                                                     │   │
│   │ T=1000: oldest_ts still stuck at 0!                    │   │
│   │         All versions since T=0 must be retained        │   │
│   │         Cache fills up with old versions               │   │
│   │                                                          │   │
│   │ Symptoms:                                               │   │
│   │ • cache_used_dirty_bytes growing                        │   │
│   │ • Eviction can't free memory effectively               │   │
│   │ • Read/write latency increases                         │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   MONGODB'S SOLUTION: Transaction timeout                       │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                                                          │   │
│   │ transactionLifetimeLimitSeconds: 60 (default)           │   │
│   │                                                          │   │
│   │ • Transactions exceeding 60s are auto-aborted           │   │
│   │ • oldest_ts advances when long txn killed               │   │
│   │ • GC can resume cleaning old versions                   │   │
│   │ • System health protected over individual transaction   │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   MONITORING:                                                   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                                                          │   │
│   │ db.serverStatus().wiredTiger.concurrentTransactions     │   │
│   │ db.serverStatus().wiredTiger.cache                      │   │
│   │                                                          │   │
│   │ Key metrics:                                            │   │
│   │ • "bytes currently in the cache"                        │   │
│   │ • "tracked dirty bytes in the cache"                    │   │
│   │ • "pages evicted"                                       │   │
│   │ • "history store table reads"                           │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────┐
│            HISTORY STORE: OVERFLOW FOR OLD VERSIONS              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   When update chains get too long or cache too full:            │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                                                          │   │
│   │ WiredTiger HISTORY STORE (internal table):              │   │
│   │                                                          │   │
│   │ • Separate B-tree storing old versions                  │   │
│   │ • Moved from in-memory chains to disk                   │   │
│   │ • Keyed by: (btree_id, RecordId, start_ts)              │   │
│   │                                                          │   │
│   │ When reader needs old version:                          │   │
│   │ 1. Check in-memory chain first                          │   │
│   │ 2. If not found, probe history store                    │   │
│   │ 3. Return version from history store                    │   │
│   │                                                          │   │
│   │ History store cleanup:                                  │   │
│   │ • Same oldest_ts rule applies                           │   │
│   │ • Entries with stop_ts < oldest_ts removed              │   │
│   │ • Happens during reconciliation                         │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   IMPLICATION:                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Long transactions can cause:                            │   │
│   │ • History store growth                                  │   │
│   │ • Additional disk I/O for old version reads             │   │
│   │ • Slower queries that need old snapshots                │   │
│   │                                                          │   │
│   │ Monitor: db.serverStatus().wiredTiger["history store"]  │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 4: Write Operations and Index Impact

### 4.1 INSERT Operation

```
┌─────────────────────────────────────────────────────────────────┐
│                      INSERT EXECUTION                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   db.users.insertOne({ name: "Alice", email: "a@ex.com" })      │
│                                                                  │
│   Execution steps:                                              │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ 1. Generate _id (if not provided)                       │   │
│   │    └── ObjectId contains timestamp, random, counter     │   │
│   │                                                          │   │
│   │ 2. Assign RecordId (monotonically increasing)           │   │
│   │    └── This ID is PERMANENT for document lifetime       │   │
│   │                                                          │   │
│   │ 3. Insert into collection B-tree                        │   │
│   │    └── Key: RecordId, Value: BSON document              │   │
│   │    └── Version info: start_ts=current, stop_ts=∞        │   │
│   │                                                          │   │
│   │ 4. Insert into _id index                                │   │
│   │    └── Key: ObjectId, Value: RecordId                   │   │
│   │                                                          │   │
│   │ 5. Insert into each secondary index                     │   │
│   │    └── email index: Key: "a@ex.com", Value: RecordId    │   │
│   │                                                          │   │
│   │ 6. Write to journal (oplog entry for replication)       │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Write amplification (with 3 indexes):                         │
│   • 1 collection write                                          │
│   • 3 index writes                                              │
│   • Total: 4 B-tree modifications                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 UPDATE Operation — MongoDB's Efficiency

```
┌─────────────────────────────────────────────────────────────────┐
│                 UPDATE: MINIMAL INDEX IMPACT                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   CASE 1: Update non-indexed field                              │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ db.users.updateOne(                                     │   │
│   │   { _id: 1 },                                           │   │
│   │   { $set: { age: 30 } }  // 'age' not indexed           │   │
│   │ )                                                       │   │
│   │                                                          │   │
│   │ What happens:                                           │   │
│   │ 1. Find document via _id index → RecordId               │   │
│   │ 2. Create new version in collection B-tree              │   │
│   │    └── RecordId UNCHANGED                               │   │
│   │    └── Old version: stop_ts = current_ts                │   │
│   │    └── New version: start_ts = current_ts, stop_ts = ∞  │   │
│   │ 3. Index updates: ZERO                                  │   │
│   │    └── _id index: unchanged (RecordId same)             │   │
│   │    └── email index: unchanged (RecordId same)           │   │
│   │    └── name index: unchanged (RecordId same)            │   │
│   │                                                          │   │
│   │ Total writes: 1 (collection only)                       │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   CASE 2: Update indexed field                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ db.users.updateOne(                                     │   │
│   │   { _id: 1 },                                           │   │
│   │   { $set: { email: "alice@newdomain.com" } }            │   │
│   │ )                                                       │   │
│   │                                                          │   │
│   │ What happens:                                           │   │
│   │ 1. Find document via _id index → RecordId               │   │
│   │ 2. Create new version in collection B-tree              │   │
│   │ 3. Update ONLY the email index:                         │   │
│   │    └── Remove: "a@ex.com" → RecordId: 1                 │   │
│   │    └── Insert: "alice@newdomain.com" → RecordId: 1      │   │
│   │ 4. Other indexes: UNCHANGED                             │   │
│   │    └── _id index: same (RecordId unchanged)             │   │
│   │    └── name index: same (name didn't change)            │   │
│   │                                                          │   │
│   │ Total writes: 1 collection + 2 index ops (remove+insert)│   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   THIS IS THE KEY EFFICIENCY GAIN:                              │
│   Traditional RDBMS: Row moves → ALL indexes updated            │
│   MongoDB: RecordId stable → ONLY modified field indexes update │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Write Amplification Comparison

```
┌─────────────────────────────────────────────────────────────────┐
│                 WRITE AMPLIFICATION ANALYSIS                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Scenario: Table/collection with 5 secondary indexes           │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Operation              │ Traditional │ MongoDB          │   │
│   │                        │ RDBMS       │                  │   │
│   ├────────────────────────┼─────────────┼──────────────────┤   │
│   │ INSERT                 │ 6 writes    │ 6 writes         │   │
│   │ (1 row + 5 indexes)    │             │                  │   │
│   ├────────────────────────┼─────────────┼──────────────────┤   │
│   │ UPDATE non-indexed col │ 1-6 writes  │ 1 write          │   │
│   │                        │ (row move?) │ (collection only)│   │
│   ├────────────────────────┼─────────────┼──────────────────┤   │
│   │ UPDATE 1 indexed col   │ 1+10 writes │ 1+2 writes       │   │
│   │                        │ (all idx×2) │ (only affected)  │   │
│   ├────────────────────────┼─────────────┼──────────────────┤   │
│   │ UPDATE 2 indexed cols  │ 1+10 writes │ 1+4 writes       │   │
│   │                        │ (all idx×2) │ (only affected)  │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Real-world impact:                                            │
│   • OLTP workload with frequent updates to few fields           │
│   • MongoDB: 3-5x lower write amplification                     │
│   • Less I/O, less wear on storage, better throughput           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.4 DELETE Operation

```
┌─────────────────────────────────────────────────────────────────┐
│                      DELETE EXECUTION                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   db.users.deleteOne({ _id: 1 })                                │
│                                                                  │
│   Execution:                                                    │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ 1. Find document via _id index → RecordId               │   │
│   │                                                          │   │
│   │ 2. Mark document as deleted in collection B-tree        │   │
│   │    └── Set stop_ts on current version                   │   │
│   │    └── (Actual removal during reconciliation)           │   │
│   │                                                          │   │
│   │ 3. Mark index entries for removal                       │   │
│   │    └── Each index entry associated with RecordId        │   │
│   │    └── Removed during background cleanup                │   │
│   │                                                          │   │
│   │ 4. Write to journal/oplog                               │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Background cleanup (automatic):                               │
│   • Old versions and deleted entries removed during eviction    │
│   • No explicit "VACUUM" needed                                 │
│   • Space reclaimed incrementally                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 5: Schema Flexibility and Index Adaptation

### 5.1 Documents Without Fixed Schema

```
┌─────────────────────────────────────────────────────────────────┐
│                   FLEXIBLE SCHEMA IN ACTION                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Same collection, different document shapes:                   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ { _id: 1, type: "user", email: "a@ex.com", name: "Al" } │   │
│   │ { _id: 2, type: "user", email: "b@ex.com" }  // no name │   │
│   │ { _id: 3, type: "org", domain: "acme.com", size: 50 }   │   │
│   │ { _id: 4, type: "user", email: "c@ex.com",              │   │
│   │           addresses: [{ city: "NYC" }, { city: "LA" }] }│   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   How indexes handle this:                                      │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Index on { email: 1 } (regular):                        │   │
│   │                                                          │   │
│   │ Index entries:                                          │   │
│   │   "a@ex.com" → RecordId: 1                              │   │
│   │   "b@ex.com" → RecordId: 2                              │   │
│   │   null       → RecordId: 3  ← org has no email          │   │
│   │   "c@ex.com" → RecordId: 4                              │   │
│   │                                                          │   │
│   │ Documents without the field get indexed with null key   │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Sparse Indexes

```
┌─────────────────────────────────────────────────────────────────┐
│                       SPARSE INDEXES                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   db.collection.createIndex({ email: 1 }, { sparse: true })     │
│                                                                  │
│   Only includes documents WHERE THE FIELD EXISTS:               │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Documents:                                              │   │
│   │   { _id: 1, email: "a@ex.com" }     ← IN index          │   │
│   │   { _id: 2, email: "b@ex.com" }     ← IN index          │   │
│   │   { _id: 3, domain: "acme.com" }    ← NOT in index      │   │
│   │   { _id: 4 }                        ← NOT in index      │   │
│   │                                                          │   │
│   │ Index entries (only 2):                                 │   │
│   │   "a@ex.com" → RecordId: 1                              │   │
│   │   "b@ex.com" → RecordId: 2                              │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Benefits:                                                     │
│   • Smaller index size                                          │
│   • Faster index operations                                     │
│   • Perfect for optional fields                                 │
│                                                                  │
│   Caveat:                                                       │
│   • Query { email: null } WON'T use this index                  │
│   • Sort-only queries may not use sparse index                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 Partial Indexes

```
┌─────────────────────────────────────────────────────────────────┐
│                      PARTIAL INDEXES                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Index only documents matching a filter expression:            │
│                                                                  │
│   db.orders.createIndex(                                        │
│     { customer_id: 1, order_date: 1 },                          │
│     { partialFilterExpression: { status: "active" } }           │
│   )                                                             │
│                                                                  │
│   Index contents:                                               │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Only documents where status == "active" are indexed     │   │
│   │                                                          │   │
│   │ { _id: 1, status: "active", customer_id: 100 }  ← IN    │   │
│   │ { _id: 2, status: "active", customer_id: 101 }  ← IN    │   │
│   │ { _id: 3, status: "completed", customer_id: 100 } ← OUT │   │
│   │ { _id: 4, status: "cancelled", customer_id: 102 } ← OUT │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Use cases:                                                    │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ • Index only "pending" orders (90% are completed)       │   │
│   │ • Index only "published" articles                       │   │
│   │ • Index only documents from last 30 days                │   │
│   │ • Index only non-deleted (soft-delete pattern)          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Query must include filter for index to be used:               │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ ✓ db.orders.find({ status: "active", customer_id: 100 })│   │
│   │ ✗ db.orders.find({ customer_id: 100 })  // won't use it │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.4 Wildcard Indexes

```
┌─────────────────────────────────────────────────────────────────┐
│                     WILDCARD INDEXES                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   For truly dynamic schemas where field names are unknown:      │
│                                                                  │
│   db.events.createIndex({ "metadata.$**": 1 })                  │
│                                                                  │
│   Documents with arbitrary metadata:                            │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ { type: "click",                                        │   │
│   │   metadata: { page: "/home", button: "signup" } }       │   │
│   │                                                          │   │
│   │ { type: "purchase",                                     │   │
│   │   metadata: { product_id: 123, price: 49.99 } }         │   │
│   │                                                          │   │
│   │ { type: "error",                                        │   │
│   │   metadata: { code: 500, message: "Internal error" } }  │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Index entries created (conceptually):                         │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ ("metadata.page", "/home")           → RecordId: 1      │   │
│   │ ("metadata.button", "signup")        → RecordId: 1      │   │
│   │ ("metadata.product_id", 123)         → RecordId: 2      │   │
│   │ ("metadata.price", 49.99)            → RecordId: 2      │   │
│   │ ("metadata.code", 500)               → RecordId: 3      │   │
│   │ ("metadata.message", "Internal...")  → RecordId: 3      │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Queries supported:                                            │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ db.events.find({ "metadata.page": "/home" })    ✓       │   │
│   │ db.events.find({ "metadata.code": 500 })        ✓       │   │
│   │ db.events.find({ "metadata.anything": "value" }) ✓      │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Trade-off: Larger index size, more write overhead             │
│   Use when: Field names truly unpredictable at design time      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.5 Schema Evolution Without Index Rebuild

```
┌─────────────────────────────────────────────────────────────────┐
│                    SCHEMA EVOLUTION                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Adding new field to documents:                                │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ // Old documents:                                       │   │
│   │ { _id: 1, name: "Alice", email: "a@ex.com" }            │   │
│   │                                                          │   │
│   │ // New documents start including phone:                 │   │
│   │ { _id: 2, name: "Bob", email: "b@ex.com",               │   │
│   │   phone: "+1-555-1234" }                                │   │
│   │                                                          │   │
│   │ // No migration needed! Just start writing new shape    │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Adding index on new field:                                    │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ db.users.createIndex({ phone: 1 }, { sparse: true })    │   │
│   │                                                          │   │
│   │ • Index built in background                             │   │
│   │ • Old documents (no phone): excluded (sparse)           │   │
│   │ • New documents: automatically indexed                  │   │
│   │ • No ALTER TABLE, no table lock                         │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Compare to traditional RDBMS:                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ 1. ALTER TABLE ADD COLUMN phone VARCHAR(20)             │   │
│   │    → May require table lock                             │   │
│   │    → Rewrites table in some cases                       │   │
│   │                                                          │   │
│   │ 2. CREATE INDEX ON phone                                │   │
│   │    → Full table scan                                    │   │
│   │    → Indexes NULL for all existing rows                 │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 6: Time Series Collections

### 6.1 The Time Series Challenge

```
┌─────────────────────────────────────────────────────────────────┐
│                TIME SERIES DATA CHARACTERISTICS                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Typical workload:                                             │
│   • Very high insert rate (thousands/second per source)         │
│   • Data arrives roughly time-ordered                           │
│   • Queries almost always filter by time range                  │
│   • Updates are rare (append-mostly)                            │
│   • Old data needs compression and eventual deletion            │
│                                                                  │
│   Problems with regular collections:                            │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ • One document per measurement = massive doc count      │   │
│   │ • Each doc has BSON overhead, _id, field names          │   │
│   │ • Index entry per measurement                           │   │
│   │ • MVCC version per measurement                          │   │
│   │ • Delete old data = millions of individual deletes      │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Time Series Collection Architecture

```javascript
db.createCollection("metrics", {
  timeseries: {
    timeField: "timestamp",
    metaField: "device_id",
    granularity: "seconds"
  }
})
```

```
┌─────────────────────────────────────────────────────────────────┐
│                   BUCKETING ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   USER INSERTS (individual measurements):                       │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ { timestamp: T1, device_id: "sensor-A", temp: 72.5 }    │   │
│   │ { timestamp: T2, device_id: "sensor-A", temp: 72.8 }    │   │
│   │ { timestamp: T3, device_id: "sensor-A", temp: 73.1 }    │   │
│   │ { timestamp: T4, device_id: "sensor-B", temp: 68.2 }    │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   INTERNAL STORAGE (bucketed):                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ BUCKET for device_id="sensor-A", time window [T1, ...]  │   │
│   │ {                                                        │   │
│   │   _id: ObjectId("..."),                                 │   │
│   │   meta: "sensor-A",                                     │   │
│   │   control: {                                            │   │
│   │     min: { timestamp: T1, temp: 72.5 },                 │   │
│   │     max: { timestamp: T3, temp: 73.1 },                 │   │
│   │     count: 3                                            │   │
│   │   },                                                    │   │
│   │   data: {                                               │   │
│   │     timestamp: [T1, T2, T3],   // COLUMN-ORIENTED       │   │
│   │     temp: [72.5, 72.8, 73.1]   // COMPRESSES WELL       │   │
│   │   }                                                     │   │
│   │ }                                                       │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ BUCKET for device_id="sensor-B", time window [T4, ...]  │   │
│   │ { ... similar structure ... }                           │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.3 Clustered Index on Time

```
┌─────────────────────────────────────────────────────────────────┐
│               TIME SERIES INDEX STRUCTURE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   IMPLICIT CLUSTERED INDEX:                                     │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Buckets stored sorted by: (meta, control.min.timestamp) │   │
│   │                                                          │   │
│   │ Physical layout on disk:                                │   │
│   │ ┌───────────────────────────────────────────────────┐   │   │
│   │ │ [sensor-A, T1-T100]  → Bucket 1                   │   │   │
│   │ │ [sensor-A, T101-T200] → Bucket 2                  │   │   │
│   │ │ [sensor-A, T201-T300] → Bucket 3                  │   │   │
│   │ │ [sensor-B, T1-T100]  → Bucket 4                   │   │   │
│   │ │ [sensor-B, T101-T200] → Bucket 5                  │   │   │
│   │ └───────────────────────────────────────────────────┘   │   │
│   │                                                          │   │
│   │ Time-range query on sensor-A, last hour:                │   │
│   │ → SEQUENTIAL read of adjacent buckets                   │   │
│   │ → No random I/O jumping between pages                   │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   CONTRAST WITH REGULAR COLLECTION:                             │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Documents scattered across B-tree by RecordId           │   │
│   │ Time-range query: index scan → random doc fetches       │   │
│   │ Much higher I/O for same logical query                  │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.4 MVCC Efficiency with Buckets

```
┌─────────────────────────────────────────────────────────────────┐
│              MVCC OVERHEAD REDUCTION                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   REGULAR COLLECTION (document per measurement):                │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ 1000 measurements =                                     │   │
│   │   1000 documents                                        │   │
│   │   1000 MVCC version chains                              │   │
│   │   1000 index entries (per index)                        │   │
│   │   1000 visibility checks per query                      │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   TIME SERIES COLLECTION (bucketed):                            │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ 1000 measurements =                                     │   │
│   │   ~1 bucket document                                    │   │
│   │   1 MVCC version chain                                  │   │
│   │   1 index entry (per index)                             │   │
│   │   1 visibility check per query                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Reduction factor: ~1000x for MVCC overhead                    │
│                                                                  │
│   Why this matters for performance:                             │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ • Less memory for version chains in WiredTiger cache    │   │
│   │ • Faster eviction/reconciliation                        │   │
│   │ • Less pressure from long-running reads                 │   │
│   │ • Checkpoint completes faster                           │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.5 Compression Benefits

```
┌─────────────────────────────────────────────────────────────────┐
│                  COLUMN-ORIENTED COMPRESSION                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Bucket data structure enables efficient compression:          │
│                                                                  │
│   TIMESTAMP ARRAY (delta encoding):                             │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Raw: [1709251200, 1709251201, 1709251202, 1709251203]   │   │
│   │                                                          │   │
│   │ Delta encoded: [1709251200, +1, +1, +1, ...]            │   │
│   │                                                          │   │
│   │ Storage: Base timestamp + tiny deltas                   │   │
│   │ Compression ratio: 10-20x                               │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   MEASUREMENT ARRAY (similarity encoding):                      │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Raw: [72.5, 72.8, 73.1, 72.9, 73.0, 72.7, ...]          │   │
│   │                                                          │   │
│   │ Similar values cluster → high compression ratio         │   │
│   │ Run-length encoding for repeated values                 │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   OVERALL STORAGE COMPARISON:                                   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Regular collection (1M measurements):                   │   │
│   │   ~100 bytes/doc × 1M = 100 MB                          │   │
│   │   Plus: field name repetition, _id overhead, indexes    │   │
│   │   Total: ~150-200 MB                                    │   │
│   │                                                          │   │
│   │ Time series collection (1M measurements):               │   │
│   │   ~1000 buckets × 10 KB (compressed) = 10 MB            │   │
│   │   Minimal index overhead                                │   │
│   │   Total: ~15-25 MB                                      │   │
│   │                                                          │   │
│   │ REDUCTION: 5-10x storage savings                        │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.6 Secondary Indexes on Time Series

```
┌─────────────────────────────────────────────────────────────────┐
│              TIME SERIES SECONDARY INDEXES                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Creating index on measurement field:                          │
│   db.metrics.createIndex({ temp: 1 })                           │
│                                                                  │
│   Index structure:                                              │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Key: measurement value                                  │   │
│   │ Value: bucket_id (NOT individual measurement position)  │   │
│   │                                                          │   │
│   │ Index entries:                                          │   │
│   │   temp=68.0 → [bucket_5, bucket_12, bucket_47]          │   │
│   │   temp=72.5 → [bucket_1, bucket_3, bucket_8]            │   │
│   │   temp=73.1 → [bucket_1, bucket_9]                      │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Query execution:                                              │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ db.metrics.find({ temp: { $gt: 72 } })                  │   │
│   │                                                          │   │
│   │ 1. Index scan: find buckets containing temp > 72        │   │
│   │ 2. Fetch each matching bucket                           │   │
│   │ 3. Scan bucket's data.temp array for exact matches      │   │
│   │ 4. Return matching measurements                         │   │
│   │                                                          │   │
│   │ Trade-off: Post-filter within bucket required           │   │
│   │ Benefit: Dramatically fewer index entries to maintain   │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Best practices:                                               │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ • Always include time range in queries when possible    │   │
│   │ • Meta field indexes are very efficient (1 entry/bucket)│   │
│   │ • Measurement field indexes useful for outlier queries  │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.7 TTL and Data Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                  TIME SERIES DATA LIFECYCLE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Automatic expiration with expireAfterSeconds:                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ db.createCollection("metrics", {                        │   │
│   │   timeseries: {                                         │   │
│   │     timeField: "timestamp",                             │   │
│   │     metaField: "device_id"                              │   │
│   │   },                                                    │   │
│   │   expireAfterSeconds: 86400 * 30  // 30 days            │   │
│   │ })                                                      │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Deletion efficiency:                                          │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ REGULAR COLLECTION with TTL:                            │   │
│   │ • Delete each document individually                     │   │
│   │ • Remove from each index                                │   │
│   │ • 1M deletes = 1M+ operations                           │   │
│   │                                                          │   │
│   │ TIME SERIES COLLECTION:                                 │   │
│   │ • Delete entire bucket when all measurements expired    │   │
│   │ • Single document delete removes 1000 measurements      │   │
│   │ • 1M measurements = ~1000 bucket deletes                │   │
│   │ • 1000x more efficient                                  │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 7: Index Bottlenecks and Optimization

### 7.1 Write Bottlenecks

```
┌─────────────────────────────────────────────────────────────────┐
│                  INDEX WRITE BOTTLENECKS                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   1. TOO MANY INDEXES                                           │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Each additional index:                                  │   │
│   │ • +1 B-tree write per insert                            │   │
│   │ • +2 B-tree operations per indexed field update         │   │
│   │ • More oplog entries for replication                    │   │
│   │                                                          │   │
│   │ Recommendation: <10 indexes per collection              │   │
│   │ Profile with db.collection.stats() for index sizes      │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   2. INDEXES ON HIGH-CHURN FIELDS                               │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Fields that change frequently on updates:               │   │
│   │ • last_modified, update_count, access_time              │   │
│   │ • Every update = index modification                     │   │
│   │                                                          │   │
│   │ Consider: Do you actually query by these fields?        │   │
│   │ If not, remove the index.                               │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   3. WRITE-HEAVY UNIQUE INDEXES                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Unique constraint requires:                             │   │
│   │ • Read-before-write to check uniqueness                 │   │
│   │ • Locks during check+insert                             │   │
│   │                                                          │   │
│   │ Mitigation:                                             │   │
│   │ • Use _id as natural unique key when possible           │   │
│   │ • Shard key design to distribute unique index load      │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Read Bottlenecks

```
┌─────────────────────────────────────────────────────────────────┐
│                   INDEX READ BOTTLENECKS                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   1. INDEX NOT FITTING IN MEMORY                                │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ WiredTiger cache miss → disk I/O                        │   │
│   │                                                          │   │
│   │ Diagnosis:                                              │   │
│   │   db.collection.stats().indexSizes                      │   │
│   │   db.serverStatus().wiredTiger.cache                    │   │
│   │                                                          │   │
│   │ Solutions:                                              │   │
│   │ • Increase WiredTiger cache size                        │   │
│   │ • Use partial indexes to reduce size                    │   │
│   │ • Remove unused indexes                                 │   │
│   │ • Add RAM to server                                     │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   2. POOR INDEX SELECTIVITY                                     │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Index on low-cardinality field (e.g., status: 3 values) │   │
│   │ Index scan returns too many RecordIds                   │   │
│   │ Many document fetches → slow query                      │   │
│   │                                                          │   │
│   │ Solutions:                                              │   │
│   │ • Compound index with selective field first             │   │
│   │ • Partial index on common query pattern                 │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   3. NON-COVERED QUERIES                                        │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Query requires fields not in index                      │   │
│   │ → Must fetch full document for each match               │   │
│   │                                                          │   │
│   │ Solutions:                                              │   │
│   │ • Add frequently accessed fields to index               │   │
│   │ • Use projection to request only indexed fields         │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.3 Replication Bottlenecks

```
┌─────────────────────────────────────────────────────────────────┐
│                REPLICATION AND INDEX OVERHEAD                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   OPLOG PRESSURE:                                               │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Every write operation → oplog entry                     │   │
│   │ Index operations included                               │   │
│   │                                                          │   │
│   │ High index count = larger oplog entries                 │   │
│   │ = Faster oplog rotation                                 │   │
│   │ = Smaller replication window                            │   │
│   │ = Higher risk of secondary falling off oplog            │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   SECONDARY LAG:                                                │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ Secondaries must replay all operations                  │   │
│   │ Index builds on secondary = same cost as primary        │   │
│   │                                                          │   │
│   │ Heavy index maintenance can cause:                      │   │
│   │ • Replication lag                                       │   │
│   │ • Read scaling issues (stale reads from lagging nodes)  │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Mitigation strategies:                                        │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ • Size oplog appropriately for write volume             │   │
│   │ • Monitor replication lag                               │   │
│   │ • Build indexes in rolling fashion (one node at a time) │   │
│   │ • Use hidden indexes for testing before promoting       │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 8: Summary

### 8.1 MongoDB Index Architecture — Key Points

```
┌─────────────────────────────────────────────────────────────────┐
│                    ARCHITECTURE SUMMARY                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   STORAGE MODEL:                                                │
│   • WiredTiger B-trees for both collections and indexes         │
│   • Documents stored by RecordId (stable logical identifier)    │
│   • Indexes store: (key_value → RecordId)                       │
│                                                                  │
│   MVCC IMPLEMENTATION:                                          │
│   • Timestamp-based visibility (start_ts, stop_ts)              │
│   • Versions stored WITH documents, not separately              │
│   • No external commit log lookups                              │
│   • Automatic cleanup via eviction/reconciliation               │
│                                                                  │
│   WRITE EFFICIENCY:                                             │
│   • RecordId never changes → only modified field indexes update │
│   • Non-indexed field updates: 1 write (collection only)        │
│   • Far lower write amplification than traditional RDBMS        │
│                                                                  │
│   SCHEMA FLEXIBILITY:                                           │
│   • Sparse indexes: skip documents without field                │
│   • Partial indexes: filter expression selects documents        │
│   • Wildcard indexes: dynamic field indexing                    │
│   • No ALTER TABLE for schema changes                           │
│                                                                  │
│   TIME SERIES OPTIMIZATION:                                     │
│   • Bucketing: 1000 measurements = 1 document                   │
│   • Column-oriented storage within buckets                      │
│   • 5-10x compression, 1000x MVCC overhead reduction            │
│   • Efficient TTL via bucket deletion                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Design Recommendations

```
┌─────────────────────────────────────────────────────────────────┐
│                  INDEX DESIGN BEST PRACTICES                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   1. INDEX SELECTION:                                           │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ • Create indexes for actual query patterns              │   │
│   │ • Use explain() to verify index usage                   │   │
│   │ • Remove unused indexes (check $indexStats)             │   │
│   │ • Prefer compound indexes over multiple single-field    │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   2. COMPOUND INDEX ORDERING:                                   │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ • Equality filters first                                │   │
│   │ • Sort fields next                                      │   │
│   │ • Range filters last                                    │   │
│   │ • ESR rule: Equality, Sort, Range                       │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   3. WRITE-HEAVY WORKLOADS:                                     │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ • Minimize index count                                  │   │
│   │ • Avoid indexing frequently-updated fields              │   │
│   │ • Consider time series collections for metrics/logs     │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   4. READ-HEAVY WORKLOADS:                                      │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ • Design for covered queries when possible              │   │
│   │ • Ensure indexes fit in WiredTiger cache                │   │
│   │ • Use partial indexes to reduce working set             │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   5. SCHEMA FLEXIBILITY:                                        │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │ • Use sparse indexes for optional fields                │   │
│   │ • Partial indexes for state-based filtering             │   │
│   │ • Wildcard indexes only when field names unpredictable  │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 8.3 Key Takeaways

1. **RecordId stability is the foundation** — Updates don't move documents, so indexes on unmodified fields are untouched

2. **MVCC is self-contained** — No external lookups for visibility checks; timestamps stored with documents

3. **Automatic garbage collection** — No explicit VACUUM; old versions cleaned during normal eviction

4. **Schema flexibility is native** — Sparse, partial, and wildcard indexes adapt to document heterogeneity

5. **Time series collections transform the economics** — Bucketing reduces documents, index entries, and MVCC overhead by ~1000x

6. **Write amplification scales with index count** — Be judicious; each index adds write overhead

7. **Covered queries eliminate document fetch** — Design indexes to include projected fields when possible
