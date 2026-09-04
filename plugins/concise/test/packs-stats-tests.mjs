#!/usr/bin/env node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ok, bad, withConfig, run, CHECK_EDIT, assertDenied, assertAllowed } from "./lib.mjs";
import { makeStats } from "../hooks/lib/text-stats.mjs";
import { stripCode } from "../hooks/lib/prose.mjs";
import lexicalDiversity from "../hooks/lib/patterns/ai/lexical-diversity.mjs";
import wordFrequency from "../hooks/lib/patterns/ai/word-frequency.mjs";
import rareWords from "../hooks/lib/patterns/ai/rare-words.mjs";
import paragraphCoherence from "../hooks/lib/patterns/ai/paragraph-coherence.mjs";

const dirs = [];
let seq = 0;

/** One tmp project per case, so the retry counter of one case cannot reach the next. */
export function project(ai = {}) {
  const dir = mkdtempSync(join(tmpdir(), "concise-stats-"));
  dirs.push(dir);
  withConfig(dir, { features: { aiWriting: { enabled: true, preset: "statistical", ...ai } } });
  seq += 1;
  return { dir, sid: `stats-${process.pid}-${seq}` };
}

export const cleanup = () => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));

export const writeEvent = ({ dir, sid }, name, content) => ({
  tool_name: "Write",
  tool_input: { file_path: join(dir, name), content },
  cwd: dir,
  session_id: sid,
});

const reasonOf = (result) => result.hookSpecificOutput?.permissionDecisionReason || result.systemMessage || "";

export function includes(name, result, needle) {
  if (reasonOf(result).includes(needle)) return ok(name);
  bad(name, `expected ${JSON.stringify(needle)} in ${JSON.stringify(reasonOf(result)).slice(0, 300)}`);
}

/** The machine text denies and names the measure, the human text stays clean. */
export function endToEnd(id, positive, negative, needle) {
  const denied = run(CHECK_EDIT, writeEvent(project(), `${id}.md`, positive));
  assertDenied(`${id} denies the machine text`, denied);
  includes(`${id} reports its measure`, denied, needle);
  assertAllowed(`${id} allows the human text`, run(CHECK_EDIT, writeEvent(project(), `${id}-ok.md`, negative)));
}

export function unit(pack, raw, shape) {
  const name = `${pack.id} match reads "<metric> <value> over <n> <unit> (<limit>)"`;
  const text = stripCode(raw);
  const hits = pack.detect(text, { path: "d.md", scope: "files", options: pack.options, stats: makeStats(text) });
  if (hits.length !== 1) return bad(name, `expected 1 finding, got ${hits.length}`);
  const { match, fix } = hits[0];
  if (!shape.test(match)) return bad(name, `match ${JSON.stringify(match)} does not fit ${shape}`);
  if (match.length >= 80) return bad(name, `match is ${match.length} characters`);
  if (fix.split(" ").length >= 8) return bad(name, `fix is ${fix.split(" ").length} words`);
  ok(name);
}

console.log("\npattern packs (statistical, vocabulary and paragraphs)");

const LEXICAL_DIVERSITY_POS = `I want to help you with your request. My goal is to help you fix this properly, and I think the best way to help you
here is to break the problem into steps so I can help you understand what went wrong. First, let's make sure the
setup is correct. Then let's make sure the config is correct. Then let's make sure the tests pass. If everything
checks out, I'll make sure the deploy step is correct too. Let me know if this helps, and let me know if you need
more help after that, because I am happy to help further. This should help resolve the issue you were having, and it
should help going forward as well.

- use the tool to fix the bug
- use the tool to fix the config
- use the tool to fix the tests
- use the tool to fix the docs
- use the tool to fix the build`;

const LEXICAL_DIVERSITY_NEG = `Water boils at a lower temperature at altitude because atmospheric pressure drops. In Denver, roughly a mile up,
that shift is enough to change how long pasta needs to cook. Recipes written at sea level often undercook rice or
beans in the mountains unless you add a few extra minutes or switch to a pressure cooker, which restores something
close to sea-level conditions inside the pot.

- Fix the null pointer in the parser
- Add a retry with backoff on the upload
- Rename \`tmp\` to \`staging\` across the config
- Drop the unused \`legacy_id\` column
- Bump the timeout from 5s to 30s

Jazz drummers rarely play the same fill twice in a set. Even within one song, a player will vary stick height,
ghost-note placement, and where the accent lands relative to the beat. That unpredictability is part of what
separates a live recording from a quantized drum machine track, where every hit lands on the same grid with the same
velocity.`;

const WORD_FREQUENCY_POS = `Our platform delivers value to customers by focusing on value at every layer of the stack. The value proposition
starts with onboarding, where we surface value immediately, and continues through the dashboard, which reinforces
that value with every session. Teams that adopt the platform see value compound over time, because the value isn't a
one-time gain but an ongoing value that grows as usage grows. This compounding value is what separates us from point
solutions that deliver a burst of value and then plateau.

The report highlights growth across every region. Growth in EMEA outpaced growth in APAC, while growth in the
Americas stayed steady. Overall growth for the year reflects growth in both new accounts and growth in expansion
revenue, with growth expected to continue into next year at a similar rate of growth.

- the system ensures reliability
- the system ensures consistency
- the system ensures uptime
- the system ensures data integrity
- the system ensures a smooth rollout because the system ensures every step is verified

Users love the app. Users tell us the app saves time. Users say the app is easy to use, and users keep coming back
because the app fits their workflow. We built the app for users, and users are at the center of every decision we
make about the app.`;

const WORD_FREQUENCY_NEG = `The invoice service validates the customer ID, looks up the pricing tier, applies any active discount codes, and
writes the final total to the ledger. Refunds go through a separate endpoint that checks whether the original charge
settled before issuing credit. Both paths log to the same audit table so support can trace a transaction end to end.

Mount Kilimanjaro rises from the savanna in a way few peaks do, since there are no neighboring mountains to soften
the climb. Hikers pass through five distinct climate zones on the way up: farmland, rainforest, heath, alpine
desert, and finally the glaciated summit. Most guided treks take five to nine days, with the extra days built in to
help with acclimatization.

Nobody expected the server to fall over at 2 a.m. on a Sunday. It did anyway, and the on-call engineer, half asleep,
spent twenty minutes chasing a stack trace that turned out to point nowhere useful. The real cause, once someone
finally found it the next morning with fresh eyes and a cup of coffee, was a single misconfigured retry loop that
had been quietly hammering a dead downstream service for weeks without anyone noticing, because the error logs were,
absurdly, routed to a channel nobody had checked since the migration.`;

const RARE_WORDS_POS = `The methodology necessitates comprehensive characterization of the underlying stochastic processes governing the
system's nondeterministic behavior, particularly insofar as this characterization informs subsequent optimization
strategies predicated upon probabilistic convergence guarantees. Practitioners should additionally consider the
computational overhead associated with instrumentation, since excessive telemetry granularity can itself introduce
observable perturbations to the phenomena under investigation, thereby compromising the validity of any conclusions
derived from the resultant measurements.

The pharmacological intervention demonstrated statistically significant efficacy in ameliorating symptomatic
manifestations across the heterogeneous patient cohort, notwithstanding considerable interindividual variability
attributable to confounding comorbidities and concomitant pharmacotherapy regimens that complicated straightforward
attribution of therapeutic benefit.

Contemporary architectural paradigms increasingly emphasize decentralized, loosely-coupled constituent services
communicating via asynchronous, event-driven mechanisms, thereby necessitating sophisticated orchestration
infrastructure capable of maintaining transactional consistency notwithstanding the inherent unpredictability of
network-mediated interservice communication.

The jurisprudential implications of this determination extend considerably beyond the immediate adjudicated
controversy, potentially precipitating substantive reconsideration of longstanding interpretive frameworks governing
analogous circumstances across multiple, jurisdictionally distinct, appellate tribunals.`;

const RARE_WORDS_NEG = `The config file lives at the root of the repo. Open it, change the port number, and restart the server. Most setup
issues come from a stale cache, not a bad config, so clear the cache first if something looks wrong.

The garden needs water twice a week in summer, once in spring and fall. Skip watering after rain. Tomatoes
especially hate wet leaves, so water at the base, not overhead.

This function takes a list and returns a new list with duplicates removed. It keeps the first copy of each value and
drops the rest. Order is preserved.

The trail climbs steadily for two miles, then levels off near the ridge. Bring extra water in summer; there's no
shade after the first mile. The view at the top is worth the climb.

Our support team answers most tickets within an hour during business hours. After hours, expect a reply the next
morning. Urgent issues can be flagged for a faster response.`;

const PARAGRAPH_COHERENCE_POS = `This section covers authentication. This is handled by the middleware layer and applies to every route by default.
This design keeps route handlers simple and free of auth logic.

This section covers authorization. This builds on the authentication layer and checks role-based permissions before
a handler runs. This keeps permission checks centralized in one place.

This section covers auditing. This records every authenticated request to a separate log stream for compliance
review. This log is retained for ninety days by policy.

The frontend team shipped the new dashboard this week. The dashboard now loads in under a second for most users. The
team is proud of this milestone.

The backend team shipped the new caching layer this week. The caching layer cut database load by half for most
queries. The team is proud of this milestone.

The mobile team shipped the offline mode this week. The offline mode now works for most core features. The team is
proud of this milestone.

Overall, the quarter went well. Overall, revenue grew across every segment. Overall, the team hit its hiring
targets.

Overall, customer satisfaction improved. Overall, support tickets dropped. Overall, the roadmap stayed on track.

Overall, the outlook for next quarter is positive. Overall, the team expects similar growth. Overall, no major risks
are on the horizon.

In this section, we discuss the problem. In this section, we outline three possible causes and weigh each one
against the observed symptoms.

In this section, we discuss the fix. In this section, we walk through the patch and explain why it addresses the
root cause rather than a symptom.

In this section, we discuss testing. In this section, we describe the new regression test added to prevent
recurrence.

Additionally, the report covers headcount. Additionally, headcount grew by twelve percent this year, concentrated
mostly in engineering.

Additionally, the report covers attrition. Additionally, attrition stayed below the industry average for a second
straight year.

Additionally, the report covers hiring pipeline. Additionally, the pipeline remains healthy going into next quarter.`;

const PARAGRAPH_COHERENCE_NEG = `The lake freezes over by late December most years. Ice fishing shacks start appearing within a week of that,
clustered near the public boat launch where the ice tends to set thickest first.

By February the ice can be two feet thick in places, though nobody trusts that number blindly — warm patches near
inflow streams stay thin all winter, and every few years someone finds that out the hard way.

Spring thaw is unpredictable. Some years the lake opens in a single warm week; other years it lingers, gray and
rotten-looking, well into April.

Start with the smallest reproducible case you can build. A five-line script that triggers the bug is worth more than
a full stack trace from production, because you can actually step through it.

From there, bisect. Comment out half the logic, see if the bug survives, and repeat. This sounds tedious and it is,
but it converges faster than staring at the code guessing.

Once you find the line, resist the urge to patch it and move on. Ask why it was wrong in the first place — half the
time there's a second instance of the same mistake elsewhere in the file.

The committee met twice before reaching a decision. The first meeting ran long and settled nothing; half the members
wanted more data before voting.

That data took three weeks to gather, which annoyed everyone who'd wanted to vote immediately. It turned out to
matter: the numbers shifted the outcome for at least two committee members.

The second meeting took twenty minutes.

Renovation on the old mill started in March. Crews found asbestos in the insulation almost immediately, which pushed
the timeline back two months while abatement crews came in.

Once that cleared, the structural work went fast — the original timber frame was in better shape than the engineers
expected, needing only a handful of beams replaced.

The mill reopens as a market hall in the fall, four months later than planned but, by most accounts around town,
worth the wait.`;

endToEnd("lexical-diversity", LEXICAL_DIVERSITY_POS, LEXICAL_DIVERSITY_NEG, "MSTTR-100");
unit(lexicalDiversity, LEXICAL_DIVERSITY_POS, /^MSTTR-100 0\.\d\d over \d+ segments \(min 0\.55\)$/);
endToEnd("word-frequency", WORD_FREQUENCY_POS, WORD_FREQUENCY_NEG, "over 216 words (max 3.5%)");
unit(wordFrequency, WORD_FREQUENCY_POS, /^word "[a-z]+" \d+\.\d% over \d+ words \(max 3\.5%\)$/);
endToEnd("rare-words", RARE_WORDS_POS, RARE_WORDS_NEG, "rare-word ratio");
unit(rareWords, RARE_WORDS_POS, /^rare-word ratio \d+% over \d+ words \(max 25%\)$/);
const LIST_ITEMS = [1, 2, 3, 4, 5]
  .map((n) => `${n}. By using the step ${n} helper the reader skips the heap page. This keeps the query plan stable as the table grows.`)
  .join("\n\n");
const LIST_OPTIONS = { ...paragraphCoherence.options, minWords: 100, minParagraphWords: 15 };

{
  const ctx = (text) => ({ path: "d.md", scope: "files", options: LIST_OPTIONS, stats: makeStats(text) });
  const asList = paragraphCoherence.detect(LIST_ITEMS, ctx(LIST_ITEMS));
  const asProse = LIST_ITEMS.replace(/^\d+\. /gm, "");
  const hits = paragraphCoherence.detect(asProse, ctx(asProse));
  if (asList.length === 0) ok("list items are not counted as paragraphs");
  else bad("list items are not counted as paragraphs", asList[0].match);
  if (hits.length === 1) ok("the same text as prose paragraphs still reports");
  else bad("the same text as prose paragraphs still reports", `got ${hits.length} findings`);
}

endToEnd("paragraph-coherence", PARAGRAPH_COHERENCE_POS, PARAGRAPH_COHERENCE_NEG, "paragraph length CV");
unit(paragraphCoherence, PARAGRAPH_COHERENCE_POS, /^paragraph length CV 0\.\d\d over \d+ paragraphs \(min 0\.15\)$/);

cleanup();
