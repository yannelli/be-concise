export const examples = {
  comments: {
    label: 'Long comments', file: 'src/auth.ts', language: 'TypeScript',
    before: `// Check whether the provided user has
// permission to access the resource.
// First read their permissions list,
// then look for the requested entry.
// Return true when a match is found.
export function canAccess(user, resource) {
  return user.permissions.includes(resource);
}`,
    after: `// Check resource permissions.
export function canAccess(user, resource) {
  return user.permissions.includes(resource);
}`,
    finding: 'Comment is 5 lines (limit 2).',
    diagnostic: '[concise] Comment at src/auth.ts:1 is 5 lines (limit 2).',
    result: '5 comment lines become 1. The code stays the same.',
    beforeCount: '5 comment lines', afterCount: '1 comment line',
  },
  files: {
    label: 'Oversized files', file: 'src/session.ts', language: 'File structure',
    before: `src/
└── session.ts                 324 lines
    ├── session types
    ├── input validation
    └── storage operations`,
    after: `src/session/
├── types.ts                   118 lines
├── validation.ts               94 lines
└── storage.ts                 112 lines

Total                         324 lines`,
    finding: 'New file would be 324 lines (limit 300).',
    diagnostic: '[concise] src/session.ts would be 324 lines (limit 300).',
    result: 'The agent can split the new file into focused modules.',
    beforeCount: '1 file over the limit', afterCount: '3 focused files',
  },
  prs: {
    label: 'Padded PRs', file: 'gh pr create --body', language: 'Pull request body',
    before: `This PR updates the authentication middleware
for the API. It adds a permission check to
protected routes. It also introduces tests
for expired sessions. These changes improve
the way the application handles access
control across the entire system.`,
    after: `## Summary
- Check permissions on protected routes.
- Test expired sessions.

## Test plan
- Run the authentication test suite.`,
    finding: 'A prose paragraph has 4 sentences (limit 3).',
    diagnostic: '[concise] PR/issue body is too verbose: a paragraph has 4 sentences (limit 3).',
    result: 'A structured summary is allowed.',
    beforeCount: '4 prose sentences', afterCount: 'A structured summary',
  },
} as const;
export type ExampleKey = keyof typeof examples;
export const presets = [
  { id: 'default', count: 21, description: 'A focused starting point for everyday projects.' },
  { id: 'technical', count: 22, description: 'API docs and comments, with eight engineering words allowed.' },
  { id: 'minimal', count: 4, description: 'Remove chat boilerplate without policing every phrase.' },
  { id: 'git', count: 7, description: 'Rules for commits, pull requests, and reviews.' },
  { id: 'ryan', count: 38, description: 'The full house rules, without STE or statistics-only checks.' },
  { id: 'ste', count: 4, description: 'Procedures and writing intended for translation.' },
  { id: 'statistical', count: 10, description: 'Text-statistics checks for longer documents.' },
  { id: 'all', count: 47, description: 'Every category, including Simplified Technical English.' },
] as const;
export const installCommands = {
  claude: '/plugin marketplace add https://github.com/yannelli/be-concise\n/plugin install concise@be-concise',
  codex: 'codex plugin marketplace add yannelli/be-concise\ncodex plugin add concise@be-concise',
  omp: 'omp plugin marketplace add yannelli/be-concise\nomp plugin install concise@be-concise',
  console: 'npm install -g @yannelli/be-concise\nconcise-web --all',
};
export const consoleViews = [
  { id: 'overview', label: 'Overview', caption: 'Hook calls, interventions, the active limits, and the rules that matched most, for each project.', alt: 'Concise console overview for a project named billing-api: 9 live hook calls, 6 interventions, 10 text findings, the active limits, and matched rules led by vocabulary.' },
  { id: 'activity', label: 'Live activity', caption: 'Each hook call as it happens. Expand one to see the findings and the exact response your agent received.', alt: 'Live activity with a denied git commit expanded: three vocabulary matches (Leverage, robust, seamless) and the hook response sent to the agent.' }, // taste-skill-ignore: quotes words the hook flagged
  { id: 'playground', label: 'Playground', caption: 'Paste text and run it through the real hooks. Each match comes with its rule, line, and suggested fix.', alt: 'Playground result for a Write call: matches for an em dash, delve, In conclusion, and game-changer, each with a suggested fix, and the hook decision.' }, // taste-skill-ignore: quotes words the hook flagged
  { id: 'configuration', label: 'Configuration', caption: 'Pick a configuration layer and change it with switches, numbers, or raw JSON.', alt: 'Configuration page with the project layer selected: switches for core checks and scanned text, the numeric thresholds, and AI writing set to the default preset.' },
  { id: 'rules', label: 'Rules & usage', caption: 'Switch pattern packs on and off for a project or for your user settings, or add your own.', alt: 'Rules and usage page listing 50 built-in pattern packs, each with an active state and a switch.' },
] as const;
