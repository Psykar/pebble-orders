## Pebble Shipping Dashboard (Devvit)

A [Devvit](https://developers.reddit.com/) port of [pebble-dash](https://github.com/myNameArnav/pebble-dash): it reads the r/pebble shipping mega thread and shows rollout progress as an interactive post.

Running on Reddit's Developer Platform means the app reads the thread through `reddit.getComments()`, which expands every "load more" stub. No cookie, OAuth app or rate-limit workarounds are needed, and all top-level comments are included.

## How it works

- `src/server/reports.ts` fetches the post and every top-level comment, parses them with `src/shared/parser.js` (ported as-is from pebble-dash) and keeps each author's most advanced report.
- The result is cached in Redis. The `refresh-reports` scheduler task refreshes it every 15 minutes, and moderators can refresh it immediately from the subreddit menu.
- `public/splash.html` is the inline post view (summary plus an "Open dashboard" button). `public/dashboard.html` with `src/client/dashboard.js` is the full dashboard, opened in expanded mode.

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
