/** Picks `min(degree, k)` distinct block indices in [0, k) using rejection sampling. */
export function pickIndices(rand: () => number, k: number, degree: number): number[] {
  const d = Math.min(degree, k)
  if (d >= k) return Array.from({ length: k }, (_, i) => i)

  const chosen = new Set<number>()
  while (chosen.size < d) {
    chosen.add(Math.floor(rand() * k))
  }
  return [...chosen]
}
