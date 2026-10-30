# Installation

Install Concise in Claude Code, Codex, or omp, review its hooks, then check a sample denial. Once your host loads and trusts the hooks, the 3 core checks run without configuration. Em-dash and AI-writing checks stay off until you enable them.

## Prerequisites

You need Git, Node.js, Bash, `jq`, `realpath`, and core Unix tools on `PATH` in the environment that runs your agent. A GitHub account or `gh` is not needed for file checks; the PR and issue checks apply when the agent uses `gh`.

Check the required executables in a Bash terminal:

```sh
command -v git node bash jq realpath
```

If any command is missing, install it with your system’s package manager and make it available to the agent process. Concise has no extra setup step or configuration requirement for its core checks.

## Claude Code

Run these slash commands inside Claude Code, not in your terminal:

```text
/plugin marketplace add https://github.com/yannelli/be-concise
/plugin install concise@be-concise
```

Review the hook commands and choose an installation scope. If the install summary requests it, reload the plugins:

```text
/reload-plugins
```

Continue with [verification](#verify-the-core-checks). For host-specific installation and scope options, see the [Claude Code plugin documentation](https://code.claude.com/docs/en/discover-plugins).

## Codex CLI

Codex CLI **0.152.0 or newer** is the supported baseline. Check your version first:

```sh
codex --version
```

Install from your terminal:

```sh
codex plugin marketplace add yannelli/be-concise
codex plugin add concise@be-concise
```

Start a new Codex session. Run `/hooks`, and review and trust each `concise` hook under both `PreToolUse` and `Stop`. Codex asks for review again whenever a hook definition changes; installation alone does not grant trust.

For automation that already validates its hook sources, Codex offers a per-invocation bypass:

```sh
codex exec --dangerously-bypass-hook-trust "<prompt>"
```

This skips hook trust review for that invocation and does not save trust. Do not use it as a substitute for reviewing unfamiliar hook code. See the [Codex plugin documentation](https://developers.openai.com/plugins/build/plugins#add-a-marketplace-from-the-cli) for host details.

## omp

omp (oh-my-pi) installs from the same marketplace. Run these in your terminal:

```sh
omp plugin marketplace add yannelli/be-concise
omp plugin install concise@be-concise
```

Start a new omp session. omp loads the hooks as an extension when a session starts, so `/reload-plugins` does not pick them up. omp has no subagent stop event, so subagent replies are not checked. See the [omp marketplace documentation](https://github.com/can1357/oh-my-pi/blob/main/docs/marketplace.md).

## Verify the core checks

Use a scratch project and ask the agent to create `concise-demo.js` with its file-write tool, containing exactly this three-line comment:

```js
// Read the input.
// Check the value.
// Return the result.
```

A contiguous comment run over two lines should trigger the comment-length check. The denial reaches the agent before the write lands, so it can shorten the comment and try again.

Sample denial, with an illustrative path:

```text
[concise] Comment at /tmp/demo/concise-demo.js:1 is 3 lines (limit 2). Trim it to the one non-obvious point, or put "concise-ignore" inside it if it is a genuine exception.
```

If the agent shortens the comment before its first tool call, no denial is expected. To exercise the hook, the pending tool call must actually contain the three lines. Do not repeatedly resend it during this test: after two denied retries on the same target, the next action is allowed and flagged. Remove any demo file that the agent eventually creates.

The file-size and PR-body checks are also enabled by default. Their limits and scope are in the [overview](/docs/#what-runs-by-default) and [configuration reference](/docs/configuration/).

## Enable optional style checks

Create a project configuration file at `.claude/concise.json` for Claude Code or `.codex/concise.json` for Codex. If both exist, **`.claude/concise.json` wins**, regardless of the host.

Add this JSON, or merge these feature settings into your existing file:

```json
{
  "features": {
    "emDash": { "enabled": true },
    "aiWriting": { "enabled": true, "preset": "default" }
  }
}
```

If you have a checkout of the source repository, you can copy `plugins/concise/.claude/concise.json.example` into the appropriate project path instead. The example lists more available settings.

For one session without creating a file, start your host with environment variables:

```sh
BEC_FEATURE_ENABLE=emDash,aiWriting claude
```

Or, for Codex:

```sh
BEC_FEATURE_ENABLE=emDash,aiWriting codex
```

These baseline variables sit below user and project configuration. A config file can override them; use the `ALWAYS` forms when you intentionally need an override. See [environment variables](/docs/environment/) and the [five configuration layers](/docs/configuration/#the-five-layers).

## Read a style denial

After enabling `aiWriting`, ask the agent to write `notes.md` in your scratch project with this sentence:

```text
We delve into the parser.
```

Sample denial, with illustrative paths:

```text
[concise] 1 AI writing pattern in /tmp/demo/notes.md.
[concise:vocabulary] 1 match at line 1: "delve" (look at, examine).
Suppress: concise-ignore on the line, or allowList.phrases in concise.json. Reference: <plugin>/skills/concise-rules/references/ai-speak-patterns.md

To keep it, send the identical write again to confirm. To fix it, read <plugin>/skills/concise-rules/references/ai-speak-patterns.md.
```

In the default `confirm` mode, you can:

1. Rewrite the sentence as `We read the parser.` The new write is checked and allowed if it passes.
2. Keep the wording by sending the identical write again. Concise allows it and reports that it was kept after confirmation.
3. Put `concise-ignore` on that line to exempt the instance.

The [pattern library](/docs/ai-speak-patterns/) explains individual findings. [Configuration modes](/docs/configuration/#mode) describes `confirm`, `ask`, and `deny`.

## If nothing is flagged

- Check that the plugin is installed in your intended scope and that the host loaded its hooks. Follow any Claude reload request; in Codex, start a new session and review hook trust.
- Check dependencies on the agent process’s `PATH`, not only in a separate terminal.
- For style checks, confirm `enabled` is `true` in the winning config layer. Both features start disabled.
- Use an ordinary project file for the test. Generated paths are ignored, and agent instruction files are excluded from style checks by default.
- Check `softFail`, bypass phrases, allow lists, and ignore markers. They can turn a denial into a flag or exempt the text.
- Run the [web console](/docs/console/) and watch **Live activity** while the agent works, or paste the text into its playground. You can also enable [logging](/docs/configuration/#log) to see each hook’s decision. Pattern matching is heuristic, and statistical checks skip texts below their minimum size.

For shared settings and cloud agents, continue to [configuration](/docs/configuration/) and [environment variables](/docs/environment/). To add team-specific wording checks, read [pattern packs](/docs/packs/).
