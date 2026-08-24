import QRCode from 'qrcode'

export type EccLevel = 'L' | 'M' | 'Q' | 'H'

export interface QrRenderOptions {
  errorCorrectionLevel?: EccLevel
  margin?: number
  scale?: number
}

/**
 * Renders raw bytes into a QR code's byte-mode segment and draws it to a
 * canvas. The bytes are handed to the `qrcode` package directly (not routed
 * through a text/string encoding), so arbitrary binary payloads — including
 * bytes that aren't valid UTF-8 — go in exactly as given.
 */
export async function renderQrToCanvas(
  canvas: HTMLCanvasElement,
  data: Uint8Array,
  opts: QrRenderOptions = {},
): Promise<void> {
  await QRCode.toCanvas(canvas, [{ data, mode: 'byte' }], {
    errorCorrectionLevel: opts.errorCorrectionLevel ?? 'M',
    margin: opts.margin ?? 1,
    scale: opts.scale ?? 6,
  })
}
