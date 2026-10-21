# Simplified Technical English (ASD-STE100)

Short form of the ASD-STE100 writing rules, plus the word choices behind the concise plugin's `ste` category.

## Legal note

ASD owns the copyright of the ASD-STE100 specification and of the full Dictionary. This file holds a summary and examples only. It does not replace the specification. Get the full specification at no cost from <https://asd-ste100.org>.

If a word is not in the tables below and you are not sure, use a word from the tables or tell the user that the word needs a check against the official Dictionary. Do not claim that a word is approved when you did not check it.

## What STE is for

STE is a controlled language for technical documents. It has two parts: a set of writing rules, and a dictionary of approved words. It makes technical text easier to read for a person whose first language is not English, and it makes machine translation more accurate. Use it for maintenance procedures, work instructions, warnings, cautions, and manuals written for translation.

The `ste` category is off in every preset except `ste` and `all`. Turn it on for procedure text. Leave it off for a blog post or a design document, where its word list flags ordinary words.

## Words

- Use only approved words. Technical names and technical verbs are exceptions.
- Use a word with only its approved part of speech. `test` is a noun, so write "do a test of the pump".
- Use a word with only its approved meaning. `follow` means "to come after".
- Do not use the same word as a noun and as a verb.
- Use one term for one thing in all of the text. Do not use synonyms.
- Do not use a gerund (an "-ing" word) as a noun, as an adjective, or as part of a complex verb. A technical name is an exception. Write "Before you start the engine, do a check of the oil."
- Use the approved verb forms: the infinitive, the imperative, the simple present tense, the simple past tense, the simple future tense, and the past participle as an adjective.
- Do not use a complex verb tense. Write "was removed" in place of "has been removed".
- Use a maximum of 3 nouns in a noun cluster. Write "the control panel of the approach system for the runway lights".
- Do not remove the articles "a", "an", and "the" to make the text short.
- Do not use an abbreviation that is not in the official list, unless you give the full term at the first use.
- Do not use a slash. The mark "and/or" is the one exception.
- Write quantities and measurements as numerals.

## Sentences

- A procedural sentence has a maximum of 20 words.
- A descriptive sentence has a maximum of 25 words.
- Write one instruction in one sentence. Two actions that occur at the same time can share one sentence with "and".
- Use the imperative for an instruction. Start the sentence with the verb.
- Use the active voice in procedural text, and in descriptive text where possible.
- Use the passive voice in descriptive text only when the active voice makes the sentence unclear, or when the agent is unknown.
- Keep the words that go together near to each other.
- Write one topic in one sentence.
- Use a connective word ("and", "but", "or", "because") to show the relation between two ideas. Do not write a long chain of connectives.

## Procedures

- Write each step as a separate numbered step.
- Write one instruction in each step. A step can have more than one sentence when the actions are related.
- Give the condition before the action: "If the lamp comes on, stop the pump."
- Put the warning or the caution before the step that it applies to.
- Do not put a warning or a caution in the middle of a step.

## Descriptive text

- Write a maximum of 6 sentences in a paragraph.
- Write one topic in one paragraph. Start the paragraph with the topic sentence.
- Use a table or a list when you give more than 3 related items.

## Warnings and cautions

- Write a warning for a risk of injury or death to persons.
- Write a caution for a risk of damage to equipment.
- Start a warning or a caution with a command, or with a clear statement of the condition.
- Give the result of the risk when the result is not obvious.
- Write warnings and cautions in the imperative. Keep them short.

Example:

> WARNING: THE FUEL IS FLAMMABLE. KEEP FLAMES AND SPARKS AWAY FROM THE WORK AREA. FUEL FIRES CAN CAUSE INJURY OR DEATH.

## Punctuation

- Use a hyphen only in a word that has a hyphen in the Dictionary.
- Do not use parentheses to add a second idea to a sentence. Write a new sentence.
- Use a colon to introduce a list.
- Do not use em dashes or en dashes.

## What not to change

- Do not change a technical name, a part number, a measurement, a tolerance, or a value to obey a rule.
- Do not remove safety data to make the text short.
- When a rule and the technical accuracy have a conflict, keep the accuracy and tell the user.

## Verbs

| Do not use | Use |
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

## Nouns

| Do not use | Use |
|---|---|
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

## Adjectives and adverbs

| Do not use | Use |
|---|---|
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

## Words with one approved meaning

| Word | Approved meaning | Do not use it for |
|---|---|---|
| `follow` | to come after | to obey |
| `clear` | to remove an obstruction | free of, easy to understand |
| `about` | approximately | on the subject of |
| `close` | to shut | near |
| `fit` | to install a part | correct size |
| `free` | to release | at no cost |
| `like` | the same as | to want |
| `only` | no more than | alone |
| `right` | the opposite of left | correct |
| `test` | a noun (do a test) | a verb (test the pump) |

## Phrases

Phrase-level replacements (`in order to`, `prior to`, `in the event that`, and the rest) sit in the `wordiness` category. The table is in [ai-speak-patterns.md](ai-speak-patterns.md). The `ste` preset turns on `wordiness`, `hedging`, `copula`, and `ste` together, so the phrase list is active whenever the word list is.

## Checklist

1. Each word is an approved word, a technical name, or a technical verb.
2. No word from the "Do not use" tables is in the text.
3. Each term is the same in all of the text. There are no synonyms.
4. No "-ing" word is a noun or an adjective, except in a technical name.
5. No noun cluster has more than 3 nouns.
6. Each procedural sentence has 20 words or less. Each descriptive sentence has 25 words or less.
7. Each instruction is in the imperative and in the active voice.
8. Each paragraph has 6 sentences or less and one topic.
9. Each warning and each caution comes before the step that it applies to.
10. Each technical name, number, tolerance, and unit is the same as in the source text.
