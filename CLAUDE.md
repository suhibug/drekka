# drekka: notes for Claude Code

Suhitha's own app idea: find the most unique drink at any place, plus a scrapbook-style drink journal. Plain HTML, CSS and JavaScript, installable as a home-screen app (PWA) on iPhone and Android. The plan is to wrap it for the App Store and Google Play later, once she's tested it.

## Files
- `index.html`, `style.css`: three views (search, picks, journal), the book overlay for logging a drink, and the settings dialog. The look is an old explorer's field journal: aged paper, ink, a leather cover with a key.
- `app.js`: screens, place search (Photon/OpenStreetMap, passes osm id), per-day menu cache, price chips (budget/mid/splurge from the menu's own price thirds), the "steal" pick, the journal (localStorage; videos in IndexedDB), camera polaroid with light b&w filter, scribble pad, rating dots, feedback ask.
- `quiz.js`: the welcome "get to know you" quiz (first open, or settings → retake). One question per page, all taps; branches (coffee → coffee style, tea/matcha/boba → tea mood, cocktails → cocktail style). Hard no's mirror the loves. Saved as `drekka-me`; `profileFrom()` turns it into liked/hard-no flavors and words, no-alcohol, and adventure level.
- `picks.js`: pure logic for the 3 picks (rare / match, or signature before we know your taste / wild card), the taste profile from ratings, the favorite drink at a place, and flavor chips. Hard no's are never picked. app.js adds a 4th, "steal": the best fit among the menu's cheapest third of prices, only when the menu has prices and no price chip is chosen.
- `menu.js`: finds the menu with no photo. OSM tags (website / brand:wikidata → Wikidata P856) → Jina Reader (renders JS, iframes with the key) reads home + /menu + menu-looking links. If the site has no drinks: Jina search, filtered so results must name the exact place. If the Jina key's balance runs out, pages are read without it.
- `ai.js`: sends that page text to Gemini (gemini-3.5-flash-lite first; falls to the next model on 404/429/503). Free tier (Nov 2026): new accounts can't use 2.5, and Gemini 3+ has 0 free Google Search grounding, which is why menu.js exists. Prices stay in the menu's own currency. `readMenuWithGoogle` is the paid last resort.
- `sound.js`: generative Web Audio music (8 original pieces), haptic taps, ambient audio session. Starts on the first tap (browsers forbid sound before one). Mute is remembered.
- `sw.js`, `manifest.json`, `icon*`: offline support and install. Bump the cache version in sw.js when app files change.

## Rules
- No faroese references anywhere (she isn't from there): no "to drink, in faroese", no "skál". The name stays all lowercase: drekka.
- Her design rules: every word lowercase (CSS text-transform on body), cursive Caveat font (bold for headings), short lowercase pick labels with a small hint under each (rare, match, signature, wild card, steal), vintage look, old-photo filter on drink pictures. Lower-cost picks should feel cute, never "cheap".
- Never ask people to photograph the menu. She rejected that firmly: the point is deciding before you reach the counter.
- Never invent drinks, and never show another place's menu. The AI prompt says to include only drinks actually found for this exact place. Keep that.
- Live "sold out today" data doesn't exist publicly; never claim it.
- The journal stays on the device. Never commit a key (.dev.vars is gitignored and assetsignored).
- Users never need keys or settings. Free for users, always.
- Money: the only paid part is GOOGLE_KEY (Cloud Prepay, $5 bought once, auto-reload off), capped at 250 lookups a month (~$3). Ask her before anything else that costs money, and say plainly when something charges upfront.
- Sounds must be audible but gentle, and always mutable. When testing in a browser, mute drekka first (localStorage drekka-muted=1, or launch with --mute-audio), then close the browser.
- Keep the code simple to read. She's learning, and she's the product owner, not the coder.

## Hosting (Cloudflare)
- The app: https://drekka.pages.dev (classic Cloudflare Pages project "drekka"; only the app's files are uploaded).
- The server: https://drekka.drekka.workers.dev/api (Worker "drekka": wrangler.jsonc + worker/index.js). KV holds menus (kept forever; once a week old they're re-read in the background, free path only, max 100 a day, and the old menu stays if that finds nothing), feedback, and the monthly Google counter. Secrets: GEMINI_KEY, JINA_KEY, GOOGLE_KEY. When the free AI is busy, the paid key steps in, inside the same monthly cap.
- Update both: `./deploy.sh`. GitHub Pages (suhibug.github.io/drekka) still works too, but share drekka.pages.dev.
