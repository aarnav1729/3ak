// server/server.cjs
"use strict";

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

// 🔗 MD router (BC live endpoints)
const mdRouter = require("./md.cjs");

const app = express();
const PORT = Number(process.env.PORT || 4000);

// IMPORTANT: everything relative to the /server folder
const SNAPSHOT_PATH = path.join(__dirname, "md-dashboard-snapshot.json");
const SNAPSHOT_MAX_AGE_MS = Number(
  process.env.SNAPSHOT_MAX_AGE_MS || 5 * 60 * 1000
); // 5 minutes

/* -------------------------------------------------------------------------- */
/*  GLOBAL ERROR LOGGING (so we see why it might die)                         */
/* -------------------------------------------------------------------------- */

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (reason, p) => {
  console.error("UNHANDLED REJECTION:", reason, "at:", p);
});

/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */

// ---- Global CORS (allow all origins, support credentials) ----
app.use((req, res, next) => {
  const origin = req.headers.origin || "*";

  // Echo the origin back so it works with credentials: "include"
  res.header("Access-Control-Allow-Origin", origin);
  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());
/* -------------------------------------------------------------------------- */
/*  LIVE MD ENDPOINTS (BC DIRECT)                                             */
/* -------------------------------------------------------------------------- */

// All /api/md/... routes from md.cjs (sales, receivables-aging, summary, etc.)
app.use("/api/md", mdRouter);

/* -------------------------------------------------------------------------- */
/*  SNAPSHOT HELPERS (JSON FILE ON DISK)                                      */
/* -------------------------------------------------------------------------- */

function isSnapshotFresh() {
  try {
    const stat = fs.statSync(SNAPSHOT_PATH);
    const age = Date.now() - stat.mtimeMs;
    return age <= SNAPSHOT_MAX_AGE_MS;
  } catch {
    return false;
  }
}

function generateSnapshot() {
  return new Promise((resolve, reject) => {
    // Your script is named md.cjs
    const mdScriptName = "md.cjs";
    console.log(`Regenerating MD snapshot via ${mdScriptName}...`);

    execFile(
      "node",
      [mdScriptName],
      { cwd: __dirname }, // run from /server
      (error, stdout, stderr) => {
        if (error) {
          console.error(`Error running ${mdScriptName}:`, error);
          if (stderr) console.error("stderr:", stderr);
          return reject(error);
        }
        console.log(`${mdScriptName} completed.`);
        if (stdout) console.log(stdout);
        resolve();
      }
    );
  });
}

function loadSnapshot() {
  console.log("Loading snapshot from:", SNAPSHOT_PATH);
  const raw = fs.readFileSync(SNAPSHOT_PATH, "utf8");
  return JSON.parse(raw);
}

// Health
app.get("/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// MD snapshot API (JSON) – cached file, separate from live /api/md/* endpoints
// MD snapshot API (JSON) – cached file, separate from live /api/md/* endpoints
app.get("/api/md/snapshot", async (_req, res) => {
  try {
    const hasSnapshot = fs.existsSync(SNAPSHOT_PATH);
    const fresh = hasSnapshot ? isSnapshotFresh() : false;

    // Case 1: No snapshot yet -> generate synchronously once
    if (!hasSnapshot) {
      console.log("[MD] No snapshot file found, generating initial...");
      await generateSnapshot();
      const snapshot = loadSnapshot();
      return res.json(snapshot);
    }

    // Case 2: snapshot exists -> serve immediately
    const snapshot = loadSnapshot();
    res.json(snapshot);

    // If stale, regenerate in background
    if (!fresh) {
      console.log(
        "[MD] Snapshot is stale; kicking off background regenerateSnapshot()"
      );
      generateSnapshot().catch((err) => {
        console.error("[MD] Background snapshot regeneration failed:", err);
      });
    }
  } catch (err) {
    console.error("Failed to serve MD snapshot:", err);
    res.status(500).json({ error: "Failed to load MD snapshot" });
  }
});

/* ---------- Serve MD dashboard frontend (built React app) ---------- */

// Vite will build into /dist at the project root
// Project structure:
//   /3ak
//     /dist          <-- vite build output
//     /server
//       server.cjs
//       md.cjs
const FRONTEND_DIR = path.join(__dirname, "..", "dist");

console.log("FRONTEND_DIR resolved to:", FRONTEND_DIR);

// Serve static files (JS/CSS/assets)
app.use(express.static(FRONTEND_DIR));

// Fallback: for any non-API request, send index.html (NO wildcard/regex)
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }

  const indexPath = path.join(FRONTEND_DIR, "index.html");
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }

  res
    .status(500)
    .send(
      "Frontend build not found. Did you run `npm run build` at the project root?"
    );
});

/* ------------------------------------------------------------------ */

const server = app.listen(PORT, () => {
  console.log(`MD dashboard BE+FE running at http://localhost:${PORT}`);
});

server.on("error", (err) => {
  console.error("HTTP server error:", err);
});
