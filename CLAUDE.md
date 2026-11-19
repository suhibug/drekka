# Drekka: notes for Claude Code

Suhitha's own app idea: find the most unique drink at any place, plus a scrapbook-style drink journal. Plain HTML, CSS and JavaScript, installable as a home-screen app (PWA). The plan is to wrap it for the App Store and Google Play later, once she's tested it.

## Files
- `index.html`, `style.css`: three views (search, picks, journal), the book overlay for logging a drink, and the settings dialog. The look is an old explorer's field journal: aged paper, ink, a leather cover with a key.
- `app.js`: screens, place search (Photon/OpenStreetMap), per-day menu cache, the journal (localStorage), camera polaroid, scribble pad, rating dots.
- `picks.js`: pure logic for the 3 picks (unique / made for you or signature / surprise me), the taste profile from ratings, the favorite drink at a place, and flavor chips.
- `ai.js`: Gemini call. Free tier (Nov 2026): only photos work, via gemini-3.5-flash-lite at 500/day. New accounts can't use 2.5, and Gemini 3+ has 0 free search grounding, so name lookup is off in app.js until there's a paid key or a small menu-fetching server. Returns the drinks as JSON with a uniqueness score from 1 to 10 and flavors.
- `sound.js`: soft Web Audio sounds and a wandering background melody. Mute is remembered.
- `sw.js`, `manifest.json`, `icon*`: offline support and install.

## Rules
- Never invent drinks. The AI prompt says to include only drinks actually found. Keep that.
- Live "sold out today" data doesn't exist publicly; never claim it. The menu photo is the way to get today's menu.
- The journal stays on the device. Never commit an AI key. A public release needs a small server to hold the key.
- Keep it free for her. The only paid step is the App Store ($99/yr), and only when she decides.
- Sounds must be audible but gentle, and always mutable. After testing in a browser, mute or stop the sound and close the browser.
- Keep the code simple to read. She's learning, and she's the product owner, not the coder.
