const PATCH_SPAN = /\*\*\* Begin Patch\r?\n[\s\S]*?\r?\n\*\*\* End Patch/;
const HUNK_HEADER = /^\*\*\* (Add File|Update File|Delete File): (.+)$/;
const KIND = { "Add File": "add", "Update File": "update", "Delete File": "delete" };

/** Returns the `*** Begin Patch ... *** End Patch` text inside a shell command, or null. */
export function extractPatch(command) {
  const m = PATCH_SPAN.exec(command || "");
  return m ? m[0] : null;
}

// Each file becomes { path, kind, chunks }. An added file is one chunk (its whole
// content); an updated file yields one chunk per contiguous run of "+" lines.
export function parseApplyPatch(patch) {
  const files = [];
  let current = null;
  let run = [];

  const flushRun = () => {
    if (current && run.length) current.chunks.push(run.join("\n"));
    run = [];
  };

  for (const rawLine of (patch || "").split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    const header = HUNK_HEADER.exec(line);
    if (header) {
      flushRun();
      current = { path: header[2].trim(), kind: KIND[header[1]], chunks: [] };
      files.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("*** Move to: ")) {
      current.path = line.slice("*** Move to: ".length).trim();
      continue;
    }
    if (line.startsWith("+")) {
      run.push(line.slice(1));
      continue;
    }
    flushRun();
  }
  flushRun();

  for (const file of files) {
    if (file.kind === "add") file.chunks = [file.chunks.join("\n")];
  }
  return files.filter((file) => file.kind !== "delete");
}
