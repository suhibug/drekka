# drekka server

A free Cloudflare Worker that reads menus for the app, so people don't need their own keys.
It's deployed together with the app from the main folder (see `../wrangler.jsonc`), at /api/.

Deploy (from the drekka folder): `npx wrangler deploy`
Keys are Cloudflare secrets: `npx wrangler secret put GEMINI_KEY` (free tier) and `npx wrangler secret put JINA_KEY`.
Optional `GOOGLE_KEY`: a Gemini key on a billed project, used only for Google Search when the free search finds nothing. Capped at 250 a month (about $3); this month's count is the KV key `google:YYYY-MM`.
For testing on this computer, they go in `../.dev.vars` (never committed or uploaded).

Read feedback: `npx wrangler kv key list --binding DREKKA --prefix feedback: --remote`

When the free ai is busy (429), the paid key reads the same pages instead, counted in the same monthly allowance. If the Jina key's balance runs out, pages are read without it (search then falls to Google). Check Jina's balance: `curl -s "https://embeddings-dashboard-api.jina.ai/api/v1/api_key/fe_user?api_key=$JINA_KEY"` (wallet.total_balance).
