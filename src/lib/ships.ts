// ------------------------------------------------------------------
//  Starblast ship -> glyph mapping (vanilla ships font).
//  Reverse-engineered from the official ship atlas: each vanilla ship
//  code maps to a Private-Use-Area codepoint rendered with the
//  "StarblastVanilla" font (see @font-face in index.css).
//  Modded ships (useries/nautic/intrusion) use their own fonts that we
//  don't bundle, so they fall back to a coloured dot.
// ------------------------------------------------------------------

const VANILLA: Record<number, number> = {
  101: 0xf100,
  201: 0xf101, 202: 0xf102,
  301: 0xf103, 302: 0xf104, 303: 0xf105, 304: 0xf106,
  401: 0xf107, 402: 0xf108, 403: 0xf109, 404: 0xf10a, 405: 0xf10b, 406: 0xf10c,
  501: 0xf10d, 502: 0xf10e, 503: 0xf10f, 504: 0xf110, 505: 0xf111, 506: 0xf112,
  507: 0xf113, 508: 0xf114,
  601: 0xf115, 602: 0xf116, 603: 0xf117, 604: 0xf118, 605: 0xf119, 606: 0xf11a,
  607: 0xf11b, 608: 0xf11c, 609: 0xf11d,
  701: 0xf11e, 702: 0xf11f, 703: 0xf120, 704: 0xf121,
}

const VANILLA_MODES = new Set(['team', 'survival', 'deathmatch', 'invasion'])

/** The glyph character for a ship in a vanilla game mode, or null. */
export function shipGlyph(ship: number, mode: string): string | null {
  if (!VANILLA_MODES.has(mode)) return null
  const cp = VANILLA[ship]
  return cp ? String.fromCodePoint(cp) : null
}
