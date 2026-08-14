#!/usr/bin/env node
/**
 * The one integration point between the n8n workflow (workflow/content-
 * production-workflow.json) and this Remotion project. It does NOT touch any visual/template
 * file and does NOT define a composition — it only:
 *
 *   1. reads a job-specific job.json { jobId, script, disclaimer, audioRelPath }
 *   2. writes a job-specific remotion-props.json (never edits defaultProps)
 *   3. atomically acquires a filesystem lock (O_EXCL) so two renders can
 *      never run at once, self-healing a stale lock left by a crashed
 *      process — the workflow itself has no lock logic of its own, this
 *      script is the single authoritative owner of the lock lifecycle
 *   4. shells out to `npx remotion render` for the EXISTING "NarrationVideo"
 *      composition, with a job-specific --output path (never overwrites
 *      another job's video)
 *   5. validates the result (file exists, size, dimensions, fps, has audio)
 *   6. prints exactly one JSON line to stdout — the n8n workflow reads this
 *      to decide the outcome:
 *        VIDEO_READY           — success
 *        LOCKED                — another render is already in progress
 *        AUDIO_MISSING         — narration audio missing or empty before render
 *        RENDER_FAILED         — the render command itself failed
 *        INVALID_RENDER_OUTPUT — render exited 0 but the MP4 failed validation
 *
 * Usage: node scripts/render-job.mjs <jobDir>
 *   <jobDir>/job.json must contain: { jobId, script, disclaimer, audioRelPath }
 *   audioRelPath is relative to the project's public/ folder, e.g.
 *   "jobs/<jobId>/narration.mp3" — the n8n workflow writes the ElevenLabs
 *   audio there before calling this script.
 *
 * Configuration (environment variables, all optional):
 *   REMOTION_PROJECT_PATH      default: this script's own project root
 *   VIDEO_JOBS_PATH            default: <project>/public/jobs
 *   OUTPUT_PATH                default: <project>/out/jobs
 *   REMOTION_BROWSER_EXECUTABLE  path to a Chrome/Chromium binary — only
 *                               needed in sandboxed environments that can't
 *                               download Remotion's own headless Chrome
 *                               (this was required for local Windows dev
 *                               testing of this project; typically NOT
 *                               needed on a normal Linux VPS)
 */
import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// npx is a .cmd shim on Windows, which Node can't spawn directly without a
// shell — but shell:true combined with an *args array* mis-handles values
// containing spaces (e.g. "C:\Program Files\...\chrome.exe"), splitting
// them into multiple arguments. The reliable fix on both platforms: build
// one command STRING with each argument explicitly quoted ourselves, then
// run it through execSync (which always uses a shell), so cmd.exe's own
// PATHEXT resolution finds npx.cmd correctly and our quoting — not Node's —
// controls how arguments are split.
function quoteArg(arg) {
  return `"${String(arg).replace(/"/g, '\\"')}"`;
}

function runCommand(bin, args, options, { mergeStderr = false } = {}) {
  const command = `${bin} ${args.map(quoteArg).join(" ")}${mergeStderr ? " 2>&1" : ""}`;
  return execSync(command, options);
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = process.env.REMOTION_PROJECT_PATH ?? path.resolve(SCRIPT_DIR, "..");
const VIDEO_JOBS_PATH = process.env.VIDEO_JOBS_PATH ?? path.join(PROJECT_ROOT, "public", "jobs");
const OUTPUT_PATH = process.env.OUTPUT_PATH ?? path.join(PROJECT_ROOT, "out", "jobs");
const LOCK_FILE = path.join(VIDEO_JOBS_PATH, "render.lock");

// Sanity floor — a valid 1080x1920 vertical short should never be this
// small; catches a silently-truncated or failed render before it's ever
// reported as ready.
const MIN_OUTPUT_BYTES = 50_000;
const EXPECTED_WIDTH = 1080;
const EXPECTED_HEIGHT = 1920;
const EXPECTED_FPS = 30;
// No real render should ever take this long; a lock older than this is
// treated as abandoned (e.g. a crashed process that never reached the
// finally-block release) rather than a genuinely active render.
const STALE_LOCK_MS = 15 * 60 * 1000;

function result(payload) {
  console.log(JSON.stringify(payload));
}

function fail(status, error, extra = {}) {
  result({ status, error, ...extra });
  // Deliberately NOT setting a non-zero process.exitCode: n8n's Execute
  // Command node (without onError configured) treats any non-zero exit as a
  // node failure and halts the workflow before the JSON line above is ever
  // read — which would silently swallow every one of these statuses instead
  // of letting Finalize Result report them. The JSON status line is the only
  // outcome signal; exit code is intentionally always 0.
}

/**
 * The workflow owns no lock logic of its own — this is the single
 * authoritative lock for the whole pipeline. Uses O_EXCL ("wx") so the
 * exists-check and the create happen as one atomic filesystem operation;
 * two near-simultaneous invocations can never both succeed (unlike a
 * separate existsSync-then-writeFileSync, which has a race window).
 */
function acquireLock(jobId) {
  mkdirSync(VIDEO_JOBS_PATH, { recursive: true });
  const write = () => writeFileSync(LOCK_FILE, JSON.stringify({ jobId, startedAt: new Date().toISOString() }), { flag: "wx" });

  try {
    write();
    return true;
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }

  const holder = safeReadJson(LOCK_FILE);
  const startedAtMs = holder?.startedAt ? new Date(holder.startedAt).getTime() : NaN;
  const isStale = !Number.isNaN(startedAtMs) && Date.now() - startedAtMs > STALE_LOCK_MS;

  if (isStale) {
    try {
      rmSync(LOCK_FILE, { force: true });
      write();
      return true;
    } catch (err) {
      // Someone else won the race to replace the stale lock — fall through
      // and report LOCKED below, same as a genuinely active lock.
    }
  }

  fail("LOCKED", "Another render is already in progress.", {
    lockedBy: holder?.jobId ?? "unknown",
    lockedSince: holder?.startedAt ?? "unknown",
  });
  return false;
}

function releaseLock() {
  try {
    rmSync(LOCK_FILE, { force: true });
  } catch {
    // Best-effort — a stale lock is a known-visible failure mode (LOCKED
    // status), not a silent one, so we don't retry harder here.
  }
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function ffprobeSummary(outputPath) {
  // ffprobe (and `remotion ffprobe`) writes its media-info report to
  // stderr, not stdout — execSync only returns stdout by default, so
  // without merging streams every field here silently parses as null even
  // though the render succeeded.
  const raw = runCommand(
    "npx",
    ["remotion", "ffprobe", outputPath],
    { cwd: PROJECT_ROOT, encoding: "utf8" },
    { mergeStderr: true },
  );
  const durationMatch = raw.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  const videoMatch = raw.match(/Video:.*?(\d{3,5})x(\d{3,5}).*?(\d+(?:\.\d+)?)\s*fps/);
  const hasAudio = /Audio:/.test(raw);
  const durationInSeconds = durationMatch
    ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])
    : null;
  return {
    durationInSeconds,
    width: videoMatch ? Number(videoMatch[1]) : null,
    height: videoMatch ? Number(videoMatch[2]) : null,
    fps: videoMatch ? Number(videoMatch[3]) : null,
    hasAudio,
  };
}

function main() {
  const jobDir = process.argv[2];
  if (!jobDir) return fail("RENDER_FAILED", "Missing required <jobDir> argument.");

  // Path traversal guard: the job directory must resolve to somewhere
  // inside VIDEO_JOBS_PATH — this is the only directory this script is
  // ever allowed to read job input from or write render output relative to.
  const resolvedJobDir = path.resolve(jobDir);
  const resolvedJobsRoot = path.resolve(VIDEO_JOBS_PATH);
  if (resolvedJobDir !== resolvedJobsRoot && !resolvedJobDir.startsWith(resolvedJobsRoot + path.sep)) {
    return fail("RENDER_FAILED", `Refusing to operate outside the jobs directory: ${resolvedJobDir}`);
  }

  const jobFile = path.join(resolvedJobDir, "job.json");
  if (!existsSync(jobFile)) return fail("RENDER_FAILED", `job.json not found at ${jobFile}`);

  const job = safeReadJson(jobFile);
  const { jobId, script, disclaimer, audioRelPath } = job ?? {};
  if (!jobId || !script || !disclaimer || !audioRelPath) {
    return fail("RENDER_FAILED", "job.json is missing one of: jobId, script, disclaimer, audioRelPath");
  }
  // jobId becomes both a directory name (VIDEO_JOBS_PATH/<jobId>) and the
  // output filename (OUTPUT_PATH/<jobId>.mp4) below — reject anything that
  // could escape either path.
  if (!/^[A-Za-z0-9._-]+$/.test(jobId)) {
    return fail("RENDER_FAILED", `jobId contains characters that are not safe for a file path: ${jobId}`);
  }

  // audioRelPath must resolve to somewhere inside public/, never escape it
  // via ".." segments or an absolute path.
  const publicRoot = path.resolve(PROJECT_ROOT, "public");
  const audioAbsPath = path.resolve(publicRoot, audioRelPath);
  if (audioAbsPath !== publicRoot && !audioAbsPath.startsWith(publicRoot + path.sep)) {
    return fail("RENDER_FAILED", `audioRelPath escapes the public/ directory: ${audioRelPath}`, { jobId });
  }
  if (!existsSync(audioAbsPath)) {
    return fail("AUDIO_MISSING", `Narration audio not found at ${audioAbsPath}`, { jobId });
  }
  if (statSync(audioAbsPath).size === 0) {
    return fail("AUDIO_MISSING", `Narration audio at ${audioAbsPath} is empty (zero bytes) — ElevenLabs likely failed silently.`, { jobId });
  }

  if (!acquireLock(jobId)) return;

  try {
    const propsPath = path.join(resolvedJobDir, "remotion-props.json");
    // The root cause of every earlier "404 loading audio" failure in this
    // project: `staticFile()` (used by defaultProps, which always worked)
    // resolves a public/ file to `/public/<name>`, NOT `/<name>` — confirmed
    // by forcing a deliberately-missing staticFile() call and reading the
    // exact URL Remotion reported as 404. --props bypasses staticFile()
    // entirely, so any hand-built URL must reproduce that same prefix.
    // STATIC_BASE is overridable in case a different deployment serves
    // public/ at a different mount point.
    const STATIC_BASE = process.env.REMOTION_STATIC_BASE ?? "/public";
    const cleanRelPath = audioRelPath.replace(/^\/+/, "");
    const audioUrl = `${STATIC_BASE}/${cleanRelPath}`;
    writeFileSync(
      propsPath,
      JSON.stringify({ script, disclaimer, audioUrl }, null, 2),
    );

    mkdirSync(OUTPUT_PATH, { recursive: true });
    const outputPath = path.join(OUTPUT_PATH, `${jobId}.mp4`);
    if (existsSync(outputPath)) {
      return fail("RENDER_FAILED", `Refusing to overwrite existing output for job ${jobId}`, { jobId });
    }

    const renderArgs = [
      "remotion",
      "render",
      "NarrationVideo",
      `--props=${propsPath}`,
      `--output=${outputPath}`,
      "--log=error",
    ];
    if (process.env.REMOTION_BROWSER_EXECUTABLE) {
      renderArgs.push(`--browser-executable=${process.env.REMOTION_BROWSER_EXECUTABLE}`);
    }

    // Belt-and-suspenders: an unrelated flaky webpack cache bug (a
    // wasm-hash crash under node_modules/.cache/webpack) was observed
    // intermittently during development and is fixed by clearing that
    // cache and retrying. Real 404s are no longer expected here — the
    // actual cause of those was a wrong STATIC_BASE assumption above, now
    // fixed — but this stays as a cheap safety net for that separate bug.
    const isFlakyCacheError = (message) => /wasm-hash|404|getAudioDurationInSeconds/i.test(message);

    function sleepSync(ms) {
      const sab = new Int32Array(new SharedArrayBuffer(4));
      Atomics.wait(sab, 0, 0, ms);
    }

    let lastError;
    const MAX_RENDER_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_RENDER_ATTEMPTS; attempt++) {
      try {
        runCommand("npx", renderArgs, { cwd: PROJECT_ROOT, stdio: ["ignore", "pipe", "pipe"] });
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        if (attempt < MAX_RENDER_ATTEMPTS && isFlakyCacheError(err.message)) {
          try {
            rmSync(path.join(PROJECT_ROOT, "node_modules", ".cache"), { recursive: true, force: true });
          } catch {
            // If the cache can't be cleared, the retry will just fail the
            // same way and we report the real error below.
          }
          sleepSync(2000);
          continue;
        }
        break;
      }
    }
    if (lastError) {
      return fail("RENDER_FAILED", `Remotion render command failed: ${lastError.message}`, { jobId });
    }

    // From here on, the render COMMAND itself succeeded (exit 0) — any
    // failure past this point means the output is unusable despite that,
    // which is a distinct condition (INVALID_RENDER_OUTPUT) from the render
    // command failing outright (RENDER_FAILED, above).
    if (!existsSync(outputPath)) {
      return fail("INVALID_RENDER_OUTPUT", "Render command exited cleanly but output file is missing.", { jobId });
    }
    const stats = statSync(outputPath);
    if (stats.size < MIN_OUTPUT_BYTES) {
      return fail("INVALID_RENDER_OUTPUT", `Output file is suspiciously small (${stats.size} bytes).`, { jobId, outputPath });
    }

    let probe;
    try {
      probe = ffprobeSummary(outputPath);
    } catch (err) {
      return fail("INVALID_RENDER_OUTPUT", `Rendered file exists but could not be validated: ${err.message}`, { jobId, outputPath });
    }

    const problems = [];
    if (probe.width !== EXPECTED_WIDTH || probe.height !== EXPECTED_HEIGHT) {
      problems.push(`unexpected dimensions ${probe.width}x${probe.height}`);
    }
    if (probe.fps !== EXPECTED_FPS) problems.push(`unexpected fps ${probe.fps}`);
    if (!probe.hasAudio) problems.push("no audio stream detected");
    if (!probe.durationInSeconds || probe.durationInSeconds < 1) problems.push("invalid/zero duration");

    if (problems.length > 0) {
      return fail("INVALID_RENDER_OUTPUT", `Validation failed: ${problems.join("; ")}`, { jobId, outputPath, probe });
    }

    result({
      status: "VIDEO_READY",
      jobId,
      outputPath,
      sizeBytes: stats.size,
      durationInSeconds: probe.durationInSeconds,
      width: probe.width,
      height: probe.height,
      fps: probe.fps,
    });
  } finally {
    releaseLock();
  }
}

main();
