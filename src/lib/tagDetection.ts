// ─── Automatic clan tag detection ────────────────────────────────────────────
// Scans player names and proposes candidate clan tags based on frequency.
// Handles bracket tags, separator tags, and arbitrary unicode prefixes/suffixes.

export interface TagCandidate {
  tag: string
  count: number          // number of unique player names that match
  examples: string[]     // up to 3 example names
}

// ── Extraction helpers ────────────────────────────────────────────────────────

/**
 * Try to extract a bracket-style tag at the start of a name.
 * Handles: [TAG], (TAG), {TAG}, <TAG>, ❮TAG❯, 【TAG】, etc.
 */
function extractBracket(name: string): string | null {
  // Any run of non-word, non-space opener chars + content + closer chars
  const m = name.match(
    /^([[\](){}<>❮❯〔〕【】《》〈〉「」『』⟨⟩\|!@#$%^&*~`]{0,3}[\S\s]{1,12}?[[\](){}<>❮❯〔〕【】《》〈〉「」『』⟨⟩\|!@#$%^&*~`]{1,3})\s*\w/,
  )
  if (!m) return null
  const tag = m[1]
  // Must start OR end with a non-word/non-space char (i.e. actually a bracket)
  if (!/[^\w\s]/.test(tag[0]) && !/[^\w\s]/.test(tag[tag.length - 1])) return null
  return tag.length >= 2 ? tag : null
}

/**
 * Try to extract a prefix tag before a separator character.
 * Handles: "TAG | name", "TAG - name", "TAG · name", "TAG.name"
 */
function extractSeparator(name: string): string | null {
  const m = name.match(/^(\S{2,12})\s*[|·•/]\s+\w/)
  return m?.[1] ?? null
}

/**
 * Try to extract a pure non-ASCII unicode prefix at the start of a name.
 * This is the key detector for tags like "❮⌥Ƒᔦ❯" — arbitrary Unicode sequences
 * that precede a regular alphabetic name.
 *
 * A "unicode prefix" is any sequence of ≥2 chars where at least half are outside
 * the basic ASCII range, appearing before a regular word character.
 */
function extractUnicodePrefix(name: string): string | null {
  // Greedy match: non-ASCII chars (and mixed), then a word char or space
  const m = name.match(/^([\S\s]{2,18}?)(?=[A-Za-z\d]{2})/)
  if (!m) return null
  const candidate = m[1]
  // Require that at least 40% of the chars are non-ASCII
  const nonAscii = [...candidate].filter((c) => c.charCodeAt(0) > 127).length
  if (nonAscii / candidate.length < 0.4) return null
  if (candidate.trim().length < 2) return null
  return candidate
}

/**
 * Try to extract a pure ALL-CAPS Latin prefix (e.g. "NK", "TK", "FOX").
 * Only returns it if it looks like an abbreviation (2-6 uppercase letters).
 */
function extractCapsPrefix(name: string): string | null {
  const m = name.match(/^([A-Z]{2,6})(?=[^A-Z\s]|\s+[A-Z][a-z])/)
  return m?.[1] ?? null
}

// ── Main detection ────────────────────────────────────────────────────────────

/**
 * Scan a list of player names and return candidate clan tags with occurrence counts.
 * Tags already in `knownTags` are excluded from suggestions.
 */
export function detectTagCandidates(
  names: string[],
  knownTags: string[] = [],
  minOccurrences = 2,
): TagCandidate[] {
  const freq = new Map<string, Set<string>>()
  const knownLower = new Set(knownTags.map((t) => t.toLowerCase()))

  for (const name of names) {
    const n = name.trim()
    if (!n) continue

    const candidates = new Set<string>()

    const b = extractBracket(n)
    if (b) candidates.add(b)

    const s = extractSeparator(n)
    if (s) candidates.add(s)

    const u = extractUnicodePrefix(n)
    if (u) candidates.add(u)

    const c = extractCapsPrefix(n)
    if (c) candidates.add(c)

    for (const tag of candidates) {
      if (knownLower.has(tag.toLowerCase())) continue
      const set = freq.get(tag) ?? new Set()
      set.add(n)
      freq.set(tag, set)
    }
  }

  // Build results, de-duplicate redundant shorter/longer variants
  let results: TagCandidate[] = []
  for (const [tag, nameSet] of freq) {
    if (nameSet.size < minOccurrences) continue
    results.push({ tag, count: nameSet.size, examples: [...nameSet].slice(0, 3) })
  }

  // Sort: most occurrences first; prefer longer tags on tie (more specific)
  results.sort((a, b) => b.count - a.count || b.tag.length - a.tag.length)

  // Remove candidates that are strict substrings of a higher-count candidate
  results = results.filter((r) => {
    return !results.some(
      (other) =>
        other !== r &&
        other.count >= r.count &&
        other.tag.toLowerCase().includes(r.tag.toLowerCase()) &&
        other.tag !== r.tag,
    )
  })

  return results.slice(0, 12)
}
