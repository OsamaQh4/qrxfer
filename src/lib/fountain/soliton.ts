/**
 * Robust Soliton Distribution (Luby, 2002) over degrees 1..k, returned as a
 * cumulative distribution so a single uniform draw can sample a degree via
 * binary search. The "robust" spike at degree k/S (S ~= c * ln(k/delta) * sqrt(k))
 * guarantees enough degree-1 symbols appear early to bootstrap peeling decode,
 * and enough high-degree symbols appear to cover the last few blocks.
 */
export function robustSolitonCdf(k: number, c = 0.03, delta = 0.5): Float64Array {
  const rho = new Float64Array(k + 1)
  rho[1] = 1 / k
  for (let i = 2; i <= k; i++) rho[i] = 1 / (i * (i - 1))

  const S = Math.max(1, c * Math.log(k / delta) * Math.sqrt(k))
  const spike = Math.max(1, Math.min(k, Math.round(k / S)))

  const tau = new Float64Array(k + 1)
  for (let i = 1; i < spike; i++) tau[i] = S / (k * i)
  tau[spike] = (S * Math.log(S / delta)) / k

  const mu = new Float64Array(k + 1)
  let sum = 0
  for (let i = 1; i <= k; i++) sum += rho[i] + tau[i]
  for (let i = 1; i <= k; i++) mu[i] = (rho[i] + tau[i]) / sum

  const cdf = new Float64Array(k + 1)
  let acc = 0
  for (let i = 1; i <= k; i++) {
    acc += mu[i]
    cdf[i] = acc
  }
  cdf[k] = 1 // guard against floating point drift so the last bucket always matches
  return cdf
}

export function sampleDegree(rand: () => number, cdf: Float64Array): number {
  const x = rand()
  let lo = 1
  let hi = cdf.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (cdf[mid] >= x) hi = mid
    else lo = mid + 1
  }
  return lo
}
