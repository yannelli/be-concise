# SPEC: Concise promo (storyline D, "The wall, in depth")

GOAL:    A developer feels the noise of agent-speak, then the relief of one plugin that checks every
         write first, and leaves knowing the install command.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps (31 s). MP4 (H.264 + AAC) for the homepage.
TIME:    31.0 s x 30 = 930 frames. 120 BPM, 15 frames a beat, 60 frames a bar (2.0 s).
         Measured attacks are about 40–50 ms after n x 0.5 s, not on a zero-phase grid.
         Visible cue frames follow those attacks: stroke f181, proof f241, camera moves
         f361–376 and f496–511, console settled f661, end square locked f856.
         Denial cues retain their original absolute times. Comment and commit repairs arrive
         earlier to preserve reading time before the faster, beat-aligned camera moves.
         (Re-timed from 30 s after the first check: the denial lines need ~3.5 s each to be read.)
LOOK:    Two worlds, one palette (the site's own tokens):
         - Noise world: ground ink #18191D, full bleed, filled edge to edge with type (never a void).
           Phrases in #F7F7F5; depth haze = opacity 1.0 at z 0 down to 0.18 at z -6000, plus
           depth-of-field blur 0 px in the focus band (z -400…+200), up to 14 px far and 24 px near.
         - Clean world: ground #F7F7F5, ink #18191D, muted #60615F. Code planes #18191D, radius 24 px,
           code ink #ECEEE8, code muted #A3A69E.
         - Accent #FF4A24 only on: what Concise flags (underline, the denial square), the stroke,
           the mark's square. Never on a whole word of a title.
         Display: Jost (self-hosted variable woff2) weight 550, tracking -0.04em; titles 104–210 px.
         Proof grid, equal at 120 px: margin 120 | label 490 | gutter 120 | card 1070 | margin 120.
         Labels y 340, heading 112/0.92, subtitle 42/1.15, gap 24 px. Commit card centred (y 352).
         Opening, proof, console and claim share the x 120 left anchor (console command right 120);
         claim leading 0.94.
         Proof motifs: hand-drawn wide bands, stroke #EEEFEB on #F7F7F5, round caps, bleeding off
         the frame edges and painted behind the labels and cards: "//" (two 170 px slashes),
         a commit lane through two rings (120 px), a pull-request branch turning back to its base
         lane with an arrowhead (120 px).
         Body/label: Jost 400–500, 40–48 px. Code: IBM Plex Mono 400, 34 px (never under 28 px).
         No shadows, no glow, no gradients, no grain. Depth comes only from perspective (1400 px),
         scale, haze and blur.
OBJECTS: - Agent-speak phrases: real strings from Concise's pattern references ("It is important to
           note that", "delve", "leverage", "I hope this helps!", "Great question!", "In conclusion",
           "seamless", "robust", "game-changer", "testament to", "Certainly!", "cutting-edge",
           "pivotal", "Let me know if", "Happy coding", "embark", "tapestry", "comprehensive").
         - Code plane: a dark editor slab with a file path line (src/invoice.ts) and real lines.
         - Terminal plane: a dark slab with a "$" prompt.
         - PR plane: white #FFFFFF slab, radius 24, PR title in Jost 550 48 px, body in Jost 400 36 px.
         - Denial line: orange square (24 x 18 px, radius 4, the mark's square in miniature) then
           the real hook text in Plex Mono 30 px, #FF4A24 on dark, #B52E10 on light.
         - Console: the real concise-web dark screenshots (activity, overview, configuration,
           playground, rules; 2880 x 1800 shown 1:1), each cropped to one panel.
         - Mark: the repository's icon paths (ink chevron, orange square).
         - Proof motifs: original geometry drawn for this film (no icon library) on a deeper plane
           (z -400, scaled 9/7 back to full frame) so camera moves show parallax; a slow 60–80 px
           drift per station. aria-hidden; text stays layout-audited above them.
         - Strike: the stroke in miniature (6 px #FF4A24 bar) drawn through rejected comment lines.
         All hook text is real output from plugins/concise/hooks on the billing-api session (a41c):
           comment: [concise] Comment at ~/code/billing-api/src/invoice.ts:1 is 4 lines (limit 2).
           commit:  [concise] 3 AI writing patterns in commit message.
                    [concise:vocabulary] 3 matches at line 1: "Leverage" (use); "robust" (reliable…);
                    "seamless" (works without X, name X).
           PR:      [concise] PR/issue body is too verbose: 3 prose paragraphs (limit 1), use short
                    bullets instead.
MOTION:  enter = expo.out (arrivals, slams 0.35 s), move = power2.inOut (camera 0.5 s),
         exit/zoom-through = power3.in (0.3–0.5 s). No springs.
         Title words rise 60–70 px with blur 8 → 0 (expo.out 0.3–0.45 s), dead still once landed.
         Exits 40–50 % shorter than entrances. Camera moves are whips (expo.inOut 0.5 s, blur peak
         16 px). Denials punch their card (scale 1.035 → 1, decaying 12 px shake over 4 frames) and
         dim to 40 % about a second after the repair lands. The bed's breaks (13–14, 21–22, 28+)
         carry the held breaths; its re-entries (14.0, 22.0) carry the payoffs.
SHOTS:   (global time; frame = t x 30)
  1  0.0–3.0   NOISE / flight. Camera z 0 → 4200 (power1.out: fastest at frame 0). 64 phrases at
               z -100…-12500 around the vanishing point; near ones pass the lens blurred.
               Frame 0 = a full frame of type. Sound: whoosh-cinematic swell.
  2  3.0–6.0   WALL. Camera settles. 22 phrases slam to the wall plane: frames 90, 105, 120, then
               the barrage accelerates from 4.5 s with gaps of 7, 6, 5, 4, 3, 3, 2, 2, 2 frames and
               then one frame apart until f178. Each slam pushes earlier layers 70 px back and 10 %
               darker (floor 16 %). 4.5–6.0 the tunnel surges again (z 4200 → 7600, power3.in), the
               wall scales 1 → 1.22 (power3.in) and a deterministic shake rises to 14 px over the
               last 30 frames, zeroed at 6.0. The music's one-beat stop (5.55–5.97) is unchanged.
  3  6.0–8.033 STROKE / reveal. 6.0 orange bar (22 px) wipes across y 540 in 0.18 s; 6.1 the wall's
               halves fly up/down and back (z -1400, rotX ±28°, blur 16 px, 0.55 s power3.in); the slit
               floods to #F7F7F5 (0.4 s). 6.45–6.85 the bar shrinks into the full stop after "first".
               6.55 "Concise checks it first" (180 px, one line ending at x 1754) per word.
               7.7 fly through the title (power3.in).
               Sound: impact-bass-1 on 6.0, the drop, whoosh on the split, whoosh into 8.0.
  4  8.033–12.033 COMMENT station. "Comments" / "Default: 2 lines." Code plane (34 px mono):
               src/invoice.ts, 4 comment lines + code arrive by 9.0; 9.2 the real denial (pop);
               10.033 (f301) the stroke strikes all four comment lines; 10.2 they fly at the lens
               (scale 1.4, blur), clipped by the card; the code and denial rise 156 px, the slab
               shortens; 10.47 "// Amounts are integer cents; never floats." Denial dims at 11.0.
  5 12.033–16.533 COMMIT station (camera move f361–376, whoosh). git commit -m "Leverage a robust,
               seamless approach to streamline invoice rounding"; 13.2 orange underlines (click);
               13.5 denial (ping), all in the bed's 13–14 s break; 14.033 (f421, the re-entry) the three
               flagged words blow out (scale 2.2, ±rotation, blur) and the rest of the line vanishes;
               14.533 (f436) "Round invoice totals to whole cents" types in (steps, 0.45 s, typing SFX).
               Subtitle: "Optional style checks." / "Off by default."
  6 16.533–21.0 PR station (camera move f496–511). PR "Round invoice totals", 3 paragraphs; 17.5
               denial (pop); 18.36 the paragraphs are crushed into the first line (power4.in 0.18 s);
               18.533 (f556) the one-line body slams in. Denial dims at 20.6 (its 3.1 s reading floor); the pull-back creeps from 20.3.
               Subtitle: "Default: 1 paragraph," / "3 sentences." Riser from 17.65.
  7 21.0–26.0  CONSOLE / payoff on the accent ground. 21.0 the stations recede, orange floods in
               from the right and completes at 21.37. The real Live activity screenshot rises from
               z -3000 at 21.5, opaque by 21.533, settled at 22.033 (f661). impact-bass-1 starts 21.423,
               with its measured peak near 21.5, replacing the earlier two-stage impact.
               "Watch every check." (104 px) + "concise-web --all" (38 px mono).
               The activity view holds two beats, pushing 1.00 → 1.10 toward its findings; then hard cuts
               one per beat (f691, 706, 721, 736; soft click each) to Overview, Configuration, Playground
               and Rules & usage, each punching 1.07 → 1 and drifting.
  8 25.3–28.0  CLAIM. Flood up to #F7F7F5, done on the 25.53 beat. "Your agent." / "Less verbose."
               210 px at x 120, one word per beat (f766, 781, 796, 811), slammed 1.3 → 1, dead still.
               27.967 the stroke returns across y 540 and the two lines split up/down (blur 14 px).
  9 28.0–31.0  END CARD. The bar shrinks into the mark's square (measured 783,395, 26 x 19) and locks
               on 28.533 (f856, impact-bass-1); the ink is drawn leftward out of the square from that
               frame and "concise" wipes 0.1 s later; 28.8 the command
               "/plugin install concise@be-concise" in a dark slab, 28.9 "github.com/yannelli/be-concise".
               Held to 31.0.
BANNED:  a dark void with small floating things (the noise world is always full of type);
         glow, bloom, particles, lens flares; gradients; glass; drop shadows;
         cream-paper + serif + italic accents; monospace caps labels; numbered labels; pill chips;
         everything centred (only the end card is centred); every element fading + sliding up;
         titles moving while read; three cards in a row; a title over a dimmed screenshot;
         product UI tilted in 3D at rest (planes face the camera whenever text is read);
         the logo docked in a corner; invented UI, invented numbers.
QA:      0.0 thumbnail full of type · 2.0 flight · 5.6 solid wall · 6.25 split mid-flight ·
         7.3 title + square · 9.6 comment denial · 11.2 comment fixed · 13.9 commit denial ·
         15.6 commit fixed · 17.8 PR denial · 19.9 PR fixed · 22.5 console activity · 24.5 overview ·
         26.8 claim · 30.5 end card. Every read line ≥ 28 px at 1080p. Phone titles must read;
         diagnostic/code detail remains available in the homepage transcript.
