---
name: Concise
description: A straightforward developer product site with readable examples, direct actions, and complete documentation.
colors:
  bg: "#f7f7f5"
  surface: "#fff"
  ink: "#18191d"
  muted: "#60615f"
  accent: "#ff4a24"
  accent-ink: "#b52e10"
  soft: "#eeefeb"
  dark: "#202124"
  line: "#dedfda"
  code-ink: "#eceee8"
  code-muted: "#a3a69e"
  success: "#2d6548"
  success-bg: "#edf4ee"
typography:
  display:
    fontFamily: "Jost, Arial, sans-serif"
    fontSize: "clamp(52px, 6.7vw, 96px)"
    fontWeight: 550
    lineHeight: 1.05
    letterSpacing: "-0.055em"
  headline:
    fontFamily: "Jost, Arial, sans-serif"
    fontSize: "clamp(36px, 4vw, 52px)"
    fontWeight: 550
    lineHeight: 1.08
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Jost, Arial, sans-serif"
    fontSize: "24px"
    fontWeight: 550
    lineHeight: 1.08
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Jost, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Jost, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  action-label:
    fontFamily: "Jost, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.2
  code:
    fontFamily: "monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.7
  docs-display:
    fontFamily: "Jost, Arial, sans-serif"
    fontSize: "clamp(2rem, 3vw, 2.5rem)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  docs-headline:
    fontFamily: "Jost, Arial, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  docs-title:
    fontFamily: "Jost, Arial, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  docs-body:
    fontFamily: "Jost, Arial, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.75
  docs-lead:
    fontFamily: "Jost, Arial, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 400
    lineHeight: 1.65
  docs-label:
    fontFamily: "Jost, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
  docs-code:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.7
rounded:
  square: "0px"
  inline-code: "2px"
  demo: "4px"
spacing:
  tight: "8px"
  small: "12px"
  regular: "16px"
  panel-gap: "18px"
  inset: "20px"
  control: "24px"
  panel: "32px"
  column: "40px"
  wide-column: "80px"
  section: "150px"
  section-tablet: "100px"
  section-mobile: "85px"
  gutter: "clamp(20px, 4.4vw, 72px)"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.ink}"
    rounded: "{rounded.square}"
    typography: "{typography.action-label}"
    padding: "12px 24px"
  button-dark:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.square}"
    typography: "{typography.action-label}"
    padding: "12px 24px"
  button-small-dark:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.square}"
    typography: "{typography.action-label}"
    padding: "10px 17px"
  preset-select:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.square}"
    typography: "{typography.body}"
    padding: "10px 14px"
    width: "100%"
  pane-state:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.muted}"
    rounded: "{rounded.square}"
    padding: "3px 7px"
  pane-state-allowed:
    backgroundColor: "{colors.success-bg}"
    textColor: "{colors.success}"
    rounded: "{rounded.square}"
    padding: "3px 7px"
  site-navigation:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
  comment-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.square}"
    padding: "38px"
  demo-stage:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.demo}"
    padding: "0 18px 18px"
  install-terminal:
    backgroundColor: "#292a2c"
    textColor: "{colors.code-ink}"
    rounded: "{rounded.square}"
    padding: "0 24px 20px"
  docs-navigation-current:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.docs-label}"
    padding: ".45rem .75rem"
  docs-table:
    textColor: "{colors.ink}"
    typography: "{typography.docs-label}"
    width: "100%"
---

# Design System: Concise

## Overview

**Creative North Star: "Straightforward developer product site"**

Concise is plain, precise, and product-led. The neutral ground, Jost typography, orange actions, and original convergence mark make a conventional developer site feel considered. Linear, Raycast, and Resend set the craft bar, not a template to copy. Preserve this chosen conventional identity rather than introducing an experimental visual world.

Readable code, hook findings, configuration, and installation commands supply the imagery. The homepage has a large centered introduction, the existing film, and a short next-step section. Dedicated marketing pages hold the interactive examples, use cases, installation, configuration, console, and FAQ; documentation uses a quieter reading layout. Open space separates ideas, while flat tonal stages group related material. Neither surface needs stock photography or invented proof.

**Key Characteristics:**
- Warm-neutral ground, white and soft stages, charcoal code, and purposeful orange.
- Self-hosted Jost for interface and prose; real monospace for code.
- Five homepage marketing sizes, with a separate documentation hierarchy.
- Square controls, original convergence geometry, and flat surfaces without shadows.
- Semantic controls, visible focus, readable responsive tables, and reduced-motion parity.

## Colors

The applied palette is neutral and restrained, with one orange brand accent and a functional green success treatment. Frontmatter keys retain the names of the applied custom properties in `src/styles/global.css`.

### Primary
- **Action Orange** (`accent`): primary actions, the closing conversion band, the mark's endpoint, selected-host underline, the hook indicator, and text selection. It is not limited to tiny accents.
- **Readable Orange** (`accent-ink`): links in documentation, focus outlines, and text findings on light backgrounds. Use this darker orange for small colored text rather than the action fill.

### Neutral
- **Neutral Ground** (`bg`): page background and light text in documentation code blocks.
- **White Surface** (`surface`): example panes, feature and FAQ containers, table cells, fields, and inverse button text.
- **Charcoal Ink** (`ink`): primary text, dark buttons, the installation section, and the inherited body of the convergence mark.
- **Muted Text** (`muted`): secondary copy, captions, inactive navigation, and table labels; do not reduce its opacity to create another text tier.
- **Soft Stage** (`soft`): demo surround, full-width use-case and footer grounds, inset examples, active documentation navigation, and table headers.
- **Code Charcoal** (`dark`): code specimens and documentation code blocks. The installation terminal has its own slightly lighter component fill.
- **Divider** (`line`): field outlines and documentation table rules.
- **Code Text** (`code-ink`) and **Code Muted** (`code-muted`): readable text and metadata on homepage charcoal specimens.

### Functional states
- **Success Text** (`success`) on **Success Ground** (`success-bg`): rewritten status and successful checks. Retain accompanying words or a check SVG; color alone does not explain the state.
- Diff, test-failure, configuration, and Shiki `github-dark` syntax colors stay local to code. They do not establish additional brand accents.
- The declared `--orange-soft` has no applied role in the shipped surfaces; do not treat it as an established container variant.

**The Readable Accent Rule.** Use action orange for fills and brand signals; use readable orange for small text and focus on the light ground.

## Typography

**Display Font:** Jost, with Arial and sans-serif fallbacks.
**Body Font:** the same Jost stack.
**Label/Mono Font:** Jost for labels; generic `monospace` for homepage code. Documentation code uses `ui-monospace, SFMono-Regular, Consolas, monospace`.

Jost is self-hosted at `public/fonts/jost-latin-variable.woff2`, normal style, variable weights (100–900), with `font-display: swap`; `SiteLayout.astro` preloads it. Use the real variable face for medium headings, not a system display substitute. Headings are tightly tracked and balanced; body copy is normally spaced and uses pretty wrapping.

### Hierarchy

The final type-role block in `src/styles/home.css` is authoritative over its earlier selectors and responsive declarations. At a wide desktop, the five marketing sizes are **14 / 17 / 24 / 52 / 96px**. The corresponding CSS properties are `--type-small`, `--type-body`, `--type-lead`, `--type-head`, and `--type-display`; their values are represented by the frontmatter label, body, title, headline, and display roles.

- **Display:** hero headline and oversized footer line. The hero uses the display token; the footer keeps its own looser line-height (1.2) and tracking (-.065em). Above the wide-home breakpoint (901px), the hero is one line. At mobile widths (550px and below), it wraps naturally, uses tracking (-.04em), and retains the display floor. The mobile footer alone uses `clamp(38px, 10vw, 52px)`.
- **Headline:** section headings and the file-limit numeral. All homepage heading overrides resolve to this fluid role, not the older individual heading sizes.
- **Title:** feature titles, guide titles, compatibility names, and the homepage wordmark. Headings use medium weight (550); the wordmark retains its own weight (600), tracking, and single-line geometry.
- **Body:** homepage description and section prose, FAQ questions and answers, select text, and configuration explanations. Typical line-height is 1.5–1.7 according to context. Do not enlarge every introductory paragraph to the title role.
- **Label:** homepage navigation, action text, captions, links, and footer metadata. Buttons and action links use medium weight (500). The hero note and demo caption reduce slightly on narrow mobile (13px).
- **Code and interface metadata:** genuine code is outside the five-size marketing scale. The demo and installation commands use readable code (13px desktop, with demo code at 12px on narrow mobile). Comment and test specimens use 12–13px according to width. Compact metadata and state labels retain their source-specific sizes; do not use these micro sizes for body copy.

Documentation does not inherit homepage type-role overrides. It uses its own display, headline, title, lead, body, label, and code tokens. Reading prose is 17px at the normal root size, with line-height (1.75) and a maximum measure (72ch). Its opening paragraph is 19px; h1 is fluid (32–40px), h2 is 26px desktop and 24px at widths up to 859px, h3 is 20px, and h4 is 17px. Headings use weight (600), line-height (1.2), and tracking (-.025em). Navigation, tables, copy controls, and code remain readable at 16px. Inline code has a soft ground; blocks retain preformatted lines and horizontal scrolling rather than shrinking the text.

**The Two Reading Speeds Rule.** Use the five-role scale for homepage marketing; use the separate documentation scale for reference reading. Do not import `home.css` into documentation to unify them.

## Layout

### Multipage structure

Main navigation goes to `/why-concise/`, `/use-cases/`, `/docs/`, and `/install/`. Supplemental `/configuration/`, `/console/`, and `/faq/` pages are linked from relevant content and the shared footer. Every page has one h1, route-specific metadata, and current-page navigation. All existing reference routes remain intact.

`MarketingLayout.astro` loads `home.css`, the focused overrides in `pages.css`, and the existing interaction bootstrap. The old component styles still govern demos, installation, the console, configuration, and film; they are no longer stacked on the homepage. The first two homepage sections contain only the introduction/film and next-step links. The demo belongs to Why Concise. Installation and configuration have separate routes, so neither is a prerequisite scroll on the homepage.

Interior page introductions use the headline role; their secondary section headings use the title role so the page title leads. Introductions use left alignment, a 62ch maximum prose measure, and 52px/48px top/bottom padding (40px tablet, 32px mobile). Their sections use 64px spacing, reducing to 48px on mobile. Page endings use 80px, 64px, and 48px bottom padding. The core-check summary is a semantic definition list on a soft ground, three columns at desktop and stacked at 800px and below. Homepage next steps use two columns, stacked at 550px. Keep the spacious existing film and product components, rather than shrinking their controls or text to reduce page length.

The footer is compact on all routes: wordmark, supported hosts, navigation, MIT/typeface licenses, and Ryan Yannelli attribution. The former oversized closing slogan and duplicate installation band are omitted. Footer destinations use two columns, including on mobile. The mobile header menu is a native `details`/`summary`, available without JavaScript; Escape closes it and returns focus when enhanced. Active links are underlined in the existing orange. The install action remains visible on mobile. The wordmark's optical correction is unchanged.

### Existing component geometry

The marketing frame is centered with the root gutter and maximum width (`--width: 1296px`). Its width is `min(calc(100% - var(--gutter)*2), var(--width))`. The gutter grows fluidly from a mobile inset to a generous desktop margin. The header is a normal-flow horizontal bar (96px desktop, 82px at widths up to 650px), not sticky chrome.

Wide homepage sections use purpose-specific compositions: paired demo panes, an asymmetric feature grouping, text beside code, a use-case list, a two-column installation area, configuration beside a native select, an unboxed guide list, and an FAQ column. Keep these differences; do not turn every section into an identical card grid. Major separation is spacious (150px desktop, 100px at widths up to 800px, 85px at widths up to 550px). Full-width tonal bands contain the same inner frame. Component insets and gaps use the smaller spacing tokens rather than another layout system.

Responsive adjustments are content-specific: code and column spacing tighten at 1100px; intermediate layouts reorganize at 800px; most paired homepage sections stack at 550px. The primary site navigation becomes a button-controlled menu at 650px, with the install action still visible. Demo panes stack at 550px. Homepage code wraps long lines; diagnostics and file paths must remain readable instead of clipping inside a narrow pane.

The Film embed keeps a 16:9 frame with a full-size, cover-fit video. Its top margin is 54px, 40px at 800px and below, and 32px at 550px and below; the following demo is separated by 24px. On narrow mobile the figure extends 10px into each side gutter, while the caption restores that inset.

Documentation has an independent shell (maximum width 1440px) and a reading measure (72ch). At 1280px and above, it has three columns: documentation navigation (11.5rem), reading content (`minmax(0, 72ch)`), and on-page TOC (11rem), with gaps (2.75rem). From 860px through 1279px, it uses navigation (12rem) plus reading content, gap (3.5rem), without a TOC. Sidebar and TOC are sticky (top 7rem), individually scrollable within the viewport; the site header remains in normal flow. At 859px and below, the sidebar becomes a native disclosure above the article, with page padding (1.5rem 1.25rem 4rem).

Documentation tables are full-width, fixed-layout semantic tables, with all columns visible on desktop. Three-column tables allocate the first two headers 35% and 19%. At 650px and below, each row becomes a stacked group: the first cell uses the soft ground, remaining cells stay white, and every cell displays its column label. Preserve the visually hidden header rather than deleting it. `astro.config.mjs` supplies `data-responsive-table`, `data-columns`, and each cell's `data-label` at build time; CSS alone cannot recover those labels.

**The Centered Hero Rule.** Center the homepage introduction, not all homepage body copy. Let section content, examples, and documentation align for scanning and reading.

## Elevation & Depth

There are no box shadows. Ground, white surface, soft stage, and charcoal code provide the depth. Use local borders for information structure, such as a table row, a field, or a terminal divider; flat does not mean borderless everywhere. Hover movement is feedback, not simulated material elevation. Do not add glows, floating card shadows, or fake desktop-window chrome to the product examples.

**The Flat Stages Rule.** Separate content with tone, spacing, and the existing local rules, never a new shadow vocabulary.

## Shapes

Buttons, selects, code blocks, feature surfaces, and FAQ containers are square. The demo surround has only a small corner softening (4px), and documentation inline code has a tiny radius (2px). Status labels are compact rectangles, not pills. Native select affordances and the native mobile documentation disclosure remain recognizable.

The Film media frame is a local rounded exception: clipped corners of 16px, 12px at 800px and below, and 8px at 550px and below. Its overlay controls remain square; the media frame does not change the control vocabulary.

The convergence mark is an authored identity asset, not a generic arrow or generated logo. Reuse `src/components/Mark.astro`, preserving its three converging paths, proportions, inherited charcoal body, and orange endpoint. The endpoint's rounded geometry (`rx="22"` in its SVG coordinate system) belongs to the mark; square controls do not authorize squaring the logo. UI icons come from the thin stroked inline SVGs in `Icon.astro`, usually 15–22px, not font glyphs.

## Components

### Buttons

Flat, direct, and sentence case. Primary actions use orange with charcoal text; dark actions use charcoal with white text. Standard buttons have a minimum height (52px), medium weight (500), an icon gap (16px), and the frontmatter padding. The small header variant has a minimum height (42px), gap (17px), and its own padding. On mobile (650px and below), standard actions have a minimum height (50px) and padding (13px 20px); the compact header action uses a minimum height (38px), padding (10px 12px), and gap (10px). Homepage action text follows the label token; documentation's shared shell retains global button sizes (16px standard, 15px small, 13px compact mobile).

Hover translates upward (2px); active translates downward (1px) and lowers opacity (.85). Transitions use `--t-hover` and `--ease`. Focus is an outline, not a shadow. Text links underline on hover; their arrow SVG moves right slightly (3px). Guide links are unboxed, without horizontal inset, and move right (4px) on hover; do not restore the earlier white-card treatment overridden at the end of `home.css`.

### Fields and status labels

The writing preset is a labeled native select, full-width with a minimum height (50px), white fill, divider-colored border, and the body role. Preserve `appearance: auto`. Changing it updates the category count, descriptive text, and copyable configuration. Do not replace it with an invented custom dropdown.

Pending labels use the soft ground and muted text. Rewritten labels use the success pair, a check SVG, and explicit wording. Desktop demo labels use compact text (12px); narrow mobile labels use 10px. These are informational states, not filter chips.

### Product examples and installation

The demo is a soft surround containing white before/after panes, not a screenshot of an invented application. Its selected example tab is white; inactive tabs are muted on the soft ground. Keep the explicit example disclosure, concrete file names and findings, count summaries, and the live status announcement. Tabs use `tablist`, `tab`, `tabpanel`, `aria-selected`, and roving tab stops. Both demo and host tabs support Left/Right, Home, and End.

Feature containers combine concise prose with honest code or hook output. Dark specimens use code text and metadata roles, with functional diff or failure colors. Installation uses a charcoal band and a slightly lighter terminal. Its selected host has a thin orange underline; copy buttons are transparent with a subtle hover fill. Keep real commands, prerequisites, and trust instructions; do not replace them with decorative terminal filler.

### Film embed

A source-backed, 31-second product film, not a replacement visual identity. `Film.astro` supplies a 1920 × 1080 MP4 (`/promo/concise-promo.mp4`) and WebP poster (`/promo/concise-promo-poster.webp`), with metadata preload, inline playback, muted initial state, and looping. The charcoal frame carries square charcoal/white sound and pause controls at its lower right. Controls use 14px medium text and minimum 42px targets, reducing to 13px and 36px at 550px and below. The centered explicit-play action uses orange/charcoal, 17px medium text, and a 56px minimum height (15px and 48px on narrow mobile). Thin SVG icons and global focus outlines retain the site's existing language. Local hover fills and media dimensions are component details, not new palette or type tokens.

`initFilm` replaces native controls only when JavaScript runs. With normal motion preference, the intersection observer starts muted playback on entry and pauses on exit; it is configured with a 0.35 threshold but tests `isIntersecting`, not an explicit minimum visible fraction. A manual pause persists across viewport re-entry. “Sound on” unmutes and restarts at zero; “Mute” leaves playback position intact. Pause changes to “Play film” and resumes from the current position. After sound is enabled, subsequent automatic resumes retain that sound state rather than re-muting.

Reduced motion initially shows the poster and “Play the 31-second film”; this explicit action starts from zero with sound. Leaving view still pauses the film, but returning never automatically resumes it: the visitor must use Play. Rejected playback attempts expose the same start action, except aborted or superseded attempts. When a focused start button is hidden after playback begins, focus moves to the pause control. Without JavaScript, the video retains browser-native controls; custom controls stay hidden and no autoplay attribute is present.

The film has no visible transcript. A visually hidden figcaption, for screen readers only, carries the film's text: the three real hook messages and example revisions, a note that AI-writing checks are optional and disabled by default, a statement that Concise does not rewrite files or commit messages, the console screens and the closing lines. Its first paragraph is the video's `aria-describedby` description. It contains no links, so nothing invisible takes keyboard focus.

This records source behavior, not completed final validation. The promo review reports measured audio but no listening check; it also records a brief semi-transparent console transition. Neither limitation establishes a reusable design rule.

### Navigation, FAQ, and documentation

The wordmark is an accessible home link. Its text has a `translateY(-.08em)` optical correction to align Jost’s lowercase letters with the mark, shared across the header and footer. Main navigation is plain text with opacity hover; the documentation current-page link has an orange underline. The mobile site menu uses a native disclosure with an accessible summary; the browser exposes its expanded state. Escape closes it and returns focus when JavaScript runs. Documentation navigation uses muted links, a soft active background, readable-orange active text, and weight (600). Its mobile menu is native `details`/`summary` and remains useful without client JavaScript. The TOC links directly to h2/h3 anchors.

The dedicated installation page stays readable by default; its commands and actions do not depend on scroll-reveal initialization. FAQ items are native `details`/`summary` in white square containers. Their plus indicator is CSS geometry; opening an item changes the indicator without replacing the semantic disclosure. Documentation code remains available without JavaScript; enhancement adds a copy toolbar, a focusable scrollable code block, status feedback, and a selection fallback when clipboard access fails. Preserve source-page links and previous/next navigation.

### Focus, selection, and motion

Global interactive focus uses readable orange (3px outline, 5px offset); documentation controls use a finer outline (2px, 4px offset). Within dark documentation code frames, focus uses action orange and an inset offset (-2px). Keep both skip links and the `[hidden]` behavior. Text selection uses action orange with charcoal text; fields use readable-orange carets. Use real links, buttons, labels, select elements, and disclosures, not clickable containers.

Motion is restrained and content stays visible without it. The root easing is `cubic-bezier(.16,1,.3,1)`, hover duration (180ms), and reveal duration (800ms). Hero arrival lasts 850ms with small staggered delays; scroll arrivals run once. Example replay uses a short fade/translation sequence (1400ms), with the button released after 1450ms. The large use-case mark has a slow horizontal drift (7s, 12px); it is absent on narrow mobile. The mobile documentation disclosure uses a short clip reveal (180ms). Under reduced motion, animations and transitions are disabled, smooth scrolling becomes automatic, button hover movement is removed, and replay reports the same finished result immediately.

**The Evidence Is Imagery Rule.** Use source-backed code, configuration, and diagnostics as product imagery. Examples must remain labeled as examples, not fabricated live-agent activity or measured performance.

For frontend work, retain the Astro structure: shared `SiteLayout.astro` and `global.css`, `MarketingLayout.astro` with `home.css` and `pages.css`, and `DocsLayout.astro` with `docs.css`. Reuse `Demo`, `Install`, `Mark`, and `Icon` rather than drawing parallel variants. Keep the documentation Markdown transforms and semantic table attributes when adding pages. The site is statically generated with trailing slashes and Cloudflare Workers static assets configured in `wrangler.jsonc`; a new visual surface should not require a framework runtime or client-rendered replacement for readable HTML.

## Do's and Don'ts

### Do:
- **Do** use the applied root colors and final homepage type roles; keep documentation on its separate readable scale.
- **Do** retain neutral ground, white and soft stages, square controls, and charcoal code without box shadows.
- **Do** preserve the original convergence mark, including its rounded orange endpoint.
- **Do** use source-backed examples and real commands, with an honest example label and readable code.
- **Do** keep visible focus, keyboard tab behavior, native controls, selection feedback, and reduced-motion parity.
- **Do** keep all desktop table columns visible and supply build-time cell labels for stacked tables at 650px and below.

### Don't:
- **Don't** turn the chosen conventional developer site into an experimental visual world or copy reference-brand chrome.
- **Don't** use action orange for small orange text when the readable-orange role exists.
- **Don't** center every section, repeat one card grid everywhere, or turn the unboxed guide list back into cards.
- **Don't** substitute stock photographs, fake terminal windows, invented testimonials, or invented metrics for product evidence.
- **Don't** replace SVG UI icons with text glyphs, shrink documentation code to homepage metadata sizes, or remove native semantics for custom controls.
- **Don't** promote unused color declarations or earlier overridden homepage sizes into new design-system variants.
