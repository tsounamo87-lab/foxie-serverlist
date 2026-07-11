// ─── Most used ship stat ──────────────────────────────────────────────────────
// Small inline stat showing the top ship(s) currently in use, tallied from the
// short-retention raw observation tables (recent games only, not lifetime).

import { useEffect, useState } from 'react'
import { Rocket } from 'lucide-react'
import { getMostUsedShips, type ShipUsage } from '../lib/db'
import { shipGlyph, shipName } from '../lib/ships'

export function MostUsedShip({ table, mode }: { table: 'observations' | 'team_observations'; mode: string }) {
  const [ships, setShips] = useState<ShipUsage[]>([])

  useEffect(() => {
    let cancelled = false
    void getMostUsedShips(table, 1).then((s) => { if (!cancelled) setShips(s) })
    return () => { cancelled = true }
  }, [table])

  const top = ships[0]
  if (!top) return null
  const glyph = shipGlyph(top.ship, mode)

  return (
    <span
      title={`${shipName(top.ship)} — most-used ship in recent games`}
      className="flex items-center gap-1 text-xs text-muted shrink-0"
    >
      <Rocket className="size-3.5" />
      {glyph && <span style={{ fontFamily: 'StarblastVanilla', fontSize: 13 }}>{glyph}</span>}
      {shipName(top.ship)}
    </span>
  )
}
