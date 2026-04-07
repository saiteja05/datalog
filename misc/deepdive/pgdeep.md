# PostgreSQL Index Internals: From First Principles to Expert

A deep dive into how PostgreSQL indexes actually work — grounded in source code,
page layouts, and the mechanics of MVCC, TOAST, and vacuum.

---

## Table of Contents

1. [Foundational Concepts](#1-foundational-concepts)
2. [The Heap: Where Rows Live](#2-the-heap-where-rows-live)
3. [TIDs: The Address System](#3-tids-the-address-system)
4. [MVCC: The Visibility Layer](#4-mvcc-the-visibility-layer)
5. [Clustered Indexes vs PostgreSQL's Heap — A Deep Comparison](#5-clustered-indexes-vs-postgresqls-heap--a-deep-comparison)
6. [B-Tree Index Internals](#6-b-tree-index-internals)
7. [How Index Scans Actually Work (MVCC Edition)](#7-how-index-scans-actually-work-mvcc-edition)
8. [How Writes Affect Indexes](#8-how-writes-affect-indexes)
9. [HOT Updates: The Write Amplification Escape Hatch](#9-hot-updates-the-write-amplification-escape-hatch)
10. [VACUUM and Index Cleanup](#10-vacuum-and-index-cleanup)
11. [TOAST and Indexes](#11-toast-and-indexes)
12. [Bottlenecks and Pathologies](#12-bottlenecks-and-pathologies)
13. [Expert-Level Mechanics](#13-expert-level-mechanics)

---

## 1. Foundational Concepts

PostgreSQL does **not** have clustered indexes in the MySQL/InnoDB sense. There is
no "primary index" that dictates physical row order. Every table is a **heap** —
an unordered pile of pages. Every index, including the one backing a PRIMARY KEY,
is a **secondary index** that stores a copy of indexed columns plus a pointer
(TID) back to the heap tuple.

This is the single most important architectural difference from systems like
InnoDB (where the primary key IS the table) or SQL Server (which has clustered
indexes). It has profound consequences for performance, write amplification,
and storage layout.

**Key insight:** In PostgreSQL, a PRIMARY KEY constraint simply creates a unique
B-tree index. Structurally, it is identical to any other B-tree index. The "primary"
designation is purely a logical constraint — it has zero impact on physical storage
of the heap.

---

## 2. The Heap: Where Rows Live

### Page Layout (8 KB default)

Every heap relation is stored as an array of fixed-size pages (default 8192 bytes).
Each page has this layout:

```
+--------------------+-------------------------------+
| PageHeaderData     | 24 bytes                      |
+--------------------+-------------------------------+
| ItemIdData[]       | Line pointer array, grows →   |
|   (lp_off, lp_len, |                               |
|    lp_flags)       |                               |
+--------------------+-------------------------------+
|                    | Free space                    |
|          pd_lower ↓|                               |
|          pd_upper ↑|                               |
+--------------------+-------------------------------+
| Tuple data         | Tuples, packed ← from end     |
+--------------------+-------------------------------+
| Special space      | (Unused in heap; used in idx) |
+--------------------+-------------------------------+
```

Line pointers (`ItemIdData`) are 4 bytes each:

```c
typedef struct ItemIdData {
    unsigned lp_off:15;    // offset to tuple from page start
    unsigned lp_flags:2;   // LP_UNUSED, LP_NORMAL, LP_REDIRECT, LP_DEAD
    unsigned lp_len:15;    // byte length of tuple
} ItemIdData;
```

Line pointers grow forward from `pd_lower`; tuples are packed backward from
`pd_upper`. This indirection is crucial — it lets the tuple's physical position
on the page change (during compaction) without invalidating external pointers.

### Heap Tuple Header

Every row version (tuple) carries a 23-byte header:

```c
struct HeapTupleHeaderData {
    union {
        HeapTupleFields t_heap;     // xmin, xmax, cid
        DatumTupleFields t_datum;
    } t_choice;
    ItemPointerData t_ctid;         // TID of this or next version
    uint16 t_infomask2;             // # of attributes + flags
    uint16 t_infomask;              // visibility flags
    uint8  t_hoff;                  // offset to user data
    bits8  t_bits[];                // null bitmap (variable)
};
```

`t_ctid` forms the **update chain**: it points to the next version of the row
after an UPDATE. The last version in the chain points to itself. This is how
PostgreSQL implements MVCC without an undo log — old and new versions coexist
in the heap.

---

## 3. TIDs: The Address System

A **TID** (Tuple Identifier), also called a **ctid** or **ItemPointer**, is the
physical address of a tuple:

```c
typedef struct ItemPointerData {
    BlockIdData ip_blkid;     // block (page) number — 4 bytes
    OffsetNumber ip_posid;    // line pointer index — 2 bytes
} ItemPointerData;
```

Total: **6 bytes**. A TID like `(42, 3)` means "page 42, line pointer 3."

This is what every index entry stores. When an index scan finds a match, it
extracts the TID and uses it to fetch the heap tuple directly — a single
page read (if the page is not in shared buffers, one I/O).

**TIDs are physical, not logical.** They change when:
- A tuple is UPDATEd (new version gets a new TID)
- VACUUM FULL or CLUSTER rewrites the table
- A tuple is moved to a different page

This is why every UPDATE that changes an indexed column must also update
every index — the TID changed.

---

## 4. MVCC: The Visibility Layer

This is the concept that makes PostgreSQL's index story fundamentally different
from systems with in-place updates. Every row can have **multiple physical
versions** alive simultaneously in the heap. Indexes point to all of them.
The question "is this row visible to me?" is answered not by the index, but by
the heap, using MVCC rules.

### The Core Problem

An index entry says: "there is a row with `name = 'Alice'` at TID (42, 3)."

But it does NOT say:
- Which transaction created that row
- Whether that transaction committed
- Whether another transaction deleted that row
- Whether the row is visible to YOUR transaction

**Indexes are visibility-blind.** They contain no xmin, no xmax, no transaction
metadata whatsoever. This is a deliberate design choice — storing visibility
in indexes would require updating index entries on every commit/abort, which
would be catastrophically expensive.

### How Visibility Actually Works

Every heap tuple carries its own visibility metadata in the tuple header:

```c
typedef struct HeapTupleFields {
    TransactionId t_xmin;    // XID of the transaction that INSERTED this tuple
    TransactionId t_xmax;    // XID of the transaction that DELETED/locked this tuple
    union {
        CommandId     t_cid;     // command ID within the transaction
        TransactionId t_xvac;   // old-style VACUUM FULL xact ID
    } t_field3;
} HeapTupleFields;
```

And the `t_infomask` flags encode the known state:

```
HEAP_XMIN_COMMITTED  (0x0100)   inserting transaction committed
HEAP_XMIN_INVALID    (0x0200)   inserting transaction aborted
HEAP_XMIN_FROZEN     (0x0300)   tuple is frozen (always visible)
HEAP_XMAX_COMMITTED  (0x0400)   deleting transaction committed
HEAP_XMAX_INVALID    (0x0800)   no valid deleter (tuple is live)
HEAP_XMAX_IS_MULTI   (0x1000)   xmax is a MultiXactId (row locks)
HEAP_UPDATED         (0x2000)   this tuple is the result of an UPDATE
```

### Snapshots: Your Window Into the Database

A **snapshot** defines which transactions' effects are visible to a query.
It is taken at query start (READ COMMITTED) or transaction start
(REPEATABLE READ / SERIALIZABLE):

```c
typedef struct SnapshotData {
    SnapshotType snapshot_type;
    TransactionId xmin;      // all XIDs < xmin are finished (visible if committed)
    TransactionId xmax;      // all XIDs >= xmax are still running (invisible)
    TransactionId *xip;      // list of in-progress XIDs in [xmin, xmax)
    uint32        xcnt;      // count of xip entries
    TransactionId *subxip;   // in-progress subtransaction XIDs
    int32         subxcnt;
    CommandId     curcid;    // commands < curcid in MY transaction are visible
} SnapshotData;
```

The visibility rule for a tuple is (simplified):

```
VISIBLE if:
    xmin is committed AND xmin is not in snapshot's xip[]
    AND (xmax is invalid/aborted OR xmax is in snapshot's xip[] OR xmax >= snapshot.xmax)

NOT VISIBLE if:
    xmin is aborted
    OR xmin is still in-progress (in xip[] or >= xmax)
    OR xmax is committed AND not in snapshot's xip[]
```

### The Visibility Check Functions

PostgreSQL has a family of visibility functions, each for a different context:

```
HeapTupleSatisfiesMVCC()      Normal queries — uses snapshot
HeapTupleSatisfiesUpdate()    UPDATE/DELETE — needs to know if row is locked
HeapTupleSatisfiesSelf()      See everything my transaction did (catalog scans)
HeapTupleSatisfiesDirty()     Like Self, but also sees uncommitted changes
HeapTupleSatisfiesVacuum()    VACUUM — "is any running transaction using this?"
HeapTupleSatisfiesToast()     TOAST — visible unless mid-vacuum
HeapTupleSatisfiesAny()       Everything is visible (debugging, pg_filedump)
```

For index scans, `HeapTupleSatisfiesMVCC()` is the one that matters. After
fetching a heap tuple by TID, it applies the snapshot rules. If the tuple
fails the visibility check, the index scan silently moves to the next entry.

### Why This Matters for Indexes

Consider a table `users` with an index on `email`. Transaction A inserts
`('alice@example.com')` but hasn't committed yet. Transaction B does
`SELECT * FROM users WHERE email = 'alice@example.com'`.

```
Index leaf page:
  ('alice@example.com', TID=(42, 3))    ← entry exists!

Heap page 42, slot 3:
  xmin = 500 (Transaction A, still running)
  xmax = 0   (not deleted)
  data = ('alice@example.com', ...)
```

Transaction B's index scan finds the entry, follows the TID to the heap,
calls `HeapTupleSatisfiesMVCC()`, discovers xmin=500 is in its snapshot's
`xip[]` (still running), and **skips the tuple**. The index had the entry
all along — MVCC filtering happened at the heap level.

This means:
1. **Every index scan that isn't index-only must visit the heap** — not just
   for the row data, but to answer the fundamental question "does this row
   exist for me?"
2. **Indexes accumulate entries for all versions** — committed, uncommitted,
   and aborted. They are cleaned up lazily by VACUUM.
3. **A long-running transaction can prevent visibility cleanup** — if its
   snapshot holds an old xmin, VACUUM cannot remove tuples that might be
   visible to it, and the index entries for those tuples persist.

### Hint Bits: Avoiding Repeated Lookups

The first time a tuple is examined, PostgreSQL may need to look up the
transaction's commit status in `pg_xact` (the commit log) or check the
`ProcArray` (list of running backends). This is expensive.

Once the status is known, PostgreSQL sets **hint bits** on the tuple header
so subsequent visitors can skip the lookup:

```
HEAP_XMIN_COMMITTED  →  xmin is committed (tuple was validly inserted)
HEAP_XMIN_INVALID    →  xmin aborted (tuple should be ignored)
HEAP_XMAX_COMMITTED  →  xmax committed (tuple was validly deleted)
HEAP_XMAX_INVALID    →  xmax is invalid (tuple is not deleted)
```

Setting hint bits is a **write to the heap page**, even during what should be
a read-only SELECT. This is one reason PostgreSQL's read path generates WAL
(if `wal_log_hints = on` or checksums are enabled) — a "dirty read" that
sets hint bits must be crash-safe.

The source code is explicit about when this is safe:

```c
// From heapam_visibility.c:
// "It is only safe to set a transaction-committed hint bit if we know
//  the transaction's commit record is guaranteed to be flushed to disk
//  before the buffer, or if the table is temporary or unlogged."
```

### Isolation Levels and Index Behavior

The isolation level determines **when** a snapshot is taken, which changes what
index scans see:

| Isolation Level | Snapshot Taken | Effect on Index Scans |
|----------------|----------------|----------------------|
| READ COMMITTED | Per statement | Same index scan sees newly committed rows if re-executed |
| REPEATABLE READ | Per transaction | Stable view — same results throughout transaction |
| SERIALIZABLE | Per transaction | Like REPEATABLE READ + conflict detection for write skew |

The index AM itself is completely unaware of isolation levels. It returns TIDs
mechanically. The heap visibility check — driven by the snapshot — is where
isolation semantics are enforced.

### The Multi-Version Index Storage Problem

Because PostgreSQL stores all tuple versions in the heap and indexes point to
ALL of them, a single logical row that has been updated 100 times produces:

- **100 heap tuples** (old versions, gradually reclaimable)
- **Up to 100 index entries per index** (all pointing to different TIDs)

Until VACUUM cleans up the dead versions, every index carries the weight of
the entire version history. This is the fundamental tension in PostgreSQL's
MVCC design: **read performance requires no locks, but the cost is paid in
storage and cleanup overhead for indexes.**

---

## 5. Clustered Indexes vs PostgreSQL's Heap — A Deep Comparison

This section goes deep into the two fundamentally different ways a relational
database can organize table data, with concrete examples of what the storage
looks like on disk in each model.

### The Clustered Index Model (InnoDB / SQL Server)

In a clustered index system, **the primary key index IS the table**. There is
no separate heap. Row data lives directly inside the leaf pages of the primary
key B-tree, physically ordered by the primary key.

Consider a table:

```sql
CREATE TABLE orders (
    id         BIGINT PRIMARY KEY,
    customer   INT,
    amount     DECIMAL(10,2),
    status     VARCHAR(20)
);
```

**InnoDB's physical storage** looks like this:

```
PRIMARY KEY B-Tree (this IS the table)
═══════════════════════════════════════

             ┌──────────────────────┐
             │  Internal Page       │
             │  [id=500 → page 7]  │
             │  [id=1000 → page 12]│
             └──────┬───────┬───────┘
                    │       │
         ┌──────────┘       └──────────┐
         ▼                             ▼
┌─────────────────────┐    ┌─────────────────────────┐
│ Leaf Page 7         │    │ Leaf Page 12             │
│                     │    │                          │
│ id=501: entire row  │    │ id=1001: entire row      │
│  (customer=42,      │    │  (customer=77,           │
│   amount=99.50,     │    │   amount=250.00,         │
│   status='shipped') │    │   status='pending')      │
│                     │    │                          │
│ id=502: entire row  │    │ id=1002: entire row      │
│  (customer=42,      │    │  (customer=88,           │
│   amount=45.00,     │    │   amount=120.00,         │
│   status='pending') │    │   status='shipped')      │
│                     │    │                          │
│ id=503: entire row  │    │ id=1003: entire row      │
│  ...                │    │  ...                     │
│                     │    │                          │
│    next → page 12   │    │    next → page 15        │
└─────────────────────┘    └─────────────────────────┘

Rows are INSIDE the B-tree.  There is no heap.
A PK lookup = one B-tree descent.  You already have the full row.
```

**Secondary indexes in InnoDB** do NOT store a physical address. They store
the primary key value as the "pointer":

```
Secondary Index on (customer)
═════════════════════════════

         ┌──────────────────────┐
         │  Internal Page       │
         └──────┬───────┬───────┘
                │       │
     ┌──────────┘       └──────────┐
     ▼                             ▼
┌──────────────────┐    ┌──────────────────┐
│ Leaf Page         │    │ Leaf Page         │
│                   │    │                   │
│ customer=42 → PK 501│  │ customer=88 → PK 1002│
│ customer=42 → PK 502│  │ customer=99 → PK 1050│
│ customer=77 → PK 1001│ │ customer=99 → PK 1051│
│                   │    │                   │
└──────────────────┘    └──────────────────┘

To get the full row: traverse THIS index → get PK value →
traverse the PRIMARY KEY index again → find row data in leaf.
This is the "double lookup" or "bookmark lookup."
```

### PostgreSQL's Heap Model

In PostgreSQL, the table is a **heap** — an unordered array of 8 KB pages.
Rows are inserted wherever there is free space. The primary key index is
structurally identical to every other index.

**PostgreSQL's physical storage** for the same table:

```
Heap (the table — unordered)
════════════════════════════

┌─────────────────────────┐  ┌─────────────────────────┐
│ Heap Page 0             │  │ Heap Page 1              │
│                         │  │                          │
│ slot 1: id=501,         │  │ slot 1: id=503,          │
│  customer=42,           │  │  customer=55,            │
│  amount=99.50,          │  │  amount=75.00,           │
│  status='shipped'       │  │  status='pending'        │
│                         │  │                          │
│ slot 2: id=1002,        │  │ slot 2: id=502,          │
│  customer=88,           │  │  customer=42,            │
│  amount=120.00,         │  │  amount=45.00,           │
│  status='shipped'       │  │  status='pending'        │
│                         │  │                          │
│ slot 3: id=1001,        │  │ slot 3: id=1003,         │
│  customer=77,           │  │  customer=90,            │
│  amount=250.00,         │  │  amount=60.00,           │
│  status='delivered'     │  │  status='shipped'        │
│                         │  │                          │
└─────────────────────────┘  └─────────────────────────┘

Notice: rows are NOT in PK order. id=1002 sits between id=501 and id=1001.
Rows land wherever the FSM found free space at insert time.


Primary Key Index (just a regular B-tree)
═════════════════════════════════════════

         ┌──────────────────────┐
         │  Internal Page       │
         └──────┬───────┬───────┘
                │       │
     ┌──────────┘       └──────────┐
     ▼                             ▼
┌──────────────────────┐    ┌──────────────────────┐
│ Leaf Page             │    │ Leaf Page             │
│                       │    │                       │
│ id=501 → TID(0,1)    │    │ id=1001 → TID(0,3)   │
│ id=502 → TID(1,2)    │    │ id=1002 → TID(0,2)   │
│ id=503 → TID(1,1)    │    │ id=1003 → TID(1,3)   │
│                       │    │                       │
└──────────────────────┘    └──────────────────────┘

Index on (customer) — structurally identical
════════════════════════════════════════════

┌──────────────────────────┐
│ Leaf Page                 │
│                           │
│ customer=42 → TID(0,1)   │    Both indexes store key + TID.
│ customer=42 → TID(1,2)   │    Both require a heap fetch for
│ customer=55 → TID(1,1)   │    the full row.
│ customer=77 → TID(0,3)   │
│ customer=88 → TID(0,2)   │    There is no hierarchy between them.
│ customer=90 → TID(1,3)   │
│                           │
└──────────────────────────┘
```

### Lookup Paths Compared

**PK lookup: `SELECT * FROM orders WHERE id = 502`**

```
InnoDB (clustered):
  1. Descend PK B-tree → find leaf containing id=502
  2. Row data is RIGHT THERE in the leaf page
  Total: 1 B-tree traversal, 0 extra I/O
  The index leaf IS the row.

PostgreSQL (heap):
  1. Descend PK B-tree → find leaf with id=502 → TID(1,2)
  2. Fetch heap page 1, slot 2 → read the row
  Total: 1 B-tree traversal + 1 heap page fetch
  The index leaf is a pointer; the row is elsewhere.
```

**Secondary index lookup: `SELECT * FROM orders WHERE customer = 88`**

```
InnoDB (clustered):
  1. Descend secondary index → find customer=88 → PK value 1002
  2. Descend PK B-tree with id=1002 → find leaf → row data
  Total: 2 B-tree traversals (the "double lookup")

PostgreSQL (heap):
  1. Descend customer index → find customer=88 → TID(0,2)
  2. Fetch heap page 0, slot 2 → read the row
  Total: 1 B-tree traversal + 1 heap page fetch
  Same cost as a PK lookup.  No double lookup.
```

**Range scan: `SELECT * FROM orders WHERE id BETWEEN 500 AND 510`**

```
InnoDB (clustered):
  1. Descend PK B-tree to id=500
  2. Scan leaf pages sequentially — rows are contiguous, in order
  3. All data is already in the leaf pages — pure sequential read
  Total: stunning I/O locality.  Adjacent keys = adjacent bytes on disk.

PostgreSQL (heap):
  1. Descend PK B-tree to id=500
  2. Scan leaf pages — get TID(0,1), TID(1,2), TID(1,1), TID(0,3), ...
  3. Each TID points to a DIFFERENT heap page — random I/O
  Total: one random heap page read per matching row.
  Adjacent keys ≠ adjacent heap locations.
```

This range scan difference is where clustered indexes shine brightest.

### Pros and Cons

#### Clustered Indexes (InnoDB-style): Advantages

**1. PK range scans are sequential I/O.**
Rows with adjacent primary keys are physically adjacent on disk. A range scan
like `WHERE id BETWEEN 1000 AND 2000` reads leaf pages in order — no random
heap fetches. For time-series data (where PK is a timestamp), this is ideal.

**2. PK lookups avoid a heap fetch.**
The B-tree leaf IS the row. One traversal, done. No indirection.

**3. Covering by default.**
The PK index "covers" every column because it contains the full row. No need
for INCLUDE columns on the primary key.

**4. Better cache efficiency for PK access patterns.**
Buffer pool pages contain full rows in PK order. If your workload is PK-centric
(e.g., key-value stores, session tables), every cached page is maximally useful.

**5. No separate heap storage.**
The table IS the index. Less total storage overhead for the primary key path
compared to PostgreSQL's heap + separate PK index.

#### Clustered Indexes (InnoDB-style): Disadvantages

**1. Secondary indexes pay the double-lookup tax.**
Every secondary index lookup requires two B-tree traversals. For workloads that
rely heavily on non-PK indexes, this is a constant overhead PostgreSQL avoids.

**2. Secondary indexes are wider.**
Instead of storing a 6-byte TID, they store the full PK value. For a table with
a composite PK like `(tenant_id BIGINT, order_id BIGINT)`, every secondary index
entry carries an extra 16 bytes. Multiply by millions of rows and multiple
secondary indexes — significant space overhead.

**3. PK choice affects everything.**
A poor PK choice (e.g., UUID) causes random inserts into the clustered index,
splitting leaf pages and fragmenting the table. Since the PK index IS the table,
fragmentation of the PK = fragmentation of all your data. In PostgreSQL, a bad
index choice only fragments that one index; the heap is unaffected.

**4. Page splits are more expensive.**
An InnoDB leaf page split moves actual row data (potentially hundreds of bytes
per row). A PostgreSQL B-tree leaf page split moves only index tuples (key +
6-byte TID). The heap is untouched.

**5. Wide rows reduce B-tree fan-out.**
Since full rows live in leaf pages, wide rows mean fewer entries per page,
deeper trees, and more I/O per traversal. PostgreSQL's index leaves only hold
narrow key + TID entries regardless of row width.

**6. No true sequential scan.**
InnoDB has no heap to sequentially scan — a "full table scan" walks the PK
B-tree leaves. This is still sequential in PK order, but less efficient than
PostgreSQL's heap scan when no ordering is needed (the B-tree structure adds
overhead from internal pages and the page linked list).

#### PostgreSQL Heap Model: Advantages

**1. All indexes are equal.**
No index is privileged. Any index gets you to the row in one traversal + one
heap fetch. Secondary index lookups are cheaper than in InnoDB.

**2. Narrow index entries.**
Every index stores key + 6-byte TID. No embedded row data, no embedded PK
copies. This means higher fan-out, shallower trees, smaller index files.

**3. PK choice is less critical.**
UUIDs as PKs cause random inserts into the PK index (bad for that index) but
don't fragment the heap — new rows go wherever the FSM finds space. In InnoDB,
UUID PKs fragment the entire table.

**4. HOT updates.**
Because the heap is separate from indexes, PostgreSQL can update a row in-place
in the heap without touching any index (when no indexed column changes and the
new tuple fits on the same page). InnoDB has no equivalent — even a non-key
column change may trigger PK B-tree modifications.

**5. True sequential scan.**
The heap is a flat array of pages — `SELECT count(*) FROM big_table` reads
pages 0, 1, 2, ... linearly. No B-tree overhead.

**6. MVCC is simpler.**
Old tuple versions live in the heap alongside new ones. No undo log needed.
InnoDB must maintain a separate undo tablespace and reconstruct old versions
on the fly during consistent reads.

#### PostgreSQL Heap Model: Disadvantages

**1. Every index lookup requires a heap fetch.**
Even PK lookups: traverse index → get TID → fetch heap page. That extra I/O
hop is the fundamental cost of the heap model.

**2. PK range scans are random I/O.**
Adjacent PK values are scattered across the heap. A `WHERE id BETWEEN` scan
generates random heap page fetches instead of sequential reads. This is the
single biggest performance difference compared to clustered indexes.

**3. Dead tuple overhead.**
Old MVCC versions live in the heap and must be vacuumed. They accumulate in
indexes too. InnoDB's undo log is append-only and purged separately — dead
versions don't bloat the clustered index.

**4. Table + index duplication.**
The heap stores the full row. The PK index stores the key columns again. In
InnoDB, there is no duplication — the PK leaf IS the row. For a table with a
wide PK, PostgreSQL stores it twice.

**5. Correlation decay.**
Even if you CLUSTER the table once (rewrite it in index order), subsequent
INSERTs go wherever the FSM finds space — the physical ordering degrades over
time. InnoDB maintains PK ordering by construction, permanently.

### Side-by-Side Summary

| Dimension | Clustered (InnoDB) | Heap (PostgreSQL) |
|-----------|-------------------|-------------------|
| PK lookup cost | 1 B-tree traversal | 1 B-tree traversal + 1 heap fetch |
| Secondary lookup cost | 2 B-tree traversals (double lookup) | 1 B-tree traversal + 1 heap fetch |
| PK range scan I/O | Sequential (rows are contiguous) | Random (rows scattered in heap) |
| Secondary index entry size | Key + full PK value | Key + 6-byte TID |
| Page split cost | Moves full row data | Moves only key + TID |
| Effect of bad PK (e.g., UUID) | Fragments entire table | Fragments only the PK index |
| Non-indexed column UPDATE | May modify PK leaf page | HOT: heap-only, no index touch |
| Full table scan | Walk PK B-tree leaves | Scan flat heap pages |
| MVCC dead versions | Undo log (separate) | Inline in heap (needs VACUUM) |
| Storage for PK path | One structure (B-tree IS table) | Two structures (heap + PK index) |
| Index-only scan on PK | Always (leaf has full row) | Only if VM says all-visible |

### When Would You Want Which?

**Clustered index wins:**
- PK-dominant workloads (key-value access, ORM `.find(id)` calls)
- Time-series tables where PK is a timestamp and queries are always date-ranged
- Narrow tables where the PK is most of the row anyway
- Read-heavy with few secondary indexes

**PostgreSQL heap wins:**
- Workloads with many secondary indexes (no double-lookup penalty)
- Heavy UPDATE load on non-indexed columns (HOT updates)
- UUID or random PKs (heap doesn't fragment)
- Analytics / OLAP with frequent full table scans
- Wide tables where embedding rows in a B-tree would tank fan-out

---

## 6. B-Tree Index Internals

B-tree is the default and most common index type in PostgreSQL. Understanding
its page layout is essential.

### Index Page Layout

Index pages use the same 8 KB page format as heap pages, but with a critical
difference: the **special space** at the end contains B-tree metadata:

```c
typedef struct BTPageOpaqueData {
    BlockNumber btpo_prev;     // left sibling (or P_NONE)
    BlockNumber btpo_next;     // right sibling (or P_NONE)
    uint32      btpo_level;    // 0 = leaf, increases upward
    uint16      btpo_flags;    // BTP_LEAF, BTP_ROOT, BTP_DELETED, etc.
    BTCycleId   btpo_cycleid;  // vacuum cycle ID
} BTPageOpaqueData;
```

This forms a **doubly-linked list** at each level of the tree, enabling
efficient range scans (just follow `btpo_next` pointers).

### Page Flags

```
BTP_LEAF            (1 << 0)   Leaf page
BTP_ROOT            (1 << 1)   Root page
BTP_DELETED         (1 << 2)   Page deleted from tree
BTP_META            (1 << 3)   Meta page (block 0)
BTP_HALF_DEAD       (1 << 4)   Empty, pending unlink
BTP_SPLIT_END       (1 << 5)   Last page from a split
BTP_HAS_GARBAGE     (1 << 6)   Contains LP_DEAD items
BTP_INCOMPLETE_SPLIT (1 << 7)  Right sibling's downlink not yet inserted
```

### Index Tuple Structure

```c
typedef struct IndexTupleData {
    ItemPointerData t_tid;     // heap TID (leaf) or downlink (internal)
    unsigned short t_info;     // size + flags
} IndexTupleData;
```

The `t_info` field packs:
- Bits 0-12: tuple size (INDEX_SIZE_MASK = 0x1FFF, max ~8 KB)
- Bit 13: AM reserved (B-tree uses for alt TID interpretation)
- Bit 14: has variable-width attributes
- Bit 15: has null attributes

After the header comes an optional null bitmap, then the indexed column values.

### Three Types of B-Tree Tuples

**1. Non-pivot tuples (leaf pages)**

```
[ t_tid → heap TID ] [ t_info ] [ key values ] [ INCLUDE columns ]
```

These are what you think of as "index entries." They store the indexed column
values and point directly to the heap tuple via the TID.

**2. Pivot tuples (internal pages)**

```
[ t_tid → child block (downlink) ] [ t_info ] [ key prefix ]
```

Internal nodes do NOT point to heap tuples. The `t_tid` field is repurposed as
a **downlink** — the block number of a child page. Pivot tuples may be
**suffix-truncated**: they only store enough key columns to separate the left
and right subtrees, saving space.

**3. Posting list tuples (deduplicated leaves)**

```
[ t_tid → posting metadata ] [ t_info ] [ key values ] [ TID1, TID2, TID3, ... ]
```

When deduplication is enabled (default since PG 13), multiple heap TIDs sharing
the same key value are merged into a single index tuple with a posting list.
This dramatically reduces index size for low-cardinality columns.

### High Key

Every non-rightmost page has a **high key** stored at position 1. The high key
is the upper bound: all tuples on this page are strictly less than the high key.
The actual data tuples start at position 2. Rightmost pages have no high key
(data starts at position 1).

```c
#define P_HIKEY     ((OffsetNumber) 1)
#define P_FIRSTKEY  ((OffsetNumber) 2)
#define P_FIRSTDATAKEY(opaque) \
    (P_RIGHTMOST(opaque) ? P_HIKEY : P_FIRSTKEY)
```

### Fill Factor

```c
#define BTREE_DEFAULT_FILLFACTOR    90   // leaves: 10% free for future inserts
#define BTREE_NONLEAF_FILLFACTOR    70   // internal pages: 30% free
#define BTREE_MIN_FILLFACTOR        10
```

Leaf pages are filled to 90% by default during bulk operations, leaving room
for future inserts to avoid immediate splits.

---

## 7. How Index Scans Actually Work (MVCC Edition)

Understanding index scans requires understanding that the index is
visibility-blind. The scan has two distinct phases: **key matching** (in the
index) and **visibility filtering** (in the heap). Both must succeed for a
tuple to be returned.

### Index Scan (indexscan) — Full MVCC Path

```
 B-tree                          Heap                    Snapshot
┌──────────┐                 ┌──────────┐            ┌──────────────┐
│ 1. Start │                 │          │            │ xmin = 100   │
│ at root  │                 │          │            │ xmax = 200   │
│          │                 │          │            │ xip = [150]  │
│ 2. Descend                 │          │            │              │
│ to leaf  │                 │          │            │              │
│          │                 │          │            │              │
│ 3. Find  │   TID (42,3)   │ 4. Fetch │  5. Check  │              │
│ match  ──┼────────────────►│ tuple  ──┼──────────►│ Visible?     │
│          │                 │          │            │              │
│          │                 │ xmin=90  │  90 < 100  │ xmin OK ✓    │
│          │                 │ xmax=0   │  invalid   │ not deleted ✓│
│          │                 │          │            │ → RETURN ROW │
│          │                 │          │            │              │
│ 6. Next  │   TID (43,1)   │ 7. Fetch │  8. Check  │              │
│ match  ──┼────────────────►│ tuple  ──┼──────────►│ Visible?     │
│          │                 │          │            │              │
│          │                 │ xmin=150 │  in xip[]  │ xmin RUNNING │
│          │                 │          │            │ → SKIP       │
└──────────┘                 └──────────┘            └──────────────┘
```

Step by step:

1. **Descend** the B-tree from root → internal → leaf using `_bt_search()`.
2. At each internal level, binary search the page for the right downlink.
   If a concurrent split moved the target right, follow `btpo_next` via
   `_bt_moveright()`.
3. At the leaf, binary search for the first matching tuple.
4. **Extract TID** from the matching index tuple.
5. **Heap fetch**: use the TID to read the heap page. If the tuple is part
   of a HOT chain, follow `t_ctid` links to find the chain members.
6. **Visibility check**: call `HeapTupleSatisfiesMVCC(tuple, snapshot, buffer)`.
   This examines `t_xmin`, `t_xmax`, the `t_infomask` hint bits, and compares
   against the snapshot's `xmin`, `xmax`, and `xip[]` array. If the tuple
   is not visible to this snapshot, **skip it** and try the next index entry.
7. **Hint bit setting**: if the visibility check resolved a transaction's
   commit/abort status, set hint bits on the tuple so future visitors pay
   no lookup cost. This is a write to the heap page during a read query.
8. **Continue**: follow `btpo_next` for range scans until the scan key is
   exhausted.

The critical insight: for a query like `SELECT * FROM users WHERE id = 42`,
the index may find 5 entries (5 versions of the row from successive UPDATEs),
follow each TID to the heap, and discover that only 1 version passes the
MVCC visibility check. The other 4 heap fetches are wasted work — the
**phantom read cost** of multi-version storage.

### Index-Only Scan — The Visibility Map Shortcut

If the query only needs columns present in the index (including INCLUDE columns),
PostgreSQL can skip the heap fetch — but only if it can prove visibility
without reading the heap tuple. This is where the **visibility map** comes in.

```c
// From nodeIndexonlyscan.c:
if (!VM_ALL_VISIBLE(scandesc->heapRelation,
                    ItemPointerGetBlockNumber(tid),
                    &node->ioss_VMBuffer))
{
    // Must visit the heap to check visibility
    if (!index_fetch_heap(scandesc, node->ioss_TableSlot))
        continue;  // not visible, try next index entry
}
// If VM says all-visible, skip heap entirely — return data from index
```

The visibility map has **two bits per heap page**:
- **All-visible**: every tuple on the page is visible to all current snapshots
- **All-frozen**: every tuple is also frozen (immune to XID wraparound)

When a page is all-visible, no transaction can have inserted, deleted, or
updated any tuple on it without clearing the bit. This means any TID pointing
to that page is guaranteed visible — no heap fetch needed.

**The catch:** VACUUM is responsible for setting VM bits. On a table with heavy
writes, many pages will not be all-visible, and index-only scans degrade to
regular index scans (with heap fetches). Monitor with
`pg_stat_user_tables.idx_tup_fetch` — high values during index-only scans
indicate poor VM coverage.

### Bitmap Index Scan — Batching the Visibility Problem

1. Scan the index and collect all matching TIDs into a bitmap.
2. Sort TIDs by block number (convert random I/O to sequential).
3. Fetch heap pages in physical order.
4. For each tuple on each page: **apply MVCC visibility check**.
5. Re-check index conditions on visible tuples (lossy bitmap may have
   lost precision).

The bitmap approach amortizes the random I/O problem but still requires
full visibility checks on the heap. It cannot use the VM shortcut because
it needs the full tuple data (not just index columns).

### kill_prior_tuple: MVCC-Driven Index Cleanup

During an index scan, when PostgreSQL follows a TID to the heap and discovers
the entire HOT chain is dead (no version visible to ANY running transaction,
not just this one), it sets `scan->kill_prior_tuple = true`.

On the next `index_getnext_tid` call, the B-tree AM calls `_bt_killitems()`,
which sets LP_DEAD on those index entries. This is safe because:

- The pin held on the leaf page prevents VACUUM from recycling TIDs on that page
- The heap check confirmed the tuples are dead to all, not just this snapshot
- LP_DEAD entries are skipped by future scans and reclaimed by future inserts

This is an opportunistic, MVCC-driven optimization — the scan's visibility
check generates cleanup information as a side effect.

---

## 8. How Writes Affect Indexes

### INSERT

```
heap_insert()          →  1 heap page write
  ↓
index_insert() × N    →  1 B-tree leaf write per index (may cascade to splits)
```

**Write amplification factor = N + 1** (one heap write + one per index).

Each index insert:
1. Descends the B-tree to the correct leaf.
2. If the leaf has space, inserts the tuple.
3. If the leaf is full: attempts deduplication, then LP_DEAD cleanup, then
   bottom-up deletion. If none free enough space → **page split**.

A page split:
1. Allocates a new page.
2. Chooses a split point via `_bt_findsplitloc()`.
3. Redistributes tuples between old and new pages.
4. Suffix-truncates the new pivot tuple (leaf splits only).
5. Inserts the pivot into the parent (may cascade upward).
6. If the root splits, a new root level is created.

### UPDATE

An UPDATE in PostgreSQL is **DELETE + INSERT** internally:

```
heap_update():
  1. Set xmax on old tuple (logical delete)
  2. Insert new tuple version (new TID)
  3. Old tuple's t_ctid → new tuple's TID (forms update chain)

For each index where an indexed column changed:
  - No explicit delete of old entry (it becomes "dead" naturally)
  - Insert new entry pointing to new TID
```

**Write amplification for non-HOT UPDATE = 1 heap + N index inserts**.

The old index entries are not removed immediately. They remain in the index
pointing to the old (now-dead) heap tuple until VACUUM removes them. This is
a major source of **index bloat**.

### DELETE

```
heap_delete():
  1. Set xmax on the tuple
  2. Set PageSetPrunable hint
  3. NO index changes happen at delete time
```

**Write amplification for DELETE = 1 heap write, 0 index writes.**

Index entries pointing to deleted tuples persist until VACUUM. During index
scans, they are followed to the heap, the dead tuple is discovered, and
the `kill_prior_tuple` mechanism may flag them as LP_DEAD.

---

## 9. HOT Updates: The Write Amplification Escape Hatch

**Heap-Only Tuples (HOT)** are PostgreSQL's most important optimization for
write-heavy workloads. When an UPDATE meets certain conditions, the new tuple
version is linked directly in the heap without touching any index.

### Conditions for HOT

All of these must be true:
1. **No indexed column changed**: `!bms_overlap(modified_attrs, hot_attrs)`
2. **New tuple fits on the same page**: `newbuf == buffer`
3. Sufficient free space exists on the page

When these conditions are met:

```c
HeapTupleSetHotUpdated(&oldtup);    // flag old tuple
HeapTupleSetHeapOnly(heaptup);      // flag new tuple
```

### How HOT Chains Work

```
Index entry → TID (42, 3) → [old tuple, t_ctid=(42,7)] → [new tuple, t_ctid=(42,7)]
                               HEAP_HOT_UPDATED             HEAP_ONLY_TUPLE
```

The index still points to the original (root) tuple. Following the `t_ctid`
chain leads to the live version. The new tuple is "heap-only" — no index
knows about it directly.

### HOT Chain Pruning

When a page is accessed and dead tuples are found, `heap_page_prune_opt()`
can clean up HOT chains:

1. **Root tuple (all versions dead)**: line pointer → LP_DEAD
   (kept because indexes still reference it)
2. **Root tuple (some versions live)**: line pointer → LP_REDIRECT
   to the first live tuple
3. **Heap-only tuples (dead)**: line pointer → LP_UNUSED
   (immediately recyclable, no index references them)

This reclaims space on the page without VACUUM and without touching indexes.

### Why HOT Matters

For a table with 10 indexes, a non-HOT UPDATE requires 11 writes
(1 heap + 10 index inserts). A HOT UPDATE requires 1 write (heap only).
That is an **11x reduction in write amplification**.

Design your schema to maximize HOT updates:
- Keep frequently-updated columns OUT of indexes
- Use generous fillfactor (e.g., 70-80%) to leave room for HOT updates on the same page
- Monitor `pg_stat_user_tables.n_tup_hot_upd` vs `n_tup_upd`

---

## 10. VACUUM and Index Cleanup

VACUUM is responsible for reclaiming dead tuples and their index entries.

### Lazy VACUUM Flow

```
Phase 1: Heap Scan
  - Scan all heap pages
  - Identify dead tuples (LP_DEAD line pointers)
  - Collect their TIDs into dead_items array
  - Freeze old tuples (prevent XID wraparound)

Phase 2: Index Vacuum (ambulkdelete)
  - For each index: scan the entire index
  - Delete entries whose TIDs match dead_items
  - B-tree: may also delete empty pages, recycle space

Phase 3: Heap Vacuum
  - Revisit heap pages with dead items
  - Set LP_DEAD → LP_UNUSED (truly free the space)
  - Update the Free Space Map (FSM)

Phase 4: Index Cleanup (amvacuumcleanup)
  - For each index: update statistics
  - B-tree: reclaim deleted pages, update metapage
```

### The ambulkdelete Callback

Each index access method implements this:

```c
typedef struct IndexVacuumInfo {
    Relation index;
    Relation heaprel;
    bool     analyze_only;
    double   num_heap_tuples;
    BufferAccessStrategy strategy;
} IndexVacuumInfo;
```

B-tree's implementation (`btbulkdelete`) walks the entire index leaf level,
checking each TID against the dead items set. This is O(index size), which
is why VACUUM on large tables with many indexes is expensive.

### The Problem of Index Vacuum Scaling

If you have a 100 GB table with 10 indexes, VACUUM must:
1. Scan 100 GB of heap
2. Scan each of the 10 indexes (potentially 10-50 GB each)
3. Total I/O: potentially 200-600 GB per VACUUM cycle

This is why tables with many indexes and high update rates are the hardest
workloads for PostgreSQL. Strategies to mitigate:
- Fewer indexes (audit and drop unused ones)
- More frequent VACUUM (smaller batches of dead tuples)
- Partitioning (VACUUM operates per partition)
- HOT updates (fewer dead index entries to clean up)

---

## 11. TOAST and Indexes

### What Is TOAST?

**The Oversized-Attribute Storage Technique.** When a tuple exceeds
`TOAST_TUPLE_THRESHOLD` (~2 KB for default 8 KB pages, calculated to fit
4 tuples per page), PostgreSQL automatically compresses and/or moves large
column values to a separate **TOAST table**.

### TOAST Constants (from `heaptoast.h`)

```c
#define TOAST_TUPLES_PER_PAGE    4
#define TOAST_TUPLE_THRESHOLD    MaximumBytesPerTuple(TOAST_TUPLES_PER_PAGE)
//   ≈ (8192 - header) / 4 ≈ ~2034 bytes

#define TOAST_MAX_CHUNK_SIZE     ~1996 bytes  // per chunk in TOAST table

#define TOAST_INDEX_TARGET       (MaxHeapTupleSize / 16)  // ≈ ~500 bytes
```

### TOAST Table Structure

Every TOASTable table gets a companion TOAST table with three columns:

```
chunk_id    (oid)     Identifies the TOAST value (matches va_valueid)
chunk_seq   (int32)   Chunk sequence number within that value
chunk_data  (bytea)   Actual data (up to TOAST_MAX_CHUNK_SIZE)
```

A unique B-tree index on `(chunk_id, chunk_seq)` enables efficient lookup
and ensures integrity.

### The TOAST Pointer

When a value is TOASTed, the heap tuple stores a compact pointer instead of
the full value:

```c
typedef struct varatt_external {
    int32   va_rawsize;      // original uncompressed size
    uint32  va_extinfo;      // external size + compression method
    Oid     va_valueid;      // unique ID in the TOAST table
    Oid     va_toastrelid;   // OID of the TOAST table
} varatt_external;           // 16 bytes + 1 byte varlena tag = 18 bytes
```

An 18-byte pointer replaces what could be megabytes of data.

### The Critical Rule: Indexes NEVER Store TOAST Pointers

This is one of the most important and least understood aspects of PostgreSQL
indexing. From `indextuple.c`:

```c
// During index tuple formation:
if (VARATT_IS_EXTERNAL(DatumGetPointer(values[i]))) {
    // DETOAST: fetch the full value from the TOAST table
    untoasted_values[i] = PointerGetDatum(
        detoast_external_attr((varlena *) DatumGetPointer(values[i]))
    );
}

// If the detoasted value is still large, try to compress it inline
if (VARSIZE(untoasted_values[i]) > TOAST_INDEX_TARGET &&
    (att->attstorage == TYPSTORAGE_EXTENDED ||
     att->attstorage == TYPSTORAGE_MAIN)) {
    cvalue = toast_compress_datum(untoasted_values[i], ...);
}
```

**What this means:**
1. When building an index entry, if a column value is stored externally
   (TOASTed), PostgreSQL **fetches the entire value** from the TOAST table.
2. It then stores the **actual data** (possibly compressed) directly in the
   index tuple.
3. Index tuples are self-contained — they never contain TOAST pointers.

### Consequences for Index Size

If you create an index on a `text` column that routinely stores 10 KB values:

- **Heap**: stores an 18-byte TOAST pointer per tuple
- **Index**: stores the full ~10 KB value (or compressed version) per entry

The index can be **much larger than the table** for TOASTed columns. This is
a common surprise.

`TOAST_INDEX_TARGET` (~500 bytes) is the threshold above which index values
are compressed. But even compressed, large values create fat index entries
that reduce the fan-out of the B-tree and increase tree height.

### TOAST Interaction During Operations

**INSERT:**
1. Heap insert → TOAST large attributes → store TOAST pointers in heap tuple
2. Index insert → detoast each indexed attribute → store actual data in index
3. TOAST table gets its own inserts + index inserts for chunks

**UPDATE:**
1. Old TOAST values may be reused if unchanged (`HEAP_HASEXTERNAL` optimization)
2. New TOAST values are inserted for changed attributes
3. Old TOAST values are deleted when old heap tuple is vacuumed
4. Index entries are rebuilt with detoasted values

**DELETE:**
1. Heap tuple marked dead
2. VACUUM later calls `heap_toast_delete()` → `toast_delete_datum()` for each
   external attribute → deletes from TOAST table via its index
3. Index entries removed by `ambulkdelete`

### TOAST and Index-Only Scans

Since index tuples contain actual data (not TOAST pointers), index-only scans
on TOASTed columns work correctly and do not need to access the TOAST table.
However, the index must still check the visibility map for MVCC correctness.

---

## 12. Bottlenecks and Pathologies

### 1. Write Amplification

Every index multiplies write cost. A table with 10 indexes and high UPDATE
rate experiences roughly 11x write amplification (without HOT). This manifests as:
- High WAL generation rate
- Increased replication lag
- I/O saturation
- Buffer pool pressure

**Mitigation:** Drop unused indexes, maximize HOT updates, use INCLUDE columns
instead of wider indexes.

### 2. Index Bloat

Dead index entries accumulate between VACUUM runs. Even after VACUUM removes
them, the freed space may not be returned to the OS — it is recycled within
the index. Over time, indexes can grow significantly larger than necessary.

Symptoms:
- Index size much larger than expected for the data volume
- Slow index scans (more pages to read)
- Wasted buffer pool space

**Mitigation:** `REINDEX`, `pg_repack`, regular VACUUM, monitor with
`pgstattuple` extension.

### 3. MVCC Version Accumulation in Indexes

This is the defining pathology of PostgreSQL's architecture. Because indexes
are visibility-blind, they accumulate entries for every tuple version:

```
Logical row: id=42, name='Alice'    (updated 5 times)

Heap:   TID(10,1) xmin=100 xmax=200  ← dead
        TID(10,4) xmin=200 xmax=300  ← dead
        TID(11,2) xmin=300 xmax=400  ← dead
        TID(11,5) xmin=400 xmax=500  ← dead
        TID(12,1) xmin=500 xmax=0    ← live

Index on name:
        ('Alice', TID(10,1))  ← points to dead tuple
        ('Alice', TID(10,4))  ← points to dead tuple
        ('Alice', TID(11,2))  ← points to dead tuple
        ('Alice', TID(11,5))  ← points to dead tuple
        ('Alice', TID(12,1))  ← points to live tuple
```

A scan for `name = 'Alice'` must follow all 5 TIDs to the heap and run
visibility checks on each. Only one returns a result. The other 4 are pure
overhead — MVCC's tax on read performance.

Between VACUUM runs, this ratio (dead entries / live entries) can grow
unboundedly. Multiply by the number of indexes and the problem compounds.

### 4. B-Tree Page Splits from Version Churn

Even when index key values don't change, non-HOT updates create new index
entries (same key, different TID). This "version churn" fills leaf pages
and causes splits.

PostgreSQL mitigates this with:
- **Deduplication** (posting lists): merge same-key entries, reducing space
- **Bottom-up deletion**: proactively remove entries pointing to dead heap
  tuples before resorting to a page split

```c
// From nbtdedup.c - bottom-up deletion targets:
// "entirely prevent 'unnecessary' page splits caused by MVCC version
//  churn from UPDATEs (when the UPDATEs don't logically modify any
//  of the columns covered by the index)"
```

### 5. The Random I/O Problem

Standard index scans produce random I/O: each TID points to a different heap
page. For queries returning many rows, this is slower than a sequential scan.

The crossover point depends on hardware but is typically 5-15% of the table.
Beyond that, the planner switches to sequential scan or bitmap index scan.

**Mitigation:** `CLUSTER` (one-time physical reorder), bitmap scans (automatic),
covering indexes (avoid heap access entirely).

### 6. VACUUM Overhead on Indexed Tables

VACUUM must scan every index for every batch of dead tuples. With many indexes:

```
VACUUM I/O ≈ heap_size + (num_indexes × index_size)
```

For a 500 GB table with 8 indexes averaging 50 GB each, one VACUUM cycle
reads ~900 GB.

**Mitigation:** Partitioning, fewer indexes, more frequent but shorter VACUUM
cycles (`autovacuum_vacuum_cost_delay`, `autovacuum_vacuum_scale_factor`).

### 7. TOAST Column Indexing Cost

Indexing a column with large values means each index INSERT must:
1. Fetch the value from the TOAST table (random I/O into TOAST pages)
2. Possibly decompress it
3. Possibly re-compress it for the index
4. Store the full (possibly compressed) value in the index

This can make index maintenance on text/jsonb columns surprisingly expensive.

---

## 13. Expert-Level Mechanics

### Suffix Truncation in Pivot Tuples

When a leaf page splits, the new pivot tuple inserted into the parent only
needs enough key columns to separate left and right pages. PostgreSQL
truncates unnecessary suffix columns via `_bt_truncate()`.

Example: If the last key on the left page is `('Smith', 'John', 42)` and the
first key on the right page is `('Smith', 'Mary', 17)`, the pivot only needs
`('Smith', 'Mary')` — the third column is unnecessary for routing.

This keeps internal pages compact, increasing fan-out and reducing tree height.

### Posting List Deduplication

Since PostgreSQL 13, duplicate keys on a leaf page are merged into posting
lists:

```
Before dedup:  ('key1', TID1)  ('key1', TID2)  ('key1', TID3)
After dedup:   ('key1', [TID1, TID2, TID3])
```

Space saved = (N-1) × key_size for N duplicates. For a boolean column index,
this can reduce index size by 50%+.

Maximum posting list size is capped at `BTMaxItemSize / 2` to prevent a
single posting tuple from monopolizing a page.

### The Visibility Map and Index-Only Scans

The visibility map (VM) has two bits per heap page:
- **All-visible**: all tuples on the page are visible to all current transactions
- **All-frozen**: all tuples are also frozen (safe from XID wraparound)

During an index-only scan:
1. Get TID from index
2. Check VM for that heap page
3. If all-visible → return data from index tuple (no heap access!)
4. If not all-visible → must fetch heap tuple to check visibility

VACUUM sets VM bits. A recently-modified table has few all-visible pages,
making index-only scans ineffective until VACUUM catches up.

### The Free Space Map (FSM)

The FSM tracks available space per heap page. It is consulted during INSERT
to find a page with enough room. After VACUUM frees space, it updates the FSM.

For HOT updates, the target page must have enough free space. Setting a lower
fillfactor (e.g., `ALTER TABLE ... SET (fillfactor = 70)`) reserves 30% of each
page for future HOT updates.

### Bottom-Up Index Deletion

When a B-tree page is about to split, `_bt_bottomupdel_pass()` attempts to
remove entries that point to dead heap tuples — specifically targeting the
"version churn" pattern where the same key has multiple TIDs from successive
UPDATEs.

This is cheaper than a full VACUUM cycle because it only examines the single
page that is about to split, and it delegates to the table AM to determine
which TIDs are actually dead.

### Index Entry Lifecycle

```
1. INSERT      → Index entry created, points to live heap tuple
2. UPDATE      → New entry created for new TID; old entry now points to dead tuple
3. Index scan  → Discovers dead tuple, sets kill_prior_tuple
4. B-tree      → Marks entry LP_DEAD on the index page
5. Next insert → If page needs space, LP_DEAD entries are removed
6. VACUUM      → ambulkdelete removes entries whose TIDs match dead heap items
7. VACUUM      → amvacuumcleanup reclaims empty pages, updates stats
```

### Concurrent Access: Lehman-Yao

PostgreSQL's B-tree implementation is based on the **Lehman-Yao** algorithm,
which allows concurrent reads and writes with minimal locking:

- Splits add a new page to the **right** of the splitting page
- The `btpo_next` pointer is set before the parent is updated
- Readers encountering a "half-split" page follow `btpo_next` via `_bt_moveright()`
- Only one page is write-locked at a time during descent
- The `BTP_INCOMPLETE_SPLIT` flag marks pages where the parent hasn't been updated yet

This means index scans almost never block writes, and writes rarely block reads.

### XID Wraparound and Tuple Freezing

Transaction IDs are unsigned 32-bit integers — they wrap around after ~4.2
billion transactions. PostgreSQL uses modular arithmetic: XID `A` is "before"
XID `B` if the signed difference `A - B` is negative. This means at any point,
roughly 2 billion XIDs are "in the past" and 2 billion are "in the future."

The danger: if a tuple's `xmin` is so old that it wraps into the "future" half,
the tuple becomes invisible — **catastrophic silent data loss**.

PostgreSQL prevents this with **freezing**. VACUUM replaces old XIDs with
the special `FrozenTransactionId` (value 2):

```c
#define InvalidTransactionId      ((TransactionId) 0)
#define BootstrapTransactionId    ((TransactionId) 1)
#define FrozenTransactionId       ((TransactionId) 2)
#define FirstNormalTransactionId  ((TransactionId) 3)
```

A frozen tuple has `HEAP_XMIN_FROZEN` set in `t_infomask` (which is
`HEAP_XMIN_COMMITTED | HEAP_XMIN_INVALID` = 0x0300). It is unconditionally
visible — no snapshot comparison needed.

**How this affects indexes:** Freezing operates on the heap only. Index entries
are oblivious to whether their target heap tuple is frozen or not. But
freezing enables the **all-frozen** VM bit to be set, which is what makes
index-only scans maximally efficient (no heap fetch, not even for visibility).

The wraparound protection thresholds:

```
xidVacLimit   = oldest_datfrozenxid + autovacuum_freeze_max_age
xidWarnLimit  = xidWrapLimit - 40,000,000
xidWrapLimit  = oldest_datfrozenxid + 2,000,000,000
```

When `xidVacLimit` is reached, autovacuum is forced to run aggressive freezing
VACUUMs. When `xidWarnLimit` is reached, warnings appear in logs. When
`xidWrapLimit` is reached, the system **shuts down** — no new transactions
until manual VACUUM.

### MVCC's Cost to Index Scans: A Worked Example

Consider a table with 1 million rows and a B-tree on `status` (low cardinality:
3 distinct values). A query `SELECT * FROM orders WHERE status = 'pending'`
matches 100,000 rows.

**Best case** (table freshly vacuumed, no bloat):
- Index scan returns ~100,000 TIDs
- Each heap fetch finds a visible tuple
- 100,000 useful heap page reads

**Worst case** (table under heavy UPDATE load, VACUUM behind):
- The status column has 100,000 live rows, but 300,000 dead versions
  (from 3 rounds of updates) also match `status = 'pending'`
- Index scan returns ~400,000 TIDs
- 300,000 heap fetches discover dead tuples, fail visibility check → wasted I/O
- The scan does **4x the necessary work** because of MVCC version accumulation

This is why `pg_stat_user_tables.n_dead_tup` and timely VACUUM are critical.
Dead tuples don't just waste heap space — they waste index scan time by
sending scans on wild goose chases to invisible heap tuples.

### The Snapshot-Too-Old Problem

A long-running transaction holds an old snapshot. VACUUM checks: "is any
running transaction's xmin older than this dead tuple's xmax?" If yes, the
tuple cannot be removed — some transaction might still need to see it.

This has cascading effects on indexes:
1. Dead heap tuples cannot be removed → their TIDs stay in `dead_items`
   for future VACUUM passes, but VACUUM skips them
2. Index entries pointing to those tuples persist
3. Index bloat accumulates proportional to the longest-running transaction
4. The visibility map cannot mark pages all-visible (stale tuples present)
5. Index-only scans degrade to regular index scans on those pages

The `old_snapshot_threshold` GUC (removed in PG 17, but important historically)
allowed PostgreSQL to error on queries with excessively old snapshots. The
modern approach is to use `idle_in_transaction_session_timeout` and monitor
`pg_stat_activity` for long-running transactions.

### MVCC and Unique Index Enforcement

Unique indexes have a special MVCC challenge. When checking for duplicates
during INSERT, PostgreSQL uses `HeapTupleSatisfiesUpdate()` (not the normal
MVCC check), because it needs to handle these cases:

```
Scenario 1: Conflicting row is from a committed transaction
  → Duplicate error

Scenario 2: Conflicting row is from an aborted transaction
  → Not a real conflict, proceed with insert

Scenario 3: Conflicting row is from an in-progress transaction
  → WAIT for that transaction to commit or abort, then re-check

Scenario 4: Conflicting row was deleted by a committed transaction
  → Not a conflict (row is gone), proceed
```

This waiting behavior (Scenario 3) is why concurrent INSERTs of the same
unique key can block each other, even in READ COMMITTED mode. The index
AM calls `_bt_check_unique()` which does a heap fetch and may sleep on
the inserting transaction's lock.

### The Pin-and-Recheck Protocol

When a B-tree scan returns a TID, there is a window between reading the index
page and fetching the heap page. During this window, VACUUM could theoretically
recycle the heap line pointer (LP_DEAD → LP_UNUSED → reused for a new tuple).

PostgreSQL prevents this with two mechanisms:

1. **Buffer pin** (default): the scan holds a pin on the index leaf page.
   VACUUM's `ambulkdelete` cannot recycle a TID while any backend pins the
   page containing the index entry that references it.

2. **MVCC snapshot** (when pin is dropped for concurrency): if the scan drops
   its pin (to allow more concurrency on the leaf page), it relies on its
   MVCC snapshot to detect stale TIDs. A heap tuple marked LP_UNUSED will
   fail the visibility check, and the scan skips it.

From the B-tree README:

```
"Index-only scans can never drop their buffer pin, since they are unable
 to tolerate having a referenced TID become recyclable. Index-only scans
 typically just visit the visibility map (not the heap proper), and so
 will not reliably notice that any stale TID reference was concurrently
 marked LP_UNUSED in the heap by VACUUM."
```

This is a subtle but critical correctness detail: the interaction between
MVCC, buffer pinning, and index page access determines whether PostgreSQL
can safely return results without heap corruption.

---

## Quick Reference Card

| Concept | Key Takeaway |
|---------|-------------|
| Primary Key index | Just a unique B-tree index. No physical clustering. |
| All PG indexes | Secondary — store key + TID, point to heap |
| TID | 6 bytes: (block number, line pointer offset) |
| B-tree leaf entry | Key columns + TID (+ INCLUDE columns) |
| B-tree internal entry | Truncated key prefix + downlink to child page |
| MVCC in indexes | Indexes store NO visibility info. Every TID must be checked at the heap. |
| Snapshots | Define visibility: xmin (floor), xmax (ceiling), xip[] (in-progress) |
| Hint bits | Written to heap tuples on first read to cache commit/abort status |
| Visibility map | 2 bits/page (all-visible, all-frozen); enables index-only scan optimization |
| HOT update | UPDATE without index changes; requires no indexed col changed + same page |
| TOAST in index | Index detoasts and stores actual data, never TOAST pointers |
| Index-only scan | Avoids heap if VM says page is all-visible |
| Write amplification | INSERT: N+1; UPDATE (non-HOT): N+1; DELETE: 1 (indexes cleaned by VACUUM) |
| VACUUM cost | Scans heap + every index; O(heap + sum of all indexes) |
| Deduplication | Posting lists merge same-key entries since PG 13 |
| Bloat | Dead versions from MVCC accumulate in indexes until VACUUM |
| XID wraparound | Freezing replaces old XIDs with FrozenTransactionId; prevents data loss |
| Long transactions | Hold back VACUUM → index bloat → degraded scan performance |
| Unique checks | Use HeapTupleSatisfiesUpdate, may block on in-progress transactions |

---

*This document is grounded in the PostgreSQL source code at `src/backend/access/nbtree/`,
`src/backend/access/heap/`, `src/include/access/nbtree.h`, `src/include/access/itup.h`,
`src/include/storage/itemptr.h`, `src/backend/access/common/indextuple.c`,
`src/backend/catalog/toasting.c`, `src/include/access/heaptoast.h`,
`src/backend/access/heap/heapam_visibility.c`, `src/backend/access/heap/visibilitymap.c`,
`src/include/access/htup_details.h`, `src/include/utils/snapshot.h`,
and `src/include/access/transam.h`.*
