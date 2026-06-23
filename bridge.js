// musikcube -> Discord Rich Presence bridge
// Reads the "now playing" track from musikcube's WebSocket metadata server
// and pushes it to Discord as Rich Presence (Listening to ...).

import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import WebSocket from "ws";
import { Client } from "@xhayper/discord-rpc";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));

const DEVICE_ID = "musikcube-discord-rpc";

if (!config.discordClientId || config.discordClientId.includes("PASTE_YOUR")) {
  console.error("[config] Set 'discordClientId' in config.json first (see README).");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Discord side
// ---------------------------------------------------------------------------
const discord = new Client({ clientId: config.discordClientId });
let discordReady = false;
let lastActivity = null; // JSON string of the last activity we set, to dedupe

discord.on("ready", () => {
  discordReady = true;
  console.log(`[discord] connected as ${discord.user?.username ?? "unknown"}`);
  applyActivity(currentOverview);
});

async function connectDiscord() {
  try {
    await discord.login();
  } catch (err) {
    discordReady = false;
    console.error(`[discord] login failed (${err.message}); retrying in 15s. Is Discord running?`);
    setTimeout(connectDiscord, 15000);
  }
}

function applyActivity(overview) {
  if (!discordReady) return;

  const idle =
    !overview ||
    overview.state === "stopped" ||
    !overview.playing_track ||
    Object.keys(overview.playing_track).length === 0;

  if (idle) {
    if (lastActivity !== "CLEARED") {
      discord.user?.clearActivity().catch(() => {});
      lastActivity = "CLEARED";
      console.log("[discord] cleared (nothing playing)");
    }
    return;
  }

  const t = overview.playing_track;
  const title = pick(t, ["title"]) || "Unknown title";
  const artist = pick(t, ["artist", "album_artist"]) || "Unknown artist";
  const album = pick(t, ["album"]) || "";
  const paused = overview.state === "paused";

  const activity = {
    type: 2, // Listening
    details: clamp(title),
    state: clamp(album ? `${artist} — ${album}` : artist),
    largeImageKey: config.presence.largeImageKey || undefined,
    largeImageText: config.presence.largeImageText || "musikcube",
    smallImageKey: paused ? "pause" : "play",
    smallImageText: paused ? "Paused" : "Playing",
    instance: false,
  };

  // Show a live progress bar while actually playing.
  if (config.presence.showTimestamp && !paused) {
    const elapsed = Number(overview.playing_current_time) || 0;
    const duration = Number(overview.playing_duration) || 0;
    const now = Date.now();
    activity.startTimestamp = Math.floor(now - elapsed * 1000);
    if (duration > 0) {
      activity.endTimestamp = Math.floor(now + (duration - elapsed) * 1000);
    }
  }

  // Dedupe on track identity + state only (NOT the computed timestamps), so we
  // don't spam Discord on every poll. Discord keeps the progress bar ticking
  // from the startTimestamp we set once per track, so it stays live.
  const sig = [t.id ?? title, overview.state, title, artist, album, overview.playing_duration].join("|");
  if (sig === lastActivity) return;
  lastActivity = sig;

  discord.user
    ?.setActivity(activity)
    .then(() => console.log(`[discord] ${paused ? "(paused) " : ""}${title} - ${artist}`))
    .catch((err) => console.error(`[discord] setActivity failed: ${err.message}`));
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj[k] != null && String(obj[k]).trim() !== "") return String(obj[k]).trim();
  }
  return "";
}

// Discord requires details/state to be 2..128 chars.
function clamp(s) {
  s = (s ?? "").toString();
  if (s.length < 2) s = (s + "  ").slice(0, 2);
  if (s.length > 128) s = s.slice(0, 127) + "…";
  return s;
}

// ---------------------------------------------------------------------------
// musikcube side
// ---------------------------------------------------------------------------
let currentOverview = null;
let ws = null;
let pollTimer = null;
const POLL_MS = Math.max(1000, (Number(config.musikcube.pollSeconds) || 2) * 1000);

function connectMusikcube() {
  const url = `ws://${config.musikcube.host}:${config.musikcube.port}`;
  ws = new WebSocket(url);

  ws.on("open", () => {
    console.log(`[musikcube] connected ${url}`);
    send("authenticate", { password: config.musikcube.password ?? "" });
  });

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    const opts = msg.options || {};

    if (msg.name === "authenticate" && msg.type === "response") {
      if (opts.authenticated) {
        console.log("[musikcube] authenticated");
        send("get_playback_overview", {});
        // musikcube doesn't reliably push broadcasts to every client, so poll
        // the playback overview to keep the presence live across track changes.
        clearInterval(pollTimer);
        pollTimer = setInterval(() => send("get_playback_overview", {}), POLL_MS);
      } else {
        console.error("[musikcube] authentication failed (wrong password?)");
      }
      return;
    }

    // Both the response to our request and the live broadcast use this name.
    if (msg.name === "get_playback_overview" && (msg.type === "response" || msg.type === "broadcast")) {
      currentOverview = opts;
      applyActivity(currentOverview);
    }
  });

  ws.on("close", () => {
    console.error("[musikcube] disconnected; retrying in 5s. Is musikcube running?");
    clearInterval(pollTimer);
    currentOverview = null;
    applyActivity(null);
    setTimeout(connectMusikcube, 5000);
  });

  ws.on("error", (err) => {
    console.error(`[musikcube] socket error: ${err.message}`);
    // 'close' will fire next and handle the retry.
  });
}

function send(name, options) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(
    JSON.stringify({
      name,
      type: "request",
      id: randomUUID(),
      device_id: DEVICE_ID,
      options,
    })
  );
}

// ---------------------------------------------------------------------------
process.on("SIGINT", () => {
  console.log("\n[shutdown] clearing presence...");
  discord.user?.clearActivity().catch(() => {});
  setTimeout(() => process.exit(0), 300);
});

console.log("musikcube -> Discord Rich Presence bridge starting...");
connectDiscord();
connectMusikcube();
