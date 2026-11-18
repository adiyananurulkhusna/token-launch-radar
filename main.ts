// token-launch-radar — entrypoint (Node 22, stdlib only)
//
// Usage:
//   node main.ts [--input <snapshot.json>] [--output <dir>]
//   node main.ts --help
//
// Snapshot source, in order: --input, /input/snapshot.json, input/snapshot.json.
// Output directory, in order: --output, $MAKEFUN_OUTPUT_DIR, /output (when it
// exists), ./out.
//
// The program is deterministic: same snapshot in, same bytes out, every run.
// It writes board.json, data.js, dashboard/ (3 files), screenshots/ and
// dossier.json, and refuses to write a board that fails the gate.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSnapshot, buildBoard, boardIssue, dataScript, fmtMoney, VERSION, MODEL_NAME } from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv: string[]): { input?: string; output?: string; help?: boolean } {
  const out: { input?: string; output?: string; help?: boolean } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--input") out.input = argv[++i];
    else if (a === "--output") out.output = argv[++i];
    else if (a.startsWith("--input=")) out.input = a.slice("--input=".length);
    else if (a.startsWith("--output=")) out.output = a.slice("--output=".length);
    else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

function pickInput(input?: string): string {
  if (input) return input;
  if (existsSync("/input/snapshot.json")) return "/input/snapshot.json";
  return join(HERE, "input", "snapshot.json");
}

function pickOutput(output?: string): string {
  if (output) return output;
  if (process.env.MAKEFUN_OUTPUT_DIR) return process.env.MAKEFUN_OUTPUT_DIR;
  if (existsSync("/output")) return "/output";
  return join(HERE, "out");
}

function copyDir(src: string, dst: string): string[] {
  mkdirSync(dst, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(src).sort()) {
    const from = join(src, name);
    const to = join(dst, name);
    copyFileSync(from, to);
    names.push(name);
  }
  return names;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("token-launch-radar v" + VERSION);
    console.log("usage: node main.ts [--input <snapshot.json>] [--output <dir>]");
    console.log("writes board.json, data.js, dashboard/, screenshots/ and dossier.json");
    return;
  }
  const inputPath = pickInput(args.input);
  const outDir = pickOutput(args.output);
  const raw = readFileSync(inputPath, "utf8");
  const snapshot = parseSnapshot(JSON.parse(raw));
  const board = buildBoard(snapshot);

  const issue = boardIssue(board, snapshot.watchlist);
  if (issue) {
    console.error(`token radar: gate check failed: ${issue}`);
    process.exitCode = 1;
    return;
  }

  mkdirSync(outDir, { recursive: true });
  const boardPath = join(outDir, "board.json");
  writeFileSync(boardPath, JSON.stringify(board, null, 2) + "\n");
  writeFileSync(join(outDir, "data.js"), dataScript(board));
  const dashFiles = copyDir(join(HERE, "dashboard"), join(outDir, "dashboard"));
  const shots = copyDir(join(HERE, "screenshots"), join(outDir, "screenshots"));
  const dossier = buildDossier(outDir, {
    text_max_bytes: 65_536,
    screenshots: { max: 4, max_bytes: 524_288 },
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  });
  writeFileSync(join(outDir, "dossier.json"), dossier);

  const early = board.rows.length - board.watchlist.covered;
  console.log(
    `token radar: ${snapshot.protocols.length} protocols, ${board.watchlist.covered} / ${board.watchlist.total} on the watchlist, ` +
      `${board.rows.length} rows scored (${early} early, ${board.live.length} live set aside)`,
  );
  console.log(`token radar: top implied value ${fmtMoney(board.rows[0].implied_value_usd)} (${board.rows[0].name}), ` +
    `median row ${fmtMoney(board.rows[Math.floor(board.rows.length / 2)].implied_value_usd)}`);
  console.log(
    `token radar: wrote ${outDir}/board.json, ${outDir}/data.js, ${outDir}/dashboard (${dashFiles.length} files), ` +
      `${outDir}/screenshots (${shots.length} images) and ${outDir}/dossier.json`,
  );
  console.log(`token radar: model ${MODEL_NAME}`);
}

main();
