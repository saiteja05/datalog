# MongoDB Atlas Complete Health Check

A 93-point checklist across 13 sections covering cluster configuration, replication, storage, memory, connections, indexing, query performance, security, backups, alerts, sharding, schema design, and networking.

> **Companion tool**: [Atlas Health Check Checklist](https://saiteja05.github.io/datalog/clusterreview.html) — interactive checklist with status tracking, owner assignment, and CSV export.

---

## Table of Contents

- [Part 1: Cluster Configuration & Tier](#part-1-cluster-configuration--tier)
- [Part 2: Replication](#part-2-replication)
- [Part 3: Storage & Disk](#part-3-storage--disk)
- [Part 4: Memory & Cache (WiredTiger)](#part-4-memory--cache-wiredtiger)
- [Part 5: Connections](#part-5-connections)
- [Part 6: Indexing](#part-6-indexing)
- [Part 7: Query Performance](#part-7-query-performance)
- [Part 8: Security & Access](#part-8-security--access)
- [Part 9: Backup & Recovery](#part-9-backup--recovery)
- [Part 10: Alerts & Monitoring](#part-10-alerts--monitoring)
- [Part 11: Sharding](#part-11-sharding)
- [Part 12: Schema Design](#part-12-schema-design)
- [Part 13: Networking & Connectivity](#part-13-networking--connectivity)
- [Quick Triage Matrix](#quick-triage-matrix)
- [Health Check Schedule](#health-check-schedule)

---

## Part 1: Cluster Configuration & Tier

### 1.1 Cluster Tier & Topology

**How to Check**

Atlas UI: Cluster → Overview → Tier, Region, cloud provider, node count. Cluster → Configuration → Auto-scaling settings, cluster type.

```javascript
// Node and build info
db.adminCommand({ hostInfo: 1 })
// system.hostname, system.memSizeMB, system.numCores, os

db.version()
db.adminCommand({ buildInfo: 1 })

// Server uptime and process info
const status = db.serverStatus();
print(`Host: ${status.host}`)
print(`Process: ${status.process}`)  // mongod or mongos
print(`Uptime: ${(status.uptime / 86400).toFixed(1)} days`)
print(`Connections current: ${status.connections.current}`)
print(`Connections available: ${status.connections.available}`)

// Replica set topology
rs.status().members.forEach(m => {
  print(`${m.name} | ${m.stateStr} | uptime: ${(m.uptime/86400).toFixed(1)}d`)
})
```

**Tier Capability Reference**

| Tier | RAM | vCPUs | Storage IOPS | Max Connections | Use Case |
|------|-----|-------|-------------|-----------------|----------|
| M10 | 2GB | 2 | 1000 | 350 | Dev/Test only |
| M20 | 4GB | 2 | 2000 | 700 | Light staging |
| M30 | 8GB | 2 | 3000 | 2000 | Small production |
| M40 | 16GB | 4 | 6000 | 4000 | Medium production |
| M50 | 32GB | 8 | 8000 | 16000 | Large production |
| M60 | 64GB | 16 | 16000 | 32000 | Heavy production |
| M80+ | 128GB+ | 32+ | 20000+ | 64000+ | Enterprise scale |

**Red Flags**

- **Running M10/M20 in production** — Multi-tenant, no SLA, limited IOPS. Migrate to M30+ for any workload with real users. Exception: internal tools with < 100 users.
- **Auto-scaling disabled on production** — Traffic spikes at 2 AM can max out CPU or storage. Enable compute auto-scaling (e.g., M30–M50 range) and storage auto-scaling. Caveat: compute auto-scaling has ~15 min cooldown.
- **Single-region deployment for critical apps** — Region outage = total unavailability. Deploy multi-region with electable nodes in 2 regions + tie-breaker in a 3rd. Roughly doubles cost.
- **Electable nodes < 3** — 2 nodes means losing 1 = no majority = read-only. Always have at least 3 electable members.
- **Cluster hasn't been right-sized in 2+ years** — Review monthly: peak CPU, peak IOPS, peak connections, storage utilization, WiredTiger cache hit ratio. Below 30% of limits → downsize. Above 70% → upsize.

```javascript
// Resource headroom check
const s = db.serverStatus();
const conn = s.connections;
print(`Connection headroom: ${((conn.available / (conn.current + conn.available)) * 100).toFixed(1)}%`)
print(`Opcounters (last snapshot):`)
printjson(s.opcounters)
```

### 1.2 MongoDB Version & Feature Compatibility

**How to Check**

```javascript
db.version()

// Feature Compatibility Version (FCV)
db.adminCommand({ getParameter: 1, featureCompatibilityVersion: 1 })

// Check startup warnings
db.adminCommand({ getLog: "startupWarnings" })
```

Atlas UI: Cluster → Overview → "MongoDB Version"

**Version Lifecycle Reference**

| Version | Release | End of Life | Status |
|---------|---------|-------------|--------|
| 4.4 | Jul 2020 | Feb 2024 | EOL |
| 5.0 | Jul 2021 | Oct 2024 | EOL |
| 6.0 | Jul 2022 | Jul 2025 | Approaching EOL |
| 7.0 | Aug 2023 | Aug 2026 | Current |
| 8.0 | Oct 2024 | Oct 2027 | Latest |

**Red Flags**

- **FCV lower than binary version for > 2 weeks** — After confirming upgrade is stable (1-2 weeks), set FCV to match: `db.adminCommand({ setFeatureCompatibilityVersion: "7.0" })`. Warning: once set, you cannot downgrade the binary.
- **Version past or nearing end-of-life** — No security patches or bug fixes. Plan a major version upgrade. Pre-upgrade: read release notes, test in staging, verify driver compatibility.
- **Running a .0 release in production** — Highest bug density. Wait 2-3 months for .2 or .3 patch.
- **Different major versions across environments** — Causes "works in staging, breaks in production." Keep all environments on the same major version.

---

## Part 2: Replication

### 2.1 Replica Set Health

**How to Check**

```javascript
// Comprehensive replica set status
const rsStatus = rs.status();
rsStatus.members.forEach(m => {
  print(`\n=== ${m.name} ===`)
  print(` State: ${m.stateStr}`)
  print(` Health: ${m.health}`)
  print(` Uptime: ${(m.uptime / 86400).toFixed(1)} days`)
  print(` Optime: ${m.optimeDate}`)
  print(` Last Heartbeat: ${m.lastHeartbeat || 'N/A (self)'}`)
  print(` Ping (ms): ${m.pingMs || 'N/A (self)'}`)
  print(` Sync Source: ${m.syncSourceHost || 'N/A'}`)
  if (m.lastHeartbeatMessage) {
    print(` ⚠ Heartbeat Message: ${m.lastHeartbeatMessage}`)
  }
})

// Replica set configuration
const conf = rs.conf();
conf.members.forEach(m => {
  print(`${m.host}: priority=${m.priority}, votes=${m.votes}, hidden=${m.hidden || false}, delay=${m.secondaryDelaySecs || 0}s, tags=${JSON.stringify(m.tags || {})}`)
})

// Election history
db.adminCommand({ getLog: "global" }).log.filter(
  line => line.includes("election") || line.includes("stepDown")
).slice(-20).forEach(print)

// Write concern default
db.adminCommand({ getDefaultRWConcern: 1 })
```

**Red Flags**

- **Any member in RECOVERING, STARTUP, or DOWN** — RECOVERING usually means node fell behind. DOWN means unreachable. Check logs, disk space, IOPS. If oplog has rolled past node's position, full initial sync required.
- **Frequent elections (multiple per week)** — Each election causes 5-15 second write outage. Common causes: resource exhaustion, network partitions, long-running ops, disk latency spikes. Fix root cause or increase `electionTimeoutMillis`.
- **Only 2 data-bearing members with no arbiter** — Losing 1 = no majority = no writes. Add a 3rd data-bearing member (preferred) or arbiter.
- **Member priorities don't match failover intent** — Remote secondary might win election. Set priorities explicitly (primary region: 10, same region backup: 5, remote DR: 1).
- **Write concern w:1 for critical data** — Primary crashes before replicating = permanent data loss. Set default to `w: "majority"`. Adds 1-5ms latency for most apps.

```javascript
db.adminCommand({
  setDefaultRWConcern: 1,
  defaultWriteConcern: { w: "majority" }
})
```

### 2.2 Replication Lag

**How to Check**

```javascript
// Quick lag summary
rs.printSecondaryReplicationInfo()

// Precise lag calculation
const primary = rs.status().members.find(m => m.stateStr === "PRIMARY");
rs.status().members.filter(m => m.stateStr === "SECONDARY").forEach(sec => {
  const lagSecs = (primary.optimeDate - sec.optimeDate) / 1000;
  print(`${sec.name}: ${lagSecs}s behind`)
})

// Replication throughput (run on secondary)
db.serverStatus().metrics.repl.apply.ops
db.serverStatus().metrics.repl.apply.batches.num
db.serverStatus().metrics.repl.buffer.count
db.serverStatus().metrics.repl.buffer.sizeBytes
```

**Red Flags**

- **Lag > 10 seconds sustained** — Stale reads, increased write latency with `w: "majority"`, risk of data loss on failover. Common causes: secondary I/O bottleneck, index builds, network throughput, large transactions. Fix: upgrade tier, move secondary closer, break batch jobs into smaller chunks.
- **Lag increasing over time (not recovering)** — Secondary falling further behind. If it passes the oplog window, full resync required. Fix: reduce write volume or increase secondary resources.
- **Lag spikes correlate with batch jobs** — Throttle batch jobs (sleep between batches), schedule during low-traffic windows, break large updates into smaller batches.

```javascript
// Break large operations into batches
let processed = 0;
while (true) {
  const result = db.bigCollection.updateMany(
    { status: "old" },
    { $set: { status: "archived" } },
    { limit: 1000 }
  );
  processed += result.modifiedCount;
  if (result.modifiedCount === 0) break;
  sleep(100);  // Let secondaries catch up
}
```

### 2.3 Oplog Size & Window

**How to Check**

```javascript
const replInfo = db.getReplicationInfo();
print(`Oplog Size: ${replInfo.logSizeMB.toFixed(2)} MB`)
print(`Used: ${replInfo.usedMB.toFixed(2)} MB`)
print(`Time Span: ${replInfo.timeDiffHours.toFixed(2)} hours`)
print(`First Event: ${replInfo.tFirst}`)
print(`Last Event: ${replInfo.tLast}`)

// Oplog consumption by namespace
use local
db.oplog.rs.aggregate([
  { $sort: { "$natural": -1 } },
  { $limit: 10000 },
  { $group: {
    _id: "$ns",
    count: { $sum: 1 },
    totalSizeBytes: { $sum: { $bsonSize: "$$ROOT" } }
  }},
  { $sort: { totalSizeBytes: -1 } },
  { $limit: 10 }
])
```

**Oplog Sizing Guidelines**

| Write Volume | Recommended Window | Oplog Size |
|-------------|-------------------|------------|
| Light (< 100 ops/sec) | 72+ hours | 1-5 GB |
| Medium (100-1000 ops/sec) | 48+ hours | 5-20 GB |
| Heavy (1000-10000 ops/sec) | 24+ hours | 20-50 GB |
| Very Heavy (> 10000 ops/sec) | 12+ hours minimum | 50-100 GB |

**Red Flags**

- **Oplog window < 4 hours** — Secondary going offline longer than 4 hours requires full initial sync (hours to days). Resize: Atlas → Cluster → Configuration → Additional Settings → Oplog Size. Rule of thumb: oplog window ≥ 2x longest expected downtime.
- **Oplog window shrinking over time** — Write volume growing faster than oplog can hold. Increase oplog size or investigate which collections generate excess writes.
- **Change streams dependent on oplog window** — If app goes offline and resume token falls off oplog, change stream is permanently invalidated. Size oplog window ≥ 2x maximum expected app downtime.

---

## Part 3: Storage & Disk

### 3.1 Disk Utilization & IOPS

**How to Check**

Atlas UI: Cluster → Metrics → Disk Utilization %, Disk IOPS, Disk Latency, Disk Queue Depth, Disk Throughput.

```javascript
// Database-level storage stats
const dbStats = db.stats();
print(`Database: ${dbStats.db}`)
print(`Collections: ${dbStats.collections}`)
print(`Data Size: ${(dbStats.dataSize / 1024 / 1024 / 1024).toFixed(2)} GB`)
print(`Storage Size (on disk): ${(dbStats.storageSize / 1024 / 1024 / 1024).toFixed(2)} GB`)
print(`Index Size: ${(dbStats.indexSize / 1024 / 1024 / 1024).toFixed(2)} GB`)
print(`Total Size: ${((dbStats.storageSize + dbStats.indexSize) / 1024 / 1024 / 1024).toFixed(2)} GB`)
print(`Fragmentation Ratio: ${(dbStats.storageSize / dbStats.dataSize).toFixed(2)}x`)

// Per-collection breakdown (sorted by size)
db.getCollectionNames().map(name => {
  const s = db.getCollection(name).stats();
  return {
    name: name,
    dataMB: +(s.size / 1024 / 1024).toFixed(2),
    storageMB: +(s.storageSize / 1024 / 1024).toFixed(2),
    indexMB: +(s.totalIndexSize / 1024 / 1024).toFixed(2),
    docs: s.count,
    avgDocBytes: +(s.avgObjSize || 0).toFixed(0),
    fragRatio: +(s.storageSize / Math.max(s.size, 1)).toFixed(2)
  }
}).sort((a, b) => b.storageMB - a.storageMB).forEach(printjson)

// WiredTiger block manager
const bm = db.serverStatus().wiredTiger["block-manager"];
print(`Blocks read: ${bm["blocks read"]}`)
print(`Blocks written: ${bm["blocks written"]}`)
print(`Bytes read: ${(bm["bytes read"] / 1024 / 1024 / 1024).toFixed(2)} GB`)
print(`Bytes written: ${(bm["bytes written"] / 1024 / 1024 / 1024).toFixed(2)} GB`)
```

**Atlas Tier IOPS Limits**

| Tier | Base IOPS | Burst IOPS | Storage Type |
|------|-----------|------------|--------------|
| M10 | 1000 | 3000 | Standard SSD |
| M30 | 3000 | 3000 | Standard SSD |
| M40 | 6000 | 6000 | Provisioned |
| M50 | 8000 | 8000 | Provisioned |
| M60+ | 16000+ | Varies | Provisioned |

**Red Flags**

- **Disk utilization > 80%** — MongoDB needs free space for compaction, index builds, temp files. At 90%+ Atlas may make cluster read-only. At 95%+ cluster can crash. Enable storage auto-scaling, drop unused collections/indexes, run `compact`.
- **Disk IOPS at > 80% of tier limit** — Operations queue up, latency increases exponentially. Add missing indexes (COLLSCAN = most common cause), upgrade tier, move reads to secondaries.
- **Disk queue depth > 1 sustained** — Disk can't keep up. Fix queries/indexes or upgrade tier.
- **storageSize >> dataSize (fragmentation ratio > 2x)** — Run `db.runCommand({ compact: "mycollection" })` during maintenance. Blocks reads/writes on the collection.

### 3.2 Data Size & Collection Stats

**How to Check**

```javascript
// Top 10 collections by data size across all databases
const allStats = [];
db.adminCommand({ listDatabases: 1 }).databases.forEach(d => {
  if (["admin", "local", "config"].includes(d.name)) return;
  const collections = db.getSiblingDB(d.name).getCollectionNames();
  collections.forEach(c => {
    const stats = db.getSiblingDB(d.name).getCollection(c).stats();
    allStats.push({
      ns: `${d.name}.${c}`,
      dataSizeGB: +(stats.size / 1024 / 1024 / 1024).toFixed(3),
      storageSizeGB: +(stats.storageSize / 1024 / 1024 / 1024).toFixed(3),
      indexSizeGB: +(stats.totalIndexSize / 1024 / 1024 / 1024).toFixed(3),
      docCount: stats.count,
      avgDocBytes: +(stats.avgObjSize || 0).toFixed(0)
    });
  });
});
allStats.sort((a, b) => b.dataSizeGB - a.dataSizeGB).slice(0, 10).forEach(printjson);

// Find and validate TTL indexes
db.getCollectionNames().forEach(name => {
  db.getCollection(name).getIndexes().forEach(idx => {
    if (idx.expireAfterSeconds !== undefined) {
      const count = db.getCollection(name).estimatedDocumentCount();
      print(`TTL: ${name}.${JSON.stringify(idx.key)} | expires: ${idx.expireAfterSeconds}s | docs: ${count}`)
    }
  })
})

// Collections without any indexes (besides _id)
db.getCollectionNames().forEach(name => {
  const indexes = db.getCollection(name).getIndexes();
  if (indexes.length <= 1) {
    const count = db.getCollection(name).estimatedDocumentCount();
    if (count > 10000) {
      print(`⚠ ${name}: ${count} docs, only _id index`)
    }
  }
})
```

**Red Flags**

- **Single collection > 50% of total storage** — Concentration risk. Implement time-partitioned archival, split "god collections", evaluate sharding, add TTL indexes.
- **avgObjSize > 10KB for high-throughput collections** — Large documents consume more cache. Move large rarely-accessed fields to separate collections, store binary data in GridFS/S3.
- **No TTL indexes on time-series or log data** — Data grows forever. Create TTL indexes: `db.logs.createIndex({ "createdAt": 1 }, { expireAfterSeconds: 2592000 })` (30 days). TTL only works on BSON Date fields.
- **Document count > 100M+ on unsharded collection** — Evaluate sharding or partitioning. Consider Atlas Online Archive.

---

## Part 4: Memory & Cache (WiredTiger)

### 4.1 WiredTiger Cache

**How to Check**

```javascript
const cache = db.serverStatus().wiredTiger.cache;
const maxCache = cache["maximum bytes configured"];
const currentCache = cache["bytes currently in the cache"];
const dirtyBytes = cache["tracked dirty bytes in the cache"];
const pagesRead = cache["pages read into cache"];
const cacheRequests = cache["pages requested from the cache"];
const evictedUnmod = cache["unmodified pages evicted"];
const evictedMod = cache["modified pages evicted"];

print(`=== WiredTiger Cache Report ===`)
print(`Max Cache: ${(maxCache / 1024/1024/1024).toFixed(2)} GB`)
print(`Current Usage: ${(currentCache / 1024/1024/1024).toFixed(2)} GB (${(currentCache/maxCache*100).toFixed(1)}%)`)
print(`Dirty Bytes: ${(dirtyBytes / 1024/1024).toFixed(2)} MB (${(dirtyBytes/maxCache*100).toFixed(1)}%)`)

const hitRatio = ((cacheRequests - pagesRead) / cacheRequests * 100);
print(`\nHit Ratio: ${hitRatio.toFixed(2)}%`)
print(`\n=== Eviction ===`)
print(`Unmodified pages evicted: ${evictedUnmod}`)
print(`Modified pages evicted: ${evictedMod}`)

// Pressure indicators
print(`\nEviction calls: ${cache["eviction calls"]}`)
print(`Eviction worker busy: ${cache["eviction server unable to reach eviction goal"]}`)
print(`Hazard pointer blocked: ${cache["hazard pointer blocked page eviction"]}`)
```

**Cache Sizing Rules**
- Default: 50% of (total RAM - 1GB), or 256MB, whichever is larger
- Atlas manages this automatically based on tier
- Cache holds both data AND indexes
- Compressed on disk, uncompressed in cache (cache usage > disk usage for same data)

**Red Flags**

- **Cache utilization consistently > 80%** — Eviction threads work overtime, can block application threads causing latency spikes. Drop unused indexes, archive old data, upgrade tier for more RAM.
- **Cache hit ratio < 95%** — Every cache miss = disk read (100-1000x slower). Below 90% is a crisis. More RAM, smaller working set, better access patterns, partial indexes.
- **Dirty bytes > 20% of cache** — Checkpoint bottleneck. Check disk write latency. Healthy checkpoint < 60 seconds. Upgrade to tier with faster disk.
- **High eviction rate sustained** — Cache is churning. If "application threads page write from cache to disk" > 0, app threads are doing eviction work instead of serving queries. More RAM or smaller working set.

### 4.2 Page Faults & Memory Pressure

**How to Check**

```javascript
print(`Page faults: ${db.serverStatus().extra_info.page_faults}`)

const hostInfo = db.hostInfo();
print(`Total RAM: ${hostInfo.system.memSizeMB} MB`)
print(`CPU Cores: ${hostInfo.system.numCores}`)

const mem = db.serverStatus().mem;
print(`Resident Memory: ${mem.resident} MB`)
print(`Virtual Memory: ${mem.virtual} MB`)

// TCMalloc memory (memory allocator stats)
const tcmalloc = db.serverStatus().tcmalloc;
if (tcmalloc) {
  const generic = tcmalloc.generic;
  print(`Heap size: ${(generic.heap_size / 1024/1024/1024).toFixed(2)} GB`)
  print(`Current allocated: ${(generic.current_allocated_bytes / 1024/1024/1024).toFixed(2)} GB`)
}
```

**Red Flags**

- **Page faults increasing rapidly** — OS is swapping to disk, catastrophic for performance. Upgrade tier for more RAM, reduce working set.
- **Resident memory << available RAM** — MongoDB being constrained by cgroup limits or competing process.
- **High TCMalloc fragmentation** — `current_allocated_bytes / resident memory > 1.5`. Fix: rolling restart of replica set during maintenance.

---

## Part 5: Connections

### 5.1 Connection Pool & Counts

**How to Check**

```javascript
const conn = db.serverStatus().connections;
print(`Current connections: ${conn.current}`)
print(`Available: ${conn.available}`)
print(`Total created (since start): ${conn.totalCreated}`)
print(`Active (running command): ${conn.active}`)
print(`Utilization: ${(conn.current / (conn.current + conn.available) * 100).toFixed(1)}%`)

// Connections grouped by client application
const appConnections = {};
db.currentOp(true).inprog.forEach(op => {
  const app = op.appName || 'unknown';
  appConnections[app] = (appConnections[app] || 0) + 1;
});
Object.entries(appConnections)
  .sort((a, b) => b[1] - a[1])
  .forEach(([app, count]) => print(`${app}: ${count} connections`));

// Connection churn rate (take two snapshots 60 seconds apart)
const t1 = db.serverStatus().connections.totalCreated;
// ... wait 60 seconds ...
const t2 = db.serverStatus().connections.totalCreated;
print(`New connections per second: ${(t2 - t1) / 60}`)
// Healthy: < 5/sec | Unhealthy: > 50/sec (missing connection pooling)
```

**Connection Pool Best Practices (driver-side)**

| App Instances | maxPoolSize (per instance) | Total Connections |
|---------------|---------------------------|-------------------|
| 1-2 | 100 (default) | 100-200 |
| 5-10 | 50 | 250-500 |
| 20-50 | 20-30 | 400-1500 |
| 50-100 | 10-15 | 500-1500 |
| 100+ | 5-10 | 500-1000 |

**Rule**: `app_instances × maxPoolSize` should stay below 80% of Atlas tier connection limit.

**Red Flags**

- **Current connections > 80% of tier limit** — Each connection ≈ 1MB RAM. Reduce `maxPoolSize`, enable `maxIdleTimeMS=60000`, microservices only need 5-10 connections.
- **totalCreated extremely high relative to uptime** — Connection churn: each new connection costs 50-100ms (TCP + TLS + SASL). Ensure app uses driver's built-in connection pool.
- **Connection count doesn't drop after app scale-down** — Connection leak. Set `maxIdleTimeMS`, ensure `client.close()` on shutdown.

### 5.2 Active Operations & Long-Running Queries

**How to Check**

```javascript
// Long-running operations
db.currentOp({
  "active": true,
  "secs_running": { $gt: 10 }
}).inprog.forEach(op => {
  print(`\n=== Operation ${op.opid} ===`)
  print(` Type: ${op.op}`)
  print(` Namespace: ${op.ns}`)
  print(` Duration: ${op.secs_running}s`)
  print(` Plan: ${op.planSummary || 'N/A'}`)
  print(` Client: ${op.client}`)
  print(` App: ${op.appName || 'unknown'}`)
  print(` Waiting for lock: ${op.waitingForLock}`)
  print(` Command: ${JSON.stringify(op.command || op.query).substring(0, 200)}`)
})

// Operations waiting on locks
db.currentOp({ "waitingForLock": true }).inprog.forEach(op => {
  print(`BLOCKED: ${op.opid} | ${op.op} on ${op.ns} | waiting ${op.secs_running}s`)
})

// Global lock stats
const gl = db.serverStatus().globalLock;
print(`Current queue - readers: ${gl.currentQueue.readers}`)
print(`Current queue - writers: ${gl.currentQueue.writers}`)
print(`Active clients - readers: ${gl.activeClients.readers}`)
print(`Active clients - writers: ${gl.activeClients.writers}`)
```

**Red Flags**

- **Operations running > 60 seconds** — Kill immediately: `db.killOp(12345)`. Find the query and add an index or rewrite it.
- **Multiple operations waiting for locks** — Usually caused by foreground index builds, `dropCollection`, or `renameCollection` during peak. Schedule DDL during maintenance.
- **Same query pattern appearing dozens of times simultaneously** — Retry storm feedback loop. Implement exponential backoff. Add `maxTimeMS()` to queries.

```javascript
db.mycollection.find({ ... }).maxTimeMS(5000)  // kill after 5 seconds
```

---

## Part 6: Indexing

### 6.1 Index Inventory & Usage

**How to Check**

```javascript
// Full index inventory
db.getCollectionNames().forEach(coll => {
  const indexes = db.getCollection(coll).getIndexes();
  const stats = db.getCollection(coll).stats();
  print(`\n=== ${coll} (${stats.count} docs, ${(stats.size/1024/1024).toFixed(2)} MB) ===`)
  print(`Total index size: ${(stats.totalIndexSize/1024/1024).toFixed(2)} MB`)
  indexes.forEach(idx => {
    const size = stats.indexSizes[idx.name] || 0;
    print(` ${idx.name}: ${JSON.stringify(idx.key)} | ${(size/1024/1024).toFixed(2)} MB | sparse=${idx.sparse || false}, unique=${idx.unique || false}, partial=${!!idx.partialFilterExpression}`)
  })
})

// Index usage statistics (which indexes are actually used)
db.getCollectionNames().forEach(coll => {
  print(`\n=== ${coll} — Index Usage ===`)
  db.getCollection(coll).aggregate([{ $indexStats: {} }]).forEach(idx => {
    const opsPerDay = idx.accesses.ops / Math.max(1, (new Date() - idx.accesses.since) / 86400000);
    print(` ${idx.name}: ${idx.accesses.ops} total ops (${opsPerDay.toFixed(1)}/day) since ${idx.accesses.since}`)
  })
})

// UNUSED indexes (candidates for removal)
print(`\n=== UNUSED INDEXES ===`)
db.getCollectionNames().forEach(coll => {
  db.getCollection(coll).aggregate([{ $indexStats: {} }]).forEach(idx => {
    if (idx.accesses.ops === 0 && idx.name !== "_id_") {
      const daysSince = (new Date() - idx.accesses.since) / 86400000;
      if (daysSince > 7) {
        const size = db.getCollection(coll).stats().indexSizes[idx.name] || 0;
        print(` ${coll}.${idx.name}: 0 ops in ${daysSince.toFixed(0)} days | ${(size/1024/1024).toFixed(2)} MB wasted`)
      }
    }
  })
})

// REDUNDANT indexes (one is a prefix of another)
db.getCollectionNames().forEach(coll => {
  const indexes = db.getCollection(coll).getIndexes();
  for (let i = 0; i < indexes.length; i++) {
    for (let j = 0; j < indexes.length; j++) {
      if (i === j) continue;
      const keysI = Object.keys(indexes[i].key);
      const keysJ = Object.keys(indexes[j].key);
      if (keysI.length < keysJ.length) {
        const isPrefix = keysI.every((k, idx) => k === keysJ[idx] && indexes[i].key[k] === indexes[j].key[k]);
        if (isPrefix) {
          print(`REDUNDANT: ${coll}.${indexes[i].name} ${JSON.stringify(indexes[i].key)} is a prefix of ${indexes[j].name} ${JSON.stringify(indexes[j].key)}`)
        }
      }
    }
  }
})
```

**Red Flags**

- **Index with 0 operations for > 7 days** — Every index costs RAM, disk, and write performance. Hide first (MongoDB 4.4+): `db.mycollection.hideIndex("myUnusedIndex")`. Wait 1-2 weeks, then drop.
- **Total index size > data size** — Indexes bloated. Remove unused/redundant, consider partial indexes.
- **> 10 indexes on a single collection** — Going from 3 to 10 indexes can reduce insert throughput by 40-60%. Consolidate with compound indexes.
- **Redundant indexes (prefix overlap)** — `{ a: 1, b: 1 }` covers queries on `{ a: 1 }`. Drop the shorter prefix index.

### 6.2 Index Effectiveness & Missing Indexes

**How to Check**

```javascript
// Enable profiler
db.setProfilingLevel(1, { slowms: 100 })

// Find all COLLSCAN operations
db.system.profile.find({
  "planSummary": /COLLSCAN/
}).sort({ millis: -1 }).limit(20).forEach(op => {
  print(`\n${op.millis}ms | ${op.ns} | ${op.planSummary}`)
  print(` docs examined: ${op.docsExamined}`)
  print(` keys examined: ${op.keysExamined}`)
  print(` returned: ${op.nreturned}`)
})

// Find inefficient index usage (high examined-to-returned ratio)
db.system.profile.find({
  "docsExamined": { $gt: 1000 },
  $expr: { $gt: ["$docsExamined", { $multiply: ["$nreturned", 10] }] }
}).sort({ millis: -1 }).limit(20)
```

**Red Flags**

- **COLLSCAN on collections with > 10K documents** — Single most common performance problem. Create an index on the filter fields.
- **Query targeting ratio > 10:1** — Use the **ESR Rule** for compound index design:
  1. **E**quality fields first (`status: "active"`)
  2. **S**ort fields next (`sort({ createdAt: -1 })`)
  3. **R**ange fields last (`age: { $gte: 18 }`)

```javascript
// Optimal index (ESR):
db.users.createIndex({ country: 1, lastName: 1, age: 1 })
//                      ^Equality     ^Sort        ^Range
```

---

## Part 7: Query Performance

### 7.1 Slow Queries & Profiler Analysis

**How to Check**

```javascript
// Configure profiler (Level 1 recommended for production)
db.setProfilingLevel(1, { slowms: 50 })

// Top 10 slowest queries
db.system.profile.find()
  .sort({ millis: -1 })
  .limit(10)
  .forEach(op => {
    print(`\nDuration: ${op.millis}ms`)
    print(`Operation: ${op.op} on ${op.ns}`)
    print(`Plan: ${op.planSummary}`)
    print(`Docs Examined: ${op.docsExamined}`)
    print(`Returned: ${op.nreturned}`)
    print(`Client: ${op.client}`)
    print(`App: ${op.appName || 'N/A'}`)
  })

// Slow query frequency by pattern
db.system.profile.aggregate([
  { $group: {
    _id: { ns: "$ns", plan: "$planSummary" },
    count: { $sum: 1 },
    avgMs: { $avg: "$millis" },
    maxMs: { $max: "$millis" },
    totalMs: { $sum: "$millis" },
    avgDocsExamined: { $avg: "$docsExamined" }
  }},
  { $sort: { totalMs: -1 } },
  { $limit: 10 }
])

// Slow queries by hour (find peak times)
db.system.profile.aggregate([
  { $group: {
    _id: { $hour: "$ts" },
    count: { $sum: 1 },
    avgMs: { $avg: "$millis" }
  }},
  { $sort: { _id: 1 } }
])
```

**Red Flags**

- **Same query pattern repeatedly in slow log** — Systematic issue. Extract pattern, run `explain("executionStats")`, apply ESR rule, create index, verify.
- **Slow queries correlate with app timeouts** — Set `maxTimeMS(5000)` on problem queries. For reports that must scan large data, run against secondaries.
- **$regex with leading wildcards** — `/.*keyword.*/` cannot use an index. Use Atlas Search for text search, or anchored regex `/^keyword/` for prefix matching.

### 7.2 Aggregation Pipeline Performance

**How to Check**

```javascript
const pipeline = [
  { $match: { status: "active" } },
  { $lookup: { from: "orders", localField: "_id", foreignField: "customerId", as: "orders" }},
  { $unwind: "$orders" },
  { $group: { _id: "$region", totalRevenue: { $sum: "$orders.amount" } } },
  { $sort: { totalRevenue: -1 } }
];
const explanation = db.customers.explain("executionStats").aggregate(pipeline);
// Check: Does $match use an index? How many docs enter each stage?
// Is sort in memory or on disk? How long does each stage take?
```

**Red Flags**

- **usedDisk: true on sort stages** — Disk-based sorting is 10-100x slower. Add an index supporting the sort. Reduce docs reaching the sort stage.
- **$match not the first pipeline stage** — Optimizer can only use indexes for $match/$sort at the beginning. Always put $match first.
- **$lookup without index on foreign field** — Without index, every $lookup triggers a COLLSCAN on the foreign collection. Create index: `db.orders.createIndex({ customerId: 1 })`.
- **$unwind causing document explosion** — Array with 1000 elements × 10K docs = 10M intermediate docs. Filter arrays with `$filter` before unwinding.

```javascript
// Filter before unwinding
[
  { $addFields: {
    events: { $filter: {
      input: "$events",
      as: "e",
      cond: { $eq: ["$$e.type", "purchase"] }
    }}
  }},
  { $unwind: "$events" }
]
```

---

## Part 8: Security & Access

### 8.1 Network & IP Access

**How to Check**

Atlas UI: Network Access → IP Access List, Private Endpoints, VPC Peering.

```javascript
db.runCommand({ connectionStatus: 1, showPrivileges: true })
db.adminCommand({ getParameter: 1, tlsMode: 1 })
```

**Red Flags**

- **0.0.0.0/0 in IP Access List** — #1 cause of MongoDB breaches. Remove immediately. Add specific IPs/CIDR ranges. For production: use VPC peering or PrivateLink.
- **Stale IP entries from former infrastructure** — Old IPs could be reassigned. Audit quarterly.
- **No private endpoints for production** — Traffic goes over public internet. Set up VPC peering or Private Endpoints (AWS PrivateLink, Azure Private Link, GCP Private Service Connect).

### 8.2 Authentication & Users

**How to Check**

```javascript
// List all database users with roles
use admin
db.system.users.find().forEach(u => {
  print(`\nUser: ${u.user}@${u.db}`)
  u.roles.forEach(r => print(` Role: ${r.role} on ${r.db}`))
})

// Check for overprivileged users
db.system.users.find().forEach(u => {
  const dangerousRoles = ['root', 'dbAdminAnyDatabase', 'readWriteAnyDatabase',
    'userAdminAnyDatabase', '__system', 'atlasAdmin'];
  u.roles.forEach(r => {
    if (dangerousRoles.includes(r.role)) {
      print(`⚠ HIGH PRIVILEGE: ${u.user}@${u.db} has ${r.role}`)
    }
  })
})
```

**Red Flags**

- **Application users with readWriteAnyDatabase or root** — If app is compromised, attacker has full access to every database. Create dedicated users with minimal permissions per app.
- **Shared credentials across applications** — Can't revoke, can't audit. One user per application with `appName` in connection string.
- **No custom roles** — Built-in roles are broad. Create custom roles restricting to exact collections and operations.

```javascript
db.createRole({
  role: "orderServiceRole",
  privileges: [
    { resource: { db: "mydb", collection: "orders" }, actions: ["find", "insert", "update"] },
    { resource: { db: "mydb", collection: "products" }, actions: ["find"] }
  ],
  roles: []
})
```

### 8.3 Encryption & Compliance

**How to Check**

Atlas UI: Cluster → Security → Encryption at Rest. Cluster → Additional Settings → Minimum TLS Protocol Version.

```javascript
db.adminCommand({ getParameter: 1, tlsMode: 1 })
db.adminCommand({ getParameter: 1, auditLog: 1 })
```

**Red Flags**

- **Encryption at Rest disabled** — Enable in Atlas. For regulated workloads, configure customer-managed keys (CMK/BYOK) using AWS KMS, Azure Key Vault, or GCP KMS.
- **Audit logging disabled for compliance workloads** — SOC2, HIPAA, PCI-DSS, GDPR all require audit trails. Enable auditing (M10+). Configure filters for auth events, CRUD on sensitive collections, admin actions.
- **No field-level encryption for PII** — Implement Client-Side Field Level Encryption (CSFLE) for SSN, credit card numbers, health records. Available in all official drivers.

---

## Part 9: Backup & Recovery

### 9.1 Backup Configuration

**How to Check**

Atlas UI: Cluster → Backup → Overview, Snapshots, Policies.

Verify:
1. Is backup enabled?
2. What type? (Cloud Backup = recommended)
3. Snapshot frequency: hourly? every 6 hours? daily?
4. Retention: how long are snapshots kept?
5. Is Continuous Cloud Backup (PITR) enabled?
6. Cross-region snapshot copies?
7. When was the last successful snapshot?

**Red Flags**

- **Backups not enabled** — Zero recovery path. Enable Cloud Backup immediately.
- **Last successful snapshot > 24 hours old** — Backups may be failing silently. Check Atlas Cluster Events.
- **No point-in-time recovery** — Without PITR, can only restore to snapshot boundaries. Enable Continuous Cloud Backup for second-level granularity.
- **Nobody has ever tested a restore** — Schedule quarterly restore drills: restore to temp cluster, time it, validate data, document the process, delete temp cluster.

### 9.2 Recovery Readiness

| Item | Question | Target |
|------|----------|--------|
| RTO | How long can you be down? | Define: 1min? 1hr? 4hrs? |
| RPO | How much data loss is OK? | Define: 0? 5min? 1hr? |
| Restore time | How long does a restore take? | Must be ≤ RTO |
| Oplog window | Does it cover RPO? | Window > RPO |
| Runbook | Documented restore process? | Yes, tested |
| Who | Who executes the restore? | Named person + backup |
| Target | Where do you restore to? | Pre-provisioned cluster |
| Validation | How do you verify restored data? | Documented checks |

**Red Flags**

- **No documented RTO/RPO** — Can't design appropriate backup strategy without targets.
- **Restore time exceeds RTO** — Pre-provision standby cluster, use multi-region with auto failover, reduce data size, use PITR.

---

## Part 10: Alerts & Monitoring

### 10.1 Alert Configuration

Atlas UI: Project → Alerts → Alert Settings.

**Recommended Alert Thresholds**

| Metric | Warning | Critical | Notes |
|--------|---------|----------|-------|
| Disk Utilization % | > 70% | > 85% | Leave room for compaction |
| CPU (Normalized) | > 70% for 10 min | > 90% for 5 min | Normalized = per-core |
| Replication Lag | > 5 sec | > 30 sec | Adjust for read consistency needs |
| Connections | > 60% of limit | > 80% of limit | Percentage of tier max |
| Oplog Window | < 12 hours | < 4 hours | Based on maintenance windows |
| Query Targeting | > 100:1 ratio | > 1000:1 ratio | Indicates missing indexes |
| Disk IOPS | > 70% of max | > 90% of max | Tier-specific limits |
| Tickets Available (read) | < 50 | < 20 | WiredTiger concurrent transaction tickets |
| Tickets Available (write) | < 50 | < 20 | Same as above |
| Page Faults | > 100/sec | > 500/sec | Indicates cache pressure |
| Backup Failures | Any | Any | Must never go unnoticed |
| Cluster Events | Elections | - | Tracks stability issues |

**Red Flags**

- **No custom alerts configured** — Create alerts for every metric above.
- **Alerts go to email only** — Email is not real-time. Integrate with PagerDuty, OpsGenie, or Slack for critical alerts.
- **No alert for replication lag or oplog window** — Silent killers. Lag builds unnoticed until failover causes data loss.

### 10.2 Monitoring Gaps & Baselines

**How to Check**

```javascript
const snapshot = {
  timestamp: new Date(),
  connections: db.serverStatus().connections,
  opcounters: db.serverStatus().opcounters,
  memory: db.serverStatus().mem,
  wiredTiger: {
    cacheUsed: db.serverStatus().wiredTiger.cache["bytes currently in the cache"],
    cacheMax: db.serverStatus().wiredTiger.cache["maximum bytes configured"],
    evictions: db.serverStatus().wiredTiger.cache["unmodified pages evicted"]
  },
  globalLock: db.serverStatus().globalLock,
  network: db.serverStatus().network
};
printjson(snapshot);
// Save weekly to establish baselines
```

**Red Flags**

- **No baseline metrics documented** — Without knowing "normal," you can't detect problems. Capture weekly for a month.
- **Monitoring only checks averages** — Averages hide tail latency. Monitor p95 and p99.
- **No application-level monitoring** — Instrument with APM (Datadog, New Relic, OpenTelemetry) for end-to-end latency.

---

## Part 11: Sharding

### 11.1 Balancer

**How to Check**

```javascript
print(`Balancer enabled: ${sh.getBalancerState()}`)
print(`Balancer running: ${sh.isBalancerRunning()}`)

use config
const settings = db.settings.findOne({ _id: "balancer" });
if (settings && settings.activeWindow) {
  print(`Balancer window: ${settings.activeWindow.start} to ${settings.activeWindow.stop}`)
} else {
  print(`Balancer window: unrestricted (24/7)`)
}

// Recent migration results
db.changelog.find({ what: /moveChunk/ }).sort({ time: -1 }).limit(20).forEach(entry => {
  print(`${entry.time} | ${entry.what} | ${entry.details.from || ''} → ${entry.details.to || ''}`)
  if (entry.details.errmsg) print(` ⚠ ERROR: ${entry.details.errmsg}`)
})
```

**Red Flags**

- **Balancer disabled** — Chunk distribution becomes uneven. `sh.startBalancer()` — but first understand why it was disabled.
- **Balancer window too narrow (< 2 hours)** — Only migrates 30-60 chunks. Widen to at least 6 hours off-peak.
- **Migration failures** — Check errors: "ChunkTooBig" (jumbo chunk), "ExceededTimeLimit" (disk I/O), "LockBusy" (concurrent DDL), "NetworkTimeout".

### 11.2 Chunk Distribution

**How to Check**

```javascript
sh.status()

use config
db.collections.find({ dropped: { $ne: true } }).forEach(coll => {
  print(`\n=== ${coll._id} ===`)
  print(` Shard key: ${JSON.stringify(coll.key)}`)
  const chunks = db.chunks.aggregate([
    { $match: { ns: coll._id } },
    { $group: { _id: "$shard", count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  const total = chunks.reduce((sum, c) => sum + c.count, 0);
  const max = chunks[0]?.count || 0;
  const min = chunks[chunks.length - 1]?.count || 0;
  print(` Total chunks: ${total}`)
  print(` Imbalance: ${total > 0 ? ((max - min) / total * 100).toFixed(1) : 0}%`)
  chunks.forEach(c => print(`   ${c._id}: ${c.count} chunks (${(c.count / total * 100).toFixed(1)}%)`))
})
```

**Red Flags**

- **One shard has 2x+ chunks** — Overloaded shard becomes bottleneck. Check balancer status, jumbo chunks, shard key monotonicity.
- **Data size skewed even when chunk counts balanced** — Uneven value distribution. Better shard key or resharding needed.

### 11.3 Jumbo Chunks

**How to Check**

```javascript
use config
const jumbos = db.chunks.find({ jumbo: true }).toArray();
print(`Total jumbo chunks: ${jumbos.length}`)
jumbos.forEach(j => {
  print(`\n NS: ${j.ns} | Shard: ${j.shard}`)
  print(` Min: ${JSON.stringify(j.min)} | Max: ${JSON.stringify(j.max)}`)
})
```

**Red Flags**

- **Any jumbo chunks exist** — Balancer cannot migrate them, causing permanent imbalance. Fixes:
  1. Clear jumbo flag + trigger split
  2. Increase chunk size temporarily (e.g., 256MB)
  3. Reshard (5.0+) to a different key
  4. Refine shard key (4.4+) to increase cardinality: `db.adminCommand({ refineCollectionShardKey: "mydb.mycoll", key: { category: 1, _id: 1 } })`

### 11.4 Shard Key Fitness

**How to Check**

```javascript
use config
db.collections.find({ dropped: { $ne: true } }).forEach(c => {
  print(`${c._id}: key=${JSON.stringify(c.key)}, unique=${c.unique || false}`)
})

// Shard key cardinality and value frequency
use mydb
const keyField = "shardKeyField";
db.mycollection.aggregate([
  { $group: { _id: `$${keyField}`, count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: 20 }
]).forEach(v => print(` ${JSON.stringify(v._id)}: ${v.count} docs`))
```

**Shard Key Evaluation Matrix**

| Criterion | Good | Bad |
|-----------|------|-----|
| Cardinality | > 10,000 distinct values | < 100 distinct values |
| Frequency | No value > 1% of collection | Top value > 10% of collection |
| Monotonicity | Random/hashed distribution | Time-based/auto-increment |
| Query coverage | 80%+ queries include the key | < 50% queries include the key |
| Write distribution | Even inserts across shards | All inserts to one shard |

**Red Flags**

- **Low cardinality (< 1000 distinct values)** — Refine shard key by adding high-cardinality suffix or reshard.
- **Monotonic shard key (ObjectId, timestamp) with range sharding** — All new inserts go to one shard. Use hashed shard key or compound key with well-distributed field first.

### 11.5 Scatter-Gather vs Targeted Queries

**How to Check**

```javascript
const explanation = db.mycollection.find({ someField: "value" }).explain("executionStats");
const plan = JSON.stringify(explanation.queryPlanner?.winningPlan || {});
if (plan.includes("SHARD_MERGE")) {
  print("⚠ SCATTER-GATHER: Query hit multiple shards")
} else if (plan.includes("SINGLE_SHARD")) {
  print("✅ TARGETED: Query routed to single shard")
}
```

**Red Flags**

- **Top 5 most frequent queries are scatter-gather** — Adding more shards makes things slower. Refactor queries to include the shard key, or create secondary collections with different shard keys.

### 11.6 Chunk Migrations

**How to Check**

```javascript
use config
// Migration history
db.changelog.find({ what: /moveChunk/ }).sort({ time: -1 }).limit(30).forEach(entry => {
  const status = entry.details.errmsg ? '❌ FAILED' : '✅ OK';
  print(`${entry.time} | ${status} | ${entry.ns}`)
  if (entry.details.errmsg) print(` Error: ${entry.details.errmsg}`)
})

// Migration frequency per day
db.changelog.aggregate([
  { $match: { what: "moveChunk.commit" } },
  { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$time" } }, count: { $sum: 1 } }},
  { $sort: { _id: -1 } },
  { $limit: 14 }
]).forEach(d => print(`${d._id}: ${d.count} migrations`))
```

**Red Flags**

- **> 10 migrations/hour sustained** — Each migration consumes bandwidth and IOPS. Expected burst after adding shards, should settle in hours/days.
- **Repeated migration failures** — Address specific error types (see Section 11.1).

### 11.7 Zone (Tag-Aware) Sharding

**How to Check**

```javascript
sh.status()  // Look at tags/zones section

use config
db.tags.find().forEach(z => {
  print(`${z.ns}: zone=${z.tag}, min=${JSON.stringify(z.min)}, max=${JSON.stringify(z.max)}`)
})
db.shards.find({}, { _id: 1, tags: 1 }).forEach(s => {
  print(`Shard ${s._id}: zones=${JSON.stringify(s.tags || [])}`)
})
```

**Red Flags**

- **Zones configured but balancer off** — Zone rules are enforced by the balancer. Enable it.
- **Zone ranges overlap** — Chunks may bounce between zones. Review and fix ranges.
- **Chunks on wrong shard for their zone** — Data residency violation. Enable balancer and wait for correct placement.

### 11.8 Unsharded Collections in a Sharded Cluster

**How to Check**

```javascript
// List all sharded collections
use config
const shardedNs = new Set();
db.collections.find({ dropped: { $ne: true } }).forEach(c => shardedNs.add(c._id));

// Find large unsharded collections across all databases
db.adminCommand({ listDatabases: 1 }).databases.forEach(d => {
  if (["admin", "local", "config"].includes(d.name)) return;
  const dbRef = db.getSiblingDB(d.name);
  dbRef.getCollectionNames().forEach(c => {
    const ns = `${d.name}.${c}`;
    if (!shardedNs.has(ns)) {
      const stats = dbRef.getCollection(c).stats();
      const docs = stats.count || 0;
      const sizeMB = (stats.size || 0) / 1024 / 1024;
      if (docs > 100000 || sizeMB > 100) {
        print(`⚠ UNSHARDED: ${ns} | ${docs.toLocaleString()} docs | ${sizeMB.toFixed(2)} MB`)
      }
    }
  })
})
```

In a sharded cluster, unsharded collections live entirely on the **primary shard** for their database. This means one shard handles 100% of the read/write load for those collections, regardless of how many shards you have.

**Red Flags**

- **Large unsharded collections (> 100K docs or > 100MB)** — All traffic for this collection is pinned to a single shard. If the collection grows, that shard becomes a hotspot while other shards sit idle. Evaluate whether the collection's access patterns benefit from sharding.
- **Primary shard overloaded due to unsharded collections** — Multiple large unsharded collections may all land on the same primary shard. Use `sh.status()` to check which shard is primary for each database, and `db.adminCommand({ movePrimary: "mydb", to: "shardB" })` to redistribute if needed. **Warning**: `movePrimary` copies all unsharded data — run during maintenance.
- **Unsharded collections with high write throughput** — Even if the data is small, high write volume on an unsharded collection creates a single-shard bottleneck. Consider sharding with a hashed key for even distribution.
- **No periodic audit of unsharded collections** — As applications evolve, collections that started small can grow into bottlenecks. Include this check in your monthly review.

**When NOT to shard:**
- Collections under 10K documents or under 10MB — sharding overhead outweighs benefit.
- Configuration or metadata collections that are rarely written to.
- Collections that are always queried with a full-collection scan (e.g., small lookup tables).

---

## Part 12: Schema Design

### 12.1 Document Structure & Anti-Patterns

**How to Check**

```javascript
// Sample documents for structure analysis
db.mycollection.find().limit(5).forEach(doc => {
  print(`\nDoc ID: ${doc._id} | Size: ${bsonsize(doc)} bytes | Fields: ${Object.keys(doc).length}`)
  for (let key in doc) {
    const val = doc[key];
    const type = Array.isArray(val) ? `array[${val.length}]` : typeof val;
    const size = bsonsize({ [key]: val });
    print(`  ${key}: ${type} (${size} bytes)`)
  }
})

// Average and max document sizes
db.mycollection.aggregate([
  { $project: { size: { $bsonSize: "$$ROOT" } } },
  { $group: {
    _id: null,
    avgSize: { $avg: "$size" },
    maxSize: { $max: "$size" },
    minSize: { $min: "$size" },
    p95: { $percentile: { input: "$size", p: [0.95], method: "approximate" } }
  }}
])

// Unbounded array analysis
const arrayField = "events";
db.mycollection.aggregate([
  { $project: { arrSize: { $size: { $ifNull: [`$${arrayField}`, []] } } } },
  { $group: {
    _id: null,
    avg: { $avg: "$arrSize" },
    max: { $max: "$arrSize" },
    over100: { $sum: { $cond: [{ $gt: ["$arrSize", 100] }, 1, 0] } },
    over1000: { $sum: { $cond: [{ $gt: ["$arrSize", 1000] }, 1, 0] } },
    total: { $sum: 1 }
  }}
])

// Schema consistency check
db.mycollection.aggregate([
  { $sample: { size: 1000 } },
  { $project: { fields: { $objectToArray: "$$ROOT" } } },
  { $unwind: "$fields" },
  { $group: {
    _id: "$fields.k",
    types: { $addToSet: { $type: "$fields.v" } },
    count: { $sum: 1 }
  }},
  { $sort: { count: -1 } }
]).forEach(f => {
  const pct = (f.count / 10).toFixed(1);
  const flag = f.types.length > 1 ? '⚠ MIXED TYPES' : '';
  print(`${f._id}: present in ${pct}% | types: [${f.types.join(', ')}] ${flag}`)
})

// Schema validation rules
db.getCollectionInfos({ name: "mycollection" }).forEach(c => {
  if (c.options && c.options.validator) {
    print(`Validation: ${JSON.stringify(c.options.validator, null, 2)}`)
    print(`Level: ${c.options.validationLevel || 'strict'}`)
    print(`Action: ${c.options.validationAction || 'error'}`)
  } else {
    print(`⚠ No schema validation on ${c.name}`)
  }
})
```

**Red Flags**

- **Unbounded arrays growing past 1000 elements** — Every update rewrites entire array. Past 16MB the write fails. Use the **Bucket Pattern**: one document per N events.

```javascript
// Bucket pattern — one document per 100 events
{
  userId: "user1",
  bucket: 42,
  count: 100,
  events: [ /* up to 100 entries */ ]
}
```

- **Mixed types in the same field** — `price` as string vs number breaks queries. Add schema validation, migrate existing data.

```javascript
db.runCommand({
  collMod: "mycollection",
  validator: {
    $jsonSchema: {
      bsonType: "object",
      properties: {
        price: { bsonType: "double", description: "must be a number" }
      }
    }
  },
  validationLevel: "moderate"
})
```

- **No schema validation on collections accepting external input** — Any document shape can be inserted. Start with `validationLevel: "moderate"` and `validationAction: "warn"`, then tighten.

### 12.2 Data Model Efficiency

**How to Check**

```javascript
// Check for excessive $lookups
db.system.profile.find({
  "command.pipeline": { $elemMatch: { "$lookup": { $exists: true } } }
}).sort({ millis: -1 }).limit(10)

// Field type analysis (find dates stored as strings)
db.mycollection.aggregate([
  { $sample: { size: 500 } },
  { $project: { fields: { $objectToArray: "$$ROOT" } } },
  { $unwind: "$fields" },
  { $group: {
    _id: { field: "$fields.k", type: { $type: "$fields.v" } },
    count: { $sum: 1 }
  }},
  { $sort: { "_id.field": 1, count: -1 } }
])
```

**Red Flags**

- **Frequent $lookups between same two collections** — Data model is wrong. Embedding rules: 1:1 or 1:few → embed. 1:many bounded → embed. 1:many unbounded → reference with bucket pattern. Independently queried → reference.
- **Dates stored as strings** — Can't use MongoDB date operators, break range queries, break TTL indexes. Convert to BSON Date objects.

---

## Part 13: Networking & Connectivity

### 13.1 Connection Topology & Latency

**How to Check**

```javascript
db.adminCommand({ whatsmyuri: 1 })   // Your IP
db.hello()                           // Cluster topology
db.serverStatus().network            // Network throughput

const net = db.serverStatus().network;
print(`Bytes in: ${(net.bytesIn / 1024/1024/1024).toFixed(2)} GB`)
print(`Bytes out: ${(net.bytesOut / 1024/1024/1024).toFixed(2)} GB`)
print(`Requests: ${net.numRequests}`)
```

**Connection String Checklist**

- `mongodb+srv://` (SRV format — handles topology changes)
- `retryWrites=true` (retries transient write failures)
- `retryReads=true` (retries transient read failures)
- `w=majority` (durability guarantee)
- `readPreference=...` (appropriate for workload)
- `maxPoolSize=...` (appropriate for instance count)
- `appName=myservice` (identifies app in `db.currentOp`)
- `connectTimeoutMS=...` (reasonable timeout)
- `socketTimeoutMS=...` (reasonable timeout)
- `tls=true` (encrypted connection)

**Red Flags**

- **App and cluster in different regions** — 50-200ms per operation. Deploy app in same region as Atlas cluster.
- **retryWrites=true missing** — Network blip or election = write error propagated to user. Most modern drivers default to true, but verify.
- **w:0 (unacknowledged writes) in production** — Server doesn't confirm writes. Data can be silently lost. Use `w: "majority"`.
- **No appName in connection string** — Can't identify which app owns connections in `db.currentOp()`.
- **Missing or excessive socketTimeoutMS** — Too low = false timeouts. Too high = stuck queries hold connections. Recommended: `socketTimeoutMS=30000` (30 seconds).

---

## Quick Triage Matrix

| Symptom | Most Likely Cause | Section | First Command |
|---------|-------------------|---------|---------------|
| Everything is slow | Cache full / working set > RAM | 4.1 | `db.serverStatus().wiredTiger.cache` |
| One shard at 90% CPU | Hot shard key | 11.4 | `sh.status()` |
| Queries slow over time | Missing/degraded indexes | 6.2 | `db.system.profile.find().sort({millis:-1}).limit(5)` |
| Adding shards = slower | Scatter-gather queries | 11.5 | `.explain("executionStats")` on top queries |
| Chunks uneven | Jumbo chunks or balancer off | 11.1/11.3 | `sh.getBalancerState()` + `db.chunks.find({jumbo:true})` |
| All writes to one shard | Monotonic shard key | 11.4 | Compare insert opcounters per shard |
| One shard overloaded despite balanced chunks | Large unsharded collections | 11.8 | List unsharded collections per database vs `config.collections` |
| Secondaries falling behind | Oplog too small / write overload | 2.2/2.3 | `rs.printSecondaryReplicationInfo()` |
| Connection errors | Pool exhausted | 5.1 | `db.serverStatus().connections` |
| Disk filling up fast | No TTL / no archival | 3.2 | Check TTL indexes + collection sizes |
| Random failovers | Resource exhaustion / network | 2.1 | `rs.status()` + check Atlas CPU/memory |
| High app latency | Cross-region / wrong tier | 13.1/1.1 | Check region + `db.adminCommand({hostInfo:1})` |
| Data residency violation | Zone misconfiguration | 11.7 | `sh.status()` zones section |
| Latency spikes at night | Chunk migrations during peak | 11.6 | Check balancer window + migration logs |
| Can't recover from outage | Backup/restore untested | 9.2 | Review backup config in Atlas UI |
| Nobody noticed the issue | Alerts missing or broken | 10.1 | Audit alert configuration |

---

## Health Check Schedule

| Frequency | What to Check | Time Estimate |
|-----------|---------------|---------------|
| **Daily** | Long-running ops (5.2), Disk utilization (3.1), Replication lag (2.2), Connection counts (5.1) | 10 minutes |
| **Weekly** | Balancer + chunks + jumbo (11.1-11.3), Cache hit ratio (4.1), Alerts working (10.1), Slow query patterns (7.1) | 30 minutes |
| **Monthly** | Index audit + usage (6.1-6.2), Query performance (7.1-7.2), Shard key targeting (11.4-11.5), Security review (8.1-8.2), Backup verification (9.1) | 2 hours |
| **Quarterly** | Tier right-sizing (1.1), Version review (1.2), Restore drill (9.2), Schema audit (12.1-12.2), Full networking review (13.1), Oplog sizing (2.3) | Half day |

---

*Generated from the [MongoDB Atlas Complete Health Check](https://saiteja05.github.io/datalog/clusterreview.html) — 93-point checklist across 13 sections.*
