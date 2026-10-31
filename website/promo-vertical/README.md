# Concise promo, vertical (1080×1920)

The 9:16 cut of `../promo` for TikTok, Reels, Shorts and X. It uses the same 31 s timeline, music
bed and sound cues, with the scenes laid out again for portrait rather than cropped.

- `assets` is a symlink to `../promo/assets`; nothing is duplicated.
- Grid: 90 px side margins. Proof labels sit at y 360 and every card at y 820. Key content stays
  out of the bottom ~480 px, where platforms draw captions and buttons.
- Slide code is 28 px, the phone reading floor. The two longer denials wrap onto two lines.
- The stroke targets were measured from rendered pixels: title stop (356, 1166) and end-card
  square (363, 765, 26×19). Re-measure if the title or lockup changes.
- The end card points to concise.chat.

Render and encode (social loudness −14 LUFS):

```sh
npx hyperframes@0.8.222 render -o renders/concise-promo-vertical-master.mp4 --quality delivery
ffmpeg -i renders/concise-promo-vertical-master.mp4 -c:v libx264 -profile:v high -crf 20 -preset slow \
  -pix_fmt yuv420p -af loudnorm=I=-14:TP=-1.5:LRA=11 -c:a aac -b:a 192k -ar 48000 \
  -movflags +faststart -t 31 renders/concise-vertical.mp4
```
