# Flow harness

Drives Flow in a real browser (Playwright + Chromium) against a **fake kie.ai**,
so whole runs, reviews and reloads can be tested without spending a credit.
Every outbound call is answered inside the browser: kie chat, tasks, polling,
uploads and the file host, ScrapeCreators, and the media CDNs. Anything the
stub doesn't recognise is logged as UNHANDLED and fails the smoke test.

Nothing here touches the repo's data: localStorage is seeded by an init script,
and the Bank rows (a product, a character, a saved ad) go in through the app's
own stores.

## Run it

```sh
npm run dev                      # in the repo root, on :5173
cd scripts/flow-harness
npm install                      # Playwright 1.56, kept out of the app's deps
node smoke.mjs --fast --quiet    # Product → 5 UGC Ads end to end → "result: PASS"
```

`UGC_URL` points it at another server. The first run draws the fake media
(stills, clips, speech) into `./assets`; delete that folder to redraw it.
`CHROME_PATH` and `FFMPEG_PATH` override the browser and the ffmpeg used to
encode the fake clips (defaults match the Claude Code cloud container).

## What's here

| File | What it is |
|---|---|
| `boot.mjs` | Opens the app with the stub installed, keys set, Flow on, onboarding dismissed, banks seeded. `boot({ timeScale, stub: { quiet, pollsBeforeSuccess } })` |
| `stub.mjs` | The fake kie.ai and friends, with per-model request counts (`stub.stats`) |
| `fakeChat.mjs` | Canned chat answers: scripts, scenes, analyses, Describe It, Ask Flow |
| `assets.mjs` | Draws the fake media once |
| `drive.mjs` | Helpers: open a template, pick a field, wait for a run while answering reviews |
| `smoke.mjs` | The end-to-end check. Screenshots in `./shots` |
| `extras.mjs`, `check-parsers.mjs` | Describe It, Ask Flow and the reply parsers |
| `estimates.mjs` | Prices every gallery template from a real plan (for `public/templates/index.json`) |
| `probe-*.mjs` | Single-bug repros: review state, Test With 1 slots, reload mid-run, partial clip failure, Scene Clips reload (asserts no clip is submitted twice), an ad of the member's own analyzed and run through Clone a Winner (`probe-own-ad.mjs`) |
| `tour-*.mjs` | Canvas controls: blank canvas, suggestions, right-click, Add Block, wire peek, help |
| `build-talking-head.mjs`, `talking-head-review-and-run-again.mjs` | The talking-head ad built from scratch, edited in review, run, then Run Again |
| `run-channel-templates.mjs`, `many-hooks-one-body.mjs`, `scene-takes-review.mjs`, `same-ad-three-faces.mjs` | The templates from the channel, run end to end |

The scenario scripts write screenshots to `./shots` (or `$OUT`).

## Gotchas

- Reach app state with `window.__appImport('/src/...')` inside `page.evaluate`,
  never a bare `import()`: after a hot update Vite serves the module as
  `?t=…`, and a bare import gets a second, empty copy of the store.
- `timeScale` speeds up the app's polling; the real poll cadence (5s after a
  1.5s first poll) makes a full run take minutes.
- Playwright's Chromium has no H.264 decoder, so fake clips are WebM served
  under `.mp4` URLs.
