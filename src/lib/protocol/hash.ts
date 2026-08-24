export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const copy = data.slice() // ensure a plain ArrayBuffer, not a shared/offset one
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer as ArrayBuffer)
  return new Uint8Array(digest)
}

export function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}
