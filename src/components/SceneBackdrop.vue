<script setup lang="ts">
// The world behind the scale. It shows the weather instead of describing it:
// clear sky and a warm sun, clouds rolling in, gusts with streaks and leaves,
// calm with mist, dust and birds. One canvas, drawn every frame.
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { DAY_H, ambient } from '../sim'
import type { SimState } from '../sim'
import { clamp01, css, daylight, lookAt, mix, tint } from '../sky'
import type { RGB } from '../sky'

const props = defineProps<{ sim: SimState }>()
const cv = ref<HTMLCanvasElement | null>(null)

// ---------- a fixed random layout, so the world does not jump around ----------
function rng(seed: number) {
  let a = seed
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0
    return a / 4294967296
  }
}
const r = rng(11)
const stars = Array.from({ length: 70 }, () => ({ x: r(), y: r() * 0.6, s: 0.6 + r() * 1.3, p: r() * 6.28 }))
const baseClouds = Array.from({ length: 6 }, () => ({ x: r(), y: 0.07 + r() * 0.3, sc: 0.6 + r() * 0.7 }))
const heavyClouds = Array.from({ length: 8 }, () => ({ x: r(), y: 0.04 + r() * 0.3, sc: 1.5 + r() }))
const turbines = [
  { x: 0.06, sc: 0.95, rot: 0 },
  { x: 0.16, sc: 0.62, rot: 2 },
  { x: 0.85, sc: 0.62, rot: 4 },
  { x: 0.94, sc: 0.95, rot: 1 },
]
const motes = Array.from({ length: 22 }, () => ({ x: r(), y: 0.3 + r() * 0.5, p: r() * 6.28, s: 1 + r() * 1.6 }))
const birds = Array.from({ length: 3 }, () => ({ x: r(), y: 0.16 + r() * 0.2, p: r() * 6, v: 12 + r() * 10 }))

interface Streak {
  x: number
  y: number
  len: number
  spd: number
  a: number
  ph: number
}
interface Leaf {
  x: number
  y: number
  spd: number
  rot: number
  vr: number
  ph: number
  c: string
  sz: number
}
const streaks: Streak[] = []
const leaves: Leaf[] = []
const LEAF_COLORS = ['#7bcf6a', '#a6d65a', '#f2b134']

// smoothed inputs: the world eases into new weather instead of snapping
const st = { wind: 0.4, clear: 1, aheadClear: 1, birds: 0 }

let ctx: CanvasRenderingContext2D | null = null
let W = 600
let H = 300
let dpr = 1
let raf = 0
let last = 0
let lastPage = 0
let ro: ResizeObserver | undefined
let motion = 1

const rootStyle = () => document.documentElement.style

function resize() {
  const c = cv.value
  const p = c?.parentElement
  if (!c || !p) return
  dpr = Math.min(2, window.devicePixelRatio || 1)
  W = Math.max(200, p.clientWidth)
  H = Math.max(120, p.clientHeight)
  c.width = Math.round(W * dpr)
  c.height = Math.round(H * dpr)
}

function puff(g: CanvasRenderingContext2D, cx: number, cy: number, R: number) {
  // one path, so overlapping puffs merge into a single soft shape
  const parts: Array<[number, number, number]> = [
    [-1.0, 0.15, 0.55],
    [-0.45, -0.15, 0.72],
    [0.25, -0.3, 0.85],
    [0.95, -0.02, 0.62],
    [0.1, 0.2, 0.7],
  ]
  g.beginPath()
  for (const [ox, oy, k] of parts) {
    g.moveTo(cx + ox * R + k * R, cy + oy * R)
    g.arc(cx + ox * R, cy + oy * R, k * R, 0, Math.PI * 2)
  }
  g.rect(cx - 1.3 * R, cy + 0.2 * R, 2.5 * R, 0.55 * R)
  g.fill()
}

function frame(now: number) {
  raf = requestAnimationFrame(frame)
  if (!ctx) return
  const g = ctx
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
  last = now
  const sim = props.sim
  const t = Math.min(sim.t, DAY_H)

  // ---- weather in, smoothed ----
  const a = ambient(sim.weather, t)
  const ahead = ambient(sim.weather, Math.min(DAY_H, t + 1.3))
  const k = 1 - Math.exp(-dt / 0.7)
  st.wind += (a.wind - st.wind) * k
  st.clear += (a.clear - st.clear) * k
  st.aheadClear += (ahead.clear - st.aheadClear) * k
  const wind = st.wind
  const day = daylight(t)
  const cover = clamp01((1 - st.clear) / 0.8)
  const coverAhead = clamp01((1 - st.aheadClear) / 0.8)
  const coverVis = Math.max(cover, coverAhead * 0.4) // clouds gather on the horizon before they arrive
  const calm = 1 - clamp01((wind - 0.08) / 0.22)
  const look = lookAt(t)
  const dark = 0.24 * day

  g.setTransform(dpr, 0, 0, dpr, 0, 0)

  // ---- sky ----
  const sky = g.createLinearGradient(0, 0, 0, H * 0.8)
  sky.addColorStop(0, css(tint(look.top, cover, dark)))
  sky.addColorStop(1, css(tint(look.bot, cover, dark)))
  g.fillStyle = sky
  g.fillRect(0, 0, W, H)

  // ---- stars ----
  const starA = (1 - day) * (1 - cover * 0.85)
  if (starA > 0.02) {
    for (const s of stars) {
      g.fillStyle = `rgba(255,255,240,${starA * (0.55 + 0.45 * Math.sin(now / 700 + s.p))})`
      g.beginPath()
      g.arc(s.x * W, s.y * H, s.s, 0, 6.283)
      g.fill()
    }
  }

  // ---- sun ----
  const u = (t - 6.3) / 12.6
  if (u > -0.08 && u < 1.08 && day > 0.01) {
    const uc = clamp01(u)
    const sx = W * (0.08 + 0.84 * uc)
    const sy = H * 0.74 - H * 0.62 * Math.sin(Math.PI * uc)
    const vis = (0.1 + 0.9 * st.clear) * clamp01(Math.sin(Math.PI * uc) * 3)
    const warm = mix([255, 210, 63], [255, 132, 74], 1 - Math.sin(Math.PI * uc))
    const R = Math.min(W, H * 1.5) * 0.05
    const glow = g.createRadialGradient(sx, sy, R * 0.5, sx, sy, H * 0.65)
    glow.addColorStop(0, css(warm, 0.62 * vis))
    glow.addColorStop(0.35, css(warm, 0.18 * vis))
    glow.addColorStop(1, css(warm, 0))
    g.fillStyle = glow
    g.fillRect(0, 0, W, H)
    // slowly turning rays
    g.save()
    g.translate(sx, sy)
    g.rotate((now / 9000) * motion)
    g.fillStyle = css(warm, 0.3 * vis * st.clear)
    for (let i = 0; i < 14; i++) {
      g.rotate((Math.PI * 2) / 14)
      g.beginPath()
      g.moveTo(R * 1.35, -R * 0.16)
      g.lineTo(R * (2.1 + 0.4 * Math.sin(now / 600 + i)), 0)
      g.lineTo(R * 1.35, R * 0.16)
      g.fill()
    }
    g.restore()
    g.fillStyle = css(warm, 0.35 + 0.65 * vis)
    g.beginPath()
    g.arc(sx, sy, R, 0, 6.283)
    g.fill()
  }

  // ---- moon ----
  const nu = (t >= 19.2 ? t - 19.2 : t + 4.8) / 10.4
  const moonA = (1 - day) * clamp01(Math.sin(Math.PI * clamp01(nu)) * 3) * (1 - cover * 0.6)
  if (moonA > 0.02) {
    const mx = W * (0.1 + 0.8 * nu)
    const my = H * 0.7 - H * 0.5 * Math.sin(Math.PI * clamp01(nu))
    const R = Math.min(W, H * 1.5) * 0.04
    const halo = g.createRadialGradient(mx, my, R * 0.6, mx, my, R * 5)
    halo.addColorStop(0, `rgba(230,236,255,${0.32 * moonA})`)
    halo.addColorStop(1, 'rgba(230,236,255,0)')
    g.fillStyle = halo
    g.fillRect(mx - R * 6, my - R * 6, R * 12, R * 12)
    g.fillStyle = `rgba(247,244,216,${moonA})`
    g.beginPath()
    g.arc(mx, my, R, 0, 6.283)
    g.fill()
    g.fillStyle = `rgba(190,185,160,${0.35 * moonA})`
    for (const [ox, oy, rr] of [[-0.3, -0.2, 0.22], [0.25, 0.15, 0.28], [-0.1, 0.4, 0.15]]) {
      g.beginPath()
      g.arc(mx + ox * R, my + oy * R, rr * R, 0, 6.283)
      g.fill()
    }
  }

  // ---- clouds (they drift as fast as the wind blows) ----
  const drift = ((2 + 70 * wind) / W) * dt * motion
  const cloudCol: RGB = tint(look.cloud, cover * 0.9, 0.25 * day)
  g.fillStyle = css(cloudCol, 0.9)
  for (const c of baseClouds) {
    c.x += drift * (0.6 + c.sc * 0.5)
    if (c.x > 1.25) c.x = -0.25
    puff(g, c.x * W, c.y * H, 34 * c.sc * Math.min(1.3, W / 700 + 0.35))
  }
  if (coverVis > 0.02) {
    const veil = g.createLinearGradient(0, 0, 0, H * 0.7)
    const grey: RGB = mix([95, 105, 128], [30, 36, 60], 1 - day)
    veil.addColorStop(0, css(grey, 0.42 * coverVis))
    veil.addColorStop(1, css(grey, 0))
    g.fillStyle = veil
    g.fillRect(0, 0, W, H * 0.7)
    const heavy: RGB = mix(tint(look.cloud, 1, 0.38), [78, 88, 112], 0.35)
    g.fillStyle = css(heavy, 0.92 * coverVis)
    for (const c of heavyClouds) {
      c.x += drift * (0.4 + c.sc * 0.3)
      if (c.x > 1.3) c.x = -0.3
      puff(g, c.x * W, c.y * H, 34 * c.sc * Math.min(1.3, W / 700 + 0.35))
    }
  } else {
    for (const c of heavyClouds) c.x += drift * (0.4 + c.sc * 0.3)
  }

  // ---- far hills ----
  const farY = (xn: number) => H * (0.73 + 0.03 * Math.sin(xn * 6 + 1.2) + 0.018 * Math.sin(xn * 13 + 0.4))
  const nearY = (xn: number) => H * (0.865 + 0.022 * Math.sin(xn * 4 + 2) + 0.012 * Math.sin(xn * 9))
  g.fillStyle = css(tint(look.hillBack, cover * 0.6, 0.12))
  g.beginPath()
  g.moveTo(0, H)
  for (let x = 0; x <= W + 8; x += 8) g.lineTo(x, farY(x / W))
  g.lineTo(W, H)
  g.fill()

  // ---- wind turbines: the faster the wind, the faster they spin ----
  const omega = (0.15 + 5.0 * Math.pow(wind, 1.1)) * motion
  const bladeCol = css(mix([248, 250, 253], [120, 135, 178], (1 - day) * 0.85))
  const towerCol = css(mix([226, 232, 242], [96, 110, 150], (1 - day) * 0.85))
  for (const tb of turbines) {
    tb.rot += omega * dt * (0.85 + 0.15 * Math.sin(tb.x * 40))
    const bx = tb.x * W
    const by = farY(tb.x) + 4
    const ht = H * 0.34 * tb.sc
    const tw = Math.max(2.4, 6 * tb.sc)
    g.fillStyle = towerCol
    g.beginPath()
    g.moveTo(bx - tw, by)
    g.lineTo(bx - tw * 0.38, by - ht)
    g.lineTo(bx + tw * 0.38, by - ht)
    g.lineTo(bx + tw, by)
    g.fill()
    g.strokeStyle = bladeCol
    g.lineWidth = Math.max(2.2, 4.4 * tb.sc)
    g.lineCap = 'round'
    const L = ht * 0.55
    for (let i = 0; i < 3; i++) {
      const ang = tb.rot + (i * Math.PI * 2) / 3
      g.beginPath()
      g.moveTo(bx, by - ht)
      g.lineTo(bx + Math.cos(ang) * L, by - ht + Math.sin(ang) * L)
      g.stroke()
    }
    g.fillStyle = bladeCol
    g.beginPath()
    g.arc(bx, by - ht, Math.max(2.6, 4.6 * tb.sc), 0, 6.283)
    g.fill()
  }

  // ---- calm: a soft mist settles over the valley ----
  if (calm > 0.02) {
    const mistA = calm * (0.34 * day + 0.16 * (1 - day))
    const mist = g.createLinearGradient(0, H * 0.52, 0, H * 0.9)
    mist.addColorStop(0, 'rgba(255,255,255,0)')
    mist.addColorStop(0.55, `rgba(255,255,255,${mistA})`)
    mist.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = mist
    g.fillRect(0, H * 0.52, W, H * 0.4)
  }

  // ---- near hill, with grass that leans into the wind ----
  const front = tint(look.hillFront, cover * 0.6, 0.12)
  g.fillStyle = css(front)
  g.beginPath()
  g.moveTo(0, H)
  for (let x = 0; x <= W + 8; x += 8) g.lineTo(x, nearY(x / W))
  g.lineTo(W, H)
  g.fill()
  g.strokeStyle = css(mix(front, [255, 255, 255], 0.12))
  g.lineWidth = 2
  g.lineCap = 'round'
  g.beginPath()
  for (let x = 6; x < W; x += 13) {
    const y0 = nearY(x / W) + 1
    const lean = wind * 11 + Math.sin(now / 380 + x * 0.06) * wind * 5 * motion
    g.moveTo(x, y0)
    g.lineTo(x + lean, y0 - 9 + wind * 2)
  }
  g.stroke()

  // ---- wind streaks and gust leaves ----
  const wantStreaks = motion < 1 ? 0 : Math.round(46 * Math.pow(wind, 1.8))
  if (streaks.length < wantStreaks && Math.random() < 0.35) {
    streaks.push({
      x: -40,
      y: H * (0.05 + Math.random() * 0.72),
      len: 40 + (60 + 140 * wind) * Math.random(),
      spd: (160 + 1300 * wind) * (0.7 + Math.random() * 0.6),
      a: 0.14 + Math.random() * 0.3,
      ph: Math.random() * 6,
    })
  }
  const streakRGB = day > 0.4 ? '255,255,255' : '190,205,255'
  g.lineWidth = 2
  g.lineCap = 'round'
  for (let i = streaks.length - 1; i >= 0; i--) {
    const s = streaks[i]
    s.x += s.spd * dt
    if (s.x - s.len > W) {
      streaks.splice(i, 1)
      continue
    }
    const wob = Math.sin(now / 250 + s.ph) * 5
    g.strokeStyle = `rgba(${streakRGB},${s.a * (0.5 + wind * 0.8)})`
    g.beginPath()
    g.moveTo(s.x, s.y)
    g.quadraticCurveTo(s.x - s.len * 0.5, s.y + wob, s.x - s.len, s.y)
    g.stroke()
  }
  const wantLeaves = motion < 1 || wind < 0.72 ? 0 : Math.round((wind - 0.7) * 42)
  if (leaves.length < wantLeaves && Math.random() < 0.1) {
    leaves.push({
      x: -20,
      y: H * (0.25 + Math.random() * 0.5),
      spd: (260 + 700 * wind) * (0.6 + Math.random() * 0.6),
      rot: Math.random() * 6,
      vr: 3 + Math.random() * 6,
      ph: Math.random() * 6,
      c: LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)],
      sz: 4 + Math.random() * 3,
    })
  }
  for (let i = leaves.length - 1; i >= 0; i--) {
    const l = leaves[i]
    l.x += l.spd * dt
    l.rot += l.vr * dt
    if (l.x > W + 30) {
      leaves.splice(i, 1)
      continue
    }
    g.save()
    g.translate(l.x, l.y + Math.sin(now / 320 + l.ph) * 16)
    g.rotate(l.rot)
    g.fillStyle = l.c
    g.beginPath()
    g.ellipse(0, 0, l.sz * 1.7, l.sz * 0.8, 0, 0, 6.283)
    g.fill()
    g.restore()
  }

  // ---- calm: drifting dust by day, fireflies by night ----
  if (calm > 0.05) {
    const night = 1 - day
    for (const m of motes) {
      const x = (((m.x * W + (now / 1000) * 7 * motion) % W) + W) % W
      const y = m.y * H + Math.sin(now / 1300 + m.p) * 10
      const tw = 0.5 + 0.5 * Math.sin(now / 800 + m.p * 3)
      if (night > 0.5) {
        const al = calm * night * (0.25 + 0.75 * tw)
        const fg = g.createRadialGradient(x, y, 0, x, y, m.s * 6)
        fg.addColorStop(0, `rgba(210,255,160,${al})`)
        fg.addColorStop(1, 'rgba(210,255,160,0)')
        g.fillStyle = fg
        g.fillRect(x - m.s * 6, y - m.s * 6, m.s * 12, m.s * 12)
      } else {
        g.fillStyle = `rgba(255,246,200,${calm * (0.25 + 0.3 * tw) * day})`
        g.beginPath()
        g.arc(x, y, m.s, 0, 6.283)
        g.fill()
      }
    }
  }

  // ---- birds fly only on calm, clear days ----
  const birdsWanted = day > 0.55 && st.clear > 0.55 && wind < 0.5 ? 1 : 0
  st.birds += (birdsWanted - st.birds) * (1 - Math.exp(-dt / 1.2))
  if (st.birds > 0.03) {
    g.strokeStyle = `rgba(31,42,68,${0.75 * st.birds})`
    g.lineWidth = 2
    g.lineCap = 'round'
    g.lineJoin = 'round'
    for (const b of birds) {
      b.x += (b.v / W) * dt * motion
      if (b.x > 1.1) b.x = -0.1
      const bx = b.x * W
      const by = b.y * H + Math.sin(now / 1500 + b.p) * 8
      const flap = Math.sin(now / 170 + b.p) * 6 * motion
      g.beginPath()
      g.moveTo(bx - 9, by - flap)
      g.quadraticCurveTo(bx - 4, by - 3, bx, by)
      g.quadraticCurveTo(bx + 4, by - 3, bx + 9, by - flap)
      g.stroke()
    }
  }

  // ---- the page behind the cards wears the same sky (throttled) ----
  if (now - lastPage > 120) {
    lastPage = now
    const rs = rootStyle()
    rs.setProperty('--page-top', css(tint(look.pageTop, cover * 0.7, 0.06)))
    rs.setProperty('--page-bot', css(tint(look.pageBot, cover * 0.7, 0.04)))
  }
}

onMounted(() => {
  const c = cv.value
  if (!c) return
  ctx = c.getContext('2d')
  motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.2 : 1
  resize()
  ro = new ResizeObserver(resize)
  if (c.parentElement) ro.observe(c.parentElement)
  raf = requestAnimationFrame((t) => {
    last = t
    frame(t)
  })
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  ro?.disconnect()
  const rs = rootStyle()
  rs.removeProperty('--page-top')
  rs.removeProperty('--page-bot')
})
</script>

<template>
  <canvas ref="cv" class="backdrop" aria-hidden="true" />
</template>

<style scoped>
.backdrop {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  z-index: 0;
}
</style>
