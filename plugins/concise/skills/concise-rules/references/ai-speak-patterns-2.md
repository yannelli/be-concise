# AI speak patterns, part 2

Adapted from avoid-ai-writing by Conor Bronsdon (MIT) and Ryan Yannelli's house rules.

Categories `chatbot`, `sycophancy`, `contrast`, `copula`, `inflation`, `closers`, `structure`, `formatting`, and `ste`. Categories `vocabulary`, `wordiness`, `transitions`, `filler`, and `hedging` are in [ai-speak-patterns.md](ai-speak-patterns.md). What to do with a deny is in [avoid-ai-speak.md](avoid-ai-speak.md).

## chatbot

Presets: `default`, `ryan`, `technical`, `minimal`, `all`.

| Flagged | Fix |
|---|---|
| `I hope this helps`, `Hope this helps` | cut |
| `Certainly!`, `Absolutely!`, `Of course!` (sentence-initial) | cut |
| `Great question`, `Excellent question`, `Good question` | cut |
| `Feel free to reach out`, `Feel free to ask`, `Feel free to contact`, `Feel free to let me know` | cut |
| `Let me know if you`, `Let me know if there`, `Let me know if that`, `Let me know if this`, `Let me know if it` | cut |
| `Don't hesitate to` | cut |
| `I'd be happy to`, `I would be happy to`, `Happy to help` | cut |
| `As an AI`, `As an AI language model` | cut |
| `As of my last update`, `As of my latest training`, `As of my last knowledge` | cut |
| `knowledge cutoff` | cut |
| `I don't have access to real-time` | cut |
| `Please note that` | state the fact |
| `Kindly` + verb | imperative without "kindly" |

## sycophancy

Presets: `default`, `ryan`, `technical`, `minimal`, `all`.

| Flagged | Fix |
|---|---|
| `You're absolutely right` | cut |
| `You're right` (sentence-initial) | cut, state the fix |
| `Great point`, `Great idea`, `Great catch`, `Excellent observation`, `Excellent suggestion` | cut |
| `That's a great point`, `That's an excellent point`, `That's a fantastic idea`, `That's a really good observation`, `That's an insightful observation` | cut |
| `What a great`, `What a fantastic`, `What a wonderful` | cut |
| `I completely understand`, `I completely agree`, `I totally understand`, `I totally agree` | cut |
| `Thank you for sharing`, `Thank you for bringing this`, `Thank you for pointing`, `Thank you for the clarification`, `Thank you for your patience`, `Thanks for sharing`, `Thanks for pointing`, `Thanks for flagging` | cut |
| `I apologize for the confusion`, `I apologize for any oversight`, `I apologize for the inconvenience`, `Apologies for the confusion`, `My apologies` | state the correction |
| `You raise a great point`, `You raise an excellent point`, `You raise a good point`, `You raise a valid point`, `You raise an important point` | cut |

## contrast

Presets: `default`, `ryan`, `technical`, `all`.

| Flagged | Fix |
|---|---|
| `it's not X, it's Y` (also `it is not`, `this is not`, `that's not`, with `just`, `only`, `about`, `merely`, or `simply` inside) | state the positive claim |
| `isn't about X, it's about Y` | state the positive claim |
| `not just X but Y` (also `not only`, `not merely`, `not simply`) | state Y |
| `X, not Y` as the tail of a sentence, up to 3 words after `not` | write the claim as "X does Y" |

## copula

Presets: `ryan`, `ste`, `all`. State the fact instead of interpreting it.

| Flagged | Fix |
|---|---|
| `serves as`, `acts as`, `stands as`, `functions as` | is, or the literal action |
| `boasts`, `boasts a`, `boasts over`, `boasts more` | has |
| `the source of truth` | say what reads it |
| `the key constraint` | name the constraint |
| `the path forward` | the next step, named |
| `this ensures`, `this ensures that` | say what happens |
| `plays a key role`, `plays a vital role`, `plays a critical role`, `plays a central role`, `plays a significant role`, `plays an important role` | say what it does |
| `designed to help`, `designed to ensure`, `designed to provide`, `designed to enable`, `designed to make` | say what it does |

## inflation

Presets: `default`, `ryan`, `technical`, `all`.

| Flagged | Fix |
|---|---|
| `marks a significant`, `marks a major`, `marks a new`, `marks a turning` | state what happened |
| `represents a significant`, `represents a major`, `represents a fundamental` | state what changed |
| `a significant step forward`, `a major step towards`, `a bold step toward`, `a big step forward` | state what changed |
| `step forward for` | state what changed |
| `turning point` | state what changed |
| `sea change` | state what changed |
| `paradigm shift` | state what changed |
| `game-changer`, `game-changing` | state what changed |
| `watershed moment` | state what changed |
| `groundbreaking` | name the prior art it beats |
| `revolutionary`, `revolutionize`, `revolutionizes`, `revolutionized` | describe the change |
| `first of its kind` | cite the search |
| `unprecedented` | name the precedent, or cut |
| `redefine the`, `redefines how`, `redefines what` | describe the change |
| `reshape the`, `reshaping the` | describe the change |
| `the future of` | cut |
| `real utility`, `actual value`, `genuine impact`, `true change`, `real results` | drop the adjective |
| `Despite challenges`, `Despite these challenges`, `Despite the challenges` | name the challenge |
| `continues to thrive`, `remains resilient` | cite the number |

## closers

Presets: `default`, `ryan`, `technical`, `all`.

| Flagged | Fix |
|---|---|
| `In conclusion`, `In summary`, `To summarize`, `To sum up` | cut, end on the last fact |
| `Ultimately` (sentence-initial) | cut |
| `At the end of the day` | cut |
| `The future looks bright`, `The future is bright` | cut |
| `Only time will tell` | cut |
| `One thing is certain`, `One thing is clear` | state it |
| `As we move forward`, `Moving forward` (sentence-initial) | cut |
| `Stay tuned` | cut |
| `Exciting times`, `Exciting times ahead` | cut |
| `Happy coding` | cut |
| `worth reading`, `worth a look`, `worth a read`, `worth exploring`, `worth checking out`, `worth your time` | say why |
| `thank me later` | cut |
| `The possibilities are endless` | cut |
| `the journey begins`, `the journey continues`, `the adventure is just beginning` | cut |
| `the bottom line is`, `the key takeaway`, `the takeaway here is` | state it |
| `I look forward to`, `we look forward to` | cut, or state the next step and date |

## structure

Presets: `default`, `ryan`, `technical`, `all`.

| Flagged | Fix |
|---|---|
| `What does this mean`, `So why should you care`, `Why does it matter` as an opener | answer it |
| `Ever wondered`, `Have you ever wondered`, `What if I told you` | state the fact |
| `Imagine a world where`, `Picture a future in which`, `Envision a scenario where` | state the fact |
| `Picture this.`, `Run the numbers.`, `Think about it.`, `Consider this:` as a line-initial fragment | state the fact |
| `Enter Redis.` and the rest of the reveal form | name it in a plain sentence |
| `Three key takeaways`, `5 things to know`, `Four reasons`, `10 ways`, `Six tips` (line-initial) | drop the count, lead with the finding |
| `Let me think step by step`, `Let me break this down step by step`, `Let me walk through this step by step`, `Here's my thought process`, `To approach this systematically`, `Breaking this down:` | cut, give the result |
| `You're asking about`, `To answer your question`, `The question of whether` | answer |

## formatting

Presets: `default`, `ryan`, `all`. Applies to prose files and replies. Skipped for comment runs.

| Flagged | Fix |
|---|---|
| an emoji in a heading | remove |
| an emoji at the end of a line | remove |
| 3 or more bold spans in one paragraph | restructure so the sentence leads with the point |

## ste

Presets: `ste`, `all`. Off by default. The rules behind this list are in [simplified-technical-english.md](simplified-technical-english.md).

| Flagged | Fix |
|---|---|
| `accomplish`, `perform` | do |
| `acquire`, `obtain`, `procure` | get |
| `adhere to`, `comply with` | obey |
| `assist`, `aid` | help |
| `attempt` | try |
| `cease`, `discontinue` | stop |
| `initiate` | start |
| `conduct a test`, `conduct the check`, `conduct a review` | do |
| `depress the button`, `depress a switch` | push |
| `desire` | want |
| `ensure` | make sure |
| `examine`, `inspect` | do a check of |
| `indicate` | show |
| `locate` | find |
| `modify` | change |
| `observe` | look at, see |
| `permit` | let |
| `purchase` | buy |
| `rectify`, `remedy` | correct, repair |
| `replenish` | fill |
| `retain` | keep |
| `transmit` | send |
| `verify` | make sure |
| `aperture` | hole |
| `assistance` | help |
| `commencement` | start |
| `malfunction` | fault |
| `personnel` | persons |
| `portion` | part |
| `remainder` | the other part |
| `requirement` | need |
| `termination` | end |
| `utilization` | use |
| `vicinity` | area |
| `adequate`, `sufficient` | enough |
| `adjacent` | near, next to |
| `approximately` | about |
| `additional` | more |
| `initial` | first |
| `numerous`, `multiple` | many |
| `optimum` | best |
| `previous` | before, earlier |
| `principal` | main |
| `rapidly` | quickly |
| `subsequent` | after, next |
