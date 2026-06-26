// ─── ThreeBg ──────────────────────────────────────────────────────────────────
// Three.js / R3F background with 4 distinct modes:
//
//   galaxy  — Full immersive: stars + particle network + gems + glow orbs
//   network — Particle network focused: network + gems, sparser stars
//   stars   — Starfield + floating gems only, no network
//   minimal — Very subtle starfield, no network, no gems
//   off     — Nothing rendered
//
// All modes read the current theme accent for adaptive colouring.

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Stars } from '@react-three/drei'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useSettings, type BgEffect } from '../store/settings'

// ── Helpers ───────────────────────────────────────────────────────────────────

function readAccent(): string {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue('--c-accent')
      .trim()
      .replace(/\s/g, '') || '#ff7a2f'
  )
}

// ── Floating wireframe icosahedron ────────────────────────────────────────────

function FloatingGem({
  position, color, rotSpeed = 0.25, floatSpeed = 0.4, scale = 1,
}: {
  position: [number, number, number]
  color: string
  rotSpeed?: number
  floatSpeed?: number
  scale?: number
}) {
  const ref = useRef<THREE.Mesh>(null)
  const baseY = position[1]

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime
    ref.current.rotation.x = t * rotSpeed * 0.7
    ref.current.rotation.y = t * rotSpeed
    ref.current.position.y = baseY + Math.sin(t * floatSpeed) * 0.45
  })

  return (
    <mesh ref={ref} position={position} scale={scale}>
      <icosahedronGeometry args={[0.65, 0]} />
      <meshBasicMaterial color={color} wireframe transparent opacity={0.32} />
    </mesh>
  )
}

// ── Pulsing glow orb ──────────────────────────────────────────────────────────

function GlowOrb({ position, color }: { position: [number, number, number]; color: string }) {
  const ref = useRef<THREE.Mesh>(null)
  const baseY = position[1]

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime
    ref.current.scale.setScalar(1 + Math.sin(t * 1.3) * 0.18)
    ref.current.position.y = baseY + Math.cos(t * 0.6) * 0.3
  })

  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.35, 12, 12]} />
      <meshBasicMaterial color={color} transparent opacity={0.13} />
    </mesh>
  )
}

// ── Connected particle network ────────────────────────────────────────────────

function ParticleNetwork({ count = 110, color }: { count: number; color: string }) {
  const groupRef = useRef<THREE.Group>(null)

  const { ptGeo, lineGeo } = useMemo(() => {
    const raw: [number, number, number][] = Array.from({ length: count }, () => [
      (Math.random() - 0.5) * 42,
      (Math.random() - 0.5) * 26,
      (Math.random() - 0.5) * 12 - 6,
    ])

    const pts = new Float32Array(count * 3)
    raw.forEach(([x, y, z], i) => { pts[i*3]=x; pts[i*3+1]=y; pts[i*3+2]=z })

    const lines: number[] = []
    const threshold = 7.5
    for (let i = 0; i < count; i++)
      for (let j = i + 1; j < count; j++) {
        const dx = raw[i][0]-raw[j][0], dy=raw[i][1]-raw[j][1], dz=raw[i][2]-raw[j][2]
        if (dx*dx + dy*dy + dz*dz < threshold*threshold)
          lines.push(...raw[i], ...raw[j])
      }

    const pg = new THREE.BufferGeometry()
    pg.setAttribute('position', new THREE.BufferAttribute(pts, 3))

    const lg = new THREE.BufferGeometry()
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lines), 3))

    return { ptGeo: pg, lineGeo: lg }
  }, [count])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    groupRef.current.rotation.y = clock.elapsedTime * 0.013
    groupRef.current.rotation.x = Math.sin(clock.elapsedTime * 0.006) * 0.07
  })

  return (
    <group ref={groupRef}>
      <points geometry={ptGeo}>
        <pointsMaterial color={color} size={0.1} transparent opacity={0.9} sizeAttenuation />
      </points>
      <lineSegments geometry={lineGeo}>
        <lineBasicMaterial color={color} transparent opacity={0.14} />
      </lineSegments>
    </group>
  )
}

// ── Mouse-following point light ───────────────────────────────────────────────

function MouseLight({ color }: { color: string }) {
  const ref = useRef<THREE.PointLight>(null)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!ref.current) return
      ref.current.position.x = (e.clientX / window.innerWidth  - 0.5) * 28
      ref.current.position.y = -(e.clientY / window.innerHeight - 0.5) * 17
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  useFrame(({ clock }) => {
    if (ref.current) ref.current.intensity = 1.8 + Math.sin(clock.elapsedTime * 2.1) * 0.4
  })

  return <pointLight ref={ref} position={[0, 0, 8]} color={color} intensity={1.8} distance={28} decay={2} />
}

// ── Mouse camera rig ─────────────────────────────────────────────────────────
// Moves the camera laterally so the starfield gets a strong parallax.

function CameraRig({ strength = 1 }: { strength?: number }) {
  const { camera } = useThree()
  const mouse = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth  - 0.5) * 2
      mouse.current.y = -(e.clientY / window.innerHeight - 0.5) * 2
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  useFrame(() => {
    camera.position.x += (mouse.current.x * 7 * strength - camera.position.x) * 0.055
    camera.position.y += (mouse.current.y * 3.5 * strength - camera.position.y) * 0.055
    camera.lookAt(0, 0, 0)
  })

  return null
}

// ── Mouse parallax group ───────────────────────────────────────────────────
// Rotates the entire scene group based on mouse position, adding a
// second layer of parallax on top of camera movement.

function MouseParallax({
  children, strength = 1,
}: {
  children: React.ReactNode
  strength?: number
}) {
  const ref = useRef<THREE.Group>(null)
  const mouse = useRef({ x: 0, y: 0 })
  const cur = useRef({ rx: 0, ry: 0 })

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth  - 0.5)
      mouse.current.y = -(e.clientY / window.innerHeight - 0.5)
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  useFrame(() => {
    if (!ref.current) return
    cur.current.rx += (mouse.current.y * 0.22 * strength - cur.current.rx) * 0.045
    cur.current.ry += (mouse.current.x * 0.35 * strength - cur.current.ry) * 0.045
    ref.current.rotation.x = cur.current.rx
    ref.current.rotation.y = cur.current.ry
  })

  return <group ref={ref}>{children}</group>
}

// ── Mode-specific scenes ──────────────────────────────────────────────────────

function SceneGalaxy({ accent }: { accent: string }) {
  return (
    <>
      <MouseParallax strength={1}>
        <Stars radius={90} depth={55} count={2800} factor={3.5} saturation={0} fade speed={0.35} />
        <ParticleNetwork count={110} color={accent} />
        <FloatingGem position={[-11, 2.5,  -9]}  color={accent} rotSpeed={0.22} scale={1.3} />
        <FloatingGem position={[12,  -3.5, -11]} color={accent} rotSpeed={0.17} floatSpeed={0.45} scale={1.0} />
        <FloatingGem position={[1,    7,   -16]} color={accent} rotSpeed={0.28} floatSpeed={0.28} scale={0.75} />
        <FloatingGem position={[-6,  -5,   -7]}  color={accent} rotSpeed={0.35} floatSpeed={0.55} scale={0.6} />
        <GlowOrb position={[-4, -3, -2]} color={accent} />
        <GlowOrb position={[ 8,  4, -3]} color={accent} />
        <GlowOrb position={[ 0, -6,-14]} color={accent} />
      </MouseParallax>
      <MouseLight color={accent} />
      <ambientLight intensity={0.06} />
      <CameraRig strength={1} />
    </>
  )
}

function SceneNetwork({ accent }: { accent: string }) {
  return (
    <>
      <MouseParallax strength={1.2}>
        <Stars radius={80} depth={40} count={1400} factor={2.5} saturation={0} fade speed={0.2} />
        <ParticleNetwork count={130} color={accent} />
        <FloatingGem position={[-9,  3,  -8]}  color={accent} rotSpeed={0.3}  scale={1.1} />
        <FloatingGem position={[10, -4, -10]}  color={accent} rotSpeed={0.2}  floatSpeed={0.5} scale={0.85} />
      </MouseParallax>
      <MouseLight color={accent} />
      <ambientLight intensity={0.05} />
      <CameraRig strength={1.2} />
    </>
  )
}

function SceneStars({ accent }: { accent: string }) {
  return (
    <>
      <MouseParallax strength={0.8}>
        <Stars radius={95} depth={60} count={3500} factor={4} saturation={0} fade speed={0.5} />
        <FloatingGem position={[-12, 3,  -9]}  color={accent} rotSpeed={0.18} scale={1.2} />
        <FloatingGem position={[11, -3, -12]}  color={accent} rotSpeed={0.22} floatSpeed={0.4} scale={0.9} />
        <FloatingGem position={[0,   6, -18]}  color={accent} rotSpeed={0.14} floatSpeed={0.25} scale={0.7} />
      </MouseParallax>
      <ambientLight intensity={0.04} />
      <CameraRig strength={0.8} />
    </>
  )
}

function SceneMinimal() {
  return (
    <>
      <MouseParallax strength={0.4}>
        <Stars radius={100} depth={50} count={1800} factor={2} saturation={0} fade speed={0.15} />
      </MouseParallax>
      <ambientLight intensity={0.03} />
      <CameraRig strength={0.4} />
    </>
  )
}

function Scene({ mode, accent }: { mode: BgEffect; accent: string }) {
  if (mode === 'galaxy')  return <SceneGalaxy  accent={accent} />
  if (mode === 'network') return <SceneNetwork accent={accent} />
  if (mode === 'stars')   return <SceneStars   accent={accent} />
  if (mode === 'minimal') return <SceneMinimal />
  return null
}

// ── Export ────────────────────────────────────────────────────────────────────

export function ThreeBg() {
  const bgEffect = useSettings((s) => s.bgEffect)
  const theme    = useSettings((s) => s.theme)

  // Re-read the accent CSS variable *after* applySettings() has updated
  // [data-theme] on <html>. applySettings runs in a useEffect in App.tsx,
  // so we defer one animation frame to guarantee the DOM is updated first.
  const [accent, setAccent] = useState(() => readAccent())
  useEffect(() => {
    const raf = requestAnimationFrame(() => setAccent(readAccent()))
    return () => cancelAnimationFrame(raf)
  }, [theme])

  if (bgEffect === 'off') return null

  return (
    <div className="pointer-events-none fixed inset-0" style={{ zIndex: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 18], fov: 55 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
        dpr={[1, 1.5]}
      >
        <Scene mode={bgEffect} accent={accent} />
      </Canvas>
    </div>
  )
}
