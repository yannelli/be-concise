# Website copy review

Applied Concise's `ryan` writing rules, Humanizer, and Avoid AI Writing to the homepage, shared site components, and the website-owned overview, installation, and console guides. Imported plugin references are outside this website change.

Changes:
- Removed the hero's configuration claim as requested; the note is now “Open source. MIT licensed.”
- Replaced repeated captions and empty contrasts: “A PR, not an essay” becomes “Short PR descriptions”; removed “Same intent. Less noise” and the repeated PR-result tail.
- Made the comment limit and PR limits explicit, using the existing defaults.
- Replaced the compatibility, console, docs, footer, and 404 filler with their subject or action.
- Corrected the installation promise: host loading, trust, and reload/session instructions still apply. Core checks require no configuration; optional style checks stay off.
- Kept the brand headline and a few short section headings. A product headline is not a reason to turn every description into a fragment.

The read-only advisor independently identified the installation overstatement and the repeated homepage fragments. Edits were re-read against the originals; no command, code sample, diagnostic, route, or numeric default was changed. The real hook denials, deliberately verbose demo examples, transcript, and rendered promo are preserved.

The repeatable local `.taste-skill/copy-check.mjs` extracts prose from the production build and calls the plugin's `checkText` with the `ryan` preset and em-dash checks in an isolated environment. It is an aid, not a claim that a pattern proves AI authorship. Final validation: 065d7610 built 15 pages, passed all 9 website tests, passed the Cloudflare dry-run, and returned 0 FAIL / 0 WARN at 1440/768/390. Astro check, source lint, and full browser regressions passed in daa1496d before the final reveal-marker-only change. All 10 final screenshot sheets in `.taste-skill/copy-final/` were opened. The shared wordmark now has a -0.08em optical text offset, verified at all three widths. The closing installation call stays visible by default rather than waiting for a scroll observer; this also removes the previously documented capture-cap blank-gap finding.

Visual review: the shorter captions fit without excess wrapping; the console heading remains two lines; the footer now names the supported hosts. Design 8.0, usability 8.5, creativity 7.8, content 9.0; overall 8.3. This narrow copy/alignment pass preserves the existing composition. The user rates the film 7/10; its beat timing and left-title spacing remain a separate follow-up and are not covered by these page scores.

Remaining flags must be judged in context: lists of distinct technical capabilities, FAQ answers beginning with “No”, and scope/security contrasts carry information and should not be rewritten solely to clear a pattern counter.
