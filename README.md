# Drekka

*Drekka* means "to drink" in Faroese.

Pick a café, bar or restaurant, snap its menu (or upload a screenshot of it), and Drekka picks 3 drinks:

- **The unique one**: the rarest thing on the menu
- **Made for you**: leans toward the flavors you've rated high (before you have ratings, it's the place's signature)
- **Surprise me**: a rare drink outside your usual taste

Not feeling them? Tap flavors you're in the mood for, or ask for 3 more. A photo at the table also catches today's specials.

Every drink you try can go into a little leather-bound journal: a small photo, a scribbled rating, and a note. Your ratings teach Drekka your taste, and next time you visit a place it reminds you of the drink you loved there.

Built by Suhitha Lakkunda Rathnakara.

## How it works
- Plain HTML, CSS and JavaScript. No build step, no framework.
- Place search uses [Photon](https://photon.komoot.io/) (OpenStreetMap), which is free with no key.
- Menus are read from the photo by Google's Gemini AI (free tier: Gemini 3.5 Flash Lite, 500 a day). Each person adds their own free key in Settings, and it stays on their device. Looking a menu up by name needs web search, which Google's free tier doesn't include for new accounts.
- The journal, photos and ratings are stored only on your device.
- Sounds are generated with Web Audio, with no recordings. There's a mute button.
- It installs like an app: open it on your phone, then tap Share → Add to Home Screen.

## Run it locally
```
python3 -m http.server 8000
```
Then open http://localhost:8000.
