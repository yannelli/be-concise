# Multipage review

## Direction and scope

This is a route/layout refinement of the incumbent developer-product site, not a new art-direction draw. No seed or replacement visual world was introduced. Jost, the neutral/charcoal/orange palette, convergence mark, optical wordmark correction, MIT wording, and Ryan Yannelli attribution remain. No new imagery, customer claims, or sample statistics were added. Existing code examples and console captures remain illustrative.

The page argument is now distributed by visitor intent:

- Home: understand the offer, see the existing film, choose an install or reading path.
- Why Concise: inspect before/after examples, learn the core checks and test filtering.
- Use cases: find review, writing, team, and cloud workflows.
- Install: choose a host, copy its commands, read trust/reload requirements.
- Configuration: choose an optional preset and understand exceptions.
- Console: inspect the real console and run its foreground CLI.
- FAQ: check scope and limitations without reading a full reference.
- Docs: retain the full existing references and upstream Markdown pipeline.

Idea: Concise's checks become focused examples on a dedicated page, while the homepage itself demonstrates saying less. The live controls remain the demo tabs, host tabs, preset selector, console viewer, and unchanged accessible film.

## Production evidence

The baseline and refactored production builds were served locally on port 4400. Browser inspection used the design-taste Chromium/CDP helper with a local `--no-sandbox` launcher; the managed browser launcher could not start in this environment. Screenshots and full raw reports are local, ignored artifacts in `.taste-skill/multipage-before/`, `.taste-skill/multipage-after/`, `.taste-skill/multipage-final/`, and `.taste-skill/multipage-browser/`. All 42 final marketing fold/page screenshots were opened and reviewed across 1440, 768, and 390px.

Homepage heights with the transcript collapsed:

| Width | Before | After |
| --- | ---: | ---: |
| 1440 | 9,469px | 1,865px |
| 768 | 8,804px | 1,433px |
| 390 | 11,093px | 1,467px |

The refactor adds six routes while retaining all 15 baseline outputs, including 404. The homepage has two sections. The film source, player, interaction code, transcript, and media are unchanged.

## Critique

ROUND 1
Seen in one second: the familiar Concise title and film on home; clear route names on the interior pages.
Idea (one sentence): give each question its own short destination instead of making every visitor scroll through every answer.
Live thing: the existing demo, host tabs, preset selector, console viewer, and film.
Layout words by section: home=centered intro / film=media / next steps=split / why=example and definition list / use cases=list / install=terminal / configuration=selector and code / console=viewer / FAQ=disclosures.
Scores: design 6.5 · usability 8 · creativity 6 · content 8 → overall 6.0 after the inspector cap.
Caps applied: fewer than four pictures on individual routes and retained generic-inspector FAIL findings; no gallery-level design claim.
Top three problems (most visible first), each with the screenshot it shows in and the fix:
1. `console/mobile-fold.jpg`: the moved section heading is as large as the page title and pushes the useful viewer down. Use the existing 24px title role for secondary headings.
2. `faq/mobile-fold.jpg`: the secondary heading competes with the page title before the questions. Apply the same secondary hierarchy.
3. `use-cases/desktop-fold.jpg` and `install/desktop-fold.jpg`: former homepage section headings still read like new page titles. Apply the same title role, without changing the component palette or layout.

ROUND 2
Seen in one second: the page title now leads; installation commands and console controls remain easy to find.
Idea (one sentence): each route answers one question without making the homepage a manual.
Live thing: all existing interactive examples and controls, verified on their new routes.
Layout words by section: unchanged from round 1; secondary headings now use the established title role.
Scores: design 6.5 · usability 8.5 · creativity 6 · content 8 → overall 6.0 after the inspector cap (raw weighted score 7.15).
Caps applied: the same generic image/motion/focal-point gate findings remain visible and unsuppressed. This is a successful focused IA refinement, not a claim to gallery-level art direction.
Top three remaining limitations (most visible first), each with screenshot and disposition:
1. `console/mobile-fold.jpg`: desktop console details are small at phone width. Keep the existing caption, descriptive alt text, and readable console guide; do not replace or fabricate the screenshots.
2. `why-concise/tablet-fold.jpg`: long code lines wrap in the paired panes. Preserve readable type and full content rather than shrinking the code or clipping it.
3. `home/desktop-fold.jpg`: the existing wide film occupies much of the first two screens. It is the only major media block, and the homepage still ends at 1,865px. Its transcript remains native and collapsed by default.

The final inspector found zero horizontal overflow, zero runtime exceptions, and zero headings over two lines in all 21 marketing route/viewport combinations. The separate browser assertions confirmed equal left/right `.frame` margins at all tested sizes, including FAQ, whose inset controls trigger the inspector's off-centre heuristic.

## Checks run

- `npm ci`: passed; zero dependency vulnerabilities. npm reported the existing blocked `workerd` postinstall; static builds do not require it and no deployment was attempted.
- `npm run build`, `npm test`, `npm run check`: passed. 21 generated pages, 11 website tests, zero Astro errors/warnings/hints. Tests preserve all baseline route coverage and verify content ownership, current navigation, local links/fragments, no-JS install content, copy accuracy, semantic tables, and unchanged film assets/transcript.
- Root `node scripts/check.mjs`, `node --test test/*.test.mjs`, and `env -u HOME -u USERPROFILE -u XDG_CONFIG_HOME node plugins/concise/test/run-tests.mjs`: passed; plugin runner reported 2,141 passed, zero failed.
- Newly authored local browser assertions (`CHROME_PATH=/usr/bin/chromium node .taste-skill/multipage-browser.mjs`): passed for all seven marketing routes plus docs overview/configuration at 1440/768/390. Covered keyboard tabs, replay, all console views and both themes, preset updates, copy success and selection fallback, docs copy fallback, mobile Enter/Escape and link navigation, native FAQ, no-JS commands/navigation/transcript, reduced-motion film start/focus/pause, normal-motion muted playback/manual pause/offscreen pause/resume, balanced frames, and no horizontal overflow. This is a local ignored script using the skill CDP helper, not a claimed pre-existing portable test suite.
- Browser harness corrections: an initial Chromium launch/navigation timeout, a premature film-focus assertion, missing native Enter key codes, and smooth-scroll races were corrected in the local checks. Final assertions pass without modifying the film player or its source.
- Production design inspection: run twice after the refactor; final screenshots opened at all three widths. Findings below are recorded honestly rather than described as an all-green design gate.
- `git diff --check`: passed. Protected plugin, package/version, CI, deployment, and film paths have no changes.

## Detector interpretation

No findings were suppressed. The source linter reported zero FAILs and one aggregate em-dash warning, chiefly page-title separators. The Impeccable detector reported four advisory font sizes already present in `global.css`; the new styles use existing type tokens. The existing design sidecar was already stale and was not regenerated as an unrelated repair.

The full-page gallery inspector is not an all-green gate for this brief. It reports `few-pictures`, `still-page`, and some `focal-point` failures because these are short task/reference pages, not long visual landing pages. Adding four images and eight entrances to every route would contradict the requested reduction in scrolling. `no-footage` warnings on interior routes are intentional: the one preserved film stays on home. `name-only-title` warnings overlook the visible supporting prose at the incumbent 17px body size. `off-centre` measurements include inset text/controls inside equal-width frames; screenshot review and explicit frame/overflow measurements are the layout evidence. Console caption contrast was measured at 5.8:1; it remains secondary text in the incumbent muted color.

Remaining inherent limitations: console screenshot details and the film's embedded code remain small on phones. Text captions, the console guide, and the unchanged native film transcript supply readable alternatives. This work does not change or re-audit the film's content or audio.

## Integration with published changes

Merged current main, preserving the `concise.chat` origin/canonical/social metadata, deployment documentation, root README changes, and the reviewed replacement film from PR #49. The PR diff has no protected plugin, package, CI/deployment configuration, or film changes. The 404 retains docs styling without incorrectly marking Docs as its current navigation destination; a regression assertion covers this distinction.

The combined build produces 21 pages. Astro reports zero diagnostics; all 19 website tests, browser metadata assertions across all 21 outputs, root checks, and 211 root tests pass. The 404 was opened at 1440, 768, and 390px after the correction: the heading remains within two lines, both recovery actions fit, and header/footer spacing stays balanced. No new visual direction or stale design-sidecar repair was introduced. Fresh PR CI and merge verification are separate shipment gates.
