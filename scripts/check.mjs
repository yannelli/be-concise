import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { verifyConditions } from "./release-manifests.mjs";

const paths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "*.mjs", "*.json"], { encoding: "utf8" })
  .split("\0").filter(Boolean);

for (const path of new Set(paths)) {
  if (path.endsWith(".mjs")) execFileSync(process.execPath, ["--check", path], { stdio: "inherit" });
  else JSON.parse(readFileSync(path, "utf8"));
}
await verifyConditions({}, { cwd: process.cwd() });
console.log("JavaScript syntax, JSON, and release versions are valid");
