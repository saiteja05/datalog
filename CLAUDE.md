# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
# Compile Tailwind CSS (run after adding new Tailwind classes to any HTML file)
npm run build:css
```

This compiles `src/tailwind-input.css` → `assets/tw-prod.min.css` (minified). All HTML pages reference this compiled file directly — there is no other build step for the main site.



## Architecture

This is a **static site** (vanilla HTML/CSS/JS) with no server-side rendering. Pages are individual `.html` files at the repo root and in `misc/`. There is no routing framework — navigation is via `<a href>` links between pages.

**CSS**: Tailwind CSS with a custom MongoDB-branded theme defined in `tailwind.config.js`. The theme uses `mongo.*` color tokens (`mongo.bg`, `mongo.accent` = `#00ED64` green, etc.). Add new HTML files to `tailwind.config.js` `content` array if Tailwind classes aren't being picked up.

**JavaScript**: Vanilla JS embedded in `<script>` tags within each HTML file. No bundler or module system for the root pages.

**Lead gate**: `subscribe.js` (root) is included on most pages. It gates content behind an Email Octopus subscription form, uses DNS MX/A validation via Cloudflare DoH, and tracks gate status in localStorage. PostHog analytics only fires for gate-passed users.

### Core interactive page: `matrix.html`

The largest and most complex page (~5,800 lines). It's a 24-question decision wizard that recommends MongoDB architecture patterns. Key internals:

- `wizardData` object — defines all questions, options, and branching conditions
- `shouldShowQuestion(qId)` — evaluates whether a question should display based on prior answers
- `selectOption()` / `renderWizardStep()` — answer tracking and UI rendering
- `determinePrimaryDB()` — the recommendation logic engine
- State persisted in localStorage with 7-day expiration and cascade clearing of dependent answers
- HTML is generated via `innerHTML`; user-facing strings go through `sanitizeHTML()` (textContent-based) to prevent XSS

### GitHub Actions

`.github/workflows/notify-subscribers.yml` — triggers on push to `main` when `*.html` files change. It detects which content HTML files changed and creates draft EmailOctopus email campaigns. The workflow uses `EMAIL_OCTOPUS_API_KEY` and `EMAIL_OCTOPUS_LIST_ID` secrets.

## Content Structure

- Root `*.html` — primary topic pages (aggregations, security, multitenancy, etc.)
- `misc/*.html` — additional topic pages and demos
- `readme/*.md` — paired documentation for each HTML page
- `assets/` — compiled CSS and static images
- `logs/` — empty; reserved for log output

## Design Language

All pages share a unified permanent dark-mode aesthetic. Follow these patterns when creating or modifying pages.

### Color Palette

Define these CSS variables at the top of every page `<style>` block:

```css
:root {
  --bg-primary:    #001E2B;
  --bg-secondary:  #002838;
  --bg-card:       #003345;
  --bg-card-hover: #004058;
  --text-pri:      #fafafa;
  --text-sec:      #b8d8e8;
  --text-muted:    #7fa8bc;
  --accent:        #00ED64;   /* MongoDB green — primary accent */
  --accent-dim:    #00c853;
  --accent-glow:   rgba(0, 237, 100, 0.15);
  --border-subtle: rgba(255, 255, 255, 0.06);
  --border-accent: rgba(0, 237, 100, 0.25);
}
body { background: var(--bg-primary); color: var(--text-sec); }
```

Tailwind equivalents: `bg-mongo-bg`, `bg-mongo-card`, `text-mongo-accent`, `text-mongo-textPri`, `text-mongo-textSec`, `text-mongo-textMuted`.

Secondary accents (use one per feature/section): blue `#3b82f6`, purple `#a855f7`, orange `#f97316`, teal `#14b8a6`, yellow `#eab308`, red `#ef4444`.

### Typography

```html
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

```css
body { font-family: 'Outfit', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
code, pre, .mono { font-family: 'JetBrains Mono', monospace; }
```

| Element      | Size         | Weight | Notes                                     |
|--------------|--------------|--------|-------------------------------------------|
| Hero H1      | 4–7rem       | 700–800| Gradient clip text (white → `var(--accent)`) |
| Section H2   | 2.5–3rem     | 700    |                                           |
| Card H3      | 1.2–1.5rem   | 600    |                                           |
| Body         | 1–1.15rem    | 400    | Line-height 1.6–1.8                       |
| Label/badge  | 0.65–0.75rem | 600    | Uppercase, `letter-spacing: 0.08em`       |
| Code         | 0.8–0.875rem | 400    | JetBrains Mono                            |

Gradient headline:
```css
.gradient-text {
  background: linear-gradient(135deg, #fff 0%, var(--accent) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

### Page Shell

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Topic · MongoDB</title>
  <link rel="stylesheet" href="assets/tw-prod.min.css">
  <!-- Google Fonts (Outfit + JetBrains Mono) -->
  <style>/* CSS variables + page styles */</style>
</head>
<body class="bg-mongo-bg text-mongo-textSec">
  <!-- sticky nav (optional) -->
  <!-- hero section -->
  <!-- content sections -->
  <!-- footer -->
  <script src="subscribe.js"></script>
  <script>/* page JS */</script>
</body>
</html>
```

**Sticky nav:**
```html
<nav style="position:sticky;top:0;z-index:50;background:rgba(0,30,43,0.85);backdrop-filter:blur(16px);border-bottom:1px solid var(--border-subtle);">
  <div style="max-width:1200px;margin:0 auto;padding:0.75rem 1.5rem;display:flex;align-items:center;gap:1.5rem;">
    <span style="font-weight:700;color:var(--text-pri)">Page Title</span>
    <div style="margin-left:auto;display:flex;gap:1.25rem;">
      <a href="#section" style="font-size:0.875rem;color:var(--text-muted);">Section</a>
    </div>
  </div>
</nav>
```

**Hero section:** Full viewport (`min-height:100vh`), flex-centered. Background gets a subtle radial accent glow (`rgba(0,237,100,0.08)` at 0%, transparent at 70%). Structure: icon/logo → H1 (gradient text) → subtitle → optional CTA button.

**Section wrapper:**
```html
<section style="padding:5rem 1.5rem;">
  <div style="max-width:1200px;margin:0 auto;">
    <h2 style="font-size:2.5rem;font-weight:700;color:var(--text-pri);margin-bottom:1rem;">Section Title</h2>
    <p style="color:var(--text-sec);max-width:680px;line-height:1.7;margin-bottom:3rem;">Description.</p>
    <!-- cards / content -->
  </div>
</section>
```

**Footer:**
```html
<footer style="padding:3rem 1.5rem;text-align:center;border-top:1px solid var(--border-subtle);">
  <p style="font-size:0.875rem;color:var(--text-muted);">Description &middot; <a href="#" style="color:var(--accent);">Link</a></p>
</footer>
```

**Section divider:**
```html
<div style="height:1px;background:linear-gradient(90deg,transparent,var(--border-accent),transparent);max-width:1200px;margin:0 auto;"></div>
```

### Components

**Feature card** — gradient bg, subtle border, hover lift + glow + accent top-line reveal:
```css
.card {
  background: linear-gradient(135deg, var(--bg-card) 0%, var(--bg-secondary) 100%);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  padding: 1.75rem;
  position: relative;
  overflow: hidden;
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}
.card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  opacity: 0;
  transition: opacity 0.35s ease;
}
.card:hover {
  border-color: var(--border-accent);
  transform: translateY(-4px);
  box-shadow: 0 20px 40px rgba(0,0,0,0.3), 0 0 30px rgba(0,237,100,0.06);
}
.card:hover::before { opacity: 1; }
```

**Buttons:**
```css
.btn { padding:0.5rem 1.25rem; border-radius:8px; font-weight:600; font-size:0.875rem; cursor:pointer; transition:all 0.2s ease; }
/* Ghost */
.btn-ghost { background:rgba(0,237,100,0.1); color:var(--accent); border:1px solid rgba(0,237,100,0.3); }
.btn-ghost:hover { background:var(--accent); color:#001E2B; }
/* Primary (filled) */
.btn-primary { background:var(--accent); color:#001E2B; border:1px solid var(--accent); }
.btn-primary:hover { background:var(--accent-dim); }
```

**Badge/tag:**
```css
.badge {
  display:inline-block; padding:0.2rem 0.6rem; border-radius:6px;
  font-size:0.7rem; font-weight:600; font-family:'JetBrains Mono';
  background:rgba(0,237,100,0.1); color:var(--accent); border:1px solid rgba(0,237,100,0.2);
}
```

**Code block:**
```html
<div class="code-block" style="background:#0a1628;border:1px solid rgba(255,255,255,0.08);border-radius:12px;overflow:hidden;">
  <div style="display:flex;justify-content:space-between;padding:0.75rem 1rem;background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.06);">
    <span style="font-family:'JetBrains Mono';font-size:0.75rem;color:var(--text-muted)">javascript</span>
    <button onclick="copyCode(this)" style="font-size:0.75rem;color:var(--text-muted);cursor:pointer;background:none;border:none;">Copy</button>
  </div>
  <pre style="padding:1.25rem;overflow-x:auto;font-family:'JetBrains Mono';font-size:0.8rem;line-height:1.7;color:#e2e8f0;margin:0;"><code>// code here</code></pre>
</div>
```

Syntax highlight CSS classes: `.kw` `#c792ea` · `.str` `#c3e88d` · `.num` `#f78c6c` · `.fn` `#82aaff` · `.op` `#89ddff` · `.cm` `#546e7a` · `.prop` `#ffcb6b`.

### Animations

**Scroll fade-in (apply to every major content block):**
```css
.fade-in { opacity:0; transform:translateY(24px); transition:opacity 0.7s ease, transform 0.7s ease; }
.fade-in.visible { opacity:1; transform:translateY(0); }
.fade-in-delay-1 { transition-delay:0.1s; }
.fade-in-delay-2 { transition-delay:0.2s; }
/* up to delay-5 (0.5s) */
```
```javascript
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
```

**Standard keyframes:**
```css
@keyframes pulseGlow { 0%,100%{transform:scale(1);opacity:0.7;} 50%{transform:scale(1.3);opacity:1;} }
@keyframes fadeInUp  { from{opacity:0;transform:translateY(24px);} to{opacity:1;transform:translateY(0);} }
@keyframes spin      { to{transform:rotate(360deg);} }
```

Timing: `0.2s ease` (micro-interactions) · `0.35s cubic-bezier(0.4,0,0.2,1)` (cards/panels) · `0.7s ease` (scroll entries).

### Layouts

Card grid (responsive, auto-fill):
```css
.card-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(280px,1fr)); gap:1.5rem; }
```

Two-column (content + visual): `grid-template-columns:1.2fr 1fr; gap:3rem; align-items:start;` — stacks to 1 col below 768px.

Subtle background dot pattern:
```css
body::before {
  content:''; position:fixed; inset:0; pointer-events:none; z-index:0;
  background-image:radial-gradient(circle, rgba(255,255,255,0.02) 1px, transparent 1px);
  background-size:32px 32px;
}
```

### JavaScript Patterns

```javascript
// Copy code button
function copyCode(btn) {
  const code = btn.closest('.code-block').querySelector('code').textContent;
  navigator.clipboard.writeText(code).then(() => {
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 2000);
  });
}

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab, .tab-content').forEach(el => el.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
  });
});

// Collapsible sections
document.querySelectorAll('.section-header').forEach(h => {
  h.addEventListener('click', () => {
    const expanded = h.classList.toggle('expanded');
    h.setAttribute('aria-expanded', expanded);
    document.getElementById(h.id + '-content').classList.toggle('collapsed');
  });
});
```
