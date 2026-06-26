# Starblast live relay — protocol notes

Reverse-engineered from the official client (archived in `PixelMelt/starblast`) and
dankdmitron's open-source `SpectatorV2.js` / `mapGen.js`. For a **server-list spectator**
relay. Note: joining games programmatically is against Starblast's anti-bot ToS — run this
only with the rights/permission you have for your community, on your own hosting.

## Architecture

```
browser (Foxie frontend)  --WS-->  relay (this server)  --WSS-->  Starblast game server
        subscribe{id}                 join / ping                  welcome + binary frames
```

The relay does the privileged part (TLS-relaxed connection + join). The browser only ever
receives benign JSON (mode info, generated asteroid grid, player snapshots).

## Game-server connection (relay → game)

1. Look up the system's address from `https://starblast.io/simstatus.json`
   (each server has `address` = `ip:port`, and `systems[].id`).
2. Open `wss://<ip>:<port>/` with **TLS verification disabled** (`rejectUnauthorized:false`)
   — game servers present a cert that doesn't validate for a raw IP.
3. Send the **join** message (exact shape from the real client):

```json
{ "name": "join", "data": {
  "mode": "<mode_id>",           // "team" | "survival" | "deathmatch" | ...
  "mod_id": null,                // set for modded systems
  "spectate": true,
  "spectate_ship": 1,
  "player_name": "see you",      // the visible bot name
  "hue": 0,
  "preferred": <systemId>,       // the system to watch
  "bonus": false,
  "ecp_key": null,               // anonymous = no ECP
  "steamid": null,
  "ecp_custom": null,
  "create": false,
  "client_ship_id": 100,
  "client_tr": false
} }
```

4. **Keepalive**: send the string `"ping"` every ~1s; the server replies `"pong"`.
   Without this the server drops the socket after a few seconds.

## Messages the game sends back (game → relay)

JSON (string) messages dispatched by `name`:
- `welcome` → `data` is the full game info: `{ seed, mode:{ id, map_size, teams:[{ hue, station:{ phase } }], mod_id, custom_map, root_mode }, name, servertime, ... }`
  - **This is all that's needed for the real map**: asteroids come from `seed` + `map_size`,
    team stations from `mode.teams[].station.phase` + `servertime`.
- `player_name` → `{ id, player_name, hue, custom, friendly }` (a player's profile; request with `{name:"get_name",data:{id}}`)
- `cannot_join`, `entered`, `ecp_verified`, `modemsg`, `error`

Binary messages (real-time, ~30/s) — **optional, phase 2**:
- first byte `0x01` = ship snapshot; 15-byte records: `id u8, x f32, y f32, score u32, u16(bit15=alive, low15=ship)`
- first byte `0x02` = team snapshot; 5-byte records: `u8(low nibble=level, high=open), crystals u32`

## Asteroids

`getMap(seed, map_size, mode)` (from `mapGen.js`) returns a `\n`-joined grid of digits
(`0`=empty, `1..9`=asteroid radius). Run it **server-side** and send the grid to the browser.

## Frontend protocol (relay → browser)

The relay emits:
- `{ "name":"mode_info", "data": <welcome data> }`
- `{ "name":"map", "data": { "grid": "<digits>", "size": <map_size> } }`
- `{ "name":"players", "data": [ { id, name, hue, x, y, score, alive, ship, custom } ] }` (if you parse binary; otherwise the browser keeps using the pixelmelt snapshot)
