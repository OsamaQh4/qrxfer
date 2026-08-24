import { NavLink, Route, Routes } from 'react-router-dom'
import BenchmarkPage from './pages/BenchmarkPage'
import HomePage from './pages/HomePage'
import ReceivePage from './pages/ReceivePage'
import SendPage from './pages/SendPage'

function App() {
  return (
    <div className="app-shell">
      <nav className="top">
        <NavLink to="/" className="brand">
          qrxfer
        </NavLink>
        <NavLink to="/send" className={({ isActive }) => (isActive ? 'active' : '')}>
          Send
        </NavLink>
        <NavLink to="/receive" className={({ isActive }) => (isActive ? 'active' : '')}>
          Receive
        </NavLink>
        <NavLink to="/benchmark" className={({ isActive }) => (isActive ? 'active' : '')}>
          Benchmark
        </NavLink>
      </nav>

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/send" element={<SendPage />} />
        <Route path="/receive" element={<ReceivePage />} />
        <Route path="/benchmark" element={<BenchmarkPage />} />
      </Routes>
    </div>
  )
}

export default App
