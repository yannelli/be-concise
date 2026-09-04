import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const header = /^(feat|fix|perf|docs|chore|ci|build|refactor|style|test|revert)(\([a-z0-9][a-z0-9._/-]*\))?!?: \S[^\r\n]*$/;

export function checkPullRequest(pr) {
  if (!header.test(pr.title)) {
    throw new Error("Use a Conventional Commit PR title: type(scope): description, or type(scope)!: breaking change");
  }
  if (/^BREAKING[ -]CHANGE:\s*\S/m.test(pr.body || "") && !/!:/u.test(pr.title)) {
    throw new Error("Put ! before the colon in the PR title when the body declares a breaking change");
  }
  if (pr.base.ref === "main" && (pr.head.ref !== "dev" || pr.head.repo?.full_name !== pr.base.repo.full_name)) {
    throw new Error("Release PRs must promote this repository's dev branch to main using a merge commit");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { pull_request: pr } = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  checkPullRequest(pr);
  console.log("PR title and target follow the release guidelines");
}
