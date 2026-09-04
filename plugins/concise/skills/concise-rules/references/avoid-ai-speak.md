# Avoid AI speak

Agent reference for the concise plugin's em dash check and AI writing check. House rules from Ryan Yannelli's writing voice (100+ documents from the past 15 years reviewed for patterns). Additional pattern catalog adapted from avoid-ai-writing by Conor Bronsdon (MIT).

## When this applies

Your `Write`, `Edit`, `MultiEdit`, `apply_patch`, `gh` call, `git commit`, or final reply was denied with a `[concise]` message ending in `Reference: <path>/avoid-ai-speak.md` or `Reference: <path>/ai-speak-patterns.md`. The hook scanned the text you were about to send: a prose file whole (fenced blocks, inline code, URLs, and HTML comments blanked first), a code file's comment runs, the `gh` body, the commit message, or the reply text. It found an em dash, an en dash, a double hyphen, or a hit from one of 44 pattern categories.

You have 2 options: send the identical write again to keep the text, or rewrite the flagged line and send the new text. `mode` decides how the hook responds. `confirm` (the default) denies once and accepts the identical retry. `ask` hands the decision to the user on `PreToolUse`, and behaves as `confirm` on `Stop`. `deny` denies until `maxRetries` is passed, then allows the write and flags it.

## The decision

Keep the text only when you can name why the flagged form is the correct one for that document. A quotation, an identifier, a command, a path, an error string, a product name, and a contrast that carries the point of the sentence all qualify. If you cannot name the reason, fix the line.

## Rules

- Em dash and en dash: replace with a comma, a period, a colon, parentheses, or two sentences. Ranges use "to" or a plain hyphen (20-35 hours).
- State the fact instead of interpreting it.
- Concrete subject, ordinary verb. Name the component, the vendor, the person, or the condition.
- Write claims as "X does Y".
- No `X, not Y` and no `it is not X, it is Y` unless the contrast is the point of the sentence.
- Digits for money, percentages, dates, times, measurements, versions, counts, and technical values.
- Match the verb to the evidence: observed, determined, measured, calculated, estimated, planned, unknown, unchecked.
- Say which check did not run instead of filling the gap.
- Invent nothing to sound better: no number, example, credential, or first person that the source did not carry.
- Do not chop a sentence into fragments to remove a dash. Vary sentence length by varying the sentences.
- No slogan ending, no offer to help, no question fishing for a reply.

## Categories

| id | What it catches | Fix | Presets |
|---|---|---|---|
| `vocabulary` | frequency markers such as `delve`, `robust`, `landscape`, `load-bearing` | use the plain word | `default`, `ryan`, `technical`, `all` |
| `wordiness` | long forms such as `utilize`, `in order to` | use the short form | `ryan`, `ste`, `all` |
| `transitions` | openers such as `Moreover`, `In today's` | cut it, state the point | `default`, `ryan`, `technical`, `all` |
| `filler` | padding such as `truly`, `at its core` | cut it, state the point | `default`, `ryan`, `technical`, `all` |
| `hedging` | softeners such as `perhaps`, `generally` | cut it, or name the exception | `ryan`, `ste`, `all` |
| `chatbot` | chat phrases such as `Great question`, `Kindly` | delete the line | `default`, `ryan`, `technical`, `minimal`, `all` |
| `sycophancy` | praise such as `You're absolutely right` | delete it, give the fix | `default`, `ryan`, `technical`, `minimal`, `all` |
| `contrast` | the `it is not X, it is Y` and `X, not Y` shapes | state the positive claim | `default`, `ryan`, `technical`, `all` |
| `copula` | interpretation verbs such as `serves as`, `boasts` | say what it does | `ryan`, `ste`, `all` |
| `inflation` | significance claims such as `game-changer` | state what changed | `default`, `ryan`, `technical`, `all` |
| `closers` | endings such as `In conclusion`, `Stay tuned` | end on the last fact | `default`, `ryan`, `technical`, `all` |
| `structure` | frames such as `Ever wondered`, `Picture this` | answer it, give the result | `default`, `ryan`, `technical`, `all` |
| `formatting` | emoji in a heading, 3 bold spans in a paragraph | remove the emoji and the bold | `default`, `ryan`, `all` |
| `ste` | words outside ASD-STE100 such as `ensure` | use the approved word | `ste`, `all` |
| `negative-parallelism` | chains such as `not X, not Y, but Z` | state the claim | `default`, `ryan`, `technical`, `all` |
| `overgeneralization` | universal claims such as `everyone knows` | name who, or name the case | `default`, `ryan`, `technical`, `all` |
| `false-ranges` | spans such as `everything from X to Y` | list the items | `default`, `ryan`, `technical`, `all` |
| `promotional` | marketing words such as `turnkey`, `supercharge` | state the measured property | `default`, `ryan`, `technical`, `all` |
| `vague-attribution` | unnamed sources such as `studies show`, `experts say` | name the source | `default`, `ryan`, `technical`, `all` |
| `outline-conclusion` | a closing paragraph that repeats the headings | end on the last fact | `ryan`, `all` |
| `elegant-variation` | rotating synonyms such as `the aforementioned` | reuse the one name | `ryan`, `all` |
| `undue-emphasis` | stress such as capitals and stacked intensifiers | state the fact once | `ryan`, `all` |
| `superficial-analysis` | empty judgments such as `speaks volumes` | give the evidence | `ryan`, `all` |
| `rule-of-three` | triads of adjectives, nouns, clauses, or bullets | keep the items that matter | `ryan`, `all` |
| `parallel-bullets` | bullets sharing one shape or first word | vary or merge the items | `ryan`, `all` |
| `ai-tool-mention` | process talk such as `as requested by the user`, tool names in commits | describe the change | `default`, `ryan`, `technical`, `git`, `all` |
| `ai-identity` | a commit author or committer naming an AI | commit as the human author | `default`, `ryan`, `technical`, `minimal`, `git`, `all` |
| `ai-attribution` | trailers such as `Co-authored-by: Claude` | remove the trailer | `default`, `ryan`, `technical`, `minimal`, `git`, `all` |
| `praise-sandwich` | praise, critique, praise in a review | state the critique | `ryan`, `git`, `all` |
| `file-narration` | narration such as `This PR introduces` | state what changed and why | `ryan`, `technical`, `git`, `all` |
| `benefit-tail` | tails such as `, which improves readability` | cut the tail, or measure it | `ryan`, `technical`, `git`, `all` |
| `canned-review` | review phrases such as `LGTM with minor nits` | name the finding | `default`, `ryan`, `technical`, `git`, `all` |
| `smart-punctuation` | curly quotes and the ellipsis character outside prose files | use ASCII punctuation | `default`, `ryan`, `technical`, `all` |
| `unicode-glyphs` | arrows, box drawing, check marks in commits, PR bodies, commands, and replies | use ASCII such as `->` and `[x]` | `default`, `ryan`, `technical`, `all` |
| `readability-grade` | Flesch-Kincaid grade above 16 | shorter sentences and words | `ryan`, `statistical`, `all` |
| `sentence-variation` | sentence lengths that hardly vary | vary the sentence length | `ryan`, `statistical`, `all` |
| `transition-density` | more than 30% of sentences opening on a connector | cut the connectors | `ryan`, `statistical`, `all` |
| `passive-voice` | more than 30% passive sentences | name the actor | `ryan`, `statistical`, `all` |
| `paragraph-coherence` | uniform paragraph lengths or repeated openers | vary the paragraphs | `ryan`, `statistical`, `all` |
| `lexical-diversity` | a low type-token ratio | vary the words | `statistical`, `all` |
| `word-frequency` | one content word above 3.5% of the tokens | vary or cut the word | `statistical`, `all` |
| `rare-words` | more than 25% long, rare words | use the short word | `statistical`, `all` |
| `punctuation-patterns` | 4 of 5 formal punctuation signals | write as you would say it | `statistical`, `all` |
| `terminal-punctuation` | every short list item ending with a period | drop the periods on fragments | `statistical`, `all` |

The full phrase list and the replacement for each phrase are in [ai-speak-patterns.md](ai-speak-patterns.md) and its numbered parts, generated from the pack files. The `ste` rules and word tables are in [simplified-technical-english.md](simplified-technical-english.md).

## Presets

- `default`: general prose. `vocabulary`, `transitions`, `filler`, `chatbot`, `sycophancy`, `contrast`, `inflation`, `closers`, `structure`, `formatting`, `negative-parallelism`, `overgeneralization`, `false-ranges`, `promotional`, `vague-attribution`, `ai-tool-mention`, `ai-identity`, `ai-attribution`, `canned-review`, `smart-punctuation`, and `unicode-glyphs`.
- `ryan`: every category except `ste` and the five statistics-only ones (`lexical-diversity`, `word-frequency`, `rare-words`, `punctuation-patterns`, `terminal-punctuation`). The house rules in this file.
- `technical`: `default` minus `formatting`, plus `file-narration` and `benefit-tail`, with an allow list of `robust`, `comprehensive`, `seamless`, `ecosystem`, `leverage`, `facilitate`, `underpin`, and `streamline`. For docs and code comments where those words carry a measured meaning.
- `ste`: `wordiness`, `hedging`, `copula`, `ste`. For maintenance procedures, work instructions, and text written for translation.
- `minimal`: `chatbot`, `sycophancy`, `ai-identity`, `ai-attribution`.
- `git`: the seven commit, PR, and review categories from `ai-tool-mention` to `canned-review`.
- `statistical`: the ten text statistics categories from `readability-grade` to `terminal-punctuation`.
- `all`: every category, `ste` included.

Preset membership is declared in each pack file under `hooks/lib/patterns/`. A project adds its own packs under `.claude/concise/patterns/` and drops a built-in one with `excludePacks`; the pack format is in `docs/packs.md`.

## Editing procedure when denied

1. Read the reason. It names the path or the label (`PR body`, `issue body`, `commit message`, `your reply`), the line, the flagged text, the category, and the fix. Up to 5 findings are printed; the count of the rest follows as `+N more`.
2. Find that line in the text you were writing.
3. Apply the replacement from the category section in `ai-speak-patterns.md`.
4. Re-read the rewritten sentence for a new flagged phrase. A rewrite that drops `delve` and adds `dive into` is denied again.
5. Send the corrected write.

To keep the text instead, send the identical text once more. The hook lets it through and flags it as `[concise] Kept after confirmation: <summary>`, which the user sees. A third identical write starts a new episode and is denied again.

## Checklist

1. Zero em dashes and en dashes.
2. Ranges use "to" or a plain hyphen.
3. Every sentence has a concrete subject and an ordinary verb.
4. Claims read as "X does Y".
5. Digits for money, dates, measurements, versions, and counts.
6. The verb matches the evidence, and unchecked things are named as unchecked.
7. Nothing added that the source did not carry.
8. No filler opener, no slogan ending, no offer to help.
9. Every flagged word you quote sits inside backticks or a fenced block.
10. The last line is the last fact.

## Examples

Every `Bad:` line sits inside backticks, so this file passes its own scan.

Bad: `The parser — which runs first — rejects the file.`
Good: The parser runs first, then it rejects the file.

Bad: `The backoff window is 20–35 seconds.`
Good: The backoff window is 20 to 35 seconds.

Bad: `This isn't a config change, it's a rewrite of the loader.`
Good: The change rewrites the loader.

Bad: `The hook scans the written text, not the file on disk.`
Good: The hook scans the written text (file on disk is never read).

Bad: `The configuration serves as the source of truth for the application.`
Good: The application reads this configuration at startup.

Bad: `The retry loop is designed to help the sender recover.`
Good: The sender retries 3 times with a 2 second base delay.

Bad: `Great question! I hope this helps, and feel free to reach out.`
Good: Delete the line.

Bad: `In conclusion, the migration is complete and the future looks bright.`
Good: The migration finished 03/07/2026. 2 tables were skipped and are still on the old host.

Bad: `Note that this could potentially break the build in some cases.`
Good: This breaks the build when `NODE_ENV` is unset.

Bad: `This release marks a pivotal step forward for the parser.`
Good: The parser now accepts nested arrays.

Bad: `We leverage a robust, comprehensive pipeline to delve into the data.`
Good: The pipeline reads the data with 3 workers and retries a failed row twice.

Bad: `Let's dive in. Here's the thing: the fix is straightforward.`
Good: The fix changes one line in `hooks/lib/config.mjs`.
