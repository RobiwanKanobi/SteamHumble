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

### Running & testing

- Start dev server: `npm run dev` — auto-restarts on file changes via Node.js `--watch`.
- The `STEAM_API_KEY` must be in a `.env` file (see `.env.example`) or as an environment variable. The app runs without it but library comparison is disabled.
- Quick smoke test: `curl http://localhost:3000/api/config` should return `{"hasSteamKey":true,...}` when key is set.
- Full comparison test: `curl "http://localhost:3000/api/steam/library?profile=76561198006409530"` should return 1000+ games from a public profile.
- The target Steam profile must have game details set to **public** in Steam privacy settings.

### Non-obvious notes

- The Humble Bundle scraper parses embedded JSON from `#landingPage-json-data` (bundles listing) and `#webpack-bundle-page-data` (bundle detail pages). If Humble Bundle changes their page structure, the scraper will return empty results gracefully — manual game entry still works as a fallback.
- Steam App ID resolution uses the Steam store search API (`/api/storesearch`) which has rate limits. Requests are batched (5 concurrent) with 300ms delays. DLC-heavy bundles (e.g. "Call of the Wild") have lower resolution rates since DLC names are ambiguous in search.
- Bundle data is cached in-memory for 15 minutes. Use `GET /api/bundles/refresh` to force a refetch.
- Initial bundle fetch on server start takes ~20-30 seconds (scrapes 11 bundles + resolves Steam App IDs). Subsequent requests are cached.
- `npm run dev` uses Node.js `--watch` flag for auto-restart on file changes.
