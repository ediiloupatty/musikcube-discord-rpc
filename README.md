# musikcube → Discord Rich Presence

Show the track you're currently playing in [musikcube](https://github.com/clangen/musikcube)
as **Discord Rich Presence** ("Listening to …"), with artist, album and a live
progress bar.

musikcube has no built-in Discord plugin
([feature request #431](https://github.com/clangen/musikcube/issues/431)), so this
is a small bridge: it reads the now-playing track from musikcube's built-in
WebSocket metadata server and pushes it to Discord over the local Discord IPC
socket. No data leaves your machine.

```
musikcube  ──WebSocket(7905)──▶  bridge.js  ──Discord IPC──▶  Discord
```

## Requirements

- [musikcube](https://github.com/clangen/musikcube) with its **WebSocket server
  enabled** (default port `7905`; on by default).
- [Node.js](https://nodejs.org) 18+.
- The **Discord desktop app** running (Rich Presence does not work in the
  browser).

## Setup

### 1. Install

```sh
git clone https://github.com/ediiloupatty/musikcube-discord-rpc.git
cd musikcube-discord-rpc
npm install
```

### 2. Create a Discord application (gives you a Client ID)

1. Open <https://discord.com/developers/applications> and log in.
2. **New Application** → name it `musikcube` (this name shows in your status) →
   **Create**.
3. On **General Information**, copy the **Application ID** (= Client ID).
4. *(Optional, for cover art)* **Rich Presence → Art Assets** → upload an image
   named exactly `musikcube` (and optionally `play` / `pause`). Asset processing
   can take a few minutes.

### 3. Configure

```sh
cp config.example.json config.json
```

Edit `config.json` and set `discordClientId`. Adjust `musikcubePath` if musikcube
isn't at `C:\musikcube\musikcube.exe`. If you set a server password in musikcube,
put it in `musikcube.password`.

### 4. Discord privacy setting

Discord → **Settings → Activity Privacy → "Share your detected activities with
others"** must be **ON**.

## Usage

```sh
npm start
```

Play a song in musikcube — it appears in your Discord profile within a second,
and updates on track change / pause / stop.

`node test-musikcube.js` prints the current track without touching Discord (handy
for debugging).

## Windows: start automatically with musikcube

This repo includes a launcher that starts the bridge when you open musikcube and
stops it when you close musikcube:

- `launch-musikcube.ps1` — launcher logic (auto-detects Node, reads
  `musikcubePath` from config, watches the musikcube process).
- `Musikcube (with Discord).vbs` — runs the launcher hidden (no console window).

Create a shortcut to the `.vbs` (target `wscript.exe "…\Musikcube (with
Discord).vbs"`) and use it instead of your normal musikcube shortcut. To start at
login, drop that shortcut into the `shell:startup` folder.

`start.bat` is also provided to run the bridge alone in a visible window.

## Configuration reference

| Key | Description |
| --- | --- |
| `discordClientId` | Discord application (client) ID. **Required.** |
| `musikcubePath` | Path to `musikcube.exe` (used by the Windows launcher). |
| `musikcube.host` / `.port` | musikcube WebSocket server address (default `127.0.0.1:7905`). |
| `musikcube.password` | musikcube server password, if you set one. |
| `presence.largeImageKey` | Art asset key uploaded in the Discord portal. |
| `presence.largeImageText` | Tooltip text for the large image. |
| `presence.showTimestamp` | Show the elapsed/remaining progress bar. |

## How it works

The bridge authenticates to musikcube's WebSocket server, requests
`get_playback_overview`, and listens for `playback_overview_changed` broadcasts.
Each update is mapped to a Discord activity (type *Listening*) via
[`@xhayper/discord-rpc`](https://github.com/xhayper/discord-rpc). See the
[musikcube remote API docs](https://github.com/clangen/musikcube/wiki/remote-api-documentation).

## Cross-platform note

The bridge itself (`bridge.js`) is platform-independent and works on
Windows/macOS/Linux. Only the `.ps1`/`.vbs` auto-launch helpers are
Windows-specific; on other systems just run `npm start`.

## License

MIT — see [LICENSE](LICENSE).
