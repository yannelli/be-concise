import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractPatch, parseApplyPatch } from "./apply-patch.mjs";
import { heredocWrites, fileFlagPaths } from "./shell-text.mjs";

const EDIT_TOOLS = ["Write", "Edit", "MultiEdit"];

// Only the text this call writes, so a one-line edit isn't blamed for what's already
// on disk. Chunks stay separate: joining them could invent a comment run.
function writtenChunks(toolName, toolInput) {
  if (toolName === "Write") return [toolInput.content || ""];
  if (toolName === "Edit") return [toolInput.new_string || ""];
  return (toolInput.edits || []).map((edit) => edit.new_string || "");
}

// Claude Code sends Write/Edit/MultiEdit; Codex sends apply_patch (or a shell heredoc
// carrying one). Both become { path, chunks, wholeFile } targets.
export function targetsOf(input) {
  const toolName = input.tool_name;
  const toolInput = input.tool_input || {};

  if (EDIT_TOOLS.includes(toolName)) {
    if (!toolInput.file_path) return [];
    return [{ path: toolInput.file_path, chunks: writtenChunks(toolName, toolInput), wholeFile: toolName === "Write" }];
  }

  if (toolName === "NotebookEdit") return notebookTargets(toolInput);

  let patch = null;
  if (toolName === "apply_patch") patch = toolInput.command || toolInput.input || "";
  if (toolName === "Bash") patch = extractPatch(toolInput.command);
  const shellWrites = toolName === "Bash" ? heredocTargets(toolInput.command, input.cwd) : [];
  if (!patch) return shellWrites;

  return parseApplyPatch(patch)
    .map((file) => ({
      path: resolve(input.cwd || ".", file.path),
      chunks: file.chunks,
      wholeFile: file.kind === "add",
    }))
    .concat(shellWrites);
}

// `cat > notes.md <<'EOF'` writes a file that no Write call ever shows. A body file that
// `gh --body-file` or `git commit -F` reads in the same command is check-bash's to scan.
function heredocTargets(command, cwd = ".") {
  const consumed = new Set(fileFlagPaths(command).map((path) => resolve(cwd, path)));
  return heredocWrites(command)
    .map((write) => ({ path: resolve(cwd, write.path), chunks: [write.body], wholeFile: !write.append, scan: "heredocWrites" }))
    .filter((target) => !consumed.has(target.path));
}

// A cell has no file of its own, so the path gets an extension that picks prose or comment rules.
// `file` keeps the notebook's own path for ignoreGlobs and the concise-ignore-file marker.
function notebookTargets({ notebook_path: path, new_source: source, cell_type: type, cell_id: id, edit_mode: mode }) {
  if (!path || typeof source !== "string" || mode === "delete") return [];
  const notebook = readNotebook(path);
  const cellType = type || notebook?.cells?.find((cell) => cell.id === id)?.cell_type || "code";
  const ext = cellType === "markdown" ? ".md" : notebook?.metadata?.language_info?.file_extension || ".py";
  return [{ path: `${path}#${id || "new"}${ext}`, file: path, chunks: [source], wholeFile: false, scan: "notebooks" }];
}

function readNotebook(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function hasFileMarker(filePath) {
  try {
    return readFileSync(filePath, "utf8").includes("concise-ignore-file");
  } catch {
    return false;
  }
}

// A whole-file write replaces the file, so its new content is the only authority on the marker.
export function isExempt({ path, file, chunks, wholeFile }) {
  if (chunks.some((chunk) => chunk.includes("concise-ignore-file"))) return true;
  return !wholeFile && hasFileMarker(file || path);
}
