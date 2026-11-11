## Pebble Shipping Dashboard (Devvit)

A [Devvit](https://developers.reddit.com/) port of [pebble-dash](https://github.com/myNameArnav/pebble-dash): it reads the r/pebble shipping mega thread and shows rollout progress as an interactive post.

Running on Reddit's Developer Platform means the app reads the thread through `reddit.getComments()`, which expands every "load more" stub. No cookie, OAuth app or rate-limit workarounds are needed, and all top-level comments are included.

## How it works

- `src/server/reports.ts` fetches the post and every top-level comment, parses them with `src/shared/parser.js` (ported as-is from pebble-dash) and keeps each author's most advanced report.
- The result is cached in Redis. The `refresh-reports` scheduler task refreshes it every 15 minutes, and moderators can refresh it immediately from the subreddit menu.
- `public/splash.html` with `src/client/splash.ts` is the inline post view. It shows overall progress, per-batch progress and a cumulative timeline for one device, Round 2 by default, with chips to pick another device. It is built to fit an inline post (~512px tall) without scrolling.
- `public/dashboard.html` with `src/client/dashboard.js` is the full dashboard, opened in expanded mode from the "Full dashboard" button. Viewers choose the expanded view's size (Mobile, Desktop or Fullscreen) in Reddit's own menu. Devvit gives the app no way to set it.

## Credits

The report parser (`src/shared/parser.js`) and the full dashboard (`public/dashboard.html`, `public/styles.css`, `src/client/dashboard.js`) come from [pebble-dash](https://github.com/myNameArnav/pebble-dash) by [myNameArnav](https://github.com/myNameArnav). The Devvit app scaffolding comes from Reddit's Devvit template and is covered by `LICENSE`. pebble-dash has no licence of its own, so the ported files are not covered by `LICENSE`.

## Getting Started

1. `npm install`
2. `npx devvit login`
3. `npm run playtest` installs the app on a private test subreddit. Use "[pebble-orders] New Post" from the subreddit menu if no post appears.

## Commands

- `npm run playtest [r/sub]`: watches changes, builds, uploads, and installs on Reddit. Accepts an optional subreddit.
- `npm run build`: builds client and server, including esbuild metafiles.
- `npm run clean`: removes build outputs.
- `npm run test`: runs all tests.
- `npm run format`: fixes lints and formatting.
- `npm run lint`: checks lints and formatting.
- `npm run publish`: cleans, builds, uploads, and files a new app review request.
