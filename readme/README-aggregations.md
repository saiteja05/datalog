# MongoDB Aggregation Pipeline Visualizer

An interactive visualization tool for understanding MongoDB powerful aggregation framework.

## 🎯 Purpose

This demo helps explain:
- How the aggregation pipeline processes documents
- Common aggregation stages and their purposes
- Building complex data transformations
- Performance considerations for aggregations
- Real-world aggregation patterns

---

## 🚀 Quick Start

1. Open `aggregations.html` in a web browser
2. Explore the visual pipeline representation
3. Click on stages to see detailed explanations
4. Review example pipelines and their outputs
5. Try modifying examples to see changes

---

## 📊 Aggregation Stages

### Filtering Stages
| Stage | Description | Example Use |
|-------|-------------|-------------|
| `$match` | Filter documents | WHERE clause equivalent |
| `$limit` | Limit results | Pagination |
| `$skip` | Skip documents | Pagination offset |
| `$sample` | Random sample | Data sampling |

### Transformation Stages
| Stage | Description | Example Use |
|-------|-------------|-------------|
| `$project` | Reshape documents | Select/rename fields |
| `$addFields` | Add computed fields | Calculated values |
| `$unwind` | Deconstruct arrays | Flatten array data |
| `$group` | Group and aggregate | SUM, AVG, COUNT |

### Join Stages
| Stage | Description | Example Use |
|-------|-------------|-------------|
| `$lookup` | Join collections | Foreign key joins |
| `$graphLookup` | Recursive lookup | Hierarchical data |
| `$unionWith` | Union collections | Combine datasets |

### Output Stages
| Stage | Description | Example Use |
|-------|-------------|-------------|
| `$sort` | Order results | ORDER BY |
| `$out` | Write to collection | Materialized views |
| `$merge` | Merge into collection | Incremental updates |

---

## 🎬 Demo Scenarios

### Scenario 1: Pipeline Basics (10 mins)
**Goal:** Explain how pipelines work

1. **Concept introduction**
   - "Documents flow through stages like a pipe"
   - "Each stage transforms the data"
   - "Output of one stage feeds into the next"

2. **Simple example**
   - $match -> $group -> $sort
   - Show document transformation at each step

**Key Talking Points:**
- Sequential processing
- Each stage sees previous output
- Think of it as data flowing through transformations

---

### Scenario 2: Common Patterns (15 mins)
**Goal:** Show real-world aggregations

1. **Group and Count**
```javascript
[
  { $match: { status: "active" } },
  { $group: { _id: "$category", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
]
```

2. **Lookup (Join)**
```javascript
[
  { $lookup: {
      from: "products",
      localField: "product_id",
      foreignField: "_id",
      as: "product"
  }},
  { $unwind: "$product" }
]
```

3. **Date Aggregation**
```javascript
[
  { $group: {
      _id: { $dateToString: { format: "%Y-%m", date: "$created" } },
      total: { $sum: "$amount" }
  }}
]
```

**Key Talking Points:**
- Aggregations replace complex application code
- Server-side processing is faster
- Indexes can accelerate $match and $sort

---

### Scenario 3: Performance Optimization (10 mins)
**Goal:** Explain aggregation performance

1. **$match early**
   - "Filter first to reduce documents"
   - "Uses indexes when at start of pipeline"

2. **Use indexes**
   - "$match and $sort can use indexes"
   - "Check explain() for index usage"

3. **Limit memory**
   - "allowDiskUse for large datasets"
   - "Watch for memory-intensive stages"

**Key Talking Points:**
- Order matters for performance
- Indexes are your friend
- Monitor with explain()

---

## 💡 Presenter Tips

### Common Questions

**Q: When should I use aggregation vs find()?**
A: Use find() for simple queries. Use aggregation when you need grouping, joins, or complex transformations.

**Q: Can aggregations use indexes?**
A: Yes, $match and $sort at the start of pipelines can use indexes.

**Q: What about memory limits?**
A: Default 100MB per stage. Use allowDiskUse: true for larger operations.

**Q: Are aggregations real-time?**
A: Yes, they run on current data. For caching, use $out or $merge to materialized views.

**Q: Can I update data with aggregation?**
A: Use $merge to update collections based on aggregation results.

---

## 📈 Performance Tips

| Tip | Impact |
|-----|--------|
| Put $match first | Reduces documents early |
| Limit $lookup results | Prevents memory bloat |
| Use $project to reduce fields | Less data to process |
| Add indexes for $match/$sort | Faster execution |
| Use allowDiskUse for large data | Prevents memory errors |

---

## 📚 Additional Resources

- [Aggregation Pipeline](https://www.mongodb.com/docs/manual/aggregation/)
- [Aggregation Stages Reference](https://www.mongodb.com/docs/manual/reference/operator/aggregation-pipeline/)
- [Aggregation Performance](https://www.mongodb.com/docs/manual/core/aggregation-pipeline-optimization/)
- [Aggregation Examples](https://www.mongodb.com/docs/manual/tutorial/aggregation-examples/)

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Visualization not loading | Refresh the page |
| Stage details not showing | Click directly on stage |
| Examples not working | Check syntax in console |
| Slow performance | Reduce dataset size |

---

*Built for MongoDB Solutions Architecture team*
