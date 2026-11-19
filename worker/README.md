# drekka server

A free Cloudflare Worker that reads menus for the app, so people don't need their own keys.

One-time setup (in this folder):
1. `npx wrangler login`  (opens the browser; sign in to your free Cloudflare account)
2. `npx wrangler kv namespace create DREKKA`, then put the id it prints into `wrangler.toml`
3. `npx wrangler secret put GEMINI_KEY` and paste the Google AI key
4. `npx wrangler secret put JINA_KEY` and paste the Jina key
5. `npx wrangler deploy`

Read feedback: `npx wrangler kv key list --binding DREKKA --prefix feedback: --remote`
