#!/usr/bin/env node
import { run, CHECK_EDIT, assertDenied, assertAllowed } from "./lib.mjs";
import { project, cleanup, writeEvent, includes, endToEnd, unit } from "./packs-stats-tests.mjs";
import readabilityGrade from "../hooks/lib/patterns/ai/readability-grade.mjs";
import sentenceVariation from "../hooks/lib/patterns/ai/sentence-variation.mjs";
import transitionDensity from "../hooks/lib/patterns/ai/transition-density.mjs";
import passiveVoice from "../hooks/lib/patterns/ai/passive-voice.mjs";
import punctuationPatterns from "../hooks/lib/patterns/ai/punctuation-patterns.mjs";
import terminalPunctuation from "../hooks/lib/patterns/ai/terminal-punctuation.mjs";

console.log("\npattern packs (statistical, sentences and punctuation)");

const READABILITY_GRADE_POS = `The implementation herein necessitates the orchestration of multifarious interdependent subsystems whose
interoperability is contingent upon the precise synchronization of asynchronous computational processes operating
across heterogeneous distributed infrastructure. Practitioners undertaking the aforementioned integration must
additionally account for the nondeterministic latency characteristics inherent to network-mediated communication
protocols, particularly insofar as these characteristics pertain to the maintenance of transactional consistency
guarantees within eventually-consistent storage architectures. Failure to adequately account for these
considerations may precipitate cascading failures whose remediation necessitates substantial engineering investment.

Utilization of the aforementioned methodology facilitates the actualization of previously unattainable levels of
operational efficiency, insofar as the underlying computational substrate is appropriately provisioned to
accommodate the anticipated throughput requirements of the constituent microservices comprising the overall
architecture.

The multifaceted ramifications of this architectural determination extend substantially beyond the immediately
observable performance characteristics, encompassing considerations pertaining to long-term maintainability,
extensibility, and the cognitive burden imposed upon engineers tasked with comprehending the resultant codebase.`;

const READABILITY_GRADE_NEG = `The cat sat by the window most of the day. When the mail carrier walked up, she jumped down and ran to the door. She
does this every day around noon, rain or shine.

We found a race condition in the queue worker. Two workers picked up the same job at once when Redis was slow to
ack. The fix locks the job row before processing and releases it after. Tests are in \`test/queue.spec.js\`.

Add flour, sugar, and salt to a bowl. Mix in the butter until it looks like coarse crumbs. Add the egg and stir just
until combined. Chill the dough for 30 minutes before rolling it out.

The library ships two build targets: a browser bundle and a Node bundle. Pick the browser bundle if you're using a
bundler like webpack or esbuild. Pick the Node bundle for server code or tests that run under Node directly.`;

const SENTENCE_VARIATION_POS = `Onboarding starts with an email. The email links to a setup guide. The guide walks through account creation. Account
creation takes about two minutes. Next comes team invites. Team invites can be sent from the dashboard. The
dashboard also shows setup progress. Progress updates in real time. Once setup is done, a welcome message appears.
The welcome message includes next steps. Next steps point to the help center.

Reviewers should check three things. They should check test coverage. They should check that naming is consistent.
They should check that the changelog is updated. Each check takes only a minute. Together they catch most issues.
This process has worked well so far. It should keep working as the team grows.

Config lives in a single file. That file is loaded at startup. Any change requires a restart. Restarts take a few
seconds. This is a known limitation. A future release may add hot reload. For now, restarts are the accepted
workaround. The team tracks this in the backlog.`;

const SENTENCE_VARIATION_NEG = `Nobody expected the server to fall over at 2 a.m. on a Sunday. It did anyway, and the on-call engineer, half asleep,
spent twenty minutes chasing a stack trace that turned out to point nowhere useful. The real cause, once someone
finally found it the next morning with fresh eyes and a cup of coffee, was a single misconfigured retry loop that
had been quietly hammering a dead downstream service for weeks without anyone noticing, because the error logs were,
absurdly, routed to a channel nobody had checked since the migration.

Cut the onions first. Fine dice, not rough. While those sweat in the pan on low heat for about fifteen minutes,
stirring occasionally so they don't catch and burn, you can start on the stock, which if you're making it from
scratch rather than reaching for the carton needs at least two hours on a bare simmer to pull enough flavor from the
bones. Patience matters more than technique here.`;

const TRANSITION_DENSITY_POS = `Moreover, the new API simplifies authentication. Furthermore, it reduces the number of round trips needed per
request. Additionally, error messages are now more descriptive. However, some older clients will need an update.
Therefore, we recommend testing against staging first. Consequently, the rollout will happen in two phases.
Meanwhile, the docs team is updating the guides. Overall, this should be a smooth transition. In fact, most internal
teams have already migrated. Nonetheless, please file an issue if anything breaks. As a result, we expect very few
surprises at launch.

Indeed, the feedback has been positive. Notably, three customers asked for this feature by name. Furthermore,
support tickets on the old flow have already started to drop. In fact, the drop began within a day of launch. As a
result, the team is prioritizing similar improvements elsewhere. In turn, this has freed up time for other roadmap
items. Ultimately, the change validates the original design decision.`;

const TRANSITION_DENSITY_NEG = `Rain hit the coast just after noon. Boats that had gone out that morning turned back early. By evening the harbor
was full and the market stalls had packed up for the day. A few fishermen stayed out anyway, betting the storm would
pass north.

Set the oven to 425. Roast the vegetables for twenty-five minutes, flipping halfway through. Pull them when the
edges start to char. Season with salt right before serving, not before roasting, or they'll steam instead of brown.

The library has no runtime dependencies. It ships as a single file under 10KB. Tree-shaking works out of the box
with most bundlers. Tests run against Node 18 and 20 in CI.

He missed the bus by ten seconds. He walked the rest of the way, which took forty minutes in the cold. By the time
he arrived, the meeting had already started without him. Nobody seemed to mind.`;

const PASSIVE_VOICE_POS = `The report was compiled by the finance team and was reviewed by two directors before it was submitted. Numbers were
pulled from the ledger, and discrepancies were flagged wherever they were found. Adjustments were made where needed,
and the final figures were signed off by the CFO.

The building was designed by a local firm and was completed in under a year. Materials were sourced locally wherever
possible, and labor was hired from the surrounding towns. The project was praised by residents and was later
featured in a regional publication.

Changes are tested before they are merged. Once merged, the code is deployed by the CI pipeline and is monitored for
the first hour. Any regression is caught by automated alerts and is escalated to the on-call engineer, who is paged
automatically.

- The file is uploaded and is scanned for malware
- The scan result is cached and is reused for identical files
- A quarantine flag is set if a threat is found
- The user is notified and is given a chance to appeal`;

const PASSIVE_VOICE_NEG = `The parser reads the file, splits it into tokens, and hands the token stream to the evaluator. The evaluator walks
the tree and calls the matching handler for each node type. If a handler throws, the evaluator catches it, wraps it
with context, and re-throws. Callers usually just want the final value, so most code paths never see the wrapping.

The chef seasons the steak generously, sears it hard on both sides, then finishes it in the oven. She rests it for
five minutes before slicing against the grain. Skipping the rest lets the juices run out onto the board instead of
staying in the meat.

The committee reviewed forty applications this cycle. They interviewed the top eight candidates and made an offer to
the strongest one within a week. She starts next month.

The dog chased the ball across the yard, missed it completely, and ran three more laps anyway before giving up and
flopping down in the shade.`;

const PUNCTUATION_PATTERNS_POS = `Our platform offers three things: speed, reliability, and clarity. Speed matters because users expect instant
feedback; reliability matters because failures erode trust; clarity matters because confusing errors waste
everyone's time. The dashboard surfaces three metrics: uptime, latency, and error rate. Each metric updates in real
time; each one links to a detailed drill-down view. Teams that adopt this approach report faster incident response:
issues are caught sooner, triaged faster, and resolved with less back-and-forth. Onboarding follows the same
three-part structure: setup, configuration, and verification. This consistency helps new users build a mental model
quickly; it also reduces support load, since most questions are answered by the structure itself.

The proposal covers three areas: budget, timeline, and staffing. Budget constraints require careful prioritization;
timeline pressure requires early alignment across teams; staffing gaps require a hiring plan agreed on this quarter.
Each area has an owner: budget is owned by finance, timeline by the PMO, and staffing by HR. Weekly syncs will track
progress: green means on track, yellow means at risk, and red means blocked. This structure keeps stakeholders
aligned; it also keeps the project visible to leadership.

- The service handles three request types: create, update, and delete.
- Each type maps to a handler: creation, mutation, and removal.
- Errors fall into three buckets: validation, authorization, and system.
- Retries apply to one bucket only: system errors; the other two fail fast.

Consider the tradeoffs: cost, speed, and correctness. Lower cost often means slower processing; faster processing
often means higher cost; correctness constrains both. The team chose a middle path: moderate cost, moderate speed,
and strict correctness checks. This choice reflects the product's needs: users tolerate a short wait, but not a
wrong answer.`;

const PUNCTUATION_PATTERNS_NEG = `Honestly? I'm not sure this is going to work. But let's try it anyway — worst case we roll it back. So here's the
plan: ship it behind a flag, watch the metrics for a day, and pull it if anything looks off. And if it does work,
great, we widen the rollout next week.

The recipe calls for butter, sugar, and eggs; you can swap the butter for oil if that's what you have. Whisk the dry
ingredients separately, then fold them in. And don't overmix, or the cake turns dense.

The trail forks at mile two. Take the left path if you want the shorter loop; take the right if you're up for the
ridge walk. Either way you end up back at the trailhead by sunset.

He said he'd be there by six. He wasn't. So we started without him, and honestly, the meeting went faster for it.`;

const TERMINAL_PUNCTUATION_POS = `Checklist before merging:
- Tests pass.
- Docs are updated.
- Changelog entry added.
- No console warnings.
- Reviewer approved.

Checklist before release:
- Version bumped.
- Release notes drafted.
- Tag pushed.
- Announcement sent.`;

const TERMINAL_PUNCTUATION_NEG = `Setup steps:
- install dependencies
- copy the env file
- run the migration (this can take a minute on a fresh DB)
- start the dev server.
- open the app in a browser

Deployment checklist:
- build the bundle
- push to registry.
- update manifest
- roll to staging
- promote when green.

Grocery list:
- eggs
- milk
- bread.
- coffee
- the good olive oil, not the cheap stuff.`;

endToEnd("readability-grade", READABILITY_GRADE_POS, READABILITY_GRADE_NEG, "Flesch-Kincaid grade");
unit(readabilityGrade, READABILITY_GRADE_POS, /^Flesch-Kincaid grade \d+\.\d over \d+ words \(max 16\)$/);
endToEnd("sentence-variation", SENTENCE_VARIATION_POS, SENTENCE_VARIATION_NEG, "sentence-length CV");
unit(sentenceVariation, SENTENCE_VARIATION_POS, /^sentence-length CV 0\.\d\d over \d+ sentences \(min 0\.35\)$/);
endToEnd("transition-density", TRANSITION_DENSITY_POS, TRANSITION_DENSITY_NEG, "transition density 100%");
unit(transitionDensity, TRANSITION_DENSITY_POS, /^transition density \d+% over \d+ sentences \(max 30%\)$/);
endToEnd("passive-voice", PASSIVE_VOICE_POS, PASSIVE_VOICE_NEG, "passive voice 100%");
unit(passiveVoice, PASSIVE_VOICE_POS, /^passive voice \d+% of sentences over \d+ \(max 30%\)$/);
endToEnd("punctuation-patterns", PUNCTUATION_PATTERNS_POS, PUNCTUATION_PATTERNS_NEG, "punctuation signals");
unit(punctuationPatterns, PUNCTUATION_PATTERNS_POS, /^punctuation signals [45]\/5: [a-z!, \/]+ \(min 4\/5\)$/);
endToEnd("terminal-punctuation", TERMINAL_PUNCTUATION_POS, TERMINAL_PUNCTUATION_NEG, "fragment list items end with");
unit(terminalPunctuation, TERMINAL_PUNCTUATION_POS, /^\d+\/\d+ fragment list items end with '\.' \(min 8 items, 2\+ lists\)$/);

console.log("\npattern packs (statistical options and scope)");

const UNIFORM = [
  "The system logs each request. It stores the result. It returns the response soon.",
  "The worker reads the queue. It runs the job. It writes the output. The cache holds it.",
].join(" ");
const LOWERED = { options: { "sentence-variation": { minWords: 30, minSentences: 6 } } };

{
  assertAllowed("a short text stays under the pack minimum", run(CHECK_EDIT, writeEvent(project(), "short.md", UNIFORM)));
  const fired = run(CHECK_EDIT, writeEvent(project(LOWERED), "short.md", UNIFORM));
  assertDenied("a lowered minWords in the config reaches ctx.options", fired);
  includes("the lowered run reports the same measure", fired, "sentence-length CV");
}

{
  const comment = `// ${UNIFORM}\nconst x = 1;\n`;
  assertAllowed("a comments-scope call stays silent", run(CHECK_EDIT, writeEvent(project(LOWERED), "uniform.ts", comment)));
}

cleanup();
