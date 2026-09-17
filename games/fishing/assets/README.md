# Deep Cast — Assets

Replace any file here **keeping the same filename** to update the game visuals or sounds.

## Images

| Path | Used for |
|------|----------|
| `images/water.png` | Full-screen sea background (replace this file to change the ocean) |
| `images/bobber.svg` | Cast bobber on the water |
| `images/boat.svg` | Reserved for future boat art swap |
| `images/bait/bait_worm.svg` | Worm bait chip |
| `images/bait/bait_shrimp.svg` | Shrimp bait chip |
| `images/bait/bait_lure.svg` | Flash Lure bait chip |
| `images/bait/bait_golden.svg` | Golden bait chip |
| `images/fish/fish_sardine.svg` | Sardine catch art |
| `images/fish/fish_bass.svg` | Bass catch art |
| `images/fish/fish_tuna.svg` | Tuna catch art |
| `images/fish/fish_swordfish.svg` | Swordfish catch art |
| `images/fish/fish_shark.svg` | Shark catch art |
| `images/fish/fish_leviathan.svg` | Leviathan catch art |
| `images/fish/fish_phantom.svg` | Phantom Ray catch art |

PNG or WebP work too — update the path in `manifest.json` if you change the extension.

## Sounds

Edit `sounds/index.json` to map action names → filenames, then drop matching `.ogg` files into `sounds/`:

```json
{
  "cast": "cast.ogg",
  "bite": "bite.ogg"
}
```

Only files listed in `index.json` are loaded (no missing-file console errors).

Default placeholders are included. Replace them with your own:

- `cast.ogg` — line thrown through the air
- `lure.ogg` — lure/bobber hits the water (real splash sample)
- `splash.ogg` — alias for lure splash
- `reel.ogg` — **continuous rolling reel** (default while you hold to pull)
- `reel-smooth.ogg` — medium roll · `reel-slow.ogg` — slower roll · `reel-clicks.ogg` — ratchet clicks

Change `"reel"` in `index.json` to swap styles.
- `bite.ogg` — fish bites
- `fight.ogg` — reel fight starts
- `reel.ogg` — while holding to reel
- `catch.ogg` — fish landed
- `catch-rare.ogg` — epic / legendary / mythic catch
- `escape.ogg` — fish got away
- `snap.ogg` — line snapped
- `buy.ogg` — bait pack purchased
- `select.ogg` — bait chip selected
- `click.ogg` — UI taps

If a sound file is missing, the game synthesizes a fallback tone automatically.
