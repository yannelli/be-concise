#!/usr/bin/env node
import { spawn } from "node:child_process";
import { startServer } from "../plugins/concise/web/server.mjs";
import { update } from "../plugins/concise/web/update.mjs";

const help = `Usage: concise-web [--cwd PATH | --all] [--port PORT] [--remote] [--no-open]
       concise-web update [--check]

Starts the Concise configuration, playground, and live hook console.
Defaults: current directory, available localhost port, open browser.
Use --all to serve every project the hooks have registered under ~/.config/concise/projects.
Use --remote to accept this machine's IPv4 addresses and Tailscale hostnames.

update installs the latest npm release, updates the plugin in Claude Code,
Codex, and omp, and restarts consoles that run as a systemd user service.
Use --check to report what would change without changing it.

From the repository: node bin/concise-web.mjs
Install from npm: npm install -g @yannelli/be-concise
`;

function parse(args) {
  if (args[0] === "update") {
    for (const arg of args.slice(1)) {
      if (arg === "--help" || arg === "-h") return { help: true };
      if (arg !== "--check") throw new Error(`Unknown option: ${arg}`);
    }
    return { update: { check: args.includes("--check") } };
  }
  const options = {};
  let open = true;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (arg === "--no-open") open = false;
    else if (arg === "--remote") options.remote = true;
    else if (arg === "--all") options.all = true;
    else if (arg === "--cwd" || arg === "--port") {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      if (arg === "--cwd") options.cwd = value;
      else {
        if (!/^\d+$/.test(value) || Number(value) > 65535) throw new Error("--port must be an integer from 0 to 65535");
        options.port = Number(value);
      }
    } else throw new Error(`Unknown option: ${arg}`);
  }
  if (options.all && options.cwd) throw new Error("--all and --cwd are exclusive");
  return { options, open };
}

try {
  const args = parse(process.argv.slice(2));
  if (args.help) process.stdout.write(help);
  else if (args.update) {
    if (!await update(args.update)) process.exitCode = 1;
  } else {
    const consoleServer = await startServer(args.options);
    const address = `${consoleServer.browserUrl}/#token=${consoleServer.token}`;
    const network = consoleServer.networkUrls.map((url) => `Network console: ${url}/#token=${consoleServer.token}\n`).join("");
    const scope = consoleServer.hub ? `Projects: ${consoleServer.projectsDir}` : `Project: ${consoleServer.cwd}`;
    let closing = false;
    const close = async () => {
      if (closing) return;
      closing = true;
      await consoleServer.close();
    };
    process.on("SIGINT", close);
    process.on("SIGTERM", close);
    process.stdout.write(`Concise console: ${address}\n${network}${scope}\nPress Ctrl+C to stop.\n`);
    if (args.open) {
      const [command, flags] = process.platform === "darwin" ? ["open", [address]]
        : process.platform === "win32" ? ["rundll32", ["url.dll,FileProtocolHandler", address]] : ["xdg-open", [address]];
      const browser = spawn(command, flags, { detached: true, stdio: "ignore" });
      const failed = () => process.stderr.write("Browser launch failed. Open the console URL above.\n");
      browser.once("error", failed);
      browser.once("exit", (code) => { if (code) failed(); });
      browser.unref();
    }
  }
} catch (err) {
  process.stderr.write(`concise-web: ${err.message}\n`);
  process.exitCode = 1;
}
