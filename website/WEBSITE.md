# Concise website

The marketing website and local reference docs live in `website/` and use Astro with static output. The plugin (`plugins/concise/`) and the npm package (root `package.json`) do not depend on the site. Run every command below from `website/`.

The public site origin is **https://concise.chat**, set in `astro.config.mjs`. Page canonical URLs, Open Graph URLs, and social-image URLs use that origin; the 404 page is marked `noindex`.

## Local development

Use Node.js 22.12.0 or newer.

```sh
npm ci
npm run dev
```

- `npm run build`: create production assets in `dist/`.
- `npm run preview`: serve the built website locally.
- `npm run check`: Astro and TypeScript validation.
- `npm test`: website route, metadata, link, screenshot, and copy checks (build first).
- `npm run screenshots`: regenerate the web console screenshots. See [Console screenshots](#console-screenshots).

CI runs the website build, typecheck, and tests in a separate Website job. The plugin's own tests and V8 coverage run from the repository root and exclude `website/`; see `CONTRIBUTING.md`.

## Routes and layout

The homepage is deliberately short: an introduction with the film, then one section with the next-step links beside real hook output and a console screenshot. Main navigation uses real pages, not homepage anchors.

| Route | Content |
| --- | --- |
| `/` | Introduction, film, install and discovery links |
| `/why-concise/` | Interactive examples, core defaults, console activity and playground, test-output filtering |
| `/use-cases/` | Reviews, writing, team rules, cloud agents, each with real hook output or a console screenshot |
| `/install/` | Host commands, prerequisites, trust and reload instructions, a 4-step check with its real denial |
| `/configuration/` | Preset picker, copyable configuration, confirm mode, soft fail, console configuration |
| `/console/` | All 5 real console screenshots with one light/dark switch, foreground CLI setup |
| `/faq/` | Defaults, scope, retries, limitations, supported hosts, with real output beside 4 answers |
| `/docs/` | Overview and all existing reference routes |

`SiteLayout.astro` supplies shared navigation and the compact footer. Active links reflect the current route; documentation children keep Docs active. The mobile navigation is a native disclosure, so it works without JavaScript. Escape closes it and returns focus when JavaScript is available.

`MarketingLayout.astro` loads the existing marketing styles and `src/scripts/home.ts` on every marketing route. The script enhances only elements present on that page; film behavior is unchanged. `src/styles/pages.css` supplies the shorter page rhythm without changing the existing palette, type, or mark. Interactive examples and preset metadata remain in `src/data/examples.ts`.

All 15 baseline output pages (including 404) remain; the six new marketing routes bring the total to 21. Website tests verify route ownership, current navigation, the short homepage, and local links/fragments across the full build.

Reference pages render the original Markdown in `../plugins/concise/docs/`, so plugin documentation edits flow into the next website build. A new file there fails the build until it has a description in `src/pages/docs/[slug].astro` and a sidebar entry in `src/layouts/DocsLayout.astro`. The overview, installation, and web console guides are site pages in `src/content/docs/`.

## Hook output on the marketing pages

`src/data/hook-output.ts` holds the hook responses shown by `HookOutput.astro`. They were captured by piping each tool input into `plugins/concise/hooks/check-edit.mjs` or `check-bash.mjs` with a throwaway `HOME` (shown as `~`) and the project `~/code/billing-api`. Long reference paths are cut with `…`. If a hook message changes, capture the new text the same way; do not edit a response by hand.

## Console screenshots

The `/console/` page and the web console guide show real screenshots from `concise-web`, stored as `public/console/<page>-<light|dark>.webp`. To regenerate them after the console changes:

```sh
npm run screenshots
```

The script builds a throwaway home directory with two sample projects, runs the real hook scripts against sample writes, commits, PR bodies, and replies, starts `concise-web --all`, and captures five pages in both themes at 1440 × 900. It needs Chromium or Chrome; set `CHROME` to the binary if it is not found. It shows the temporary home directory as `~` and deletes it when it finishes. Nothing in your own configuration or history is read or changed.

## Homepage film

The editable 31-second HyperFrames project lives in `promo/`. Its direction, timing, review, and media credits are in `promo/STORYLINES.md`, `promo/SPEC.md`, `promo/REVIEW.md`, and `promo/assets/*/CREDITS.md`. The film uses real hook output and console screenshots; the shorter revisions are illustrative. Music was generated with ElevenLabs `music_v2_5`, then extended and mixed with credited sound effects.

The site serves `public/promo/concise-promo.mp4` (H.264/AAC, about 3.7 MB) and `concise-promo-poster.webp`. It does not require HyperFrames, FFmpeg, or an ElevenLabs key to build or deploy. The final audio measures −14.6 LUFS and −1.1 dBTP; it has not been reviewed by listening.

To edit or render, from `website/`:

```sh
cd promo
npm run dev -- --port 4395 --no-open
npm run check -- --json
npx hyperframes@0.8.222 snapshot --review
# Review the preview before rendering:
npm run render -- -o renders/concise-promo-master.mp4 --quality delivery --skill hyperframes --strict
```

With FFmpeg installed, encode the master from `promo/`:

```sh
ffmpeg -i renders/concise-promo-master.mp4 -c:v libx264 -preset slow -crf 25 \
  -pix_fmt yuv420p -profile:v high -movflags +faststart \
  -af 'loudnorm=I=-15:TP=-1.5:LRA=11' -ar 48000 -c:a aac -b:a 160k \
  ../public/promo/concise-promo.mp4
ffmpeg -ss 7.3 -i renders/concise-promo-master.mp4 -frames:v 1 \
  -c:v libwebp -quality 82 ../public/promo/concise-promo-poster.webp
```

The player is `src/components/Film.astro`, with behavior in `src/scripts/home.ts`. It loops muted while visible. **Sound on** restarts with sound; pause persists across scrolling. Reduced motion shows a poster and requires explicit play/resume. All playback pauses offscreen. Without JavaScript, native video controls remain available. A visually hidden caption, for screen readers only, carries the film's text: the hook messages, a note that AI-writing checks are optional and disabled by default, and the console and closing lines. It has no links, so nothing invisible takes keyboard focus.

Render artifacts and rejected music takes are gitignored. Keep API keys outside the repository; the shipped bed is sufficient for rendering.

## Cloudflare Workers: connect the repository

In Cloudflare, open **Workers & Pages → Create → Import a repository**, connect this repository, and set the root directory to `website`:

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Non-production deploy command | `npx wrangler preview` |
| Root directory | `website` |
| Node version | `24` or another supported version >=22.12.0 |

`wrangler.jsonc` declares the Worker name `be-concise` and the `dist/` static asset directory. There is no server-side runtime, database, secret, or adapter requirement. Cloudflare supplies deployment authentication for its Git integration. Attach a custom domain in the Worker settings after deployment. The empty `"previews": {}` block enables `wrangler preview` for non-production branches. Keep production on `wrangler deploy`; `npm run cf:preview` is a different command that starts the local development runtime.

### Website-only automatic deployments

In the Cloudflare dashboard for `be-concise`, open **Settings → Build → Build watch paths**:

- **Include paths:** `website/*`
- **Exclude paths:** leave empty.

These patterns are relative to the repository root, even though the build root is `website`. Cloudflare's `*` matches nested paths too. This is a Workers Builds setting, not a field in `wrangler.jsonc`; `build.watch_dir` controls local custom-build watching and does not configure repository triggers.

Changes outside `website/` will not normally trigger an automatic deployment. Because the site imports plugin Markdown from outside that path, manually rebuild when you want to publish changes to those source docs. Manual builds still run, and Cloudflare also bypasses path matching for empty pushes, pushes with 3,000+ changed files, or pushes with 20+ commits. See [Cloudflare build watch paths](https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/).

For a manual authenticated deployment:

```sh
npx wrangler login
npm run deploy
```

For the Cloudflare runtime locally:

```sh
npm run cf:preview
```

If npm reports that `workerd`'s install script was blocked, review and allow that dependency's install script using the npm version's approval mechanism before using `wrangler dev`. The static Astro build does not need it.

## Content and accessibility

The code and diagnostic examples are illustrative, not a live agent or a performance benchmark. The demo never sends entered data to a service. Main content, initial code examples, the console screenshots, docs, FAQ, and mobile navigation remain readable without JavaScript. The `/install/` page includes the Codex and omp commands even when scripting is off. The preset page keeps its default configuration example and links to all preset values without JavaScript. Tabs support arrow keys, Home, and End; controls have visible focus; motion respects reduced-motion preferences. Copy controls select text for manual copying if clipboard access is denied.

There are no customer quotes, invented adoption figures, tracking scripts, cookies, external font requests, or unrelated stock photographs. The console screenshots come from the real console and real hook runs on sample projects. The mark is the repository's existing MIT-licensed asset. Jost is served locally under its SIL Open Font License in `public/fonts/OFL-Jost.txt`; the license is linked in the footer. The original repository banner is used for social metadata.

Connect `concise.chat` in the Worker's custom-domain settings if it is not already connected; setting Astro's public origin does not create DNS records or attach the domain. Test examples and presets should be updated when plugin defaults change.
