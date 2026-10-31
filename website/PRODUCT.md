# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Astro, requested by the user. Deployment must be ready for Cloudflare Workers Git repository integration.

## Users

Individual Claude Code, Codex, and omp users evaluating and installing Concise. Team maintainers need shared configuration, presets, custom packs, and cloud-agent guidance.

## Product Purpose

Concise catches the agent's own verbosity before a write or GitHub command runs and filters test output before the agent reads it. The website must explain its purpose, use cases, installation, and documentation.

## Positioning

PreToolUse hooks check pending additions rather than linting the working tree afterward. The agent receives a concrete reason and can rewrite. Core limits: comment blocks over 2 lines, new files over 300 lines, and inline PR/issue bodies over 1 prose paragraph or 3 sentences per paragraph.

## Operating Context

Claude Code, Codex CLI (supported baseline 0.152.0), and omp. Git, Node.js, Bash, jq, realpath, and core Unix tools are prerequisites. Codex requires hook review and trust.

## Capabilities and Constraints

Three core checks work without configuration. Optional em-dash and AI-writing checks ship disabled. Eight AI-writing presets and 47 categories are documented. Test-output filtering supports pytest, go test, npm test, Jest, and Vitest. Pattern matching uses heuristics and may produce false positives. After two denied retries on one target, the next action is allowed and flagged. File-body GH commands and commit -F inputs are not inspected.

## Brand Commitments

Name: Concise. Existing convergence mark in plugins/concise/assets/icon.svg; charcoal #18191D and orange #FF4A24 are recognizable source assets. Preserve the mark. Write plain, concrete copy that demonstrates the product's own rules. The user chose a straightforward developer product site and named Linear, Raycast, and Resend as the quality bar; convention is an explicit commitment rather than an unchosen default.

## Evidence on Hand

Source, tests, README, complete Markdown documentation under plugins/concise/docs/, MIT license, and authored brand assets. No supplied customer quotes, adoption statistics, or benchmarks; do not invent them. Website examples must be clearly identified as examples, not measured performance claims.

## Product Principles

- Show the mechanism before making broad claims.
- Make installation and reference material easy to reach.
- Distinguish enabled defaults from optional checks.
- Keep the plugin code and behavior unchanged.
