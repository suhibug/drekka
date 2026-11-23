# drekka: notes for Claude Code

Suhitha's own app idea: find the most unique drink at any place, plus a scrapbook-style drink journal. Plain HTML, CSS and JavaScript, installable as a home-screen app (PWA) on iPhone and Android. The plan is to wrap it for the App Store and Google Play later, once she's tested it.

## Files
- `index.html`, `style.css`: three views (search, picks, journal), the book overlay for logging a drink, and the settings dialog. The look is an old explorer's field journal: aged paper, ink, a leather cover with a key.
- `app.js`: screens, place search (Photon/OpenStreetMap, passes osm id), per-day menu cache, price chips (budget/mid/splurge from the menu's own price thirds), the "steal" pick, the journal (localStorage; videos in IndexedDB), camera polaroid with light b&w filter, scribble pad, rating dots, feedback ask.
- `quiz.js`: the welcome "get to know you" quiz (first open, or settings → retake). One question per page, all taps; branches (coffee → coffee style, tea/matcha/boba → tea mood, cocktails → cocktail style). Hard no's mirror the loves. Saved as `drekka-me`; `profileFrom()` turns it into liked/hard-no flavors and words, no-alcohol, and adventure level.
- `picks.js`: pure logic for the 3 picks (rare / match, or signature before we know your taste / wild card), the taste profile from ratings, the favorite drink at a place, and flavor chips. Hard no's are never picked. app.js adds a 4th, "steal": the best fit among the menu's cheapest third of prices, only when the menu has prices and no price chip is chosen.
- `menu.js`: finds the menu with no photo. OSM tags (website / brand:wikidata → Wikidata P856) → Jina Reader (renders JS, iframes with the key) reads home + /menu + menu-looking links. If the site has no drinks: Jina search, filtered so results must name the exact place. If the Jina key's balance runs out, pages are read without it.
- `ai.js`: sends that page text to Gemini (gemini-3.5-flash-lite first; falls to the next model on 404/429/503). Free tier (Nov 2026): new accounts can't use 2.5, and Gemini 3+ has 0 free Google Search grounding, which is why menu.js exists. Prices stay in the menu's own currency. `readMenuWithGoogle` is the paid last resort.
- `intro.js`: the welcome. A glass fills and fizzes while "drekka" writes in. First time: "tap to open" (can-opening sound + bubbles), then a 5-page story in drekka's playful brand voice (no consent checkbox; she said consent isn't needed), each line floating in, then the quiz. Saved as `drekka-intro-seen`. Later opens: a 1.7s splash, tap to skip. Settings → "how drekka works" replays it.
- `motion.js`: tiny faint fizz bubbles on the screen edges (she found ink dots ugly) that move against the phone's motion (like car motion cues; iphone asks permission on "tap to open"), drifting gently without a sensor. Shown on the welcome story and while a menu loads.
- `celebrate.js`: after a drink is saved to the journal, a random drink character (from tour.js) pops up and dances with confetti and fizz and a "congrats" line; tap or ~4s to go on, then the feedback ask.
- `waiting.js`: when a menu takes over 1s, a drink is "made" on screen, the steps change, a "first time... up to a minute" note shows at 6s, and there is a deck of true drink-fact flashcards (each card is a little game to open, taking turns: tap to flip, scratch it off, slide the lid off, hold to pour; "next card" for another; they never change on their own). When the menu is ready a "see my picks" button appears: picks never pop in while someone is reading. Fast/saved menus skip all of it.
- `nearby.js`: "no place in mind? find one near me". Pick a kind of spot → location (asks once; falls back to the rough city guess) → server /nearby (google, star ratings, best-loved first) or, if that's unavailable, OpenStreetMap Overpass (closest first). "you choose for me" shuffles and lands on a well-rated nearby spot with a website. Typing a kind word ("cafe", "boba", "bar") in search offers this at the top of the results.
- `look.js`: looks in settings: match my phone (default), paper, night, matcha, berry, blue hour. Colors are CSS variables on `html[data-look]` (style.css); never hard-code a color, add a variable.
- `tour.js`: a tour of the buttons right after the first welcome+quiz (`drekka-toured`), replayable from settings. The screen dims, the button pops and zooms, and a different drink character (coffee, boba, lemonade, matcha) explains it in a speech bubble.
- `sound.js`: generative Web Audio music (8 original pieces), haptic taps, ambient audio session. Starts on the first tap (browsers forbid sound before one). Mute is remembered.
- `sw.js`, `manifest.json`, `icon*`: offline support and install. Bump the cache version in sw.js when app files change.

## Breweries (what's on tap)
Brewery-ish places (tap: true from the near-me list, or a name with brew/taproom/taphouse/beer) look for beer pages and untappd "today's taps" links first, need real beer words before they stop digging, and the ai lists the beers first (style + abv in why). Tap menus are re-read after 2 days instead of 7.

## Feedback
One app-feedback form (about the app, not the drink): easy/okay/confusing, picks felt right, use again, what to change, what you liked. Opens from "tell me what you think of drekka" (search screen), settings, after the 1st/3rd/every 5th saved drink, and once after someone's first place. Saved with about: "app".

## Rules
- No faroese references anywhere (she isn't from there): no "to drink, in faroese", no "skál". The name stays all lowercase: drekka.
- Her design rules: every word lowercase (CSS text-transform on body), cursive Caveat font (bold for headings), short lowercase pick labels with a small hint under each (rare, match, signature, wild card, steal), vintage look, old-photo filter on drink pictures. Lower-cost picks should feel cute, never "cheap".
- Never ask people to photograph the menu. She rejected that firmly: the point is deciding before you reach the counter.
- Alcohol is only picked if the quiz said cocktails or beer & wine, or the person chose a bar/brewery themselves (picks.js isAlcohol also checks names like wine, ipa, margarita; mocktails and root beer don't count).
- Page turns make one quick soft paper fold (sound.fold), never a long rustle.
- Never invent drinks, and never show another place's menu. The AI prompt says to include only drinks actually found for this exact place. Keep that.
- Live "sold out today" data doesn't exist publicly; never claim it. The picks page always shows a one-line heads-up that the menu is from the web and may differ in store.
- The journal stays on the device. Never commit a key (.dev.vars is gitignored and assetsignored).
- Users never need keys or settings. Free for users, always.
- Money: the only paid part is GOOGLE_KEY (Cloud Prepay, $5 bought once, auto-reload off), capped at 250 lookups a month (~$3). Ask her before anything else that costs money, and say plainly when something charges upfront.
- Sounds must be audible but gentle, and always mutable. When testing in a browser, mute drekka first (localStorage drekka-muted=1, or launch with --mute-audio), then close the browser.
- Keep the code simple to read. She's learning, and she's the product owner, not the coder.

## Hosting (Cloudflare)
- The app: https://drekka.pages.dev (classic Cloudflare Pages project "drekka"; only the app's files are uploaded).
- The server: https://drekka.drekka.workers.dev/api (Worker "drekka": wrangler.jsonc + worker/index.js). KV holds menus (kept forever; once a week old they're re-read in the background, free path only, max 100 a day, and the old menu stays if that finds nothing), feedback, and the monthly Google counter. Secrets: GEMINI_KEY, JINA_KEY, GOOGLE_KEY, PLACES_KEY. /nearby (google text search with ratings) is capped at 800 a month under google's 1,000 free and cached a week per ~1 km area: $0. When the free AI is busy, the paid key steps in, inside the same monthly cap.
- Update both: `./deploy.sh`. GitHub Pages (suhibug.github.io/drekka) still works too, but share drekka.pages.dev.
