#!/bin/sh
# Puts drekka online (free, Cloudflare):
#   the server  -> https://drekka.drekka.workers.dev/api   (worker/, wrangler.jsonc)
#   the app     -> https://drekka.pages.dev                (only the app's own files)
set -e
cd "$(dirname "$0")"
npx wrangler deploy
out=$(mktemp -d)
cp index.html style.css app.js config.js ai.js menu.js quiz.js intro.js nearby.js motion.js waiting.js look.js tour.js celebrate.js picks.js sound.js sw.js manifest.json icon.svg icon-*.png "$out"/
(cd "$out" && npx wrangler pages deploy . --project-name drekka --branch main --commit-dirty=true)
rm -rf "$out"
