# Foxie live relay

Bridges the browser to a Starblast game server so the frontend can draw the **real map**
(asteroids from the seed + team stations). See `PROTOCOL.md` for the wire details.

> ⚠️ Joining games programmatically is against Starblast's anti-bot ToS. Run this only with
> the rights/permission you have, on hosting you control. This is the part you operate — not
> the static frontend.

## What it does

- Browser sends `subscribe {id}` → relay connects to that game, joins as a spectator named
  `see you`, keeps the socket alive, and forwards the game's `welcome` as `mode_info`.
- If `mapGen.js` is present, the relay generates the asteroid grid **server-side** and sends
  it as `map` (the browser only ever receives a string of digits — no foreign code runs in
  the browser).
- Live player **positions** still come from the existing pixelmelt snapshot on the frontend.
  Parsing the game's binary frames for native 60 fps positions is the optional "phase 2"
  noted in `PROTOCOL.md`.

## Add the asteroid generator (optional but recommended)

The generator is not bundled here (it's third-party code). Fetch it yourself and place it
next to `relay.mjs` as `mapGen.js`, exporting `getMap(seed, size, mode)`:

```bash
curl -o mapGen.js https://starblast.dankdmitron.dev/js/lib/mapGen.js
# then change its last lines from `window.getMap = function(...)` to an ES export:
#   export const getMap = window.getMap   (or adapt the IIFE to `export`)
```

Review it before running — it's an obfuscated map generator.

## Run locally

```bash
cd server
npm install
node relay.mjs            # listens on :8080 (PORT env to change)
```

Then point the frontend at it: create `.env.local` in the project root with

```
VITE_RELAY_URL=ws://localhost:8080
```

## Free hosting options (24/7)

A relay must hold persistent outbound WebSockets, so pick a host that runs a **long-lived
Node process** (not edge/serverless):

| Host | Free tier notes |
|------|-----------------|
| **Fly.io** | Small shared-cpu VM; good for persistent WS. Deploy with a `Dockerfile` or `fly launch`. |
| **Railway** | Free trial credits; simple `node relay.mjs` start command. |
| **Render** | Free web service, but it **sleeps after 15 min idle** — fine for occasional use. |
| **Replit / Glitch** | Quick to try; may sleep on free tiers. |

Set the start command to `node relay.mjs`, expose the assigned port (most hosts inject
`PORT`), and use the public URL as `VITE_RELAY_URL` (`wss://…` once it's HTTPS).
