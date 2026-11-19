# drekka

Type a café, bar or restaurant, tap it, and drekka reads its menu online and picks 3 drinks:

- **rare**: the rarest drink here that still fits your taste
- **match**: the one that fits your taste best (or **signature**, what the place is known for, before drekka knows you)
- **wild card**: a surprise outside your usual, on purpose
- **steal**: when the menu lists prices, a lovely pick that's easier on the wallet

Not feeling them? Tap flavors you're in the mood for, pick a price (budget, mid, splurge), or ask for 3 more.

The first time you open it, a short tap-only quiz gets to know you: what you usually drink, how you like your coffee or tea, flavors you love or skip, and how adventurous you are. drekka uses that from the very first pick.

Every drink you try can go into a little leather-bound journal: a small photo or video, a scribbled rating, and a note. Your ratings teach drekka your taste, and next time you visit a place it reminds you of the drink you loved there.

Built by Suhitha Lakkunda Rathnakara.

## How it works
- Plain HTML, CSS and JavaScript. No build step, no framework.
- Place search uses [Photon](https://photon.komoot.io/) (OpenStreetMap), which is free with no key.
- Finding the menu, no photo needed: OpenStreetMap gives the place's website (chains: brand → Wikidata → official site), [Jina Reader](https://jina.ai/reader/) opens the menu pages like a browser (or searches the web when the site has no drinks), and Google's Gemini AI picks out the drinks. Google Search is a capped last resort.
- A small server (a Cloudflare Worker, see `worker/`) holds the keys and remembers menus, so nobody needs a key or an account.
- Journal photos and videos get a soft black-and-white old-photo look.
- The journal, photos and ratings are stored only on your device.
- Calm music is generated with Web Audio, with no recordings. There's a mute button, and taps give a small vibration.
- It installs like an app: on iPhone, Share → Add to Home Screen; on Android, ⋮ menu → Add to Home screen (or Install app).

## Run it locally
```
python3 -m http.server 8000
```
Then open http://localhost:8000.
