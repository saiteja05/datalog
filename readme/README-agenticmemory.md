# Agentic Memory on MongoDB

An interactive guide illustrating how MongoDB Atlas powers every layer of AI agent memory — from fleeting context to permanent knowledge — in a single unified platform.

## Purpose

This page helps explain:
- The 5-phase agent lifecycle (Perceive → Retrieve → Reason → Act → Store) and MongoDB's role at each step
- Eight distinct memory types that intelligent agents require and how each maps to MongoDB features
- How Atlas Vector Search with built-in Voyage AI embedding and reranking models eliminates external API dependencies
- The architectural advantage of a unified memory store vs. bolting together separate databases
- Integration paths via LangChain, LangGraph, LlamaIndex, and MongoDB MCP Server

---

## Quick Start

1. Open `agenticmemory.html` in a web browser
2. Use the sticky navigation bar to jump between sections
3. Click lifecycle phases to see MongoDB's role at each step
4. Click memory layers in the Architecture Diagram for interactive feature details
5. Step through the Scenario Walkthrough to see memory reads/writes in action
6. Switch between Framework tabs (LangChain, LangGraph, LlamaIndex, MCP) for integration code

---

## Page Sections

| # | Section | Description |
|---|---------|-------------|
| 1 | **Hero** | Animated neural-network canvas background with page title |
| 2 | **Agent Lifecycle** | Interactive pentagonal diagram — click or auto-cycle through 5 phases |
| 3 | **Eight Layers of Memory** | 8-card grid linking to deep-dive sections |
| 4 | **Deep Dives** | Detailed breakdown of each memory type with MongoDB features and code examples |
| 5 | **Architecture Diagram** | Interactive 3-column flow (User → Agent → Atlas) with clickable memory layers |
| 6 | **Memory in Action** | 6-step scenario walkthrough simulating a customer support agent conversation |
| 7 | **The Sync Tax** | Before/After comparison — bolted-on (6 DBs) vs. unified on Atlas |
| 8 | **Memory Lifecycle Timeline** | Vertical timeline showing data flow across memory layers over time |
| 9 | **Plug Into Any Framework** | Tabbed code panels for LangChain, LangGraph, LlamaIndex, and MCP Server |
| 10 | **Why MongoDB Atlas** | Value proposition: unified platform, Voyage AI vectors, production readiness |

---

## Eight Memory Types

| Memory Type | What It Stores | Key MongoDB Features |
|-------------|---------------|---------------------|
| **Working** | Current conversation context, scratchpad | TTL Index, Change Streams |
| **Episodic** | Past interactions and experiences | Timestamped Docs, Atlas Search |
| **Semantic** | Knowledge base, facts, domain expertise | Atlas Vector Search, Voyage AI Embeddings & Reranking |
| **Procedural** | Skills, tool schemas, learned workflows | Versioned Docs, $graphLookup |
| **Long-term** | User profiles, preferences, trust scores | Atomic Updates ($set, $push, $inc) |
| **Taxonomic** | Category hierarchies and domain ontologies | Self-referencing Docs, Tree Patterns |
| **Entity** | People, products, orgs the agent interacts with | Unique Index, Upsert, $addToSet |
| **Shared** | Cross-agent team knowledge | RBAC, Multi-tenant Design |

---

## Key Technologies Highlighted

- **Atlas Vector Search** — ANN similarity search with pre-filtering
- **Voyage AI Embeddings** — Atlas-native embedding models (no external API calls)
- **Voyage AI Reranking** — cross-encoder reranking for higher precision
- **MongoDB MCP Server** — Model Context Protocol for agent-to-database communication
- **Change Streams** — real-time event capture
- **TTL Indexes** — automatic expiration for working memory
- **$graphLookup** — recursive graph traversal for procedural and taxonomic memory
- **Aggregation Pipelines** — combine $vectorSearch, $graphLookup, text search, and filters in one query
- **Atomic Operators** — $set, $push, $inc, $addToSet for concurrent memory updates
- **RBAC & CSFLE** — security for shared/multi-tenant memory

---

## Demo Scenarios

### Scenario 1: Agent Memory Overview (10 mins)
Goal: Explain why agents need persistent memory beyond the LLM context window

1. Start at the Hero section
2. Walk through the Agent Lifecycle — click each phase to show MongoDB's role
3. Scroll to the Eight Layers grid — explain each card briefly
4. Jump to the Architecture Diagram — click memory layers for details

Key Talking Points:
- LLM context windows are finite and ephemeral — agents need durable memory
- MongoDB Atlas serves as a single unified memory backbone
- No sync pipelines between separate vector, cache, graph, and document databases

### Scenario 2: Deep Technical Dive (20 mins)
Goal: Show how MongoDB features map to each memory type

1. Walk through 2-3 Deep Dive sections (Semantic + Working + Long-term recommended)
2. Highlight Voyage AI embeddings and reranking in the Semantic Memory section
3. Show the Scenario Walkthrough — step through all 6 steps
4. Open the Framework tabs — show LangChain integration, then MCP Server config

Key Talking Points:
- Voyage AI models are built into Atlas — embed and rerank without external APIs
- A single `aggregate()` pipeline can combine vector search, graph lookups, and filters
- MCP Server lets agents query MongoDB directly via Model Context Protocol

### Scenario 3: Why Not Bolt It Together? (10 mins)
Goal: Make the case for a unified platform over a multi-database stack

1. Scroll to "The Sync Tax" section
2. Walk through the Before side (6 databases, 5+ sync pipelines, N consistency bugs)
3. Contrast with the After side (8 collections, 1 cluster, zero sync)
4. Finish with "Why MongoDB Atlas" value cards

---

## Interactive Features

| Feature | Interaction | Implementation |
|---------|------------|----------------|
| Neural canvas | Animated background | Canvas API with connected nodes |
| Lifecycle ring | Click phases or auto-cycle | SVG + JS event listeners |
| Architecture layers | Click memory types for detail panel | JS `toggleArchLayer()` with data object |
| Scenario walkthrough | Click steps 1-6 | JS `setScenarioStep()` with memory pill highlights |
| Framework tabs | Click LangChain / LangGraph / LlamaIndex / MCP | JS `setFramework()` with syntax-highlighted code |
| Fade-in animations | Scroll-triggered | IntersectionObserver |
| Sticky nav | Highlights active section | IntersectionObserver on sections |
| Code blocks | Copy button | `navigator.clipboard` API |

---

## Tech Stack

- **HTML** — single self-contained file, no build step
- **Tailwind CSS** — via CDN with custom `mongo` color palette
- **Vanilla JavaScript** — no frameworks, no dependencies
- **Inter + JetBrains Mono** — Google Fonts
- **CSP Headers** — Content Security Policy meta tag for safe deployment

---

## Common Questions

Q: Why a single HTML file instead of a framework?
A: Zero build step, instant deployment to GitHub Pages, easy to share as a standalone artifact.

Q: Can I use this offline?
A: The page requires CDN access for Tailwind CSS and Google Fonts on first load. After caching, most features work offline.

Q: How do I update memory types?
A: Each memory type appears in 4 places — the grid card, the deep-dive section, the `archLayers` JS object, and the scenario walkthrough. Search for the memory type name to find all references.

---

## Additional Resources

- MongoDB Atlas Vector Search: https://www.mongodb.com/products/platform/atlas-vector-search
- Voyage AI on MongoDB: https://www.mongodb.com/products/platform/voyage-ai
- MongoDB MCP Server: https://www.mongodb.com/products/tools/mcp-server
- LangChain MongoDB Integration: https://python.langchain.com/docs/integrations/vectorstores/mongodb_atlas/
- LangGraph Checkpointing: https://langchain-ai.github.io/langgraph/reference/checkpoints/

---

Built for MongoDB Solutions Architecture team
