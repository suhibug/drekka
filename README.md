# Drekka

*Drekka* means "to drink" in Faroese.

Type any café, bar or restaurant and Drekka picks 3 drinks from its current menu:

- **The unique one**: the rarest thing on the menu
- **Made for you**: leans toward the flavors you've rated high (before you have ratings, it's the place's signature)
- **Surprise me**: a rare drink outside your usual taste

Not feeling them? Tap flavors you're in the mood for, or ask for 3 more. At the table, you can snap a photo of the menu to get today's specials.

Every drink you try can go into a little leather-bound journal: a small photo, a scribbled rating, and a note. Your ratings teach Drekka your taste, and next time you visit a place it reminds you of the drink you loved there.

Built by Suhitha Lakkunda Rathnakara.

## How it works
- Plain HTML, CSS and JavaScript. No build step, no framework.
- Place search uses [Photon](https://photon.komoot.io/) (OpenStreetMap), which is free with no key.
- Menus are read by Google's Gemini AI (free tier). Each person adds their own free key in Settings, and it stays on their device.
- The journal, photos and ratings are stored only on your device.
- Sounds are generated with Web Audio, with no recordings. There's a mute button.
- It installs like an app: open it on your phone, then tap Share → Add to Home Screen.

## Run it locally
```
python3 -m http.server 8000
```
Then open http://localhost:8000.
