# REVIEW: Concise promo (31 s, 1920 x 1080, 30 fps)

## Creative calls

- Storyline D, "The wall, in depth" (the person asked for dramatic, cinematic, kinetic, with depth).
  A, B and C are in STORYLINES.md: A "One diff, start to finish" (one continuous take), B "The wall of
  agent-speak" (flat kinetic type, cut on the beat), C "Review at 6 pm" (split screen to one).
- One real session carries the film: the billing-api session (a41c) from the console screenshot
  script. The comment, the commit and the PR are the same writes the console screenshots record, so
  the payoff shows the exact deny record (Leverage / robust / seamless) the commit station just made.
- Every hook message is real output from plugins/concise/hooks. Two are shortened on screen with an
  ellipsis: the comment path (`…/src/invoice.ts:1`) and the PR message (cut after "(limit 1),").
  The commit station shows only the first line of its denial.
- Wall phrases come from Concise's own pattern references.
- The payoff takes the accent ground: the brand rations orange to flagged words, the payoff and the mark.
- 30 s became 31 s after the first check: the denial lines needed about 3.5 s each, and the
  install command needed 2 s on screen.
- Music: ElevenLabs Eleven Music `music_v2_5`. The first takes drifted their section changes by about
  2 s and decayed to silence before the end card. The final bed is round 2, take 1, uploaded for
  inpainting: its 2.0–25.5 s is kept unchanged (so its drop lands on the stroke at 6.0 s) and a 7.5 s
  outro (a final hit, then a held chord) is generated onto it. A volume lane makes the one-beat stop
  at 5.55–5.97 s. Credits: assets/music/CREDITS.md, assets/sfx/CREDITS.md (Pixabay licence).

## Measured

- `hyperframes check`: ok, no errors. Kept warnings (`line_unread`):
  - the noise phrases (0–6 s): unreadable on purpose, they are the noise;
  - the verbose "before" text that gets cut (comment line 3, PR paragraphs 1 and 3, 1.8–1.9 s each,
    floors 2.2–2.4 s): the viewer only needs to see that it is long;
  - every denial and every rewritten line clears its floor.
- Rendered master: 930 frames, true peak −1.7 dBTP, no clipping, −17.5 LUFS; the silence before the
  stroke measured at 5.55–5.97 s; hits measured at 6.0, 9.2, 13.5, 17.5, 21.1 and 28.5 s.
- Web file (public/promo/concise-promo.mp4, H.264 CRF 25 + AAC 160k, loudness-normalised): 3.7 MB,
  −14.6 LUFS, −1.1 dBTP.
- The sound was measured, not heard. Nobody has listened to the mix yet.

## Looked at

- Beat sheet, phone sheet (360 px), all five seams, and a contact sheet from the rendered master.
- Phone: the titles ("Concise checks it first", "Watch every check.", the claim, the lockup) read at
  360 px. The 34 px code and the hook text inside the planes do not; on a phone the planes carry the
  story by shape (long → short) and the orange line, not by their words.

## Weakest shot, and what I'd change with more time

- 21.0–21.4 s: the console plane rises from depth while the orange flood is still completing. It
  reads as intended at speed, but the first 0.1 s of the plane is semi-transparent on orange. With
  more time: hold the plane until the flood finishes and land it on the 21.5 beat.
- The end card is plain: the mark draws, its square locks, the command fades in. A camera move
  through the square into the lockup would carry the depth idea to the end.
