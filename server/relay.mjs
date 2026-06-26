// ------------------------------------------------------------------
//  Foxie live relay
//  Bridges the browser <-> a Starblast game server so the frontend can
//  render the REAL map (asteroids from the seed + team stations).
//
//  Browser protocol (this server):
//    -> {"name":"subscribe","data":{"id":<systemId>}}
//    <- {"name":"mode_info","data":{...}}        // seed, mode, teams, servertime
//    <- {"name":"map","data":{"grid":"...","size":N}}
//    <- {"name":"error","data":"..."}
//
//  Run it on YOUR OWN hosting. Joining games programmatically is against
//  Starblast's anti-bot ToS — only run with the rights you have.
//
//  Setup:
//    1) npm install            (installs `ws`)
//    2) drop `mapGen.js` next to this file (asteroid generator, see README)
//    3) node relay.mjs         (PORT env optional, default 8080)
// ------------------------------------------------------------------

import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const PORT = process.env.PORT || 8080
const BOT_NAME = process.env.BOT_NAME || 'see you'
const __dirname = dirname(fileURLToPath(import.meta.url))

// Optional asteroid generator (server-side). Drop the RAW mapGen.js next to
// this file — no editing needed. It sets `window.getMap`, so we load it with a
// stand-in window. Review the file before running; if absent we relay
// mode_info only and the frontend falls back to a plain map.
let getMap = null
const mapGenPath = join(__dirname, 'mapGen.js')
if (existsSync(mapGenPath)) {
  try {
    const src = readFileSync(mapGenPath, 'utf8')
    getMap = new Function('window', src + '\nreturn window.getMap')({})
    console.log(typeof getMap === 'function' ? 'mapGen loaded — asteroids enabled' : 'mapGen.js loaded but getMap missing')
    if (typeof getMap !== 'function') getMap = null
  } catch (e) {
    console.warn('failed to load mapGen.js:', e.message)
  }
} else {
  console.warn('mapGen.js not present — relaying mode_info only (no asteroid grid). See README.')
}

// ---- tiny simstatus cache (system id -> server address) ----------
let simCache = { at: 0, byId: new Map() }
async function addressForSystem(id) {
  if (Date.now() - simCache.at > 8000) {
    const res = await fetch('https://starblast.io/simstatus.json', { cache: 'no-store' })
    const servers = await res.json()
    const byId = new Map()
    for (const s of servers) for (const sys of s.systems || []) byId.set(sys.id, { address: s.address, mode: sys.mode, mod_id: sys.mod_id })
    simCache = { at: Date.now(), byId }
  }
  return simCache.byId.get(id)
}

// ---- one game connection per subscribed browser ------------------
function connectToGame(systemId, info, onModeInfo, onClose, onDebug) {
  const [ip, port] = info.address.split(':')
  console.log(`[${systemId}] connecting to game ${info.address} (mode=${info.mode})`)
  const game = new WebSocket(`wss://${ip}:${port}/`, {
    rejectUnauthorized: false, // game servers have no valid cert for a raw IP
    origin: 'https://starblast.io',
  })

  let pingTimer = null
  let gotWelcome = false

  game.on('open', () => {
    console.log(`[${systemId}] socket open -> sending join`)
    game.send(JSON.stringify({
      name: 'join',
      data: {
        mode: info.mode, mod_id: info.mod_id ?? null, spectate: true, spectate_ship: 1,
        player_name: BOT_NAME, hue: 0, preferred: systemId, bonus: false,
        ecp_key: null, steamid: null, ecp_custom: null, create: false,
        client_ship_id: 100, client_tr: false,
      },
    }))
    pingTimer = setInterval(() => { try { game.send('ping') } catch {} }, 1000)
  })

  let binCount = 0
  game.on('message', (data, isBinary) => {
    if (isBinary) {
      binCount++
      if (binCount <= 3) onDebug?.({ kind: 'binary', type: data[0], len: data.length })
      return // phase 2: parse 0x01/0x02 frames here for live positions
    }
    const str = data.toString()
    if (str === 'pong') return
    let msg
    try { msg = JSON.parse(str) } catch { return }
    // DEBUG: forward the shape of every game message to the browser inspector.
    onDebug?.({ kind: 'json', name: msg.name, topKeys: msg.data ? Object.keys(msg.data) : null, modeKeys: msg.data?.mode ? Object.keys(msg.data.mode) : null, seed: msg.data?.seed })
    if (msg.name === 'welcome') {
      // The first welcome is just {version}; the real game info comes with seed/mode.
      if (msg.data && (msg.data.seed != null || msg.data.mode)) {
        gotWelcome = true
        console.log(`[${systemId}] WELCOME ok — seed=${msg.data.seed}, map_size=${msg.data?.mode?.map_size}`)
        onModeInfo(msg.data)
      } else {
        console.log(`[${systemId}] welcome handshake (version=${msg.data?.version})`)
      }
    } else {
      console.log(`[${systemId}] game says: ${msg.name}`)
    }
  })

  game.on('close', (code) => {
    clearInterval(pingTimer)
    console.log(`[${systemId}] game closed (code=${code}${gotWelcome ? '' : ', no game-info received'})`)
    onClose?.()
  })
  game.on('error', (e) => { clearInterval(pingTimer); console.log(`[${systemId}] game error: ${e.message}`); onClose?.(e) })
  return game
}

// ---- browser-facing WS server ------------------------------------
const httpServer = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' })
  res.end('Foxie relay up')
})
const wss = new WebSocketServer({ server: httpServer })

wss.on('connection', (client) => {
  let game = null
  const send = (obj) => { try { client.send(JSON.stringify(obj)) } catch {} }
  console.log('browser connected')

  client.on('message', async (raw) => {
    let msg
    try { msg = JSON.parse(raw.toString()) } catch { return }
    if (msg.name !== 'subscribe') return
    const id = msg.data?.id
    console.log(`browser subscribed to system ${id}`)
    game?.close()

    const info = await addressForSystem(id).catch(() => null)
    if (!info) { console.log(`system ${id} not found in simstatus`); return send({ name: 'error', data: 'system not found' }) }

    game = connectToGame(id, info, (modeInfo) => {
      send({ name: 'mode_info', data: modeInfo })
      try {
        const size = modeInfo?.mode?.map_size || 30
        if (getMap && modeInfo?.seed != null) {
          const rootMode = modeInfo.mode?.id === 'modding' ? modeInfo.mode?.root_mode : modeInfo.mode?.id
          const grid = modeInfo.mode?.custom_map || getMap(modeInfo.seed, size, rootMode)
          send({ name: 'map', data: { grid, size } })
        }
      } catch (e) { console.warn('map gen failed', e?.message) }
    }, (err) => { if (err) send({ name: 'error', data: 'game connection closed' }) },
    (dbg) => send({ name: 'debug', data: dbg }))
  })

  client.on('close', () => game?.close())
})

httpServer.listen(PORT, () => console.log(`Foxie relay listening on :${PORT}`))
