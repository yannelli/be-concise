# Installation

This guide tells you how to install Concise in Claude Code, Codex, or omp. It also tells you how to review the hooks and how to see a sample denial. After your host loads and trusts the hooks, the 3 core checks run without configuration. The em-dash and AI-writing checks stay disabled until you enable them.

## Prerequisites

The environment that runs your agent must have these tools on `PATH`:

- Git
- Node.js
- Bash
- `jq`
- `realpath`
- Core Unix tools

The file checks do not need a GitHub account or `gh`. The PR and issue checks apply when the agent uses `gh`.

To make sure that the necessary executables are available, run this command in a Bash terminal:

```sh
command -v git node bash jq realpath
```

If a command is not available, install it with the package manager of your system. Then make sure that the agent process can use the command. Concise needs no more setup steps and no configuration for its core checks.

## Claude Code

Run these slash commands in Claude Code. Do not run them in your terminal:

```text
/plugin marketplace add https://github.com/yannelli/be-concise
/plugin install concise@be-concise
```

Then do these steps:

1. Review the hook commands.
2. Select an installation scope.
3. If the install summary tells you to reload the plugins, run this command:

   ```text
   /reload-plugins
   ```

Then go to [Verify the core checks](#verify-the-core-checks). For installation and scope options that are specific to the host, refer to the [Claude Code plugin documentation](https://code.claude.com/docs/en/discover-plugins).

## Codex CLI

Concise supports Codex CLI **0.152.0 or newer**. Do these steps:

1. Make sure that you have a supported version:

   ```sh
   codex --version
   ```

2. Install Concise from your terminal:

   ```sh
   codex plugin marketplace add yannelli/be-concise
   codex plugin add concise@be-concise
   ```

3. Start a new Codex session.
4. Run `/hooks`.
5. Review each `concise` hook under both `PreToolUse` and `Stop`.
6. Trust each `concise` hook under both `PreToolUse` and `Stop`.

Each time a hook definition changes, Codex asks for a review again. The installation alone does not make Codex trust the hooks.

If your automation already validates its hook sources, you can use the Codex bypass for one invocation.

**CAUTION:** Do not use the bypass in place of a review of hook code that you do not know.

```sh
codex exec --dangerously-bypass-hook-trust "<prompt>"
```

The bypass does not do the hook trust review for that invocation. It does not save trust. For host details, refer to the [Codex plugin documentation](https://developers.openai.com/plugins/build/plugins#add-a-marketplace-from-the-cli).

## omp

You install Concise in omp (oh-my-pi) from the same marketplace. Do these steps:

1. Run these commands in your terminal:

   ```sh
   omp plugin marketplace add yannelli/be-concise
   omp plugin install concise@be-concise
   ```

2. Start a new omp session.

omp loads the hooks as an extension when a session starts. Thus, `/reload-plugins` does not load them. omp has no subagent stop event. Thus, Concise does not do a check of subagent replies. Refer to the [omp marketplace documentation](https://github.com/can1357/oh-my-pi/blob/main/docs/marketplace.md).

## Verify the core checks

Do these steps:

1. Use a scratch project.
2. Ask the agent to create `concise-demo.js` with its file-write tool.
3. Tell the agent that the file must contain exactly this 3-line comment:

   ```js
   // Read the input.
   // Check the value.
   // Return the result.
   ```

The comment-length check denies a contiguous comment run of more than 2 lines. The agent gets the denial before the write occurs. Thus, the agent can make the comment shorter and try again.

This is a sample denial. The path is an example:

```text
[concise] Comment at /tmp/demo/concise-demo.js:1 is 3 lines (limit 2). Trim it to the one non-obvious point, or put "concise-ignore" inside it if it is a genuine exception.
```

If the agent makes the comment shorter before its first tool call, you will not see a denial. To do a test of the hook, the tool call must contain all 3 lines. During this test, do not send the tool call again many times. After 2 denied retries on the same target, Concise allows and flags the next action. If the agent creates a demo file, remove it after the test.

The file-size and PR-body checks are also enabled by default. For their limits and scope, refer to the [overview](/docs/#what-runs-by-default) and the [configuration reference](/docs/configuration/).

## Enable optional style checks

Do these steps:

1. Create a project configuration file. For Claude Code, use `.claude/concise.json`. For Codex, use `.codex/concise.json`.
2. If the file already has settings, merge these feature settings into it. If not, add this JSON:

   ```json
   {
     "features": {
       "emDash": { "enabled": true },
       "aiWriting": { "enabled": true, "preset": "default" }
     }
   }
   ```

If both files exist, **`.claude/concise.json` has priority** on all hosts.

If you have a checkout of the source repository, you can copy `plugins/concise/.claude/concise.json.example` to the correct project path. Use it in place of the JSON above. The example file shows more settings that you can use.

To enable the checks for one session without a file, start your host with environment variables:

```sh
BEC_FEATURE_ENABLE=emDash,aiWriting claude
```

For Codex, use this command:

```sh
BEC_FEATURE_ENABLE=emDash,aiWriting codex
```

These baseline variables have a lower priority than the user and project configuration. A configuration file can override them. If you must have an override, use the `ALWAYS` forms. Refer to [environment variables](/docs/environment/) and the [5 configuration layers](/docs/configuration/#the-five-layers).

## Read a style denial

After you enable `aiWriting`, ask the agent to write `notes.md` in your scratch project. The file must contain this sentence:

```text
We delve into the parser.
```

This is a sample denial. The paths are examples:

```text
[concise] 1 AI writing pattern in /tmp/demo/notes.md.
[concise:vocabulary] 1 match at line 1: "delve" (look at, examine).
Suppress: concise-ignore on the line, or allowList.phrases in concise.json. Reference: <plugin>/skills/concise-rules/references/ai-speak-patterns.md

To keep it, send the identical write again to confirm. To fix it, read <plugin>/skills/concise-rules/references/ai-speak-patterns.md.
```

In the default `confirm` mode, you can select one of these options:

1. Change the sentence to `We read the parser.` Concise does a check of the new write and allows it if it passes.
2. To keep the words, send the identical write again. Concise allows it and reports that the text was kept after confirmation.
3. To stop the check for this one instance, put `concise-ignore` on that line.

The [pattern library](/docs/ai-speak-patterns/) explains each finding. The [confirmation modes](/docs/configuration/#mode) section describes `confirm`, `ask`, and `deny`.

## If nothing is flagged

- Make sure that the plugin is installed in the scope that you selected.
- Make sure that the host loaded the hooks.
- If Claude Code tells you to reload the plugins, do the reload.
- In Codex, start a new session. Then review the hook trust.
- Make sure that the dependencies are on the `PATH` of the agent process. A check in a separate terminal is not enough.
- For style checks, make sure that `enabled` is `true` in the configuration layer that has priority. Both features are disabled by default.
- For the test, use a normal project file. Concise ignores generated paths. By default, the style checks do not apply to agent instruction files.
- Do a check of `softFail`, bypass phrases, allow lists, and ignore markers. These settings can change a denial into a flag. They can also remove the text from the checks.
- Start the [web console](/docs/console/). While the agent works, look at **Live activity**. You can also paste the text into the playground.
- To see the decision of each hook, enable the [log](/docs/configuration/#log).
- Pattern matches are heuristic. Statistical checks do not apply to text that is shorter than their minimum size.

For shared settings and cloud agents, go to [configuration](/docs/configuration/) and [environment variables](/docs/environment/). To add checks for words that are specific to your team, read [pattern packs](/docs/packs/).
