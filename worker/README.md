# drekka server

A free Cloudflare Worker that reads menus for the app, so people don't need their own keys.
It's deployed together with the app from the main folder (see `../wrangler.jsonc`), at /api/.

Deploy (from the drekka folder): `npx wrangler deploy`
Keys are Cloudflare secrets: `npx wrangler secret put GEMINI_KEY` and `npx wrangler secret put JINA_KEY`.
For testing on this computer, they go in `../.dev.vars` (never committed or uploaded).

Read feedback: `npx wrangler kv key list --binding DREKKA --prefix feedback: --remote`
