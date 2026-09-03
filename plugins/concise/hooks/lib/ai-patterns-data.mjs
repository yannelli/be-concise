const apostrophes = (s) => s.replace(/'/g, "['\u2019]");
const build = (pairs, wrap, flags, tier) =>
  pairs.map(([source, fix]) => ({ re: new RegExp(wrap(source), flags), fix, tier }));

const bounded = (s) => `\\b(?:${apostrophes(s)})\\b`;
const bare = (s) => s;
const sentenceStart = (s) => `(?<=^|[.!?]\\s+)(?:${apostrophes(s)})`;

const words = (pairs, tier = 1) => build(pairs, bounded, "gi", tier);
const raw = (pairs, flags = "gi") => build(pairs, bare, flags, 1);
const opening = (pairs) => build(pairs, sentenceStart, "gim", 1);

const vocabulary = [
  ...words([
    ["delv(?:e|es|ed|ing)", "look at, examine"], ["tapestry", "describe the actual parts"],
    ["realm", "area, field"], ["embark(?:s|ed|ing)?", "start"], ["beacon", "rewrite"],
    ["testament to", "shows, proves"], ["robust", "reliable, or the measured property"],
    ["comprehensive", "complete, full"], ["cutting-edge", "latest, or name the version"],
    ["leverag(?:e|es|ed|ing)", "use"], ["pivotal", "important, or say what depends on it"],
    ["meticulous(?:ly)?", "careful"], ["seamless(?:ly)?", "works without X, name X"],
    ["nestled", "is in, sits"], ["vibrant", "describe what is active"],
    ["thriving", "growing, or cite a number"], ["showcas(?:es|ing)", "shows"],
    ["deep dive", "look at, examine"], ["dive into", "look at"], ["bustling", "busy"],
    ["intricate|intricacies", "complex, or name the complexity"], ["ever-evolving", "changing"],
    ["daunting", "hard"], ["holistic(?:ally)?", "complete, or list what is included"],
    ["actionable", "practical, or drop"], ["impactful", "effective, or name the effect"],
    ["learnings", "lessons, findings"], ["thought leader(?:ship)?", "expert, or name the work"],
    ["best practices", "what works, the standard approach"],
    ["synerg(?:y|ies)", "describe the combined effect"], ["interplay", "relationship"],
    ["symphony", "describe the coordination"], ["state-of-the-art", "name the benchmark"],
    ["world-class|best-in-class", "cite a comparison"], ["future-proof", "say what changes it survives"],
    ["empower(?:s|ed|ing)?", "let, enable"], ["crucial", "important, or say what breaks without it"],
    ["incredibly", "cut"], ["competitive edge", "name the advantage"],
    ["vast experience", "years and scope"], ["excited to announce", "state the fact"],
    ["humbled", "cut"],
  ]),
  ...raw([
    ["\\bparadigm\\b(?! shift)", "model, approach"],
    ["\\bload[- ]bearing\\b(?! (?:down|on|upon)\\b)(?! (?:\\w+ )?(?:wall|beam|column|joist|truss|member|footing|slab|stud|partition|masonry|lintel|pier|rafter|girder|capacity)s?\\b)", "essential, or say what breaks without it"],
    ["\\bunderscore(?:s|d)? (?:the|how|that|why)\\b", "shows"],
    ["\\b(?:the|today['\u2019]s|current|evolving|competitive|digital|tech|business|AI) landscape\\b|\\blandscape of\\b", "field, market, or cut"],
  ]),
  ...words(
    [
      ["harness(?:es|ed|ing)?", "use"], ["navigat(?:e|es|ing)", "handle, or name the work"],
      ["foster(?:s|ing)?", "build, cause"], ["elevate(?:s|d)?", "improve, raise"],
      ["unleash(?:es|ed|ing)?", "release, start"], ["streamline(?:s|d)?", "simplify, speed up"],
      ["bolster(?:s|ed|ing)?", "strengthen, add to"], ["spearhead(?:s|ed|ing)?", "lead"],
      ["resonates? with", "matches, appeals to"], ["facilitate(?:s|d)?", "help, run"],
      ["underpin(?:s|ning)?", "supports"], ["nuanced", "name the difference"],
      ["multifaceted", "list the parts"], ["ecosystem", "the tools, the parts"],
      ["myriad|plethora", "many, or the number"], ["encompass(?:es|ed)?", "includes, covers"],
      ["catalyz(?:e|es|ed)|catalyst for", "causes"], ["reimagine(?:s|d)?", "redesign"],
      ["galvaniz(?:e|es|ed)", "prompt, spur"], ["augment(?:s|ed|ing)?", "add to"],
      ["cultivate(?:s|d)?", "build, grow"], ["illuminate(?:s)?", "shows, explains"],
      ["elucidate(?:s)?", "explain"], ["juxtapose(?:s|d)?", "compare"],
      ["cornerstone", "the main part"], ["paramount", "most important"],
      ["poised to", "about to, or say when"], ["burgeoning", "growing"], ["nascent", "new, early"],
      ["quintessential", "typical"], ["overarching", "main, general"],
      ["transformative", "describe the change"],
    ],
    2,
  ),
];

const wordiness = words([
  ["utili[sz](?:e|es|ed|ing)", "use"], ["in order to", "to"], ["due to the fact that", "because"],
  ["commence(?:s|d)?", "start"], ["ascertain", "find out"], ["endeavou?r(?:s|ed|ing)?", "try, effort"],
  ["prior to", "before"], ["subsequent to", "after"], ["in the event that", "if"],
  ["at this time|at this point in time", "now"], ["for the purpose of", "to, for"],
  ["with regard to", "about"], ["in conjunction with", "with"], ["in accordance with", "as in, follow"],
  ["(?:is|are) capable of|(?:has|have) the ability to", "can"], ["a number of", "some, or the number"],
  ["a large number of", "many, or the number"], ["it is necessary to", "you must"],
  ["in the vicinity of|in close proximity", "near"], ["the majority of", "most"],
  ["in spite of the fact that", "although"],
]);

const transitions = [
  ...opening([
    ["moreover|furthermore|additionally", 'cut, or "and", "also"'],
    ["notably|importantly|interestingly|surprisingly", "cut"],
  ]),
  ...words([
    ["in today's", "name the context or cut"], ["in an era (?:where|of)", "cut"],
    ["in the (?:rapidly )?(?:evolving|changing) (?:world|field) of", "lead with the point"],
    ["(?:it's |it is )?worth noting", "state the fact"], ["when it comes to", "name the thing"],
    ["here's (?:what's interesting|what caught my eye|what stood out|the interesting part)", "state the fact"],
    ["that (?:being )?said", 'cut, or "but"'],
    ["certainly(?!\\s*!)|undoubtedly|without a doubt", "cut"],
  ]),
];

const filler = [
  ...opening([["honestly", "cut"]]),
  ...words([
    ["genuinely|truly|quite frankly|to be honest|real talk|at its core|here's the thing", "cut"],
    ["let's be (?:clear|honest)", "cut"],
    ["a genuine (?:improvement|step|shift|change|concern|interest)", "cut"],
    ["(?:it's|it is) important to (?:note|remember|understand)", "state the point"],
    ["worth (?:flagging|mentioning|remembering)", "state the point"],
    ["let's (?:unpack|dive in|explore|take a look|break (?:this|it) down|examine|get started)", "start with the point"],
    ["straightforward", "cut, or say what the steps are"], ["a powerful example", "the example"],
    ["this (?:highlights|speaks to)", "state the fact"], ["the broader takeaway", "state it"],
    ["(?:a (?:stark |powerful |timely )?|an important )reminder (?:that|of)", "state the fact"],
    ["I recently had the pleasure of", "say what happened"],
  ]),
  ...raw([["\\bwhether you['\u2019]re .{1,40}? or ", "name the audience or cut"]]),
];

const hedging = [
  ...opening([["note that", "cut, state the fact"]]),
  ...words([
    ["perhaps|arguably", "cut, or commit"], ["(?:may|could) eventually", "say when"],
    ["(?:could|may|might) potentially|(?:might|could) possibly", "can, or cut"],
    ["to be clear|in general", "cut"], ["keep in mind", "cut, state the fact"],
    ["generally|typically", "cut, or name the exception"], ["in (?:some|many|most) cases", "name the case"],
    ["somewhat|to some extent", "cut, or measure"],
    ["it (?:could|may|might) be (?:argued|said)", "state the claim"],
  ]),
  ...raw([["(?<!(?:could|may|might) )\\bpotentially\\b", "cut"]]),
];

const chatbot = [
  ...opening([["(?:certainly|absolutely|of course)!", "cut"]]),
  ...words([
    ["(?:I hope|hope) this helps", "cut"], ["(?:great|excellent|good) question", "cut"],
    ["feel free to (?:reach out|ask|contact|let me know)", "cut"], ["don't hesitate to", "cut"],
    ["let me know if (?:you|there|that|this|it)", "cut"], ["happy to help", "cut"],
    ["(?:I'd|I would) be happy to", "cut"], ["as an AI(?: language model)?", "cut"],
    ["as of my (?:last|latest) (?:update|training|knowledge)|knowledge cutoff", "cut"],
    ["I don't have access to real-time", "cut"], ["please note that", "state the fact"],
    ["kindly \\w+", 'imperative without "kindly"'],
  ]),
];

const sycophancy = [
  ...opening([["you're right", "cut, state the fix"]]),
  ...words([
    ["you're absolutely right", "cut"], ["what a (?:great|fantastic|wonderful)", "cut"],
    ["(?<!an? )(?:great|excellent) (?:point|idea|catch|observation|suggestion)", "cut"],
    ["that's an? (?:great|excellent|fantastic|wonderful|really good|insightful) (?:point|idea|observation)", "cut"],
    ["I (?:completely|totally) (?:understand|agree)", "cut"],
    ["thank you for (?:sharing|bringing this|pointing|the clarification|your patience)", "cut"],
    ["thanks for (?:sharing|pointing|flagging)", "cut"],
    ["you raise an? (?:great|excellent|good|valid|important) point", "cut"],
    ["I apologize for (?:the|any) (?:confusion|oversight|inconvenience)|apologies for the confusion|my apologies", "state the correction"],
  ]),
];

const PAIR_END = "[,;\u2014\u2013-]\\s*(it|this|that)(['\u2019]s| is)\\b";
const contrast = [
  ...raw([
    [`\\b(it|this|that)(['\u2019]s| is) not (just |only |about |merely |simply )?[^.!?\\n]{1,60}?${PAIR_END}`, "state the positive claim"],
    [`\\bisn['\u2019]t (just |only |about )?[^.!?\\n]{1,60}?${PAIR_END}`, "state the positive claim"],
    ["\\bnot (just|only|merely|simply) [^.!?\\n]{1,60}?\\b(but|it['\u2019]s|it is)\\b", "state Y"],
  ]),
  ...raw(
    [[",\\s*not\\s+(?:a|an|the|just|only|merely)?\\s*[\\w'\u2019-]+(?:\\s+[\\w'\u2019-]+){0,2}[.!?]\\s*$", 'write the claim as "X does Y"']],
    "gim",
  ),
];

const copula = words([
  ["serves as|acts as|stands as|functions as", "is, or the literal action"], ["boasts", "has"],
  ["the source of truth", "say what reads it"], ["the key constraint", "name the constraint"],
  ["the path forward", "the next step, named"], ["this ensures", "say what happens"],
  ["plays an? (?:key|vital|critical|central|significant|important) role", "say what it does"],
  ["designed to (?:help|ensure|provide|enable|make)", "say what it does"],
]);

const inflation = words([
  ["marks a (?:significant|major|new|turning)", "state what happened"],
  ["represents a (?:significant|major|fundamental)", "state what changed"],
  ["a (?:significant|major|important|bold|big) step (?:forward|towards|toward)|step forward for", "state what changed"],
  ["turning point|sea change|paradigm shift|game-chang(?:er|ing)|watershed moment", "state what changed"],
  ["groundbreaking", "name the prior art it beats"], ["first of its kind", "cite the search"],
  ["revolutionary|revolutioniz(?:e|es|ed)", "describe the change"], ["the future of", "cut"],
  ["unprecedented", "name the precedent, or cut"],
  ["redefines? (?:the|how|what)|reshap(?:e|es|ing) the", "describe the change"],
  ["(?:real|actual|true) (?:utility|value|impact|change|results)|genuine (?:utility|value|impact|results)", "drop the adjective"],
  ["despite (?:these |the )?challenges", "name the challenge"],
  ["continues to thrive|remains resilient", "cite the number"],
]);

const closers = [
  ...opening([["ultimately", "cut"], ["as we move forward|moving forward", "cut"]]),
  ...words([
    ["in conclusion|in summary|to summarize|to sum up", "cut, end on the last fact"],
    ["at the end of the day|only time will tell|stay tuned|exciting times|happy coding|thank me later", "cut"],
    ["the future (?:looks|is) bright|the possibilities are endless", "cut"],
    ["one thing is (?:certain|clear)", "state it"],
    ["worth (?:reading|a look|a read|exploring|checking out|your time)", "say why"],
    ["the (?:journey|adventure) (?:begins|continues|is just beginning)", "cut"],
    ["the (?:bottom line|key takeaway|takeaway here)", "state it"],
    ["(?:I|we) look forward to", "cut, or state the next step and date"],
  ]),
];

const structure = [
  ...raw(
    [
      ["^(?:But )?(?:what|so why|why) (?:does this mean|should you care|does (?:it|this) matter)\\b", "answer it"],
      ["^\\s*(?:picture this|run the numbers|think about it|consider this)[.:]", "state the fact"],
      ["^\\s*(?:three|four|five|six|seven|ten|\\d+) (?:key )?(?:takeaways|things (?:to know|you need)|reasons|ways|tips)\\b", "drop the count, lead with the finding"],
      ["^\\s*(?:let me (?:think|break this down|walk through this) step by step|here['\u2019]s my thought process|to approach this systematically|breaking this down:)", "cut, give the result"],
    ],
    "gim",
  ),
  ...raw([["(?<=^|[.!?]\\s)Enter [A-Z]\\w+\\.", "name it in a plain sentence"]], "gm"),
  ...words([
    ["(?:have you )?ever wondered|what if I told you", "state the fact"],
    ["(?:imagine|picture|envision) a (?:world|future|scenario) (?:where|in which)", "state the fact"],
  ]),
  ...opening([["you're asking about|to answer your question|the question of whether", "answer"]]),
];

const formatting = raw(
  [
    ["^#{1,6}\\s.*?(?<hit>\\p{Extended_Pictographic})", "remove"],
    ["(?<hit>\\p{Extended_Pictographic})[ \\t]*$", "remove"],
  ],
  "gmu",
);

const ste = [
  ...words([
    ["accomplish(?:es|ed)?|perform(?:s|ed)?|conduct (?:a|the) (?:test|check|review)", "do"],
    ["acquire|obtain|procure", "get"], ["adhere to|comply with", "obey"],
    ["assist|aid|assistance", "help"], ["attempt(?:s|ed)?", "try"], ["cease|discontinue", "stop"],
    ["initiate(?:s|d)?|commencement", "start"], ["depress (?:the|a) (?:button|switch)", "push"],
    ["desire(?:s|d)?", "want"], ["indicate(?:s|d)?", "show"], ["locate(?:s|d)?", "find"],
    ["modif(?:y|ies|ied)", "change"], ["observe(?:s|d)?", "look at, see"], ["permit(?:s|ted)?", "let"],
    ["purchase(?:s|d)?", "buy"], ["rectif(?:y|ies|ied)|remed(?:y|ies|ied)", "correct, repair"],
    ["replenish(?:es|ed)?", "fill"], ["retain(?:s|ed)?", "keep"], ["transmit(?:s|ted)?", "send"],
    ["verif(?:y|ies|ied)", "make sure"], ["aperture", "hole"], ["malfunction", "fault"],
    ["personnel", "persons"], ["portion", "part"], ["remainder", "the other part"],
    ["requirements?", "need"], ["termination", "end"], ["utilization", "use"],
    ["adequate|sufficient", "enough"], ["adjacent", "near, next to"], ["approximately", "about"],
    ["additional", "more"], ["initial", "first"], ["numerous|multiple", "many"], ["optimum", "best"],
    ["previous", "before, earlier"], ["principal", "main"],
  ]),
  ...raw([
    ["(?<!designed to )\\bensure\\b", "make sure"],
    ["(?<!let['\u2019]s )\\b(?:examine|inspect)\\b", "do a check of"],
    ["(?<!in the )\\bvicinity\\b", "area"],
    ["\\brapidly\\b(?! (?:evolving|changing))", "quickly"],
    ["\\bsubsequent\\b(?! to)", "after, next"],
  ]),
];

export const CATEGORIES = [
  { id: "vocabulary", label: "AI frequency words", patterns: vocabulary },
  { id: "wordiness", label: "wordiness", patterns: wordiness },
  { id: "transitions", label: "transitions", patterns: transitions },
  { id: "filler", label: "filler", patterns: filler },
  { id: "hedging", label: "hedging", patterns: hedging },
  { id: "chatbot", label: "chatbot phrases", patterns: chatbot },
  { id: "sycophancy", label: "sycophancy", patterns: sycophancy },
  { id: "contrast", label: "contrast frames", patterns: contrast },
  { id: "copula", label: "interpreting verbs", patterns: copula },
  { id: "inflation", label: "significance inflation", patterns: inflation },
  { id: "closers", label: "closers", patterns: closers },
  { id: "structure", label: "openers and frames", patterns: structure },
  { id: "formatting", label: "formatting", patterns: formatting },
  { id: "ste", label: "simplified technical english", patterns: ste },
];

const ALL_IDS = CATEGORIES.map((c) => c.id);
const OFF_BY_DEFAULT = ["wordiness", "hedging", "copula", "ste"];
const DEFAULT_IDS = ALL_IDS.filter((id) => !OFF_BY_DEFAULT.includes(id));

export const PRESETS = {
  default: { categories: DEFAULT_IDS, allow: [] },
  ryan: { categories: ALL_IDS.filter((id) => id !== "ste"), allow: [] },
  technical: {
    categories: DEFAULT_IDS.filter((id) => id !== "formatting"),
    allow: ["robust", "comprehensive", "seamless", "ecosystem", "leverage", "facilitate", "underpin", "streamline"],
  },
  ste: { categories: ["wordiness", "hedging", "copula", "ste"], allow: [] },
  minimal: { categories: ["chatbot", "sycophancy"], allow: [] },
  all: { categories: ALL_IDS, allow: [] },
};
