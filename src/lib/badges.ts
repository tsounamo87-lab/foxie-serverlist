// ------------------------------------------------------------------
//  ECP badge registry — extracted from the official ecpIcon catalogue.
//  Maps a badge id (from player.custom.badge) to a display name and,
//  when one exists, the image filename under https://starblast.io/ecp/.
//  Badges with file === null are vector-drawn in-game (no flat image);
//  we render those as a small labelled chip instead.
// ------------------------------------------------------------------

interface BadgeDef {
  name: string
  file: string | null
}

export const BADGES: Record<string, BadgeDef> = {
  star: { name: 'Star', file: null },
  reddit: { name: 'Reddit', file: null },
  pirate: { name: 'Pirate', file: null },
  csf: { name: 'Centauri Space Force', file: 'csf.png' },
  pmf: { name: 'Proxima Mining Front', file: 'pmf.png' },
  nwac: { name: 'New World Army Citizens', file: 'nwac.png' },
  unge: { name: 'United Nations Green Eagles', file: 'unge.png' },
  halo: { name: 'Halo Corsairs', file: 'halo.png' },
  youtube: { name: 'Youtube', file: null },
  twitch: { name: 'Twitch', file: 'twitch.png' },
  invader: { name: 'Invader', file: null },
  empire: { name: 'Galactic Empire', file: null },
  alliance: { name: 'Rebel Alliance', file: null },
  sdf: { name: 'Soloist Defence Force', file: null },
  paw: { name: 'Paw', file: null },
  gamepedia: { name: 'Gamepedia', file: 'gamepedia.png' },
  discord: { name: 'Discord', file: 'discord.png' },
  medic: { name: 'Medic', file: 'medic.jpg' },
  blank: { name: 'Blank', file: null },
  seasonal: { name: 'Seasonal', file: 'seasonal.png' },
  halloween_2021: { name: 'Seasonal - Halloween 2021', file: 'halloween.png' },
  christmas_2021: { name: 'Seasonal - Christmas 2021', file: null },  // no image on server
  summer_2022: { name: 'Seasonal - Summer 2022', file: null },        // no image on server
  dev: { name: 'Developer', file: 'dev.png' },
  translator: { name: 'Translator', file: 'translator.png' },
  shipdesigner: { name: 'Shipwright', file: 'shipdesigner.jpg' },
  srcchamp: { name: 'SRC Champion', file: 'srcchamp.png' },
  sdcchamp: { name: 'SDC Champion', file: 'sdcchamp.png' },
  x27: { name: 'X-27', file: 'x27.png' },
  loveship: { name: 'Loveship', file: 'loveship.png' },
  paralx: { name: 'Paralx', file: 'paralx.jpg' },
  iridium: { name: 'Iridium Ore', file: 'iridium_ore.jpg' },
  carme: { name: 'Carme', file: 'carme.jpg' },
  pudding: { name: 'Pudding Ship', file: 'pudding.jpg' },
  acarii: { name: 'Acarii', file: 'acarii.jpg' },
  scarn: { name: 'Scarn', file: 'scarn.jpg' },
  tournebulle: { name: 'Tournebulle', file: 'tournebulle.png' },
  blackstar: { name: 'Blackstar', file: 'blackstar.jpg' },
  oh: { name: 'Oh_', file: 'oh.jpg' },
  ancientsky: { name: 'Ancient Sky', file: 'ancientsky.jpg' },
  kleinem: { name: 'Kleinem', file: 'kleinem.jpg' },
  '2k': { name: 'Double K', file: '2k.jpg' },
  xcommander: { name: 'X-Commander', file: 'xcommander.jpg' },
  fady: { name: 'Fady', file: 'fady.jpg' },
  andromeda: { name: 'Andromeda', file: 'andromeda.jpg' },
  mortyrules: { name: 'MortyRules', file: 'mortyrules.jpg' },
  pell: { name: 'Pell', file: 'pell.jpg' },
  dimed: { name: 'Dimed', file: 'dimed.jpg' },
  finalizer: { name: 'Finalizer', file: 'finalizer.jpg' },
  mikr: { name: 'Mikr Pollock', file: 'mikr.jpg' },
  goldman: { name: 'Goldman', file: 'goldman.jpg' },
  uranus: { name: 'Uranus', file: 'uranus.jpg' },
  nova: { name: 'Nova', file: 'nova.jpg' },
  '45rfew': { name: '45rfew', file: '45rfew.jpg' },
  bhpsngum: { name: 'Bhpsngum', file: 'bhpsngum.png' },
  valiant: { name: 'Valiant', file: 'valiant.jpg' },
  notus: { name: 'Notus', file: 'notus.png' },
  destroy: { name: 'Destroy', file: 'destroy.png' },
  schickenman: { name: 'SChickenMan', file: 'schickenman.png' },
}

export interface ResolvedBadge {
  id: string
  name: string
  /** Direct image URL, or null when the badge is vector-only / unknown. */
  url: string | null
}

/** Resolve a player.custom.badge code. Returns null for blank/empty. */
export function resolveBadge(code: string | undefined | null): ResolvedBadge | null {
  if (!code || code === 'blank') return null
  const def = BADGES[code]
  if (!def) {
    // Unknown code: still try the conventional .png path.
    return { id: code, name: code, url: `https://starblast.io/ecp/${code}.png` }
  }
  return {
    id: code,
    name: def.name,
    url: def.file ? `https://starblast.io/ecp/${def.file}` : null,
  }
}
