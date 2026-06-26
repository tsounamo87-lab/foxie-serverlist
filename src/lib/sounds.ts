// ─── Procedural UI sounds — Web Audio API ─────────────────────────────────────
// All tones generated on the fly — no audio files.
// 5 presets: sci-fi (FM), retro (8-bit), holo (bell FM), minimal, deep (bass).

import { useSettings } from '../store/settings'
import type { SoundPreset } from '../store/settings'

let _ctx: AudioContext | null = null
function actx(): AudioContext | null {
  try {
    if (!_ctx) _ctx = new AudioContext()
    if (_ctx.state === 'suspended') void _ctx.resume()
    return _ctx
  } catch { return null }
}

function masterVol(raw: number): number {
  const v = useSettings.getState().soundVolume
  return raw * (v / 100)
}

// ── Simple swept oscillator ──────────────────────────────────────────────────
interface ToneOpts {
  f0: number; f1?: number
  wave?: OscillatorType
  dur: number; v: number
  attack?: number; delay?: number
}
function tone({ f0, f1, wave = 'sine', dur, v, attack = 0.003, delay = 0 }: ToneOpts) {
  const c = actx(); if (!c) return
  const g = masterVol(v); if (g <= 0) return
  try {
    const t = c.currentTime + delay
    const osc = c.createOscillator(), env = c.createGain()
    osc.connect(env); env.connect(c.destination)
    osc.type = wave; osc.frequency.setValueAtTime(f0, t)
    if (f1 !== undefined && f1 !== f0)
      osc.frequency.exponentialRampToValueAtTime(f1, t + dur)
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(g, t + attack)
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.start(t); osc.stop(t + dur + 0.04)
  } catch { /* ignore */ }
}

// ── FM synthesis ─────────────────────────────────────────────────────────────
interface FmOpts {
  carrier: number; carrier1?: number
  modFreq: number; modDepth: number
  dur: number; v: number
  attack?: number; delay?: number
}
function fm({ carrier, carrier1, modFreq, modDepth, dur, v, attack = 0.003, delay = 0 }: FmOpts) {
  const c = actx(); if (!c) return
  const g = masterVol(v); if (g <= 0) return
  try {
    const t = c.currentTime + delay
    const mod = c.createOscillator(), modEnv = c.createGain()
    const car = c.createOscillator(), env = c.createGain()
    mod.connect(modEnv); modEnv.connect(car.frequency)
    car.connect(env);    env.connect(c.destination)
    mod.type = 'sine'; mod.frequency.value = modFreq
    modEnv.gain.setValueAtTime(modDepth, t)
    modEnv.gain.exponentialRampToValueAtTime(0.001, t + dur)
    car.type = 'sine'; car.frequency.setValueAtTime(carrier, t)
    if (carrier1) car.frequency.exponentialRampToValueAtTime(carrier1, t + dur)
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(g, t + attack)
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    mod.start(t); mod.stop(t + dur + 0.04)
    car.start(t); car.stop(t + dur + 0.04)
  } catch { /* ignore */ }
}

// ── File-based playback (for FX preset) ─────────────────────────────────────
function playFile(url: string) {
  const v = useSettings.getState().soundVolume
  if (v === 0) return
  try {
    const a = new Audio(url)
    a.volume = Math.min(1, v / 100)
    void a.play()
  } catch { /* ignore */ }
}

// ── Preset definitions ───────────────────────────────────────────────────────
interface SoundFns {
  click(): void; open(): void; close(): void
  toggle(): void; join(): void; notify(): void; error(): void
}

// FX — real audio files from /public/sounds/
const fx: SoundFns = {
  click()  { playFile('/sounds/mixkit-sci-fi-click-900.wav') },
  open()   { playFile('/sounds/mixkit-futuristic-door-open-183.mp3') },
  close()  { playFile('/sounds/mixkit-sci-fi-tube-swoosh-912.wav') },
  toggle() { playFile('/sounds/mixkit-alien-technology-button-3118.wav') },
  join()   { playFile('/sounds/mixkit-sci-fi-power-up-3160.wav') },
  notify() { playFile('/sounds/mixkit-sci-fi-positive-notification-266.wav') },
  error()  { playFile('/sounds/mixkit-sci-fi-error-alert-898.wav') },
}

// Sci-Fi — FM synthesis, metallic & electronic
const sciFi: SoundFns = {
  click() {
    tone({ f0: 1200, f1: 700, wave: 'sawtooth', dur: 0.045, v: 0.10 })
    fm  ({ carrier: 900,  modFreq: 900,  modDepth: 400,  dur: 0.04,  v: 0.06 })
  },
  open() {
    fm  ({ carrier: 280, carrier1: 840, modFreq: 280, modDepth: 840,  dur: 0.18, v: 0.09 })
    tone({ f0: 560, f1: 1680, wave: 'triangle', dur: 0.12, v: 0.06, delay: 0.07 })
    tone({ f0: 1760, dur: 0.06, v: 0.04, delay: 0.15 })
  },
  close() {
    fm  ({ carrier: 700, carrier1: 180, modFreq: 350, modDepth: 700, dur: 0.14, v: 0.08 })
    tone({ f0: 440, f1: 110, wave: 'triangle', dur: 0.11, v: 0.04, delay: 0.02 })
  },
  toggle() {
    tone({ f0: 2200, f1: 3000, wave: 'square', dur: 0.03,  v: 0.07 })
    fm  ({ carrier: 1400, modFreq: 1400, modDepth: 1400, dur: 0.035, v: 0.05, delay: 0.01 })
  },
  join() {
    fm({ carrier: 440,  carrier1: 660,  modFreq: 440, modDepth: 880, dur: 0.10, v: 0.11 })
    fm({ carrier: 660,  carrier1: 880,  modFreq: 660, modDepth: 660, dur: 0.10, v: 0.09, delay: 0.09 })
    fm({ carrier: 880,  carrier1: 1320, modFreq: 440, modDepth: 440, dur: 0.14, v: 0.11, delay: 0.17 })
  },
  notify() {
    fm({ carrier: 1320, modFreq: 1320, modDepth: 880, dur: 0.10, v: 0.08 })
    fm({ carrier: 1760, modFreq: 880,  modDepth: 440, dur: 0.08, v: 0.06, delay: 0.22 })
  },
  error() {
    fm  ({ carrier: 400, carrier1: 240, modFreq: 133, modDepth: 600, dur: 0.16, v: 0.10 })
    tone({ f0: 300, f1: 150, wave: 'sawtooth', dur: 0.12, v: 0.06, delay: 0.04 })
  },
}

// Retro — 8-bit square wave / chiptune
const retro: SoundFns = {
  click() {
    tone({ f0: 1400, f1: 700, wave: 'square', dur: 0.04, v: 0.12 })
  },
  open() {
    tone({ f0: 330, f1: 660,  wave: 'square', dur: 0.06, v: 0.11 })
    tone({ f0: 440, f1: 880,  wave: 'square', dur: 0.06, v: 0.09, delay: 0.055 })
    tone({ f0: 660, f1: 1320, wave: 'square', dur: 0.08, v: 0.08, delay: 0.11  })
  },
  close() {
    tone({ f0: 880, f1: 220, wave: 'square', dur: 0.10, v: 0.11 })
    tone({ f0: 440, f1: 110, wave: 'square', dur: 0.08, v: 0.07, delay: 0.04 })
  },
  toggle() {
    tone({ f0: 1760, wave: 'square', dur: 0.025, v: 0.11 })
  },
  join() {
    tone({ f0: 523,  wave: 'square', dur: 0.06, v: 0.12 })
    tone({ f0: 659,  wave: 'square', dur: 0.06, v: 0.11, delay: 0.06  })
    tone({ f0: 784,  wave: 'square', dur: 0.06, v: 0.10, delay: 0.12  })
    tone({ f0: 1046, wave: 'square', dur: 0.12, v: 0.13, delay: 0.18  })
  },
  notify() {
    tone({ f0: 1046, wave: 'square', dur: 0.06, v: 0.10 })
    tone({ f0: 1046, wave: 'square', dur: 0.06, v: 0.07, delay: 0.18 })
  },
  error() {
    tone({ f0: 220, f1: 110, wave: 'square', dur: 0.12, v: 0.12 })
    tone({ f0: 185, f1: 92,  wave: 'square', dur: 0.10, v: 0.08, delay: 0.06 })
  },
}

// Holo — bell-like FM, crystal / ethereal
const holo: SoundFns = {
  click() {
    fm({ carrier: 2400, modFreq: 1200, modDepth: 4800, dur: 0.18, v: 0.06 })
  },
  open() {
    fm({ carrier: 660,  modFreq: 330,  modDepth: 1980, dur: 0.28, v: 0.07 })
    fm({ carrier: 1320, modFreq: 660,  modDepth: 1320, dur: 0.18, v: 0.05, delay: 0.12 })
    fm({ carrier: 2640, modFreq: 1320, modDepth: 1320, dur: 0.10, v: 0.04, delay: 0.22 })
  },
  close() {
    fm({ carrier: 880, modFreq: 440, modDepth: 2640, dur: 0.22, v: 0.07 })
    fm({ carrier: 440, modFreq: 220, modDepth: 1320, dur: 0.16, v: 0.04, delay: 0.10 })
  },
  toggle() {
    fm({ carrier: 1760, modFreq: 1760, modDepth: 5280, dur: 0.12, v: 0.06 })
  },
  join() {
    fm({ carrier: 440,  modFreq: 220, modDepth: 1320, dur: 0.16, v: 0.08 })
    fm({ carrier: 660,  modFreq: 330, modDepth: 1980, dur: 0.16, v: 0.08, delay: 0.14 })
    fm({ carrier: 880,  modFreq: 440, modDepth: 2640, dur: 0.20, v: 0.10, delay: 0.26 })
    fm({ carrier: 1320, modFreq: 660, modDepth: 1320, dur: 0.14, v: 0.06, delay: 0.42 })
  },
  notify() {
    fm({ carrier: 1760, modFreq: 880,  modDepth: 2640, dur: 0.14, v: 0.07 })
    fm({ carrier: 2200, modFreq: 1100, modDepth: 2200, dur: 0.10, v: 0.05, delay: 0.25 })
  },
  error() {
    fm({ carrier: 330, modFreq: 165, modDepth: 660, dur: 0.25, v: 0.08 })
    fm({ carrier: 220, modFreq: 110, modDepth: 440, dur: 0.18, v: 0.06, delay: 0.16 })
  },
}

// Minimal — barely-there soft sine tones
const minimal: SoundFns = {
  click()  { tone({ f0: 800,  f1: 600, dur: 0.04, v: 0.05 }) },
  open()   { tone({ f0: 440,  f1: 660, dur: 0.10, v: 0.04 }) },
  close()  { tone({ f0: 550,  f1: 330, dur: 0.08, v: 0.04 }) },
  toggle() { tone({ f0: 1200, dur: 0.03, v: 0.04 }) },
  join() {
    tone({ f0: 440, f1: 660, dur: 0.08, v: 0.05 })
    tone({ f0: 660, f1: 880, dur: 0.08, v: 0.04, delay: 0.08 })
  },
  notify() {
    tone({ f0: 880,  dur: 0.07, v: 0.05 })
    tone({ f0: 1100, dur: 0.06, v: 0.03, delay: 0.18 })
  },
  error() { tone({ f0: 300, f1: 200, dur: 0.10, v: 0.05 }) },
}

// Deep — low bass emphasis, subby & heavy
const deep: SoundFns = {
  click() {
    fm  ({ carrier: 120, modFreq: 60,  modDepth: 240, dur: 0.08, v: 0.14 })
    tone({ f0: 80,  f1: 40,  dur: 0.06, v: 0.08 })
  },
  open() {
    fm  ({ carrier: 80, carrier1: 240, modFreq: 80,  modDepth: 320, dur: 0.24, v: 0.12 })
    tone({ f0: 120, f1: 360, wave: 'sawtooth', dur: 0.16, v: 0.07, delay: 0.10 })
  },
  close() {
    fm  ({ carrier: 240, carrier1: 60, modFreq: 120, modDepth: 480, dur: 0.20, v: 0.11 })
    tone({ f0: 160, f1: 40, dur: 0.14, v: 0.07, delay: 0.04 })
  },
  toggle() { tone({ f0: 200, f1: 300, wave: 'sawtooth', dur: 0.06, v: 0.13 }) },
  join() {
    fm({ carrier: 80,  carrier1: 160, modFreq: 80,  modDepth: 320, dur: 0.14, v: 0.12 })
    fm({ carrier: 120, carrier1: 240, modFreq: 120, modDepth: 480, dur: 0.14, v: 0.11, delay: 0.12 })
    fm({ carrier: 160, carrier1: 320, modFreq: 80,  modDepth: 320, dur: 0.18, v: 0.13, delay: 0.24 })
  },
  notify() {
    fm({ carrier: 160, modFreq: 80,  modDepth: 240, dur: 0.18, v: 0.10 })
    fm({ carrier: 200, modFreq: 100, modDepth: 300, dur: 0.14, v: 0.08, delay: 0.26 })
  },
  error() {
    fm  ({ carrier: 80, carrier1: 50, modFreq: 40,  modDepth: 200, dur: 0.22, v: 0.13 })
    tone({ f0: 60, f1: 30, wave: 'sawtooth', dur: 0.18, v: 0.08, delay: 0.04 })
  },
}

const PRESETS: Record<SoundPreset, SoundFns> = {
  fx, 'sci-fi': sciFi, retro, holo, minimal, deep,
}

function getPreset(): SoundFns {
  const p = useSettings.getState().soundPreset
  return PRESETS[p] ?? sciFi
}

// ── Public API ────────────────────────────────────────────────────────────────
export const Sounds: SoundFns = {
  click()  { getPreset().click()  },
  open()   { getPreset().open()   },
  close()  { getPreset().close()  },
  toggle() { getPreset().toggle() },
  join()   { getPreset().join()   },
  notify() { getPreset().notify() },
  error()  { getPreset().error()  },
}
