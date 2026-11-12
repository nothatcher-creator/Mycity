# Promotional stills

Real renders from the game, staged and then graded.

1. Serve the game folder on `http://127.0.0.1:5510` with CORS headers. Loaded from localhost, the game turns
   on its debug keys, among them the photo scenes in `src/game/photo.js` (Numpad9 steps through the scenes of
   the current start, Numpad0 switches between a cheap draft resolution and 2x supersampling). The published
   game has none of this.
2. `python3 script.py <planet|orbit|rocks> steps.json <scenes> <loadMs> <refineMs> <hiMs>` writes the key
   presses for a run; `node cap.cjs f steps.json` plays them in the Project 0 dev kit at 1920x1080 with the
   platform overlay hidden and saves `f-<scenario><n>.png`.
3. `VW_FONTS=<folder with the Chakra Petch TTFs> python3 batch.py` grades every capture into `out/`: bloom, a
   light streak on small bright lights, a soft shoulder, contrast, split toning, vibrance, a vignette, a trace
   of fringing, sharpening, grain, and a wordmark; plus a titled key art and a collage.

The grade is done on the pictures only. The game itself has no bloom or colour grading.
