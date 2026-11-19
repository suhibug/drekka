# Drekka: notes for Claude Code

Suhitha's own app idea: find the most unique drink at any place, plus a scrapbook-style drink journal. Plain HTML, CSS and JavaScript, installable as a home-screen app (PWA). The plan is to wrap it for the App Store and Google Play later, once she's tested it.

## Files
- `index.html`, `style.css`: three views (search, picks, journal), the book overlay for logging a drink, and the settings dialog. The look is an old explorer's field journal: aged paper, ink, a leather cover with a key.
- `app.js`: screens, place search (Photon/OpenStreetMap, passes osm id), per-day menu cache, the journal (localStorage), camera polaroid with vintage sepia filter, scribble pad, rating dots.
- `quiz.js`: the welcome "get to know you" quiz (first open, or settings → retake). One question per page, all taps; branches (coffee → coffee style, tea/matcha/boba → tea mood, cocktails → cocktail style). Saved as `drekka-me`; `profileFrom()` turns it into liked/skipped flavors, name words, no-alcohol, and adventure level.
- `picks.js`: pure logic for the 3 picks (unique / made for you or signature / surprise me), the taste profile from ratings, the favorite drink at a place, and flavor chips.
- `menu.js`: finds the menu with no photo. OSM tags (website / brand:wikidata → Wikidata P856) → Jina Reader (r.jina.ai, free, CORS ok, renders JS) reads home + /menu + menu-looking links + drink tabs.
- `ai.js`: sends that page text to Gemini (gemini-3.5-flash-lite first; falls to the next model on 404/503). Free tier (Nov 2026): new accounts can't use 2.5, and Gemini 3+ has 0 free Google Search grounding, which is why menu.js exists. Known gap: Swig's menu is inside an iframe, which needs a (free) Jina key. Returns the drinks as JSON with a uniqueness score from 1 to 10 and flavors.
- `sound.js`: soft Web Audio sounds and a wandering background melody. Mute is remembered.
- `sw.js`, `manifest.json`, `icon*`: offline support and install.

## Rules
- Her design rules: every word lowercase (CSS text-transform on body), cursive fonts only (Pinyon Script + Caveat), labels as one_word (rare_find, house_fave/your_type, wild_card), vintage look, old-photo filter on drink pictures.
- Never ask people to photograph the menu. She rejected that firmly: the point is deciding before you reach the counter.
- Never invent drinks. The AI prompt says to include only drinks actually found. Keep that.
- Live "sold out today" data doesn't exist publicly; never claim it.
- The journal stays on the device. Never commit an AI key. A public release needs a small server to hold the key.
- Keep it free for her. The only paid step is the App Store ($99/yr), and only when she decides.
- Sounds must be audible but gentle, and always mutable. After testing in a browser, mute or stop the sound and close the browser.
- Keep the code simple to read. She's learning, and she's the product owner, not the coder.
