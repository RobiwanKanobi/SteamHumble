# AGENTS.md

## Cursor Cloud specific instructions

This is a Node.js web application (Express backend + vanilla HTML/CSS/JS frontend) that compares Steam games in Humble Bundles with a user's Steam library.

### Services

| Service | Command | Port | Notes |
|---------|---------|------|-------|
| Web server | `npm run dev` (or `node server.js`) | 3000 | Serves both API and static frontend |

### Key environment variables

- `STEAM_API_KEY` — Required for Steam library lookups. Get one at https://steamcommunity.com/dev/apikey
- `PORT` — Server port (default 3000)
- `HUMBLE_PARTNER_ID` — Optional, for affiliate links

### Non-obvious notes

- The Humble Bundle scraper parses embedded JSON from `#landingPage-json-data` (bundles listing) and `#webpack-bundle-page-data` (bundle detail pages). If Humble Bundle changes their page structure, the scraper will return empty results gracefully — manual game entry still works as a fallback.
- Steam App ID resolution uses the Steam store search API (`/api/storesearch`) which has rate limits. Requests are batched (5 concurrent) with 300ms delays.
- Bundle data is cached in-memory for 15 minutes. Use `GET /api/bundles/refresh` to force a refetch.
- The app works without a `STEAM_API_KEY` — bundles load and manual game lists display, but the "Compare" (library lookup) feature requires the key.
- `npm run dev` uses Node.js `--watch` flag for auto-restart on file changes.
