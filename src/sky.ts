// sky.ts: colours of the world through the day. Pure helpers, no framework.

export type RGB = [number, number, number]

const hex = (s: string): RGB => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]

export const css = (c: RGB, a = 1): string => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`

export const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))
const smooth = (x: number) => x * x * (3 - 2 * x)
const sm = (a: number, b: number, x: number) => smooth(clamp01((x - a) / (b - a)))

const WHITE: RGB = [255, 255, 255]

export interface Look {
  top: RGB
  bot: RGB
  hillBack: RGB
  hillFront: RGB
  cloud: RGB
  pageTop: RGB
  pageBot: RGB
}

// hour -> [sky top, sky horizon, far hills, near hills, cloud]
const KEYS: Array<[number, [string, string, string, string, string]]> = [
  [0, ['#0e1838', '#2a3770', '#1f3a52', '#172e40', '#4b5a8c']], // night
  [5, ['#0e1838', '#2a3770', '#1f3a52', '#172e40', '#4b5a8c']],
  [6.2, ['#5663b8', '#ffae88', '#5f8f78', '#46755f', '#ffd2c0']], // dawn
  [8, ['#49a6ff', '#c4e8ff', '#78cf8c', '#56b56d', '#ffffff']], // morning
  [12, ['#2d98ff', '#bfe8ff', '#7ad48c', '#52b86b', '#ffffff']], // noon
  [16.5, ['#3ea3ff', '#d0eeff', '#86d48a', '#5cbc6c', '#ffffff']], // afternoon
  [18.3, ['#5a5cc0', '#ff9566', '#6f8f6a', '#4f7358', '#ffc7a8']], // dusk
  [19.5, ['#2a2f70', '#e0627a', '#3f5a66', '#2f4753', '#8a6fa0']], // twilight
  [21, ['#0e1838', '#2a3770', '#1f3a52', '#172e40', '#4b5a8c']], // night
  [24, ['#0e1838', '#2a3770', '#1f3a52', '#172e40', '#4b5a8c']],
]

const PARSED = KEYS.map(([h, c]) => [h, c.map(hex)] as [number, RGB[]])

export function lookAt(h: number): Look {
  const t = Math.min(24, Math.max(0, h))
  let i = 0
  while (i < PARSED.length - 2 && t >= PARSED[i + 1][0]) i++
  const [h0, a] = PARSED[i]
  const [h1, b] = PARSED[i + 1]
  const k = smooth(clamp01((t - h0) / (h1 - h0)))
  const m = a.map((c, j) => mix(c, b[j], k))
  const [top, bot, hillBack, hillFront, cloud] = m
  // the page behind the cards is the same sky, lightened so dark text stays readable
  return { top, bot, hillBack, hillFront, cloud, pageTop: mix(top, WHITE, 0.55), pageBot: mix(bot, WHITE, 0.6) }
}

/** 0 at night, 1 in full daylight, with smooth dawn and dusk. */
export function daylight(h: number): number {
  return sm(5.8, 7.6, h) * (1 - sm(17.9, 19.8, h))
}

/** Overcast: wash the colour towards grey and darken it a little. */
export function tint(c: RGB, cover: number, dark: number): RGB {
  const lum = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]
  const m = mix(c, [lum, lum, lum], 0.72 * cover)
  const f = 1 - dark * cover
  return [m[0] * f, m[1] * f, m[2] * f]
}
