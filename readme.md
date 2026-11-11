## Pebble Shipping Dashboard

Track the 2026 Pebble rollout without scrolling through hundreds of comments. This app reads the community shipping reports in r/pebble's shipping mega thread and turns them into an interactive post.

### What viewers see

- **In the feed:** overall progress (delivered, shipped, confirmed, waiting), progress for each batch, and a cumulative timeline. It shows the Pebble Round 2 by default, and chips switch to Time 2, Duo 2, Index or all devices.
- **Full dashboard:** tap "Full dashboard" for filters by status, batch, colour, device and continent, more charts, and a searchable table of every report with a link back to the original comment. On desktop, Reddit's size menu at the top of the expanded view switches it between Mobile, Desktop and Fullscreen.

Reports refresh every 15 minutes.

### For moderators

1. Install the app on your subreddit.
2. Choose **"[pebble-orders] New Post"** from the subreddit menu to create a dashboard post. One is also created automatically when the app is installed.
3. Optional: under the app's settings, set **Shipping mega thread** to a thread link or post ID if the reports move to a new thread. The thread can be in any public subreddit, and the change shows on the next view.
4. **"[pebble-orders] Refresh Reports"** in the subreddit menu re-reads the thread immediately.

### Data and privacy

- The app reads the public top-level comments on the configured thread. Nothing else on Reddit is read.
- Each comment is parsed for model, batch, colour, destination, dates and status. Each Redditor's most advanced report per device is kept.
- Parsed reports, including the commenter's username, comment text and a link to the comment, are cached in the app's Reddit-hosted storage and shown in the dashboard.
- Deleted and removed comments, and comments from deleted accounts, drop out at the next refresh (within 15 minutes). The cache also expires after an hour if refreshes stop.
- The app sends no data outside Reddit and stores nothing about the people viewing the dashboard.

### Support

Report problems or ideas as an issue at [github.com/Psykar/pebble-orders](https://github.com/Psykar/pebble-orders/issues).

### Credits

The report parser and the full dashboard are ported from [pebble-dash](https://github.com/myNameArnav/pebble-dash) by [myNameArnav](https://github.com/myNameArnav).

## Development

Source: [github.com/Psykar/pebble-orders](https://github.com/Psykar/pebble-orders). This file is also the app's App Directory description, because `devvit publish` uploads it as the app's "about" text.

### How it works

- `src/server/reports.ts` fetches the configured thread (the `megaThread` subreddit setting, defaulting to `t3_1sjk3c7`) and every top-level comment through `reddit.getComments()`, which expands every "load more" stub. It parses them with `src/shared/parser.js` and keeps each author's most advanced report per device.
- The result is cached in Redis with the thread ID it came from. The `refresh-reports` scheduler task refreshes it every 15 minutes, and a changed setting refetches on the next view.
- `public/splash.html` with `src/client/splash.ts` is the inline post view. It has to fit an inline post (~512px tall) without scrolling.
- `public/dashboard.html` with `src/client/dashboard.js` is the full dashboard, opened in expanded mode. Viewers choose the expanded view's size, and Devvit gives the app no way to set it.

### Licence

MIT, including the files ported from pebble-dash (MIT, Arnav Jain). Portions derived from Reddit's Devvit app template stay under BSD-3-Clause. `LICENSE` has both texts.

### Getting started

1. `npm install`
2. `npx devvit login`
3. `npm run playtest` installs the app on a private test subreddit. Use "[pebble-orders] New Post" from the subreddit menu if no post appears.

Don't run `npm run build` or `npm test` while playtest is running. Both rebuild `public/`, and the watcher's upload then collides with the build ("AppVersion already exists").

### Commands

- `npm run playtest [r/sub]`: watches changes, builds, uploads, and installs on Reddit. Accepts an optional subreddit.
- `npm run build`: builds client and server, including esbuild metafiles.
- `npm run clean`: removes build outputs.
- `npm run test`: runs all tests.
- `npm run format`: fixes lints and formatting.
- `npm run lint`: checks lints and formatting.
- `npm run publish`: cleans, builds, uploads, and files a new app review request (unlisted; add `--public` to request an App Directory listing).
