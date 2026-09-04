# Categories

The `aiWriting` feature ships 44 categories. Each category is one pack file under `hooks/lib/patterns/`. This page lists every category, the presets that turn it on, and the scopes it runs in.

Pick categories with `features.aiWriting.preset`, or replace the preset list with `features.aiWriting.categories`. Both keys are described in [configuration.md](configuration.md). The flagged text and the replacement for every pattern are in [../skills/concise-rules/references/ai-speak-patterns.md](../skills/concise-rules/references/ai-speak-patterns.md).

Scope names: `files` (prose files), `comments` (comment runs in code files), `gh` (`gh pr` and `gh issue` bodies), `commit` (`git commit` messages), `command` (the full command line), `reply` (the agent's final reply).

## Phrase categories

Scopes across this group: `files`, `comments`, `gh`, `commit`, `reply`. The scope column below gives the scopes for each category.

| id | What it catches | Flagged example | Fix | Presets | Scopes |
|---|---|---|---|---|---|
| `chatbot` | Assistant boilerplate that belongs to a chat window. | `Great question` | delete the line | `default`, `ryan`, `technical`, `minimal`, `all` | `files`, `comments`, `gh`, `commit`, `reply` |
| `closers` | Endings that restate the text instead of stopping. | `In conclusion` | end on the last fact | `default`, `ryan`, `technical`, `all` | `files`, `comments`, `gh`, `commit`, `reply` |
| `contrast` | Frames that define the subject by what it is not. | `it's not a config change, it's a rewrite` | state the positive claim | `default`, `ryan`, `technical`, `all` | `files`, `comments`, `gh`, `commit`, `reply` |
| `copula` | Verbs that interpret the subject instead of naming what it does. | `serves as` | say what it does | `ryan`, `ste`, `all` | `files`, `comments`, `gh`, `commit`, `reply` |
| `filler` | Openers and asides that carry no fact. | `at its core` | cut it, state the point | `default`, `ryan`, `technical`, `all` | `files`, `comments`, `gh`, `commit`, `reply` |
| `formatting` | Emoji and bold runs used as structure. | an emoji in a heading | remove the emoji | `default`, `ryan`, `all` | `files`, `gh`, `commit`, `reply` |
| `hedging` | Qualifiers that leave the claim unowned. | `note that` | cut it, state the fact | `ryan`, `ste`, `all` | `files`, `comments`, `gh`, `commit`, `reply` |
| `inflation` | Wording that makes a change sound larger than it is. | `a significant step forward` | state what changed | `default`, `ryan`, `technical`, `all` | `files`, `comments`, `gh`, `commit`, `reply` |
| `ste` | Word choices from Simplified Technical English. | `ensure` | use the approved word | `ste`, `all` | `files`, `comments`, `gh`, `commit`, `reply` |
| `structure` | Openers and frames that delay the point. | `Picture this:` | state the fact | `default`, `ryan`, `technical`, `all` | `files`, `comments`, `gh`, `commit`, `reply` |
| `sycophancy` | Praise aimed at the reader instead of the work. | `You're absolutely right` | delete it, give the fix | `default`, `ryan`, `technical`, `minimal`, `all` | `files`, `comments`, `gh`, `commit`, `reply` |
| `transitions` | Connectors and scene setters that add length without adding a fact. | `Moreover` | cut it, or use `and` | `default`, `ryan`, `technical`, `all` | `files`, `comments`, `gh`, `commit`, `reply` |
| `vocabulary` | Words that appear far more often in model output than in human writing. | `delve` | `look at`, `examine` | `default`, `ryan`, `technical`, `all` | `files`, `comments`, `gh`, `commit`, `reply` |
| `wordiness` | Long forms of short words. | `in order to` | `to` | `ryan`, `ste`, `all` | `files`, `comments`, `gh`, `commit`, `reply` |

## Rhetorical categories

Scopes across this group: `files`, `comments`, `gh`, `commit`, `reply`. The scope column below gives the scopes for each category.

| id | What it catches | Flagged example | Fix | Presets | Scopes |
|---|---|---|---|---|---|
| `elegant-variation` | Rotating synonyms for one referent instead of repeating the name. | `aforementioned` | name it again | `ryan`, `all` | `files`, `gh`, `reply` |
| `false-ranges` | A "from X to Y" span whose endpoints share no real scale. | `everything from X to Y` | list the items | `default`, `ryan`, `technical`, `all` | `files`, `comments`, `gh`, `reply` |
| `negative-parallelism` | A chain of two or more negated clauses resolved by one affirmation. | `not X, not Y, but Z` | state the one claim | `default`, `ryan`, `technical`, `all` | `files`, `comments`, `gh`, `reply` |
| `outline-conclusion` | A closing paragraph that re-lists the section headings instead of adding a new fact. | a closing paragraph that re-lists 3 headings | end on the last fact | `ryan`, `all` | `files`, `gh`, `reply` |
| `overgeneralization` | A universal claim about people or the industry with no source. | `everyone knows` | name who | `default`, `ryan`, `technical`, `all` | `files`, `comments`, `gh`, `reply` |
| `parallel-bullets` | A bulleted list where every item shares one rigid shape. | 3 bullets that open on the same word | vary or merge the items | `ryan`, `all` | `files`, `gh`, `reply` |
| `promotional` | Marketing language for a technical change. | `supercharge` | name the effect | `default`, `ryan`, `technical`, `all` | `files`, `gh`, `commit`, `reply` |
| `rule-of-three` | Triads of adjectives, nouns, or clauses used past the point of restraint. | 3 triads in one text | keep the items that matter | `ryan`, `all` | `files`, `comments`, `gh`, `reply` |
| `superficial-analysis` | A significance claim with no evidence behind it. | `cannot be overstated` | state the fact plainly | `ryan`, `all` | `files`, `gh`, `reply` |
| `undue-emphasis` | Intensifiers, stacked qualifiers, or markup used to manufacture stress. | `extremely` | cut it | `ryan`, `all` | `files`, `comments`, `gh`, `commit`, `reply` |
| `vague-attribution` | A claim attributed to an unnamed authority. | `studies show` | cite the study | `default`, `ryan`, `technical`, `all` | `files`, `gh`, `reply` |

## Commit and review categories

Scopes across this group: `comments`, `gh`, `commit`, `command`, `reply`. The scope column below gives the scopes for each category.

| id | What it catches | Flagged example | Fix | Presets | Scopes |
|---|---|---|---|---|---|
| `ai-attribution` | A commit or PR trailer credits an AI tool as co-author, generator, or signer. | `Co-authored-by: Claude` | drop the trailer | `default`, `ryan`, `technical`, `minimal`, `git`, `all` | `commit`, `gh`, `command` |
| `ai-identity` | The commit author or committer field names an AI tool instead of a person. | `GIT_AUTHOR_NAME=Claude Code` | use a human author name | `default`, `ryan`, `technical`, `minimal`, `git`, `all` | `command` |
| `ai-tool-mention` | Names of AI coding tools, or the agent narrating its own process instead of the change. | `as requested by the user` | state the change | `default`, `ryan`, `technical`, `git`, `all` | `commit`, `gh`, `comments`, `command` |
| `benefit-tail` | A sentence ends in a justification clause tacked on after a comma. | `, which improves readability` | cut the clause | `ryan`, `technical`, `git`, `all` | `commit`, `gh`, `comments`, `reply` |
| `canned-review` | Stock PR-review phrasing used regardless of what the diff actually does. | `LGTM with minor nits` | name the finding | `default`, `ryan`, `technical`, `git`, `all` | `gh`, `reply` |
| `file-narration` | Text narrates a trivial file operation instead of stating the change. | `This PR introduces` | state what changed | `ryan`, `technical`, `git`, `all` | `commit`, `gh`, `reply`, `comments` |
| `praise-sandwich` | Review or reply text opens and closes with praise around a middle critique. | praise, critique, praise over 3 paragraphs | state the critique | `ryan`, `git`, `all` | `gh`, `reply` |

## Punctuation categories

Scopes across this group: `comments`, `gh`, `commit`, `command`, `reply`. The scope column below gives the scopes for each category.

| id | What it catches | Flagged example | Fix | Presets | Scopes |
|---|---|---|---|---|---|
| `smart-punctuation` | Curly quotes and the ellipsis character typical of text pasted from a chat UI. | a curly apostrophe | use a straight apostrophe | `default`, `ryan`, `technical`, `all` | `comments`, `commit`, `gh`, `command`, `reply` |
| `unicode-glyphs` | Arrows, box drawing, dingbats, and geometric symbols used in place of plain ASCII or words. | an arrow character | use `->` | `default`, `ryan`, `technical`, `all` | `commit`, `gh`, `command`, `reply` |

## Text statistics categories

Scopes across this group: `files`, `gh`, `reply`. The scope column below gives the scopes for each category.

| id | What it catches | Flagged example | Fix | Presets | Scopes |
|---|---|---|---|---|---|
| `lexical-diversity` | Flags text that reuses the same words instead of varying vocabulary. | type-token ratio under 0.55 | vary the words | `statistical`, `all` | `files`, `gh`, `reply` |
| `paragraph-coherence` | Flags formulaic paragraphs: near-identical lengths, repeated opening words, or repeated topic sentences. | 5 paragraphs of near-equal length | vary the paragraphs | `ryan`, `statistical`, `all` | `files`, `gh`, `reply` |
| `passive-voice` | Flags text where passive voice runs past a third of the sentences. | passive voice over 30% of sentences | name the actor | `ryan`, `statistical`, `all` | `files`, `gh`, `reply` |
| `punctuation-patterns` | Flags punctuation habits that agree: colon and semicolon rate, no exclamations, a uniform Oxford comma, no sentence-initial conjunctions. | 4 of 5 punctuation signals agree | write as you would say it | `statistical`, `all` | `files`, `gh`, `reply` |
| `rare-words` | Flags text with an unusually high share of long, low-frequency words. | over 25% long, rare words | use the short word | `statistical`, `all` | `files`, `gh`, `reply` |
| `readability-grade` | Flags text with a Flesch-Kincaid grade level above what technical writing needs. | Flesch-Kincaid grade over 16 | shorter sentences and words | `ryan`, `statistical`, `all` | `files`, `gh`, `reply` |
| `sentence-variation` | Flags text where every sentence runs about the same length. | sentence-length variation under 0.35 | vary the sentence length | `ryan`, `statistical`, `all` | `files`, `gh`, `reply` |
| `terminal-punctuation` | Flags list items that all carry a trailing period even though they read as short fragments. | 8 short list items that all end in a period | drop the periods on fragments | `statistical`, `all` | `files`, `gh` |
| `transition-density` | Flags text where too many sentences open on a transition or connector word. | over 30% of sentences opening on a connector | cut the connectors | `ryan`, `statistical`, `all` | `files`, `gh`, `reply` |
| `word-frequency` | Flags text that leans on one favorite word far more than natural word spread predicts. | one content word over 3.5% of the words | vary or cut the word | `statistical`, `all` | `files`, `gh`, `reply` |

The `emDash` feature has its own category, `em-dash`, in `hooks/lib/patterns/prose/em-dash.json`. No preset controls it. `features.emDash.enabled` does.
