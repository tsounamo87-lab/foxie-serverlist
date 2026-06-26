// ─── World Map ────────────────────────────────────────────────────────────────
// Pixelated dotted world map — square dots on a regular grid, land clipped
// to accurate continent outlines. Reference: dark bg, square dots, high contrast.

import { useMemo, useState } from 'react'
import type { EnrichedGame } from '../lib/players'
import { modeLabel, formatUptime } from '../lib/starblast'
import type { RegionFilter } from '../store/filters'

// ── Continent paths (1000×500 Mercator) ──────────────────────────────────────
// Coordinates computed from lat/lon:  x=(lon+180)/360*1000  y=(90-lat)/180*500
const CONTINENTS = [

  // ── NORTH AMERICA (clockwise from W Alaska coast)
  // W Alaska(-168,65)→(33,69) ; N Alaska(-157,71)→(64,53) ; N Canada(-120,72)→(167,50)
  // Baffin(-75,70)→(292,56) ; Labrador(-56,58)→(344,89) ; Nova Scotia(-64,45)→(322,125)
  // Cape Cod(-70,42)→(306,133) ; Cape Hatteras(-76,36)→(289,150)
  // S Florida(-81,25)→(275,181) ; Yucatan(-87,20)→(258,194) ; C.America(-82,10)→(272,222)
  // W Mexico(-105,20)→(208,194) ; Baja(-118,32)→(172,161) ; Oregon(-124,48)→(156,117)
  // SE Alaska(-137,58)→(119,89) ; SW Alaska(-162,58)→(50,89)
  `M 33,69 L 64,53 L 167,50 L 292,56
   L 344,89 L 322,125 L 306,133 L 289,150
   L 275,181 L 258,194 L 272,222
   L 208,194 L 172,161
   L 156,117 L 119,89 L 50,89 Z`,

  // ── GREENLAND
  `M 292,22 L 358,13 L 389,36 L 378,58 L 339,67 L 292,50 Z`,

  // ── SOUTH AMERICA (clockwise from NW coast)
  // Colombia(-77,11)→(286,219) ; Suriname(-54,4)→(350,244)
  // Amazon mouth(-50,-1)→(361,253) ; NE Brazil bulge(-35,-8)→(403,261)
  // SE Brazil(-39,-22)→(392,311) ; Uruguay(-58,-35)→(339,347)
  // Patagonia S(-66,-52)→(317,400) ; Chile coast(-72,-35)→(300,347)
  // Peru(-77,-6)→(286,267) ; Ecuador(-80,-2)→(278,256) ; Colombia pac(-77,2)→(286,244)
  `M 286,219 L 350,244 L 361,253 L 403,261
   L 392,311 L 339,347 L 317,400
   L 300,347 L 286,267 L 278,256 L 286,244 Z`,

  // ── EUROPE (main body, clockwise from W Ireland)
  // W Ireland(-10,53)→(472,103) ; Scotland N(-5,58)→(486,89)
  // Norway S(5,58)→(514,89) ; Norway N(18,70)→(550,56) ; N Russia(40,68)→(611,61)
  // Russia W(38,56)→(606,94) ; Black Sea NW(30,46)→(583,122)
  // Istanbul(29,41)→(580,136) ; Greece(24,38)→(567,144) ; Italy(16,38)→(544,144)
  // S Spain(Gibraltar)(-5,36)→(486,150) ; Biscay(-3,44)→(492,128) ; France N(-2,51)→(494,108)
  `M 472,103 L 486,89 L 514,89
   L 550,56 L 611,61 L 606,94
   L 583,122 L 580,136 L 567,144 L 544,144
   L 486,150 L 492,128 L 494,108 Z`,

  // ── SCANDINAVIA (peninsula)
  `M 492,64 L 514,89 L 506,100 L 492,94 L 480,72 Z`,

  // ── UK / IRELAND (simplified island)
  `M 452,84 L 469,74 L 477,91 L 463,101 L 448,94 Z`,

  // ── AFRICA (clockwise from NW corner)
  // Morocco(-6,36)→(483,150) ; N Algeria(3,37)→(508,147) ; Libya/Egypt(25,31)→(569,164)
  // Suez(32,30)→(589,167) ; Djibouti(43,12)→(619,217) ; Horn Somalia(51,11)→(642,219)
  // S Somalia(42,-1)→(617,253) ; Mombasa(40,-4)→(611,261) ; Mozambique(35,-22)→(597,311)
  // Cape Good Hope(19,-35)→(553,347) ; Namibia(12,-28)→(533,328)
  // Angola(11,-18)→(531,300) ; Gulf Guinea(3,4)→(508,244) ; W Africa(-17,14)→(453,211)
  // Mauritania(-17,21)→(453,192) ; NW Morocco(-13,28)→(464,172)
  `M 483,150 L 508,147 L 542,158 L 569,164 L 589,167
   L 619,217 L 642,219
   L 617,253 L 611,261 L 597,311
   L 553,347 L 533,328 L 531,300
   L 508,244 L 453,211 L 453,192 L 464,172 Z`,

  // ── MADAGASCAR
  `M 587,318 L 601,306 L 611,328 L 604,357 L 587,361 L 579,341 Z`,

  // ── ARABIAN PENINSULA
  // Turkey/Bosphorus: (29,41)→(580,136)  —  included via Asia below
  // Arabia NW(37,30)→(603,167) ; Arabia tip/Yemen(45,13)→(625,214)
  // Oman E(58,22)→(661,189) ; UAE(55,24)→(653,183) ; back Kuwait(47,30)→(631,167)
  `M 562,148 L 622,138 L 653,162 L 661,189
   L 631,209 L 600,212 L 572,194 L 557,168 Z`,

  // ── ASIA main body (clockwise from Bosphorus area)
  // Bosphorus(29,41)→(580,136) ; Turkey E(36,38)→(600,144) ; Caucasus(48,42)→(633,133)
  // Caspian N(51,47)→(642,119) ; Russia W(40,56)→(611,94) ; Russia N(60,70)→(667,56)
  // Siberia NE(140,72)→(889,50) ; NE Russia(190,65)→(1028,69) — we'll cap at ~970
  // Chukotka(190,66)→(cap at 970,67) ; Kamchatka(162,52)→(950,106)
  // Korea/China E(121,30)→(836,167) ; S China Sea(109,20)→(803,194)
  // Malay(103,2)→(786,244) ; India SW already covered ; back through Iran
  // Iran/Iraq(48,30)→(633,167) ; Turkey back to start
  `M 580,136 L 600,144 L 633,133 L 642,119
   L 611,94 L 667,56 L 766,40 L 864,48 L 928,70
   L 963,108 L 952,152 L 921,184 L 889,209
   L 858,228 L 825,256 L 786,271
   L 745,264 L 715,281 L 681,265
   L 650,245 L 628,255 L 608,241
   L 588,219 L 565,194 L 554,155
   L 558,118 L 555,88 L 562,60 L 633,133 Z`,

  // ── INDIA peninsula
  `M 600,202 L 650,194 L 670,221 L 664,265
   L 640,287 L 616,281 L 600,261 L 590,233 Z`,

  // ── INDOCHINA / SE ASIA
  `M 706,228 L 754,220 L 776,242 L 774,274
   L 747,287 L 722,280 L 706,259 Z`,

  // ── MALAY PENINSULA
  `M 722,274 L 739,274 L 743,298 L 732,313 L 720,303 L 716,283 Z`,

  // ── JAPAN (Honshu + Kyushu)
  `M 876,100 L 900,90 L 918,107 L 910,125 L 887,120 Z`,
  `M 856,121 L 882,115 L 891,133 L 872,142 L 854,133 Z`,

  // ── INDONESIA (Sumatra, Java, Borneo, Sulawesi, New Guinea)
  `M 702,271 L 739,261 L 753,279 L 741,292 L 711,288 Z`,
  `M 743,285 L 784,277 L 800,295 L 785,309 L 754,307 Z`,
  `M 803,275 L 848,267 L 863,285 L 848,299 L 818,295 Z`,
  `M 864,250 L 920,242 L 936,262 L 920,278 L 878,270 Z`,

  // ── PHILIPPINES
  `M 813,234 L 831,226 L 838,244 L 830,258 L 813,250 Z`,

  // ── AUSTRALIA
  `M 758,310 L 860,302 L 910,324 L 916,373 L 892,418
   L 854,433 L 806,420 L 765,386 L 750,349 Z`,

  // ── NEW ZEALAND
  `M 929,389 L 944,379 L 951,396 L 939,412 L 925,406 Z`,
  `M 933,414 L 947,407 L 951,426 L 940,438 L 927,431 Z`,
]

// ── Land zones per region ─────────────────────────────────────────────────────
// Multiple small rectangles that sit clearly on land (verified against the
// continent paths above). Dots are distributed across zones weighted by area.
type Zone = [number, number, number, number] // xmin, xmax, ymin, ymax

const REGION_ZONES: Record<string, Zone[]> = {
  America: [
    [ 88, 165,  70, 125],  // Alaska + NW Canada
    [150, 195, 100, 190],  // W Canada / W USA coast
    [182, 290,  70, 188],  // Central USA + Canada interior
    [258, 308, 122, 190],  // E USA
    [176, 272, 188, 228],  // Mexico + Central America
  ],
  Europe: [
    [472, 562,  88, 145],  // W Europe (France/Spain/Germany/Benelux)
    [555, 606,  88, 130],  // E Europe + W Russia
  ],
  Asia: [
    [562, 878,  84, 170],  // Russia + Central Asia
    [720, 898, 158, 228],  // China + Korea
    [594, 666, 198, 282],  // India
    [698, 772, 224, 268],  // Indochina / SE Asia
  ],
}

// ── Region label positions (above dot zones, in clear sky/Arctic area) ─────
const LABEL_POS: Record<string, { x: number, y: number }> = {
  America: { x: 185, y: 58 },
  Europe:  { x: 522, y: 72 },
  Asia:    { x: 762, y: 62 },
}

// Deterministic area-weighted placement across land zones
function placeInZones(key: string, zones: Zone[]): [number, number] {
  // Primary hash → zone selection (area-weighted)
  let h = 0
  for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0
  const areas = zones.map(([x0, x1, y0, y1]) => (x1 - x0) * (y1 - y0))
  const total = areas.reduce((s, a) => s + a, 0)
  const pick  = ((h >>> 0) / 0x100000000) * total
  let cum = 0, zi = zones.length - 1
  for (let i = 0; i < zones.length; i++) { cum += areas[i]; if (pick < cum) { zi = i; break } }
  const [x0, x1, y0, y1] = zones[zi]
  // Secondary hash → position within chosen zone
  const h2 = Math.imul(h ^ 0x9e3779b9, 0x6c62272e) | 0
  const a = (h2 & 0xffff) / 0xffff
  const b = ((h2 >>> 16) & 0xffff) / 0xffff
  return [x0 + a * (x1 - x0), y0 + b * (y1 - y0)]
}

// Glow anchor = area-weighted centroid of all zones
function zonesCentroid(zones: Zone[]): { cx: number; cy: number } {
  let wx = 0, wy = 0, w = 0
  for (const [x0,x1,y0,y1] of zones) {
    const a = (x1-x0)*(y1-y0)
    wx += ((x0+x1)/2) * a; wy += ((y0+y1)/2) * a; w += a
  }
  return { cx: wx/w, cy: wy/w }
}

// ── Mode colors ───────────────────────────────────────────────────────────────
const MODE_COLOR: Record<string, string> = {
  team:       '#4a9eff',  // blue
  survival:   '#4de87c',  // green
  deathmatch: '#ff4a4a',  // red
  invasion:   '#bf4af5',  // purple
  modding:    '#ffd44a',  // yellow
  custom:     '#4af5e8',  // teal
}
const MODE_DEFAULT = '#ff8c42'  // fox orange (fallback)
function modeColor(mode: string) { return MODE_COLOR[mode] ?? MODE_DEFAULT }


// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  games: EnrichedGame[]
  /** Pass servers.reduce(sum + s.current_players, 0) for exact match with StatsBar */
  totalPlayersOverride?: number
  onFilterRegion: (region: RegionFilter) => void
  onOpenGame?: (g: EnrichedGame) => void
}

// ── Component ─────────────────────────────────────────────────────────────────
export function WorldMap({ games, totalPlayersOverride, onFilterRegion, onOpenGame }: Props) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  const byRegion = useMemo(() => {
    const map: Record<string, EnrichedGame[]> = {}
    for (const g of games) {
      if (!map[g.location]) map[g.location] = []
      map[g.location].push(g)
    }
    return map
  }, [games])

  const allDots = useMemo(() => {
    return Object.entries(byRegion).flatMap(([region, servers]) => {
      const zones = REGION_ZONES[region] ?? [[400, 600, 150, 350]] as Zone[]
      return servers.map(g => {
        const [x, y] = placeInZones(g.key, zones)
        const players = g.players
        const r = Math.max(5, Math.min(11, 4 + players / 5))
        const color = modeColor(g.mode)
        return { key: g.key, x, y, r, players, game: g, region, color }
      })
    })
  }, [byRegion])

  const regionStats = useMemo(() => {
    return Object.entries(byRegion).map(([region, servers]) => {
      const zones  = REGION_ZONES[region] ?? [[400, 600, 150, 350]] as Zone[]
      const center = zonesCentroid(zones)
      const total  = servers.reduce((s, g) => s + (g.players), 0)
      const label  = LABEL_POS[region] ?? { x: center.cx, y: center.cy }
      return { region, center, label, total, count: servers.length }
    })
  }, [byRegion])

  const computedTotal = useMemo(
    () => games.reduce((s, g) => s + g.players, 0),
    [games]
  )
  const totalPlayers = totalPlayersOverride ?? computedTotal

  const hoveredDot = allDots.find(d => d.key === hoveredKey) ?? null

  return (
    <div className="relative overflow-hidden rounded-[var(--radius-app)] border border-border"
      style={{ background: '#080604' }}>
      <svg
        viewBox="0 0 1000 500"
        className="w-full"
        style={{ display: 'block', maxHeight: 480 }}
      >
        <defs>
          {/* Large square dots — matches reference image style */}
          <pattern id="wm-sq" width="12" height="12" patternUnits="userSpaceOnUse">
            <rect x="2" y="2" width="8" height="8" rx="1.2" fill="var(--c-accent)" />
          </pattern>

          <clipPath id="wm-land">
            {CONTINENTS.map((d, i) => <path key={i} d={d} />)}
          </clipPath>

          <filter id="wm-glow" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="wm-amb" x="-400%" y="-400%" width="900%" height="900%">
            <feGaussianBlur stdDeviation="20" />
          </filter>
        </defs>

        {/* Background */}
        <rect width="1000" height="500" fill="#080604" />

        {/* Ocean grid — nearly invisible, just barely perceptible */}
        <rect width="1000" height="500" fill="url(#wm-sq)" opacity="0.04" />

        {/* Land grid — bright, high contrast */}
        <rect width="1000" height="500" fill="url(#wm-sq)"
          clipPath="url(#wm-land)" opacity="0.45" />

        {/* Region ambient glow */}
        {regionStats.map(({ region, center, total }) => (
          <circle key={`amb-${region}`}
            cx={center.cx} cy={center.cy}
            r={Math.max(30, Math.min(65, 25 + total * 0.2))}
            fill="var(--c-accent)" opacity="0.08"
            filter="url(#wm-amb)"
            style={{ cursor: 'pointer' }}
            onClick={() => onFilterRegion(region as RegionFilter)}
          />
        ))}

        {/* Server dots — colored by mode */}
        {allDots.map(dot => {
          const hovered = dot.key === hoveredKey
          return (
            <g key={dot.key} style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoveredKey(dot.key)}
              onMouseLeave={() => setHoveredKey(null)}
              onClick={() => onOpenGame ? onOpenGame(dot.game) : onFilterRegion(dot.region as RegionFilter)}
            >
              {/* Outer pulse ring */}
              <circle cx={dot.x} cy={dot.y}
                r={dot.r + (hovered ? 8 : 5)}
                fill="none"
                stroke={dot.color}
                strokeWidth={hovered ? 2 : 1.2}
                opacity={hovered ? 0.8 : 0.35} />
              {/* Core dot */}
              <circle cx={dot.x} cy={dot.y}
                r={hovered ? dot.r * 1.5 : dot.r}
                fill={dot.color}
                opacity={hovered ? 1 : 0.92}
                filter="url(#wm-glow)" />
            </g>
          )
        })}

        {/* Region labels — rendered BEFORE tooltip so tooltip appears on top */}
        {regionStats.map(({ region, label, total, count }) => (
          <g key={`lbl-${region}`} style={{ cursor: 'pointer' }}
            onClick={() => onFilterRegion(region as RegionFilter)}>
            <text x={label.x} y={label.y}
              textAnchor="middle" fontSize="16" fontWeight="900"
              stroke="#080604" strokeWidth="4" strokeLinejoin="round"
              fill="var(--c-accent)"
              style={{ paintOrder: 'stroke fill' }}
              fontFamily="system-ui,sans-serif" letterSpacing="3">
              {region.toUpperCase()}
            </text>
            <text x={label.x} y={label.y + 14}
              textAnchor="middle" fontSize="10"
              stroke="#080604" strokeWidth="3" strokeLinejoin="round"
              fill="rgba(255,255,255,0.70)"
              style={{ paintOrder: 'stroke fill' }}
              fontFamily="system-ui,sans-serif">
              {count} servers · {total} players
            </text>
          </g>
        ))}

        {/* Hover tooltip — rendered LAST so it always appears on top of everything */}
        {hoveredDot && (() => {
          const { x: sx, y: sy, game, players, region, color } = hoveredDot
          const name = game.name || `System ${game.id}`
          const label = name.length > 24 ? name.slice(0, 23) + '…' : name
          const mode = modeLabel(game)
          const status = game.open ? 'Open' : 'Closed'
          const uptime = formatUptime(game.time)
          const W = 210, H = 72
          const tx = Math.min(Math.max(sx - W / 2, 4), 996 - W)
          // Always above the dot — clamp to top of SVG, never flip below
          const ty = Math.max(2, sy - H - 14)
          return (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={tx} y={ty} width={W} height={H} rx="5"
                fill="#1c140c" stroke={color} strokeWidth="1.2" opacity="0.98" />
              {/* Color dot + server name */}
              <circle cx={tx + 14} cy={ty + 15} r="4" fill={color} opacity="0.9" />
              <text x={tx + 24} y={ty + 19} fontSize="12" fontWeight="700"
                fill="#ffffff" fontFamily="system-ui,sans-serif">{label}</text>
              {/* Mode chip */}
              <rect x={tx + 10} y={ty + 26} width="50" height="13" rx="3" fill={color} opacity="0.2" />
              <text x={tx + 35} y={ty + 36} textAnchor="middle" fontSize="8.5" fontWeight="600"
                fill={color} fontFamily="system-ui,sans-serif">{mode}</text>
              {/* Status + uptime */}
              <text x={tx + 68} y={ty + 36} fontSize="8.5"
                fill="rgba(255,255,255,0.55)" fontFamily="system-ui,sans-serif">
                {status}  ·  {uptime}
              </text>
              {/* Players */}
              <text x={tx + 10} y={ty + 53} fontSize="13" fontWeight="800"
                fill="#ffffff" fontFamily="system-ui,sans-serif">{players}</text>
              <text x={tx + 10 + String(players).length * 8 + 4} y={ty + 53} fontSize="9"
                fill="rgba(255,255,255,0.5)" fontFamily="system-ui,sans-serif">players</text>
              {/* Region + ID */}
              <text x={tx + W - 10} y={ty + 53} textAnchor="end" fontSize="9"
                fill="rgba(255,255,255,0.45)" fontFamily="system-ui,sans-serif">
                {region} · #{game.id}
              </text>
              {/* Click hint */}
              {onOpenGame && (
                <text x={tx + W / 2} y={ty + H - 5} textAnchor="middle" fontSize="8"
                  fill={color} opacity="0.6"
                  fontFamily="system-ui,sans-serif">click to open →</text>
              )}
            </g>
          )
        })()}

      </svg>

      {/* Bottom bar */}
      <div className="border-t border-border/50 px-5 py-3 space-y-2">
        {/* Mode legend */}
        <div className="flex items-center gap-3 flex-wrap">
          {Object.entries(MODE_COLOR).map(([mode, color]) => (
            <span key={mode} className="flex items-center gap-1 text-[11px]" style={{ color }}>
              <span className="inline-block size-2 rounded-full" style={{ background: color }} />
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </span>
          ))}
        </div>
        {/* Region stats */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted">Hover · click to open · click region to filter</span>
          <div className="flex items-center gap-4">
            {regionStats.map(({ region, total, count }: { region: string; total: number; count: number; label: { x: number; y: number }; center: { cx: number; cy: number } }) => (
              <button key={region}
                onClick={() => onFilterRegion(region as RegionFilter)}
                className="flex items-center gap-1.5 text-muted hover:text-text transition-colors text-[11px]">
                <span className="font-semibold text-accent">{total}</span>
                <span>pl ·</span>
                <span>{count} srv</span>
                <span className="rounded-sm border border-border px-1.5 text-[10px]">
                  {region.slice(0, 2).toUpperCase()}
                </span>
              </button>
            ))}
            <span className="font-semibold text-text text-[11px]">{totalPlayers} total</span>
          </div>
        </div>
      </div>
    </div>
  )
}
