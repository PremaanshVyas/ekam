# Studio radio — playlist

The player on ekam.ink reads **`playlist.json`** in this folder. Edit that file to curate
the music. No code changes needed — just edit the JSON and (for your own songs) drop the
audio files here, then commit + push.

## Add your own track (3 steps)

1. Get a **royalty-free** track. Best source: **Pixabay** (https://pixabay.com/music) —
   free for commercial use, **no attribution required**. (Also fine: Chosic, Bensound,
   Free-Stock-Music — some of those need a credit line.)
2. Put the `.mp3` in this folder, e.g. `web/public/audio/morning.mp3`.
3. Add an entry to `playlist.json`:

   ```json
   { "title": "Morning", "artist": "Your Name", "src": "/audio/morning.mp3" }
   ```

That's it — the player picks it up after the next deploy. The "browse" menu in the player
lists every entry here, in order.

## Notes
- `src` can be a local file (`/audio/xxx.mp3`) **or** a stream URL. The current playlist
  is local lofi tracks from Pixabay (free for commercial use, no attribution required).
- Keep files reasonably small (a few MB each). ~8–12 tracks is plenty.
- Order in the JSON = order in the player.
