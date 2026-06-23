import { randomUUID } from "node:crypto";
import WebSocket from "ws";

const ws = new WebSocket("ws://127.0.0.1:7905");
const DEVICE_ID = "musikcube-test";

ws.on("open", () => {
  console.log("connected");
  ws.send(JSON.stringify({ name: "authenticate", type: "request", id: randomUUID(), device_id: DEVICE_ID, options: { password: "" } }));
});

ws.on("message", (d) => {
  const m = JSON.parse(d.toString());
  if (m.name === "authenticate" && m.type === "response") {
    console.log("authenticated:", m.options.authenticated);
    ws.send(JSON.stringify({ name: "get_playback_overview", type: "request", id: randomUUID(), device_id: DEVICE_ID, options: {} }));
  }
  if (m.name === "get_playback_overview" && m.type === "response") {
    console.log("STATE:", m.options.state);
    console.log("TRACK KEYS:", m.options.playing_track ? Object.keys(m.options.playing_track) : "(none)");
    console.log("TRACK:", JSON.stringify(m.options.playing_track, null, 2));
    console.log("current_time:", m.options.playing_current_time, "duration:", m.options.playing_duration);
    process.exit(0);
  }
});

ws.on("error", (e) => { console.error("error:", e.message); process.exit(1); });
setTimeout(() => { console.error("timeout"); process.exit(1); }, 8000);
