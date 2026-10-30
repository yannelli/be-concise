# Concise website

The marketing website and local reference docs live in `website/` and use Astro with static output. The plugin (`plugins/concise/`) and the npm package (root `package.json`) do not depend on the site. Run every command below from `website/`.

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

The homepage is `src/pages/index.astro`. Shared design tokens live in `src/styles/global.css`. Interactive examples and preset metadata are in `src/data/examples.ts`; interactions are in `src/scripts/home.ts`. Reference pages render the original Markdown in `../plugins/concise/docs/`, so plugin documentation edits flow into the next website build. A new file there fails the build until it has a description in `src/pages/docs/[slug].astro` and a sidebar entry in `src/layouts/DocsLayout.astro`. The overview, installation, and web console guides are site pages in `src/content/docs/`.

## Console screenshots

The homepage and the web console guide show real screenshots from `concise-web`, stored as `public/console/<page>-<light|dark>.webp`. To regenerate them after the console changes:

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

The player is `src/components/Film.astro`, with behavior in `src/scripts/home.ts`. It loops muted while visible. **Sound on** restarts with sound; pause persists across scrolling. Reduced motion shows a poster and requires explicit play/resume. All playback pauses offscreen. Without JavaScript, native video controls remain available. A native transcript disclosure includes the hook messages and notes that AI-writing checks are optional and disabled by default.

Render artifacts and rejected music takes are gitignored. Keep API keys outside the repository; the shipped bed is sufficient for rendering.

## Cloudflare Workers: connect the repository

In Cloudflare, open **Workers & Pages → Create → Import a repository**, connect this repository, and set the root directory to `website`:

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | `website` |
| Node version | `24` or another supported version >=22.12.0 |

`wrangler.jsonc` declares the Worker name `be-concise` and the `dist/` static asset directory. There is no server-side runtime, database, secret, or adapter requirement. Cloudflare supplies deployment authentication for its Git integration. Attach a custom domain in the Worker settings after deployment. Preview branches can use Cloudflare's configured non-production deploy command.

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

The code and diagnostic examples are illustrative, not a live agent or a performance benchmark. The demo never sends entered data to a service. Main content, initial code examples, the first console screenshot, docs, and FAQ remain readable without JavaScript. The installation section includes the Codex and omp commands even when scripting is off. Tabs support arrow keys, Home, and End; controls have visible focus; motion respects reduced-motion preferences. Copy controls select text for manual copying if clipboard access is denied.

There are no customer quotes, invented adoption figures, tracking scripts, cookies, external font requests, or unrelated stock photographs. The console screenshots come from the real console and real hook runs on sample projects. The mark is the repository's existing MIT-licensed asset. Jost is served locally under its SIL Open Font License in `public/fonts/OFL-Jost.txt`; the license is linked in the footer. The original repository banner is used for social metadata.

Before launch, optionally set an absolute public site origin and absolute social-image URL when a domain has been assigned. They are intentionally not guessed in this repository. Test examples and presets should be updated when plugin defaults change.
