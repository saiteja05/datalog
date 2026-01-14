# AI Search Platform Comparison

An interactive comparison of enterprise AI search platforms: MongoDB Atlas, Azure AI Search, and AWS Kendra.

## 🎯 Purpose

This comparison helps explain:
- How MongoDB Atlas Search compares to cloud-native AI search
- Feature differences between platforms
- Pricing and cost considerations
- When to choose each platform
- Integration and architecture implications

---

## 🚀 Quick Start

1. Open `aisearch.html` in a web browser
2. Expand sections to explore each topic
3. Compare features across platforms
4. Review pricing tables and use cases
5. Click reference links for source documentation

---

## 📊 Platforms Compared

### MongoDB Atlas Search
| Aspect | Details |
|--------|---------|
| **Integration** | Native to MongoDB |
| **Data Sync** | Zero (same platform) |
| **Full-text** | Lucene-based |
| **Vector** | HNSW algorithm |
| **Hybrid** | Native support |
| **Pricing** | Compute-based |

### Azure AI Search (Cognitive Search)
| Aspect | Details |
|--------|---------|
| **Integration** | Azure ecosystem |
| **Data Sync** | Indexers, push API |
| **AI Enrichment** | Skillsets, cognitive services |
| **Vector** | Yes (preview/GA) |
| **Pricing** | Tiered (S1, S2, S3) |

### AWS Kendra
| Aspect | Details |
|--------|---------|
| **Integration** | AWS ecosystem |
| **Data Sync** | Pre-built connectors |
| **NLP** | Built-in understanding |
| **Vector** | Limited |
| **Pricing** | Per query + index |

---

## 🎬 Demo Scenarios

### Scenario 1: Platform Overview (15 mins)
**Goal:** Compare the three platforms

1. **MongoDB Atlas Search**
   - "Integrated with your database"
   - "No data movement needed"
   - "Full-text + vector + hybrid"

2. **Azure AI Search**
   - "Part of Azure AI services"
   - "Strong enrichment pipeline"
   - "Microsoft ecosystem integration"

3. **AWS Kendra**
   - "Enterprise search service"
   - "Natural language queries"
   - "Pre-built connectors"

**Key Talking Points:**
- Each has strengths
- Integration matters
- Consider total architecture

---

### Scenario 2: Zero-ETL Advantage (10 mins)
**Goal:** Highlight Atlas Search architecture

1. **Traditional search architecture**
   - "Data in database A"
   - "Sync to search engine B"
   - "Maintain consistency"

2. **Atlas Search approach**
   - "Data in MongoDB"
   - "Search index on same data"
   - "Automatic, real-time sync"

3. **Benefits**
   - "No pipeline to maintain"
   - "Always consistent"
   - "Lower operational burden"

**Key Talking Points:**
- Every sync is a liability
- Real-time beats batch
- Simplicity scales

---

### Scenario 3: AI/ML Integration (10 mins)
**Goal:** Compare AI capabilities

1. **Atlas Search**
   - "Bring your own embeddings"
   - "Any model (OpenAI, Cohere, etc.)"
   - "Combine with full-text"

2. **Azure AI Search**
   - "Integrated cognitive skills"
   - "OCR, entity extraction"
   - "Azure OpenAI integration"

3. **AWS Kendra**
   - "Built-in NLP"
   - "FAQ extraction"
   - "Document understanding"

**Key Talking Points:**
- All support AI features
- Integration depth varies
- Flexibility vs pre-built

---

### Scenario 4: Cost Analysis (10 mins)
**Goal:** Compare pricing models

1. **Atlas Search**
   - "Part of Atlas compute"
   - "Search nodes scale with data"
   - "Predictable pricing"

2. **Azure AI Search**
   - "Tiered pricing (S1-S3)"
   - "Per-replica/partition"
   - "Additional for AI enrichment"

3. **AWS Kendra**
   - "Per query pricing"
   - "Index size tiers"
   - "Can spike with usage"

**Key Talking Points:**
- Model matters for budgeting
- Per-query can be expensive
- Calculate for your workload

---

## 💡 Presenter Tips

### Common Questions

**Q: Which is best for document search?**
A: Kendra excels at enterprise documents. Azure good for enrichment. Atlas best when data is already in MongoDB.

**Q: What about vector search?**
A: Atlas has native vector. Azure added vector support. Kendra has limited vector capabilities.

**Q: How do I choose?**
A: Consider: Where is your data? What cloud are you on? What features do you need?

**Q: Can I use multiple?**
A: Yes, but adds complexity. Usually better to standardize.

**Q: What about open source alternatives?**
A: Elasticsearch/OpenSearch are options. Consider operational overhead.

---

## 📊 Comparison Matrix

| Feature | Atlas Search | Azure AI Search | AWS Kendra |
|---------|--------------|-----------------|------------|
| **Full-text** | ✅ | ✅ | ✅ |
| **Vector** | ✅ | ✅ | ⚠️ |
| **Hybrid** | ✅ | ⚠️ | ❌ |
| **Zero-sync** | ✅ | ❌ | ❌ |
| **AI Enrichment** | BYOM | Native skills | Built-in NLP |
| **Pricing** | Compute | Tiered | Per-query |

---

## 💰 Pricing Comparison (Estimate)

| Scenario | Atlas | Azure (S2) | Kendra |
|----------|-------|------------|--------|
| **1M docs** | $500/mo | $700/mo | $800/mo |
| **10M queries/mo** | Included | Included | $2500/mo |
| **AI features** | BYOM | +$200/mo | Included |

*Estimates only. Actual pricing varies by configuration.*

---

## 📚 Additional Resources

- [Atlas Search](https://www.mongodb.com/docs/atlas/atlas-search/)
- [Azure AI Search](https://docs.microsoft.com/azure/search/)
- [AWS Kendra](https://docs.aws.amazon.com/kendra/)
- [Vector Search Comparison](https://www.mongodb.com/developer/products/atlas/vector-search/)

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Sections not expanding | Click the header text |
| Links not working | Check if target exists |
| Comparison tables cut off | Scroll horizontally |
| Slow loading | Large page, wait for full load |

---

*Built for MongoDB Solutions Architecture team*
