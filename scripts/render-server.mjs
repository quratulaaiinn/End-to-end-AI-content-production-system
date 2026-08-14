#!/usr/bin/env node
/**
 * HTTP wrapper around render-job.mjs, and now also the ONLY writer of job
 * input files (narration.mp3, job.json). n8n's container writes into this
 * project's bind-mounted folder as a non-root user, which repeatedly proved
 * fragile across container/host UID and permission changes — so the
 * container no longer touches the shared filesystem directly at all. It
 * POSTs the ElevenLabs audio bytes and the manifest JSON here instead; this
 * process (root, host-side) does every actual file write, so there is no
 * cross-UID permission surface left to break.
 *
 * Endpoints (all require the x-render-token header):
 *   POST /save-audio?jobId=X            body = raw MP3 bytes  -> writes narration.mp3
 *   POST /save-manifest?jobId=X         body = JSON manifest  -> writes job.json
 *   POST /save-upload-details?jobId=X   body = raw text       -> writes out/jobs/<jobId>-upload-details.txt
 *   GET  /render?jobId=X                                      -> runs render-job.mjs
 *
 * /save-audio and /save-manifest create the job folder themselves if it
 * doesn't exist yet — there is no separate "ensure folder" step anymore.
 * Writes are atomic (write to a temp file, then rename into place) so
 * nothing ever reads a partially-written file.
 *
 * /save-upload-details is deliberately narrow: it is the one remaining
 * piece of the manual-upload package (a human-readable .txt file sitting
 * next to the rendered MP4 in out/jobs) that n8n used to write directly
 * onto the bind-mounted filesystem — the exact pattern this file's own
 * history above says was already abandoned everywhere else because it's
 * fragile across container/host UID boundaries. This endpoint always
 * writes to the single fixed path OUTPUT_PATH/<jobId>-upload-details.txt;
 * it accepts no filename or path from the caller, so there is no
 * traversal surface. `videoPath` and `uploadDetailsPath` query params are
 * pure display strings echoed back in the response — n8n already knows
 * the container-visible paths (this process only knows host-side ones),
 * so it computes them and this endpoint just confirms the write and
 * hands them back for the workflow's final output.
 *
 * Binds to the Docker bridge gateway IP only (not 0.0.0.0), so it is
 * reachable from containers but not from the public internet.
 */
import http from "node:http";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, renameSync, chmodSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const JOB_DIR_MODE = 0o2775; // rwxrwsr-x — defense in depth; this process is root, so not strictly required for it to write, but keeps the tree consistently permissioned for any other tooling that inspects it.
const MAX_BODY_BYTES = 100 * 1024 * 1024; // 100MB — generous for a short narration MP3 or a small JSON manifest; just a sanity cap, not a real limit.
const MAX_UPLOAD_DETAILS_BYTES = 262_144; // 256KB — the upload-details file is plain metadata (title/description/hashtags/tags), never media; this is already a generous ceiling for it.
const MAX_DISPLAY_PATH_CHARS = 2000; // caps the echoed videoPath/uploadDetailsPath query values; they are never used in any filesystem call, only reflected back in the JSON response.

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..");
const VIDEO_JOBS_PATH = process.env.VIDEO_JOBS_PATH ?? path.join(PROJECT_ROOT, "public", "jobs");
// Same env var name and same default expression render-job.mjs uses for its
// own OUTPUT_PATH — render-job.mjs runs as a child process of this one
// (execFileSync below, no explicit `env` override) so it always inherits
// this exact value, guaranteeing both scripts agree on where the rendered
// MP4s (and now the upload-details.txt files) live.
const OUTPUT_PATH = process.env.OUTPUT_PATH ?? path.join(PROJECT_ROOT, "out", "jobs");
const RENDER_SCRIPT = path.join(SCRIPT_DIR, "render-job.mjs");

const HOST = process.env.RENDER_SERVER_HOST ?? "172.17.0.1";
const PORT = Number(process.env.RENDER_SERVER_PORT ?? 8091);
const TOKEN = process.env.RENDER_SERVER_TOKEN ?? "";

const JOB_ID_RE = /^[A-Za-z0-9._-]+$/;

function sendJson(res, code, payload) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

// jobId is validated against JOB_ID_RE (alnum/dot/dash/underscore only)
// before this is ever called, so path.join can't be escaped with "..".
function resolveJobDir(jobId) {
  return path.join(VIDEO_JOBS_PATH, jobId);
}

function ensureJobDir(jobDir) {
  mkdirSync(jobDir, { recursive: true });
  chmodSync(jobDir, JOB_DIR_MODE);
}

function atomicWriteFile(finalPath, data) {
  const tmpPath = `${finalPath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmpPath, data);
  renameSync(tmpPath, finalPath); // same directory -> same filesystem -> atomic
}

// Caller-supplied display text only (never a filesystem path used in an fs
// call) — capped and type-checked so a missing/oversized/non-string query
// value can't produce a malformed JSON response.
function truncateDisplay(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  return value.length > MAX_DISPLAY_PATH_CHARS ? value.slice(0, MAX_DISPLAY_PATH_CHARS) : value;
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://internal");

    if (TOKEN && req.headers["x-render-token"] !== TOKEN) {
      return sendJson(res, 403, { status: "RENDER_FAILED", error: "forbidden" });
    }

    const jobId = url.searchParams.get("jobId") ?? "";
    if (!JOB_ID_RE.test(jobId)) {
      return sendJson(res, 400, { status: "RENDER_FAILED", error: "missing or invalid jobId" });
    }
    const jobDir = resolveJobDir(jobId);

    if (url.pathname === "/save-audio") {
      try {
        const body = await readRawBody(req);
        if (body.length === 0) {
          return sendJson(res, 200, { status: "AUDIO_WRITE_FAILED", jobId, error: "received empty audio body" });
        }
        ensureJobDir(jobDir);
        atomicWriteFile(path.join(jobDir, "narration.mp3"), body);
        return sendJson(res, 200, { status: "AUDIO_SAVED", jobId, bytes: body.length });
      } catch (err) {
        return sendJson(res, 200, { status: "AUDIO_WRITE_FAILED", jobId, error: err.message });
      }
    }

    if (url.pathname === "/save-manifest") {
      try {
        const body = await readRawBody(req);
        let manifest;
        try {
          manifest = JSON.parse(body.toString("utf8"));
        } catch (err) {
          return sendJson(res, 200, { status: "MANIFEST_WRITE_FAILED", jobId, error: `invalid JSON body: ${err.message}` });
        }
        const required = ["jobId", "script", "disclaimer", "audioRelPath"];
        const missing = required.filter((k) => !manifest || typeof manifest[k] !== "string" || manifest[k].length === 0);
        if (missing.length > 0) {
          return sendJson(res, 200, { status: "MANIFEST_WRITE_FAILED", jobId, error: `manifest missing required field(s): ${missing.join(", ")}` });
        }
        ensureJobDir(jobDir);
        atomicWriteFile(path.join(jobDir, "job.json"), JSON.stringify(manifest, null, 2));
        return sendJson(res, 200, { status: "MANIFEST_SAVED", jobId });
      } catch (err) {
        return sendJson(res, 200, { status: "MANIFEST_WRITE_FAILED", jobId, error: err.message });
      }
    }

    if (url.pathname === "/save-upload-details") {
      try {
        const body = await readRawBody(req);
        if (body.length === 0) {
          return sendJson(res, 200, {
            status: "UPLOAD_DETAILS_WRITE_FAILED", jobId, videoPath: null, uploadDetailsPath: null,
            error: "received empty upload-details body",
          });
        }
        if (body.length > MAX_UPLOAD_DETAILS_BYTES) {
          return sendJson(res, 200, {
            status: "UPLOAD_DETAILS_WRITE_FAILED", jobId, videoPath: null, uploadDetailsPath: null,
            error: `upload-details body exceeds ${MAX_UPLOAD_DETAILS_BYTES}-byte limit (${body.length} bytes)`,
          });
        }

        // Fixed, jobId-derived filename only — jobId was already validated
        // above against JOB_ID_RE (alnum/dot/dash/underscore, no "/" or
        // ".."), so this can't be redirected outside OUTPUT_PATH. The
        // resolved-path check below is defense in depth, not the only guard.
        const targetFileName = `${jobId}-upload-details.txt`;
        const resolvedOutputRoot = path.resolve(OUTPUT_PATH);
        const targetPath = path.resolve(resolvedOutputRoot, targetFileName);
        if (targetPath !== path.join(resolvedOutputRoot, targetFileName) || !targetPath.startsWith(resolvedOutputRoot + path.sep)) {
          return sendJson(res, 200, {
            status: "UPLOAD_DETAILS_WRITE_FAILED", jobId, videoPath: null, uploadDetailsPath: null,
            error: "resolved path escapes the output directory",
          });
        }

        // out/jobs already exists (the render that produced this job's MP4
        // created it) — this is just a defensive no-op for a first-run edge
        // case, and deliberately does NOT chmod an already-provisioned
        // shared directory the way ensureJobDir() does for per-job folders.
        mkdirSync(resolvedOutputRoot, { recursive: true });
        atomicWriteFile(targetPath, body);

        return sendJson(res, 200, {
          status: "MANUAL_UPLOAD_READY",
          jobId,
          videoPath: truncateDisplay(url.searchParams.get("videoPath")),
          uploadDetailsPath: truncateDisplay(url.searchParams.get("uploadDetailsPath")) ?? targetPath,
          error: null,
        });
      } catch (err) {
        return sendJson(res, 200, {
          status: "UPLOAD_DETAILS_WRITE_FAILED", jobId, videoPath: null, uploadDetailsPath: null,
          error: err.message,
        });
      }
    }

    if (url.pathname === "/render") {
      let lastLine;
      try {
        const out = execFileSync("node", [RENDER_SCRIPT, jobDir], { encoding: "utf8" });
        lastLine = out.trim().split("\n").filter(Boolean).pop();
      } catch (err) {
        const stdout = String(err.stdout ?? "").trim().split("\n").filter(Boolean).pop();
        lastLine = stdout ?? JSON.stringify({ status: "RENDER_FAILED", error: err.message });
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(lastLine);
    }

    return sendJson(res, 404, { status: "RENDER_FAILED", error: "unknown endpoint" });
  } catch (err) {
    return sendJson(res, 500, { status: "RENDER_FAILED", error: err.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`render-server listening on http://${HOST}:${PORT}`);
});
