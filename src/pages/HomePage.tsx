import { Link } from 'react-router-dom'

export default function HomePage() {
  return (
    <div>
      <h1>qrxfer</h1>
      <p>
        A research/benchmarking playground for transferring files over animated QR codes — no
        network, no pairing, no server. One device streams a sequence of QR codes on screen, the
        other scans them with its camera and reconstructs the file.
      </p>

      <div className="card">
        <h3>How it works</h3>
        <p>
          The current best-documented approach for this problem is <strong>Luby Transform (LT)
          fountain coding</strong> over the QR stream: the sender emits an endless sequence of
          encoded symbols, and the receiver just needs <em>any</em> ~10–20% more symbols than the
          minimum required — not a specific sequence — to reconstruct the file. That makes it
          robust to a camera dropping frames, since there's no way to ask for a retransmission over
          a one-way optical channel. This is the same idea behind{' '}
          <a href="https://github.com/divan/txqr" target="_blank" rel="noreferrer">
            txqr
          </a>{' '}
          and{' '}
          <a href="https://github.com/qifi-dev/qrs" target="_blank" rel="noreferrer">
            qifi
          </a>
          . This project implements its own LT encoder/decoder end-to-end so every stage of the
          pipeline is instrumented for benchmarking.
        </p>
      </div>

      <div className="field-row">
        <Link to="/send">
          <button type="button">Send a file →</button>
        </Link>
        <Link to="/receive">
          <button type="button" className="secondary">
            Receive a file →
          </button>
        </Link>
        <Link to="/benchmark">
          <button type="button" className="secondary">
            Run benchmarks →
          </button>
        </Link>
      </div>
    </div>
  )
}
