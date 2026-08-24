# qrxfer

A research/benchmarking playground for transferring files over animated QR codes: no network,
no pairing, no server. One device streams a sequence of QR codes on screen; another device scans
them with its camera and reconstructs the file locally in the browser.

## The approach

The current best-documented technique for this problem — used by
[divan/txqr](https://github.com/divan/txqr), [qifi-dev/qrs](https://github.com/qifi-dev/qrs), and
[qrfiletransfer.app](https://qrfiletransfer.app/docs) — is **fountain-coded animated QR
streaming**:

1. The file is compressed, hashed (SHA-256), and split into `k` fixed-size blocks.
2. A **Luby Transform (LT) fountain code** turns those blocks into an endless stream of encoded
   symbols. Each symbol XORs together a small, randomly-chosen subset of the source blocks; the
   exact subset is fully determined by a 4-byte seed carried in the symbol itself.
3. Each symbol is rendered as one QR code frame and displayed on a loop.
4. The receiver scans frames with its camera in *any* order. Once it has collected roughly
   `k × 1.1–1.3` distinct symbols — a small constant overhead over the theoretical minimum — a
   belief-propagation ("peeling") decoder reconstructs every source block, and the file is
   decompressed and checksummed.

The key property: because the receiver only needs *enough* symbols, not any *particular* ones, a
camera missing frames (motion blur, autofocus hunting, blinking) costs a little time and nothing
else. There's no retransmission request possible over a one-way optical channel, and none is
needed.

This repo implements its own LT encoder/decoder and binary framing (`src/lib/fountain`,
`src/lib/protocol`) rather than depending on a pre-built library, so every stage of the pipeline —
compression ratio, redundancy, header overhead, frame timing — is instrumented for the
benchmarking goal below.

QR decoding uses [`zxing-wasm`](https://github.com/Sec-ant/zxing-wasm) rather than a jsQR-based
scanner, because jsQR-style decoders push byte-mode QR content through a UTF-8 text decode by
default, which silently corrupts arbitrary binary payloads. `zxing-wasm` exposes the raw decoded
bytes directly.

## Benchmarking

Every transfer — sending, receiving, or an offline simulated run — records live metrics
(throughput, frames, redundancy ratio, header overhead, compression ratio) via
`src/lib/benchmark/recorder.ts`, shown as a live chart during the transfer and saved as a summary
to an IndexedDB-backed history afterward.

The **/benchmark** page runs the full encode → render → scan → decode pipeline against an
offscreen canvas instead of a real camera, so you can compare FPS / QR error-correction level /
block size choices repeatably without needing a second device.

## Project layout

```
src/lib/fountain/    LT fountain code: soliton degree distribution, encoder, peeling decoder
src/lib/protocol/    compression, SHA-256 hashing, binary frame format, transfer orchestration
src/lib/qr/          QR rendering (qrcode) and scanning (zxing-wasm)
src/lib/benchmark/   metrics recorder, offline loopback benchmark harness, IndexedDB history
src/pages/           Send / Receive / Benchmark UI
```

## Developing

```bash
npm install
npm run dev       # http://localhost:5173
npm run test      # vitest: fountain code + protocol round-trip tests
npm run build     # typecheck + production build
npm run lint       # oxlint
```

To actually transfer a file, open `/send` on one device and `/receive` on another (or the same
machine in two tabs/windows) — both need camera permission and a clear line of sight to the
sending screen. To evaluate the pipeline without a second device, use `/benchmark`.
