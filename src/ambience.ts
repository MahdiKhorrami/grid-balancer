// ambience.ts: the weather you can hear. Everything is synthesized with WebAudio,
// so there are no audio files to ship.
//   wind    filtered noise: louder and brighter as the wind picks up, with slow swells
//   birds   short chirps on calm, sunny days
//   crickets a quiet shimmer on calm nights
// Browsers only allow sound after a click, so nothing is created until unlock().

export interface Mood {
  wind: number // 0 calm .. 1 gust
  clear: number // 1 clear sky .. 0.2 cloud front
  day: number // 0 night .. 1 day
  on: boolean // playing and not muted
}

type ACtor = typeof AudioContext

export class Ambience {
  private ctx: AudioContext | null = null
  private master!: GainNode
  private windGain!: GainNode
  private windFilter!: BiquadFilterNode
  private swell!: GainNode
  private cricketBase!: GainNode
  private cricketDepth!: GainNode
  private mood: Mood = { wind: 0.4, clear: 1, day: 1, on: false }
  private birdTimer = 0

  /** Call from a click or key press. Safe to call many times. */
  unlock(): void {
    if (!this.ctx) {
      const AC: ACtor | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: ACtor }).webkitAudioContext
      if (!AC) return
      try {
        this.ctx = new AC()
        this.build(this.ctx)
      } catch {
        this.ctx = null
        return
      }
      this.update(this.mood)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  private build(c: AudioContext) {
    this.master = c.createGain()
    this.master.gain.value = 0
    this.master.connect(c.destination)

    // wind: brown noise through a band-pass filter
    const len = c.sampleRate * 4
    const buf = c.createBuffer(1, len, c.sampleRate)
    const d = buf.getChannelData(0)
    let lastOut = 0
    for (let i = 0; i < len; i++) {
      lastOut = (lastOut + 0.02 * (Math.random() * 2 - 1)) / 1.02
      d[i] = lastOut * 3.5
    }
    const src = c.createBufferSource()
    src.buffer = buf
    src.loop = true
    this.windFilter = c.createBiquadFilter()
    this.windFilter.type = 'bandpass'
    this.windFilter.frequency.value = 500
    this.windFilter.Q.value = 0.7
    this.windGain = c.createGain()
    this.windGain.gain.value = 0
    src.connect(this.windFilter).connect(this.windGain).connect(this.master)
    src.start()

    // two slow oscillators make the wind breathe: the pitch drifts and the level swells
    const lfoPitch = c.createOscillator()
    lfoPitch.frequency.value = 0.13
    const pitchDepth = c.createGain()
    pitchDepth.gain.value = 160
    lfoPitch.connect(pitchDepth).connect(this.windFilter.frequency)
    lfoPitch.start()
    const lfoSwell = c.createOscillator()
    lfoSwell.frequency.value = 0.27
    this.swell = c.createGain()
    this.swell.gain.value = 0
    lfoSwell.connect(this.swell).connect(this.windGain.gain)
    lfoSwell.start()

    // crickets: a high carrier, chopped fast, then gated in slow bursts
    const carrier = c.createOscillator()
    carrier.type = 'sine'
    carrier.frequency.value = 4300
    this.cricketBase = c.createGain()
    this.cricketBase.gain.value = 0
    const fast = c.createOscillator()
    fast.frequency.value = 26
    this.cricketDepth = c.createGain()
    this.cricketDepth.gain.value = 0
    fast.connect(this.cricketDepth).connect(this.cricketBase.gain)
    const gate = c.createGain()
    gate.gain.value = 0.5
    const slow = c.createOscillator()
    slow.frequency.value = 1.4
    const slowDepth = c.createGain()
    slowDepth.gain.value = 0.5
    slow.connect(slowDepth).connect(gate.gain)
    carrier.connect(this.cricketBase).connect(gate).connect(this.master)
    carrier.start()
    fast.start()
    slow.start()

    this.scheduleBird()
  }

  /** Tell the soundscape what the weather is doing. Cheap; call a few times a second. */
  update(m: Mood): void {
    this.mood = m
    const c = this.ctx
    if (!c || c.state === 'closed') return
    const t = c.currentTime
    const s = m.wind
    this.master.gain.setTargetAtTime(m.on ? 1 : 0, t, m.on ? 0.7 : 0.25)
    const level = 0.03 + 1.1 * Math.pow(s, 1.7)
    this.windGain.gain.setTargetAtTime(level, t, 0.5)
    this.windFilter.frequency.setTargetAtTime(260 + 950 * s, t, 0.5)
    this.swell.gain.setTargetAtTime(level * 0.4, t, 0.5)
    const cr = 0.011 * (1 - m.day) * (s < 0.55 ? 1 : 0)
    this.cricketBase.gain.setTargetAtTime(cr * 0.5, t, 0.8)
    this.cricketDepth.gain.setTargetAtTime(cr * 0.5, t, 0.8)
  }

  /** Pause the audio clock while the tab is hidden. */
  setVisible(visible: boolean): void {
    const c = this.ctx
    if (!c || c.state === 'closed') return
    if (visible) void c.resume()
    else void c.suspend()
  }

  private scheduleBird() {
    this.birdTimer = window.setTimeout(() => {
      const m = this.mood
      if (m.on && m.day > 0.55 && m.clear > 0.5 && m.wind < 0.55) this.chirp()
      this.scheduleBird()
    }, 1500 + Math.random() * 3500)
  }

  private chirp() {
    const c = this.ctx
    if (!c || c.state !== 'running') return
    const t0 = c.currentTime + 0.01
    const notes = 2 + Math.floor(Math.random() * 3)
    const base = 2400 + Math.random() * 1400
    for (let i = 0; i < notes; i++) {
      const t = t0 + i * 0.13
      const o = c.createOscillator()
      const g = c.createGain()
      o.type = 'sine'
      o.frequency.setValueAtTime(base, t)
      o.frequency.exponentialRampToValueAtTime(base * (1.25 + Math.random() * 0.3), t + 0.07)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
      o.connect(g).connect(this.master)
      o.start(t)
      o.stop(t + 0.12)
    }
  }

  dispose(): void {
    window.clearTimeout(this.birdTimer)
    if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close()
    this.ctx = null
  }
}
