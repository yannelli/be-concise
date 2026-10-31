# REVIEW: Concise promo (31 s, 1920 x 1080, 30 fps)

## Creative calls

- Storyline D, "The wall, in depth" (the person asked for dramatic, cinematic, kinetic, with depth).
  A, B and C are in STORYLINES.md: A "One diff, start to finish" (one continuous take), B "The wall of
  agent-speak" (flat kinetic type, cut on the beat), C "Review at 6 pm" (split screen to one).
- One real session carries the film: the billing-api session (a41c) from the console screenshot
  script. The comment, the commit and the PR are the same writes the console screenshots record, so
  the payoff shows the exact deny record (Leverage / robust / seamless) the commit station just made.
- Every hook message is real output from plugins/concise/hooks. Two are shortened on screen with an
  ellipsis: the comment location (now `Comment …`) and the PR message (cut after "(limit 1),").
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

## Baseline delivery measurements

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

## Baseline weak points

- 21.0–21.4 s: the console plane rises from depth while the orange flood is still completing. It
  reads as intended at speed, but the first 0.1 s of the plane is semi-transparent on orange. With
  more time: hold the plane until the flood finishes and land it on the 21.5 beat.
- The end card is plain: the mark draws, its square locks, the command fades in. A camera move
  through the square into the lockup would carry the depth idea to the end.

## Beat and title refinement (replacement delivery)

The user asked for stronger music synchronization and tighter left-slide titles. No new storyline,
UI, music generation or duration was introduced.

Measured waveform attacks support 120 BPM with a roughly +40–50 ms phase, not an exact zero-phase
half-second grid. The shipped MP4 and music source have no measured offset. At 30 fps, the new
proof start is frame 241; camera moves run frames 361–376 and 496–511. The console plane waits
until the orange flood finishes, becomes opaque at frame 646 and settles at frame 661. The end
square settles and the name wipe starts together at frame 856. SFX starts compensate for their
actual internal attacks: the existing stroke and lock offsets were already right and are unchanged.
The old two-stage payoff impact is replaced by the shorter impact-bass-1, peaking near 21.5 s.

Proof titles now share x160/y340, 112 px type with 0.92 leading, a 24 px subtitle gap, and 42 px
subtitles. Console titles now use the same left anchor; the claim leading is 0.94. Subtitles identify
the numeric defaults and say that style checks are optional and off by default.

The faster camera moves initially shortened the repaired lines' reading holds. The comment repair
now arrives at 10.4 s and the commit repair at frame 436; denial cues remain at 9.2, 13.5 and 17.5 s.
The comment location is abbreviated further because the file path is already visible above it.

Verification so far: all 16 website/timeline regression tests pass. HyperFrames check runs the browser
and passes lint, runtime, layout, motion and contrast with zero errors or warnings in those gates.
Its eight craft warnings are only the intentionally verbose before text and noise-wall phrases.
All denials and repaired lines clear their reading floors. Four informational occlusion findings are
the outgoing console title being covered by the intentional outro flood.

Opened: before/after comment, commit and PR frames; claim and square-lock frames; the review beat
and phone sheets, all five seam strips, the camera-move strip, the console-entrance strip, and the
updated repaired-text sheet. Large labels fit, the PR subtitle has two deliberate lines, and the
console no longer arrives over an unfinished flood. Diagnostic detail remains unreadable at phone
width; the homepage's text transcript remains available. Automatic review sheet sampling catches
some transition frames rather than the held title/claim/end card, so targeted full-size frames were
also reviewed.

The user approved rendering and shipping the refinement without motifs. Replacement web MP4:
3,690,504 bytes, H.264/AAC, 1920×1080, 30 fps, 930 frames, exactly 31.000 s. FFmpeg measurements of
the encoded file: −14.56 LUFS integrated, −1.27 dBTP, no clipping. Normalized waveform correlation
against the music source found 0 ms offset in clean windows 10.9–11.8, 14.9–15.8 and 23.8–24.8 s
(correlation 0.998–1.000, 2 kHz analysis, 0.5 ms sample resolution). This verifies placement, not
perceived musical feel; sound was measured, not listened to. The unchanged title-frame poster is
retained because the title at 7.3 s did not change.

The delivery master rendered in 24.2 s using screenshot capture and software GPU (system Chrome).
Opened an eight-frame contact sheet decoded from the web MP4 plus the full-resolution 14 s commit
frame: labels, optional/default-off text, code, console entrance, claim and end card match the
reviewed source. The managed browser launcher failed to start, but HyperFrames checks and snapshots
ran in system Chrome; both editor and lightweight-player endpoints answer HTTP 200.

Independent review (sa30eb4a2): ship for preview, with no introduced P0/P1. The reviewer compared
before/after frames and all review sheets, confirmed that the tighter claim has no glyph collision,
that both two-line proof subtitles fit, and that the console handoff is clean. This does not verify
perceived musical sync by listening. The subsequent replacement encode checks are recorded above.

The existing IBM Plex Mono code face is intentional under SPEC.md. A value-specific detector
exception is scoped to the three film compositions only; website typography is unchanged. An
existing DESIGN.md/sidecar freshness warning was not repaired as a side effect of this film edit.

## Proof-title motifs (rendered for PR review)

Started on a new branch only after PRs #49, #52 and #53 were merged and all 21 production routes,
metadata, homepage assets, and the exact refined MP4 were verified at concise.chat. The user
explicitly deferred the separate Cloudflare watch-path setting.

Added Lucide comment, commit and pull-request geometry behind the three proof labels. The marks
inherit brand ink at 8% opacity, measure 520×520 px, and travel with the unchanged station camera;
there is no additional ambient motion. The deliberately faint treatment is the user's request.
Their pinned sources and complete license are in assets/icons/. Only these three decorative SVGs
are aria-hidden, unfocusable, pointer-inert, and individually excluded from layout auditing because
their title overlap is intentional. All text remains audited and paints above the marks.

Measured: 21-page website build, zero Astro diagnostics, 20 passing website tests, and a clean
project-local Impeccable detector. HyperFrames check reports no errors/warnings in lint, runtime,
layout, motion or contrast; the same four outro occlusion infos and eight intentional noise/before-
text reading warnings remain. The proof script is byte-identical to main. The root timeline, music,
SFX, other scenes, website UI, public media, plugin and package sources are unchanged. The existing
scoped IBM Plex Mono exception is retained; no new detector ignore or design-sidecar repair.

Opened the three full-size proof stills at 9.6, 14 and 18.5 s; both eight-frame camera-move sheets
(12–12.7 and 16.5–17.2 s); and the proof-scoped beat and 360px phone sheets. The icons stay behind
the headings, clear the code planes, and follow the camera without new cropping or jumps. Labels
and default/optional qualifications remain readable. No introduced P0/P1 found. Weakest detail:
the commit symbol is less apparent than the other two because its simple geometry is mostly
covered by the heading; accepted as a quiet background mark rather than increasing its weight.
Phone-size diagnostic detail still belongs to the existing readable transcript.

The user approved rendering for PR review only, not merging. The replacement web MP4 is
3,699,058 bytes, H.264/AAC, 30 fps, 930 frames, exactly 31.000 s; audio and video both start at 0.
Measured audio: −14.56 LUFS, −1.27 dBTP, no clipping. Encoded AAC packet SHA-256 is identical to the
previous shipped film (5d844e918caa9b9a8093ba58f53331f2695f84cf14db1730c9809948ff8a1e64),
confirming the soundtrack did not change. Sound was measured, not listened to.

Opened the three-proof-frame contact sheet decoded from the new web MP4 and the full-resolution
18.5 s PR frame. All three marks survive compression without overpowering the headings; copy,
qualifications and layering match the approved preview. The unchanged title-frame poster is
retained because 7.3 s precedes this scene. The master rendered in 24.6 s with screenshot capture
and software GPU. The source player answers HTTP 200 on port 4397. HyperFrames usage remains
unknown (unsupported_harness). The replacement MP4 is included only in this PR; production remains
unchanged until a later authorized merge. This PR must remain unmerged for the user's review.

Independent advisor (sae4b5561): ship-for-source-preview, no introduced P0/P1. The motifs remain
subordinate and topic-consistent, titles and qualifications stay legible above the SVGs, and both
camera-move sheets show no problematic cropping or neighbor bleed. This verdict does not approve
a render, audition sound, verify a new encode, or approve the whole film.
