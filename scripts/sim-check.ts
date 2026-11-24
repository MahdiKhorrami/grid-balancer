// Headless sanity check: does careful play beat naive play? Run with `npm run check`.
import { autopilotControls, runHeadless, summarize, insights } from '../src/sim.ts'
import type { Controls } from '../src/sim.ts'

const naive = (): Controls => ({ factory: 6, battery: 0, gas: 0 })
const lazyGas = (): Controls => ({ factory: 6, battery: 0, gas: 6 })

const seeds = [20261123, 1, 2, 3, 42, 777, 20250101, 99]
let sumNaive = 0
let sumLazy = 0
let sumAuto = 0
for (const seed of seeds) {
  const n = summarize(runHeadless(seed, naive))
  const l = summarize(runHeadless(seed, lazyGas))
  const aState = runHeadless(seed, (s) => autopilotControls(s))
  const a = summarize(aState)
  sumNaive += n.score
  sumLazy += l.score
  sumAuto += a.score
  console.log(
    `seed ${String(seed).padEnd(9)} naive ${String(n.score).padStart(3)} | lazy-gas ${String(l.score).padStart(3)} | autopilot ${String(a.score).padStart(3)} ${a.grade}` +
      `  (stab ${(a.stability * 100).toFixed(0)}% prod ${(a.production * 100).toFixed(0)}% gas ${a.gasMWh.toFixed(1)} MWh cost €${a.costEUR.toFixed(0)} co2 ${a.co2.toFixed(1)} t curt ${a.curtailMWh.toFixed(1)} shed ${a.shedMWh.toFixed(1)})`,
  )
}
console.log(`\nmean: naive ${(sumNaive / seeds.length).toFixed(1)} | lazy-gas ${(sumLazy / seeds.length).toFixed(1)} | autopilot ${(sumAuto / seeds.length).toFixed(1)}`)

console.log('\nInsights for the first seed (autopilot):')
for (const line of insights(runHeadless(seeds[0], (s) => autopilotControls(s)))) console.log(' -', line)
