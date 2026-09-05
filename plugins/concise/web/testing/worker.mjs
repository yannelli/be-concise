import { createWriteStream, readFileSync } from "node:fs";
import { finished } from "node:stream/promises";
import { loadConfig } from "../../hooks/lib/config.mjs";
import { styleLog } from "../../hooks/lib/style-check.mjs";
import { scan } from "./scan.mjs";

const hook = process.argv[2];
if (!["check-edit", "check-bash", "check-reply"].includes(hook)) throw new Error("Unsupported playground hook");
const input = JSON.parse(readFileSync(process.argv[3], "utf8"));
await import(`../../hooks/${hook}.mjs`);
const style = structuredClone(styleLog());
let matches = [];
let error = null;
try {
  matches = await scan(input, loadConfig(input.cwd), hook);
} catch (cause) {
  error = `Match diagnostics: ${cause.message}`;
}
const diagnostics = createWriteStream(null, { fd: 3 });
diagnostics.end(JSON.stringify({ style, matches, error }));
await finished(diagnostics);
