# MongoDB High Availability Demo

An interactive visualization tool for demonstrating MongoDB's high availability concepts to stakeholders.

## 🎯 Purpose

This demo helps explain:
- How MongoDB replica sets maintain availability
- What happens during node failures
- How elections work and why majority matters
- The difference between single-region and multi-region deployments
- Common HA misconceptions (like read-only replicas not helping with failover)

---

## 🚀 Quick Start

1. Open `ha-demo.html` in a web browser
2. Select a cluster topology from the tabs at the top
3. Use the operation buttons to simulate reads/writes
4. Click on nodes to simulate failures
5. Watch the elections and replication in action

---

## 🎮 Controls

### Buttons
| Button | Action |
|--------|--------|
| **➕ Insert** | Simulate a write (insert) operation |
| **✏️ Update** | Simulate a write (update) operation |
| **📖 Read** | Simulate a read operation |
| **💥 Kill Primary** | Take down the current primary node |
| **🔄 Reset** | Restore all nodes to healthy state |
| **💥 Kill Region X** | Simulate entire region failure |

### Animation Controls (Top-Left)
| Button | Action |
|--------|--------|
| **🐢 Slow / ⚡ Fast / 🦥 Slowest** | Cycle animation speed |
| **⏸️ Pause / ▶️ Resume** | Pause or resume animations |


---

## 📊 Cluster Configurations

### Replica Set Mode

| Configuration | Nodes | Regions | Best For Demonstrating |
|--------------|-------|---------|----------------------|
| **Single Region RS** | 3 | 1 | Basic HA, elections, majority concept |
| **Two Region RS** | 3 (2+1) | 2 | Cross-region latency, partial failures |
| **Three Region RS** | 5 (2-2-1) | 3 | True HA, survives any single region failure |
| **⚠️ HA Misconception** | 4 (2+1+R/O) | 2 | Why read-only replicas don't help HA |

### Sharded Mode (Toggle with "T" key)
Same regional configurations but with:
- Multiple shards
- Mongos routers
- Config servers

---

## 🎬 Demo Scenarios

### Scenario 1: Basic Failover (5 mins)
**Goal:** Show how MongoDB automatically recovers from primary failure

1. Start with **Single Region RS** (3 nodes)
2. Point out: "3 nodes, majority = 2"
3. Click **Insert** - show write flow to primary → replication to secondaries
4. Click primary node to kill it
5. Watch election happen automatically
6. Click **Insert** again - "System recovered, writes continue"

**Key Talking Points:**
- Automatic failover, no manual intervention
- Election takes ~10 seconds
- Application retries automatically with proper drivers

---

### Scenario 2: Why Majority Matters (5 mins)
**Goal:** Explain why you can't have just 2 nodes

1. Use **Single Region RS**
2. Kill 2 nodes (click each one)
3. Show: "No majority (1/2 needed) - cluster is READ-ONLY"
4. Try to **Insert** - it fails
5. "This is why we need odd numbers and majority"

**Key Talking Points:**
- Majority prevents "split-brain" scenarios
- 3 nodes can lose 1, 5 nodes can lose 2
- Even with 2 healthy nodes, if they can't reach majority, no writes

---

### Scenario 3: The HA Misconception (7 mins)
**Goal:** Show why read replicas don't provide HA

1. Select **⚠️ HA Misconception** configuration
2. Point out: "4 nodes - 2 in Region 1, 1 + 1 read-only in Region 2"
3. "Looks redundant, right? Let's see what happens..."
4. Click **💥 Kill Region 1**
5. Watch: NO election happens!
6. Show the log: "NO MAJORITY: 1 voters < 2 required"
7. "The read-only node has votes:0 - it can't participate in elections"

**Key Talking Points:**
- Read replicas (priority:0, votes:0) are for scaling reads, NOT for HA
- To recover, someone must MANUALLY reconfigure the replica set
- This is a common misconception that leads to outages

---

### Scenario 4: True Multi-Region HA (7 mins)
**Goal:** Show proper HA architecture

1. Select **Three Region RS** (5 nodes: 2-2-1)
2. Explain: "5 nodes across 3 regions, majority = 3"
3. Click **Insert** - show cross-region replication
4. Kill **Region 1** (2 nodes down)
5. Watch: Election succeeds! New primary in Region 2
6. Click **Insert** - "Writes continue, we survived a region failure"
7. "Region 3 has priority:0 - it's DR only, won't become primary"

**Key Talking Points:**
- This is the recommended production setup
- Can survive any single region failure
- Region 3 is "disaster recovery" - won't take writes normally
- ~10ms latency between Region 1 & 2

---

### Scenario 5: Write Concerns Explained (5 mins)
**Goal:** Show tradeoffs between durability and speed

1. Use any multi-node configuration
2. Set **Write Concern: w:1**
   - Click Insert - "Fast! Only waits for primary"
   - "Risk: If primary dies before replication, data could be lost"

3. Set **Write Concern: w:majority**
   - Click Insert - "Waits for majority acknowledgment"
   - "Slower but durable - data is on multiple nodes"

4. Set **Write Concern: w:all**
   - Kill one secondary node first
   - Click Insert - "Hangs forever! Waiting for all nodes"
   - "w:all is dangerous - any node down blocks writes"

**Key Talking Points:**
- w:majority is recommended for production
- w:1 is faster but risks data loss
- w:all should rarely be used

---

## 💡 Presenter Tips

### Before the Demo
- [ ] Test the demo in your browser
- [ ] Set animation speed to **Slow** or **Slowest** for audiences
- [ ] Have the keyboard shortcuts ready (press **⌨️ Shortcuts** to show)
- [ ] Close unnecessary browser tabs for performance

### During the Demo
- **Pause often** (press P) to explain what's happening
- **Point to the event log** (bottom panel) for technical details
- **Use the connection string** display to show how apps connect
- **Let them ask questions** - the interactive nature helps

### Common Questions

**Q: How fast is failover?**
A: Typically 10-30 seconds. Configurable via election timeout.

**Q: What about data during failover?**
A: With w:majority, acknowledged writes are durable. Unacknowledged writes may be rolled back.

**Q: Can I have nodes in more than 3 regions?**
A: Yes, but only 7 voting members max. Additional nodes can be non-voting.

**Q: What's the latency impact of w:majority?**
A: Adds one network round-trip to closest secondary. In same region, ~1-2ms.

---

## 🔧 Customization

### Changing Default Speed
In the JavaScript, find:
```javascript
let currentSpeedIndex = 1; // 0=Fast, 1=Slow, 2=Slowest
```

### Adding Custom Configurations
Add to `CLUSTER_CONFIGS` object in the JavaScript section.

---

## 📚 Additional Resources

- [MongoDB Replica Set Documentation](https://www.mongodb.com/docs/manual/replication/)
- [Write Concern Reference](https://www.mongodb.com/docs/manual/reference/write-concern/)
- [Read Preference Reference](https://www.mongodb.com/docs/manual/core/read-preference/)
- [Production Notes](https://www.mongodb.com/docs/manual/administration/production-notes/)

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Animations not showing | Check browser console for errors |
| Buttons not responding | Refresh the page |
| Layout broken | Try a wider browser window |
| Particles stuck | Click Reset or refresh |

---

*Built for MongoDB Solutions Architecture team *

