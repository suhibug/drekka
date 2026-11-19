# Drekka

*Drekka* means "to drink" in Faroese.

Type a café, bar or restaurant, tap it, and Drekka reads its menu online and picks 3 drinks:

- **rare_find**: the rarest thing on the menu
- **house_fave** (later **your_type**): the place's signature, and once you've rated drinks, the one that fits your taste
- **wild_card**: a rare drink outside your usual taste

Not feeling them? Tap flavors you're in the mood for, or ask for 3 more.

Every drink you try can go into a little leather-bound journal: a small photo, a scribbled rating, and a note. Your ratings teach Drekka your taste, and next time you visit a place it reminds you of the drink you loved there.

Built by Suhitha Lakkunda Rathnakara.

## How it works
- Plain HTML, CSS and JavaScript. No build step, no framework.
- Place search uses [Photon](https://photon.komoot.io/) (OpenStreetMap), which is free with no key.
- Finding the menu, all free: OpenStreetMap gives the place's website (chains: brand → Wikidata → official site), [Jina Reader](https://jina.ai/reader/) opens the menu pages like a browser, and Google's Gemini AI (free tier: Gemini 3.5 Flash Lite) picks out the drinks. Each person adds their own free Gemini key in Settings, and it stays on their device.
- Journal photos get an old sepia look, like a photo pasted in a journal.
- The journal, photos and ratings are stored only on your device.
- Sounds are generated with Web Audio, with no recordings. There's a mute button.
- It installs like an app: open it on your phone, then tap Share → Add to Home Screen.

## Run it locally
```
python3 -m http.server 8000
```
Then open http://localhost:8000.
