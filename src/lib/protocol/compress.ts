import { deflateRaw, inflateRaw } from 'pako'

export function compress(data: Uint8Array): Uint8Array {
  return deflateRaw(data)
}

export function decompress(data: Uint8Array): Uint8Array {
  return inflateRaw(data)
}
