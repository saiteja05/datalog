# MongoDB Aggregation Pipeline Visualizer

An interactive visualization tool for understanding MongoDB's powerful aggregation framework.

## 🎯 Purpose

This demo helps explain:
- How the aggregation pipeline processes documents
- Common aggregation stages and their purposes
- Building complex data transformations
- Performance considerations for aggregations

## 📋 Aggregation Stages Covered

### Filtering & Matching
- `$match` - Filter documents
- `$limit` - Limit result count
- `$skip` - Skip documents
- `$sample` - Random sampling

### Transformation
- `$project` - Reshape documents
- `$addFields` - Add computed fields
- `$set` / `$unset` - Modify fields
- `$replaceRoot` - Replace document root

### Grouping & Analytics
- `$group` - Group and aggregate
- `$bucket` - Categorize into buckets
- `$facet` - Multiple pipelines in one
- `$sortByCount` - Group and count

### Joining & Lookups
- `$lookup` - Join collections
- `$graphLookup` - Recursive lookups
- `$unwind` - Deconstruct arrays

### Sorting & Output
- `$sort` - Order results
- `$out` - Write to collection
- `$merge` - Merge into collection

## 🚀 Quick Start

1. Open `aggregations.html` in a web browser
2. Explore the visual pipeline representation
3. Click on stages to see detailed explanations
4. Review example pipelines and their outputs

## 🎨 Interactive Features

- **Visual Pipeline Flow** - See data flow through stages
- **Stage Selector** - Click to explore each stage
- **Live Examples** - See input/output transformations
- **Color-Coded Stages** - Different colors for stage types

## 💡 Performance Tips

- Place `$match` early to filter data
- Use indexes for `$match` and `$sort`
- Limit `$lookup` result sizes
- Consider `allowDiskUse` for large datasets

## 🔗 Related Resources

- [Aggregation Pipeline](https://www.mongodb.com/docs/manual/aggregation/)
- [Aggregation Stages Reference](https://www.mongodb.com/docs/manual/reference/operator/aggregation-pipeline/)
