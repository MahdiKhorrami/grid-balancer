// sim.ts: a small, framework-free model of an industrial microgrid.
//
// One simulated day. Solar + wind (weather-driven) and a battery and a gas genset
// (player-controlled) supply the site. A flexible factory and a fixed park load demand
// energy. Any imbalance shows up as a frequency deviation, so the player's job is to
// keep supply = demand while spending as little gas (cost, CO2) as possible.

export const DAY_H = 24
export const TICK_H = 0.02 // simulated hours per tick -> 1200 ticks per day
const SAMPLE_EVERY = 2 // record every n-th tick for the chart
export const SAMPLE_H = TICK_H * SAMPLE_EVERY

export const CFG = {
  solarPeakMW: 32,
  batteryMWh: 50,
  batteryMW: 10,
  chargeEff: 0.95,
  dischargeEff: 0.95,
  startSoC: 0.5,
  gasMaxMW: 14,
  gasRampPerH: 18, // MW per hour: the genset is slow, so plan ahead
  factoryMinMW: 4,
  factoryMaxMW: 22,
  factoryRampPerH: 40,
  factoryTargetMWh: 145, // daily production target (renewables minus park load leave ~130-155 MWh free)
  hzPerMW: 0.08, // frequency deviation per MW of imbalance
  bandHz: 0.2, // "green" band
  curtailAboveMW: 2, // over-frequency droop: renewables back off beyond this much surplus
  shedAboveMW: 7.5, // under-frequency protection: load is shed beyond this deficit
  gasCostPerMWh: 95,
  gasCO2PerMWh: 0.5, // tonnes
  unservedCostPerMWh: 600,
  curtailCostPerMWh: 30,
  batteryWearPerMWh: 4,
  shortfallCostPerMWh: 120,
  // scoring references (a bad day costs about this much)
  costRefEUR: 7000,
  co2RefT: 28,
} as const

export type EventKind = 'cloud' | 'lull' | 'gust'

export interface WeatherEvent {
  kind: EventKind
  start: number
  end: number
  factor: number
  label: string
}

export interface Weather {
  seed: number
  events: WeatherEvent[]
  phase: [number, number, number]
}

/** battery: MW, positive = discharge, negative = charge */
export interface Controls {
  factory: number
  battery: number
  gas: number
}

export interface Sample {
  t: number
  solar: number
  wind: number
  gas: number
  batDis: number
  batChg: number
  park: number
  factory: number
  avail: number
  dev: number
  soc: number
  sunF: number
  windF: number
}

export interface LogEntry {
  t: number
  kind: 'info' | 'warn' | 'good' | 'bad'
  text: string
}

export interface Totals {
  gasMWh: number
  co2: number
  facMWh: number
  curtailMWh: number
  shedMWh: number
  throughputMWh: number
  inBandH: number
}

export interface SimState {
  seed: number
  t: number
  tick: number
  weather: Weather
  soc: number // MWh
  gas: number // actual MW (ramped)
  factory: number // actual MW (ramped)
  dev: number // Hz deviation
  solarNow: number
  windNow: number
  totals: Totals
  history: Sample[]
  log: LogEntry[]
  flags: Record<string, number>
}

// ---------- helpers ----------

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))
const approach = (cur: number, target: number, maxStep: number) =>
  cur + clamp(target - cur, -maxStep, maxStep)
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))
const gauss = (h: number, mean: number, sd: number) => Math.exp(-0.5 * ((h - mean) / sd) ** 2)

export function mulberry32(a: number): () => number {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function fmtTime(h: number): string {
  if (h >= 24) return '24:00'
  const hh = Math.floor(h)
  const mm = Math.floor((h - hh) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

// ---------- weather & load profiles ----------

export function makeWeather(seed: number): Weather {
  const r = mulberry32(seed)
  const rr = (a: number, b: number) => a + (b - a) * r()
  const events: WeatherEvent[] = []

  const gs = rr(1.0, 3.5)
  events.push({ kind: 'gust', start: gs, end: gs + rr(2, 3), factor: rr(1.4, 1.7), label: 'Gust front' })

  const cs = rr(9.0, 11.5)
  events.push({ kind: 'cloud', start: cs, end: cs + rr(2.5, 3.5), factor: rr(0.15, 0.3), label: 'Cloud front' })

  const ls = rr(16.5, 18.5)
  events.push({ kind: 'lull', start: ls, end: ls + rr(2.5, 3.5), factor: rr(0.15, 0.35), label: 'Wind lull' })

  const phase: [number, number, number] = [rr(0, 6.28), rr(0, 6.28), rr(0, 6.28)]
  return { seed, events, phase }
}

function eventFactor(w: Weather, kind: EventKind, h: number): number {
  let f = 1
  const ramp = 0.4
  for (const e of w.events) {
    if (e.kind !== kind) continue
    const k = Math.min(smooth((h - e.start) / ramp), smooth((e.end - h) / ramp))
    f *= 1 + (e.factor - 1) * k
  }
  return f
}

function sunShape(h: number): number {
  if (h <= 6.5 || h >= 18.5) return 0
  return Math.pow(Math.sin((Math.PI * (h - 6.5)) / 12), 1.3)
}

export function solarAvail(w: Weather, h: number): number {
  return CFG.solarPeakMW * sunShape(h) * eventFactor(w, 'cloud', h)
}

export function windFactor(w: Weather, h: number): number {
  return eventFactor(w, 'gust', h) * eventFactor(w, 'lull', h)
}

export function windAvail(w: Weather, h: number): number {
  const base = 10 + 3.5 * Math.sin((2 * Math.PI * (h - 2)) / 24)
  const [p0, p1, p2] = w.phase
  const noise = 2.2 * (0.5 * Math.sin(1.7 * h + p0) + 0.3 * Math.sin(3.1 * h + p1) + 0.2 * Math.sin(5.3 * h + p2))
  return clamp(base + noise, 1, 20) * windFactor(w, h)
}

export function parkLoad(h: number): number {
  return 9 + 3.2 * gauss(h, 12.5, 3.5) + 2.2 * gauss(h, 19.5, 1.6)
}

// ---------- state ----------

export function createState(seed: number): SimState {
  return {
    seed,
    t: 0,
    tick: 0,
    weather: makeWeather(seed),
    soc: CFG.startSoC * CFG.batteryMWh,
    gas: 0,
    factory: 6,
    dev: 0,
    solarNow: 0,
    windNow: 0,
    totals: { gasMWh: 0, co2: 0, facMWh: 0, curtailMWh: 0, shedMWh: 0, throughputMWh: 0, inBandH: 0 },
    history: [],
    log: [],
    flags: {},
  }
}

function note(s: SimState, key: string, cooldownH: number, kind: LogEntry['kind'], text: string) {
  const last = s.flags[key]
  if (last !== undefined && s.t - last < cooldownH) return
  s.flags[key] = s.t
  s.log.push({ t: s.t, kind, text })
}

// ---------- one tick ----------

export function stepSim(s: SimState, c: Controls, dt: number = TICK_H): void {
  if (s.t >= DAY_H - 1e-6) return
  const h = s.t
  const w = s.weather

  const solarA = solarAvail(w, h)
  const windA = windAvail(w, h)
  const park = parkLoad(h)

  // slow actuators
  s.gas = approach(s.gas, clamp(c.gas, 0, CFG.gasMaxMW), CFG.gasRampPerH * dt)
  s.factory = approach(s.factory, clamp(c.factory, CFG.factoryMinMW, CFG.factoryMaxMW), CFG.factoryRampPerH * dt)

  // battery (limited by state of charge)
  const bReq = clamp(c.battery, -CFG.batteryMW, CFG.batteryMW)
  let batDis = 0
  let batChg = 0
  if (bReq > 0) {
    batDis = Math.min(bReq, (s.soc * CFG.dischargeEff) / dt)
    s.soc = Math.max(0, s.soc - (batDis * dt) / CFG.dischargeEff)
    if (batDis < bReq * 0.6 && s.soc < 0.5) note(s, 'bat-empty', 1.5, 'warn', 'Battery is empty!')
  } else if (bReq < 0) {
    batChg = Math.min(-bReq, (CFG.batteryMWh - s.soc) / (CFG.chargeEff * dt))
    s.soc = Math.min(CFG.batteryMWh, s.soc + batChg * dt * CFG.chargeEff)
    if (batChg < -bReq * 0.6 && s.soc > CFG.batteryMWh - 0.5) note(s, 'bat-full', 1.5, 'info', 'Battery is full!')
  }

  let solar = solarA
  let wind = windA
  let imb = solar + wind + s.gas + batDis - (park + s.factory + batChg)
  let curtail = 0
  let shed = 0

  // grid protection: curtail renewables on big surplus, shed load on big deficit
  if (imb > CFG.curtailAboveMW) {
    curtail = Math.min(imb - CFG.curtailAboveMW, solar + wind)
    const fromWind = Math.min(wind, curtail)
    wind -= fromWind
    solar -= curtail - fromWind
    imb -= curtail
  } else if (imb < -CFG.shedAboveMW) {
    shed = Math.min(-CFG.shedAboveMW - imb, park)
    imb += shed
  }

  // frequency follows imbalance with a little inertia
  const target = imb * CFG.hzPerMW
  s.dev = clamp(s.dev + (target - s.dev) * (1 - Math.exp(-dt / 0.06)), -1.5, 1.5)

  // accounting
  const T = s.totals
  T.gasMWh += s.gas * dt
  T.co2 += s.gas * dt * CFG.gasCO2PerMWh
  T.facMWh += s.factory * dt
  T.curtailMWh += curtail * dt
  T.shedMWh += shed * dt
  T.throughputMWh += (batDis + batChg) * dt
  if (Math.abs(s.dev) <= CFG.bandHz) T.inBandH += dt

  s.solarNow = solar
  s.windNow = wind

  // operator log
  w.events.forEach((e, i) => {
    if (h >= e.start - 1.5 && h < e.start) note(s, `fw${i}`, 99, 'warn', `Heads up: ${e.label.toLowerCase()} around ${fmtTime(e.start)}.`)
    if (h >= e.start && h < e.end) note(s, `st${i}`, 99, 'warn', `${e.label} is here.`)
    if (h >= e.end) note(s, `en${i}`, 99, 'info', `${e.label} has passed.`)
  })
  if (s.gas > 1.5 && !s.flags['gasOn']) {
    s.flags['gasOn'] = 1
    s.log.push({ t: s.t, kind: 'warn', text: `Gas generator started (battery at ${(s.soc / CFG.batteryMWh * 100).toFixed(0)}%).` })
  } else if (s.gas < 0.5) delete s.flags['gasOn']
  if (curtail > 1) note(s, 'curtail', 2, 'warn', 'Too much power! Some free wind and sun is being wasted.')
  if (shed > 0.5) note(s, 'shed', 1.5, 'bad', 'Brownout! Part of the park just lost power.')
  if (Math.abs(s.dev) > 0.5) note(s, 'freq', 1, 'bad', `The grid is shaky (${(50 + s.dev).toFixed(2)} Hz)!`)

  if (s.tick % SAMPLE_EVERY === 0) {
    s.history.push({
      t: h,
      solar,
      wind,
      gas: s.gas,
      batDis,
      batChg,
      park: park - shed,
      factory: s.factory,
      avail: solarA + windA,
      dev: s.dev,
      soc: s.soc,
      sunF: eventFactor(w, 'cloud', h),
      windF: windFactor(w, h),
    })
  }

  s.tick++
  s.t += dt
}

// ---------- scoring ----------

export function costEUR(t: Totals, final = false): number {
  const shortfall = final ? Math.max(0, CFG.factoryTargetMWh - t.facMWh) : 0
  return (
    t.gasMWh * CFG.gasCostPerMWh +
    t.shedMWh * CFG.unservedCostPerMWh +
    t.curtailMWh * CFG.curtailCostPerMWh +
    t.throughputMWh * CFG.batteryWearPerMWh +
    shortfall * CFG.shortfallCostPerMWh
  )
}

export interface Result {
  score: number
  grade: 'S' | 'A' | 'B' | 'C' | 'D'
  stability: number // 0..1
  production: number // 0..1
  costEUR: number
  co2: number
  gasMWh: number
  curtailMWh: number
  shedMWh: number
  shortfallMWh: number
}

export function summarize(s: SimState): Result {
  const T = s.totals
  const stability = clamp(T.inBandH / DAY_H, 0, 1)
  const production = clamp(T.facMWh / CFG.factoryTargetMWh, 0, 1)
  const cost = costEUR(T, true)
  const costScore = clamp(1 - cost / CFG.costRefEUR, 0, 1)
  const co2Score = clamp(1 - T.co2 / CFG.co2RefT, 0, 1)
  // Stability comes first. Cost, CO2 and production only count in proportion to how
  // stable the grid was, so doing nothing at all can't farm a "clean" score.
  const score = Math.round(
    100 * (0.45 * stability + stability * stability * (0.15 * production + 0.2 * costScore + 0.2 * co2Score)),
  )
  const grade = score >= 90 ? 'S' : score >= 78 ? 'A' : score >= 62 ? 'B' : score >= 45 ? 'C' : 'D'
  return {
    score,
    grade,
    stability,
    production,
    costEUR: cost,
    co2: T.co2,
    gasMWh: T.gasMWh,
    curtailMWh: T.curtailMWh,
    shedMWh: T.shedMWh,
    shortfallMWh: Math.max(0, CFG.factoryTargetMWh - T.facMWh),
  }
}

// ---------- "explain the plan" insights ----------

export function insights(s: SimState): string[] {
  const out: string[] = []
  const H = s.history
  const T = s.totals
  if (H.length === 0) return out

  // 1. where did the gas go, and why
  if (T.gasMWh < 0.5) {
    out.push('You ran almost no gas. Great for the planet!')
  } else {
    const byHour = new Array<number>(24).fill(0)
    for (const p of H) byHour[Math.min(23, Math.floor(p.t))] += p.gas * SAMPLE_H
    let bestStart = 0
    let best = -1
    for (let i = 0; i <= 21; i++) {
      const v = byHour[i] + byHour[i + 1] + byHour[i + 2]
      if (v > best) {
        best = v
        bestStart = i
      }
    }
    const win = H.filter((p) => p.t >= bestStart && p.t < bestStart + 3)
    const avg = (f: (p: Sample) => number) => win.reduce((a, p) => a + f(p), 0) / Math.max(1, win.length)
    const socF = avg((p) => p.soc) / CFG.batteryMWh
    let why =
      avg((p) => p.factory) > 9
        ? 'the factory was running hard while renewables were thin'
        : 'demand outran thin renewables and the battery could not carry it alone'
    if (socF < 0.12) why = 'the battery was nearly empty, so charging it earlier from surplus would have avoided this'
    else if (avg((p) => p.windF) < 0.6) why = 'a wind lull cut generation'
    else if (avg((p) => p.sunF) < 0.6) why = 'a cloud front cut solar'
    out.push(
      `Most of the gas ran between ${fmtTime(bestStart)} and ${fmtTime(bestStart + 3)}: ${why}.`,
    )
  }

  // 2. wasted renewable energy
  if (T.curtailMWh >= 3) {
    let peakH = 0
    let peak = 0
    for (const p of H) {
      const lost = p.avail - p.solar - p.wind
      if (lost > peak) {
        peak = lost
        peakH = p.t
      }
    }
    out.push(
      `Free wind and sun went to waste, mostly around ${fmtTime(peakH)}. A busier factory or a charging battery could have used it.`,
    )
  }

  // 3. production target
  const short = Math.max(0, CFG.factoryTargetMWh - T.facMWh)
  out.push(
    short > 2
      ? `The factory fell short of its goal. Let it work harder when power is plentiful.`
      : 'The factory reached its goal.',
  )

  // 4. stability
  let worst = H[0]
  for (const p of H) if (Math.abs(p.dev) > Math.abs(worst.dev)) worst = p
  out.push(
    `The grid was steady ${(100 * T.inBandH / DAY_H).toFixed(0)}% of the day. Shakiest moment: ${fmtTime(worst.t)}, when there was too ${worst.dev >= 0 ? 'much' : 'little'} power.`,
  )
  return out
}

// ---------- autopilot (a simple forecast-aware controller) ----------

/** What the actuators will do this tick, so the controller can balance exactly. */
export function autopilotControls(s: SimState, dt: number = TICK_H): Controls {
  const h = s.t
  const w = s.weather
  const R = solarAvail(w, h) + windAvail(w, h)
  const park = parkLoad(h)
  const remaining = Math.max(0.25, DAY_H - h)
  const socF = s.soc / CFG.batteryMWh

  let facSet = clamp((CFG.factoryTargetMWh - s.totals.facMWh) / remaining, CFG.factoryMinMW, CFG.factoryMaxMW)
  const net = R - park - facSet // positive = surplus

  // look 3 h ahead: if renewables are about to collapse, keep the battery topped up
  const R3 = solarAvail(w, h + 3) + windAvail(w, h + 3)
  const dropAhead = R - R3 > 8

  let gasSet = 0
  if (net < 0 && socF < 0.2) gasSet = clamp(-net, 0, CFG.gasMaxMW)
  else if (net < -2 && socF < 0.35 && dropAhead) gasSet = clamp(-net * 0.6, 0, CFG.gasMaxMW)

  // the genset ramps slowly: start it early enough that battery power covers the rest
  const gapAhead = parkLoad(h + 1) + CFG.factoryMinMW - (solarAvail(w, h + 1) + windAvail(w, h + 1))
  gasSet = Math.max(gasSet, clamp(gapAhead - CFG.batteryMW * 0.9, 0, CFG.gasMaxMW))

  // absorb big surplus in the factory once the battery is nearly full or at its power limit
  if (net > 0) {
    const batRoom = socF < 0.97 ? CFG.batteryMW : 0
    if (net > batRoom) facSet = clamp(facSet + (net - batRoom), CFG.factoryMinMW, CFG.factoryMaxMW)
  }

  // predict ramped values, then let the battery close the gap
  const gasAct = approach(s.gas, gasSet, CFG.gasRampPerH * dt)
  let facAct = approach(s.factory, facSet, CFG.factoryRampPerH * dt)

  // if the battery can't cover what's left (power or energy limit), flex the factory instead
  const maxDis = Math.min(CFG.batteryMW, (s.soc * CFG.dischargeEff) / dt)
  const maxChg = Math.min(CFG.batteryMW, (CFG.batteryMWh - s.soc) / (CFG.chargeEff * dt))
  const gap = park + facAct - R - gasAct // positive = need more supply
  if (gap > maxDis) facSet = clamp(facAct - (gap - maxDis), CFG.factoryMinMW, CFG.factoryMaxMW)
  else if (-gap > maxChg) facSet = clamp(facAct + (-gap - maxChg), CFG.factoryMinMW, CFG.factoryMaxMW)
  facAct = approach(s.factory, facSet, CFG.factoryRampPerH * dt)

  const battery = clamp(park + facAct - R - gasAct, -CFG.batteryMW, CFG.batteryMW)
  return { factory: facSet, battery, gas: gasSet }
}

/** Sensible opening setpoints: the battery starts out covering the overnight gap, so the player isn't punished before they can react. */
export function startingControls(s: SimState): Controls {
  const factory = 6
  const gap = parkLoad(0) + factory - (solarAvail(s.weather, 0) + windAvail(s.weather, 0))
  const battery = clamp(Math.round(gap * 2) / 2, -CFG.batteryMW, CFG.batteryMW)
  return { factory, battery, gas: 0 }
}

export function runHeadless(seed: number, policy: (s: SimState) => Controls): SimState {
  const s = createState(seed)
  let guard = 0
  while (s.t < DAY_H - 1e-6 && guard++ < 5000) stepSim(s, policy(s))
  return s
}

// ---------- display-only weather summary (backdrop and soundscape) ----------

/** clear: 1 = open sky, ~0.2 = cloud front. wind: 0 = dead calm, 1 = strong gust. */
export function ambient(w: Weather, h: number): { clear: number; wind: number } {
  const t = Math.min(h, DAY_H)
  return {
    clear: clamp(eventFactor(w, 'cloud', t), 0, 1),
    wind: clamp((windAvail(w, t) - 2) / 17, 0, 1),
  }
}
