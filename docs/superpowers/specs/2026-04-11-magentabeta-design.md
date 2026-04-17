# magentabeta.html -- MongoDB Magenta Product Story Page

## Overview

A visually immersive, interactive product story page for MongoDB Magenta -- the agentic compute and orchestration platform built natively on Atlas. Positions Magenta as the GA answer to AWS AgentCore and GCP Vertex AI Agent Engine, with customer data ownership as the structural differentiator.

**Audience:** Layered -- CTO/VP hook (vision + competitive positioning) flowing into Platform Engineering depth (architecture + workflows), closing with transparent roadmap.

**Design philosophy:** Fresh, adventurous, premium. NOT a rehash of existing repo pages. Break free from the standard card-grid-with-fade-in pattern. Keep MongoDB color palette (#001E2B, #00ED64) but push into cinematic, scroll-driven, interactive territory. Think product launch keynote translated to web.

## Design Decisions

1. **Narrative:** Layered (CTO + Platform Eng), scroll-driven story arc
2. **Interactivity:** High -- architecture explorer, terminal simulations, agent execution trace viz, industry demos with multi-turn chat simulation
3. **Transparency:** Bookended -- GA vision told uninterrupted, then honest roadmap section near bottom
4. **Visual language:** Adventurous, fresh -- not bound by existing repo design patterns. MongoDB colors only constraint.

## Visual Direction

### Fresh Design Elements (departing from repo patterns)

- **Full-bleed sections** with dramatic scale shifts -- some sections edge-to-edge dark, others with floating glassmorphic panels
- **3D-ish isometric architecture diagrams** using CSS transforms rather than flat SVG boxes
- **Scroll-triggered stage transitions** -- sections don't just fade in, they transform (e.g., architecture diagram assembles from scattered components as you scroll)
- **Glassmorphism + depth layers** -- floating panels with backdrop-blur over ambient gradient backgrounds
- **Ambient animated gradients** -- slow-moving color fields (dark greens, teals) behind content, not static backgrounds
- **Typography scale drama** -- massive hero text (8-10rem), aggressive size contrast between headings and body
- **Horizontal scroll segments** -- the industry demos and roadmap timeline scroll horizontally within vertical page flow
- **Particle/node network** -- canvas-based ambient animation in hero, not just a static radial glow
- **Monospace accent typography** -- JetBrains Mono used decoratively for labels, counters, status indicators throughout
- **Color accents beyond green** -- use magenta/pink (#e91e90) as a secondary accent (it's called Magenta after all), plus the existing blue/purple/teal for category coding

### Color System

```
Primary background:  #001E2B (MongoDB navy)
Secondary bg:        #002838
Tertiary bg:         #003345
Accent green:        #00ED64 (MongoDB green -- primary interactive)
Accent magenta:      #e91e90 (product identity accent -- used sparingly for Magenta branding)
Accent blue:         #3b82f6 (info, Public Preview badges)
Accent purple:       #a855f7 (GA Vision badges)
Accent teal:         #14b8a6 (success states)
Text primary:        #fafafa
Text secondary:      #b8d8e8
Text muted:          #7fa8bc
Glow green:          rgba(0, 237, 100, 0.15)
Glow magenta:        rgba(233, 30, 144, 0.15)
```

## Page Sections (11 total)

### 1. Hero -- "Agents Need a Home"

Full viewport cinematic. Canvas-based particle network showing interconnected nodes (representing agents, data, tools, memory) with animated connection lines. Particles drift and connect organically.

- Massive gradient headline (white → green): "The Agentic Platform"
- Subtitle: "Atlas was the database for AI. Magenta is where agents run, remember, and scale."
- Two CTAs: "Explore the Platform" (smooth scroll) + "Join Private Preview" (anchor)
- Subtle scroll indicator at bottom
- Background: Animated ambient gradient (deep navy → dark teal → navy cycle)

### 2. The Problem -- "You Built the Agent. Now What?"

Three dramatic floating cards that assemble on scroll (start scattered/transparent, converge to grid):

1. **A place to run** -- Isolated compute with framework freedom
2. **A place to remember** -- Persistent memory across sessions
3. **A place to be governed** -- Enterprise policies, auth, audit trails

Each card has an animated icon (CSS-only). Minimal text. This section is emotional, not technical.

### 3. The Platform -- Interactive Architecture Diagram

The centerpiece technical section. An isometric-style architecture visualization built with CSS transforms and SVG.

**Components shown:**
- API Gateway (top) -- AuthN/AuthZ entry point
- Orchestrator (center) -- routing, policy enforcement, the brain
- Agent Executors (left cluster) -- isolated containers for agent code
- Tool Executors (right cluster) -- isolated containers for tools, MCP servers
- ExoMemory (bottom-left) -- STM + LTM with digestion workers
- Customer Data Store (bottom-center) -- in customer's Atlas org (highlighted differently)
- Runtime Data Store (bottom-right) -- config + image registry metadata
- Secrets Store -- encrypted credentials
- Observability -- OTel traces, cost metrics

**Interactivity:**
- Click any component to reveal a detail panel (glassmorphic overlay) with description, capabilities, and how it connects
- Animated flow lines pulse between components showing a request lifecycle
- Toggle button: "See a request flow" animates a full agent execution path through the system
- Components glow/highlight as the flow reaches them

### 4. Your Data, Your Atlas -- The Differentiator

Split section with dramatic visual comparison:

**Left (60%):** Explanation of Customer Data Store architecture. Data lives in the customer's own Atlas organization. Not MongoDB's cloud. Not a shared tenant. YOUR Atlas, YOUR encryption keys, YOUR compliance boundary.

**Right (40%):** Animated comparison diagram:
- **Magenta:** Data icon flowing into a box labeled "Your Atlas Org" with a lock icon, green border
- **Hyperscalers:** Data icon flowing into a box labeled "Their Cloud" with an open lock, red/dim border
- Animated toggle between the two states

Key stats/callouts: "Customer-owned encryption", "Same Atlas org as your database", "Regulated-industry ready"

### 5. Resource Hierarchy Explorer

Interactive tree visualization using the State Farm Insurance example.

```
Organization: State Farm Car Insurance
  |-- Project: Insurance Agent Dev
  |   |-- Workspace: Web Chat Agent (Model: Claude Sonnet, Tools: Web session mgmt)
  |   |-- Workspace: Phone Agent (Model: ElevenLabs, Tools: Call routing)
  |   |-- [Shared]: Customer Data Store, Memory, Orchestrator, Tools
  |-- Project: Insurance Agent Prod
      |-- Workspace: Web Chat Agent
      |-- Workspace: Phone Agent
      |-- [Shared]: ...
```

- Click to expand/collapse nodes
- Hover over shared resources to see connection lines to all workspaces that inherit them
- Clicking a Workspace reveals its components in a detail panel
- Animated connection lines show shared vs workspace-specific resources
- Color coding: Org = green border, Project = blue border, Workspace = purple border

### 6. Magenta in Action -- Industry Demos

**The showpiece interactive section.** Horizontal-scroll industry selector with immersive multi-turn agent simulations.

**Industry pill selector:** Financial Services | Healthcare & Insurance | Telecommunications

**Demo UI (per industry):**

3-panel layout adapted from agenticmemory.html patterns but with Magenta-specific architecture visibility:

- **Left panel -- Platform View:** Live view of Magenta components activating. Shows which Executor is running, Orchestrator policy checks, Memory reads/writes, Customer Data Store operations. Animated flow lines between components. Displays actual API/tool calls with params.
- **Center panel -- Governance View:** What makes this distinctly Magenta. Shows Orchestrator decisions: policy enforcement, model authorization checks, tool authorization, resource limit tracking. This panel makes the "governed" story tangible.
- **Right panel -- Conversation:** User-agent chat thread with suggestion buttons to advance scenarios.
- **Bottom bar:** Phase indicators (Perceive > Route > Execute > Govern > Store) + live stats (Execution time, Tool calls, Memory ops, Cost)
- **Controls:** Auto-run all scenarios, step through manually, pause/resume

**Financial Services scenarios (3):**

1. **Claims Fraud Detection** -- Customer submits claim > Agent retrieves policy from CDS > Orchestrator routes to fraud-scoring Tool Executor > Agent cross-refs historical claims via LTM > Flags for human review or auto-approves > Stores checkpoint
2. **KYC Document Processing** -- Doc uploaded > Agent extracts entities via Tool Executor > Orchestrator enforces model authorization (region-approved models only) > Agent checks sanctions DB > Stores verification in CDS
3. **Portfolio Advisory (multi-agent)** -- Client asks about portfolio > Orchestrator dispatches to Market Data Agent + Risk Agent + Compliance Agent via A2A > Results aggregated > Response with audit trail

**Healthcare & Insurance scenarios (2):**

1. **Insurance Claims Processing** -- The State Farm example. Web Chat workspace: customer reports accident > Agent retrieves policy > dispatches to Claims Assessment subagent > checks coverage > initiates claim. Shows shared Memory/CDS across workspaces.
2. **Patient Triage** -- Patient describes symptoms > Agent retrieves medical history from CDS > STM tracks conversation > Orchestrator enforces tool authorization (approved diagnostics only) > Recommends care pathway > Stores in LTM

**Telecommunications scenarios (2):**

1. **Network Troubleshooting** -- Customer reports outage > Agent retrieves account + service area > Tool Executor runs network diagnostics via private networking > LTM recalls recent outage patterns > Resolves or escalates > OTel traces exported to Langfuse
2. **Plan Optimization** -- Agent analyzes usage from CDS > Cross-refs current plans > Tool Executor queries billing > Recommends optimal plan with projected savings

Each scenario builds on previous turns with ExoMemory loopback, showing STM/LTM continuity.

### 7. Developer Experience -- Terminal + Trace Viz

Three-tab section with simulated terminals and animated trace visualization.

**Tab 1: Build (magenta dev)**
Simulated terminal showing:
```
$ magenta dev
Starting local Magenta runtime...
Orchestrator ready on localhost:8100
Agent Executor sandbox initialized
Tool Executor sandbox initialized
Memory service connected (local)
Playground available at http://localhost:8100/playground
```
Terminal types out character-by-character with realistic timing.

**Tab 2: Deploy (magenta build + deploy)**
```
$ magenta build
Building agent image: insurance-webchat:v2.1.0
Packaging agent code... done
Packaging tool definitions... done
Pushing to Agent & Tool Image Registry... done
Image sha256:a1b2c3... published

$ magenta deploy --project insurance-prod --workspace webchat
Deploying insurance-webchat:v2.1.0...
Orchestrator configuration updated
Agent Executor provisioned
Tool Executors (3) provisioned
Memory service connected to Customer Data Store
Deployment complete. Agent live at:
  https://api.magenta.mongodb.com/v1/orgs/statefarm/projects/insurance-prod/workspaces/webchat/invoke
```

**Tab 3: Observe (trace visualization)**
Animated node graph showing an agent execution trace:
- Client Request node → API Gateway → Orchestrator → Agent Executor → Tool Executor (fan out to multiple) → Memory → back through Orchestrator → Response
- Each node shows: latency, cost, status
- Clicking a node expands to show OTel span detail
- Color coding: green = success, yellow = slow, red = error

### 8. Framework Freedom

Interactive framework selector with code comparison.

Four cards: **LangGraph** (green badge: "Available Now") | **CrewAI** | **Google ADK** | **Custom** (all: blue badge "Coming Soon")

Clicking each shows the same insurance agent skeleton in that framework's syntax:
- LangGraph: Full working example with `@magenta.tool`, `@magenta.agent` decorators
- CrewAI: Equivalent with CrewAI patterns
- ADK: Equivalent with Google ADK patterns
- Custom: Raw Python with Magenta SDK

Code blocks with syntax highlighting (existing repo highlight classes). The point: same agent, any framework, one platform.

### 9. Enterprise Grade

NOT a boring card grid. Instead: an animated security layers visualization.

Concentric rings or stacked layers, each representing an isolation boundary:
- **Outer: Network Isolation** -- Private networking, AWS PrivateLink, policy-enforced no-public
- **Next: Control Plane Isolation** -- RBAC, Org/Project scoping, service accounts
- **Next: Compute Isolation** -- Per-execution sandboxes, no shared process/memory/filesystem
- **Next: Data Isolation** -- Customer Data Store in customer Atlas org, scoped to Org+Project
- **Center: Secrets Isolation** -- Encrypted by MongoDB-managed keys, never cross org boundaries

Click each layer to expand details. Also covers: Federated Identity (OIDC/SAML), Terraform/CLI/REST API for IaC, Policies (model allowlists, tool authorization, resource limits).

### 10. Where We Are Today -- Interactive Roadmap

Horizontal scrolling timeline with three milestone cards:

**Private Preview (Jun 30, 2026)** -- green accent
- AWS us-east-1
- LangGraph + Python
- CLI / REST API / Terraform Provider
- OTel traces to Langfuse
- FDE-supported onboarding
- Private + public networking
- ExoMemory STM/LTM
- Multi-agent via A2A

**Public Preview (Sep 30, 2026)** -- blue accent
- Built-in Traces UI
- Enterprise data sources (CDC pipelines)
- Expanded framework support
- Self-service onboarding + billing
- Interactive tool catalog
- Native evals UI

**GA Vision** -- purple accent, with ambient glow
- Multi-cloud: AWS + Azure + GCP
- Multi-framework: LangGraph, CrewAI, ADK, custom
- On-prem deployment for regulated industries
- Agent & Tool Marketplace
- Built-in observability UI
- Environment promotion (dev → stage → prod)
- Air-gap support

Each card expandable. Honest, specific. No hand-waving.

### 11. CTA + Footer

"Build the future of agents on MongoDB."

Email capture integrating with existing subscribe.js lead gate for Private Preview interest list. Links to documentation. Standard footer.

## Technical Notes

- Single HTML file, no framework. Vanilla JS + CSS. Follows repo pattern.
- Canvas API for hero particle animation and architecture flow lines
- CSS transforms for isometric effects
- All demo data hardcoded in JS objects (same pattern as agenticmemory.html mcpScenarios)
- subscribe.js included for lead gate
- assets/tw-prod.min.css included (Tailwind), but page-specific styles in inline `<style>` block
- Must run `npm run build:css` after creation if new Tailwind classes used
- Add magentabeta.html to tailwind.config.js content array if needed
- Responsive: Desktop-first, graceful degradation to tablet/mobile
- Target: ~4000-6000 lines (comparable to matrix.html in ambition)

## Out of Scope

- Backend/API integration (all demos are simulated)
- Video/media assets (all visuals are CSS/SVG/Canvas)
- CMS or content management
- Server-side rendering
