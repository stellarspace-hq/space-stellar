import { Link, useLocation } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { useWalletKit, WalletKitButton } from '../contexts/WalletContext'
import { POINTS_CHANGED_EVENT, PointsChangedDetail } from '../utils/pointsEvents'
import './Navbar.css'

const Navbar = () => {
  const location = useLocation()
  const { address, disconnect, isConnected } = useWalletKit()
  // null means "not loaded yet"; 0 is a real balance and must render as 0.
  const [points, setPoints] = useState<number | null>(null)
  // Timestamp of the most recent local (optimistic) update. A poll that lands
  // shortly after a spend is ignored so it cannot resurrect a stale balance.
  const lastLocalUpdateRef = useRef<number>(0)

  const isActive = (path: string) => location.pathname === path
  
  // Hide navbar saat game sedang dimainkan
  const isGamePage = location.pathname.startsWith('/game/')

  // Load user points
  useEffect(() => {
    if (isConnected && address) {
      let cancelled = false
      const loadPoints = async () => {
        try {
          const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001'
          const response = await fetch(`${apiUrl}/api/points/${address}`)
          if (!response.ok) {
            throw new Error(`Points request failed with ${response.status}`)
          }
          const data = await response.json()
          if (cancelled) return
          if (data.success && typeof data.points === 'number') {
            // Don't clobber a value the app just updated optimistically.
            if (Date.now() - lastLocalUpdateRef.current < 3000) return
            setPoints(data.points)
          }
        } catch (error) {
          // Keep the last known value. Never fabricate a balance on error.
          console.error('Error loading points:', error)
        }
      }
      loadPoints()
      // Refresh points every 5 seconds
      const interval = setInterval(loadPoints, 5000)
      return () => {
        cancelled = true
        clearInterval(interval)
      }
    } else {
      setPoints(null)
    }
  }, [isConnected, address])

  // Spend/earn flows publish the new balance so the badge updates without
  // waiting for the next poll.
  useEffect(() => {
    const handlePointsChanged = (event: Event) => {
      const detail = (event as CustomEvent<PointsChangedDetail>).detail
      if (!detail || detail.address !== address) return
      if (typeof detail.points !== 'number') return
      lastLocalUpdateRef.current = Date.now()
      setPoints(detail.points)
    }
    window.addEventListener(POINTS_CHANGED_EVENT, handlePointsChanged)
    return () => window.removeEventListener(POINTS_CHANGED_EVENT, handlePointsChanged)
  }, [address])

  // Jangan render navbar saat game sedang dimainkan
  if (isGamePage) {
    return null
  }

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">
          <span className="logo-text">SPACE STELLAR</span>
        </Link>
        
        <div className="navbar-links">
          <Link 
            to="/" 
            className={`nav-link ${isActive('/') ? 'active' : ''}`}
          >
            HOME
          </Link>
          <Link 
            to="/store" 
            className={`nav-link ${isActive('/store') ? 'active' : ''}`}
          >
            STORE
          </Link>
          <Link 
            to="/collection" 
            className={`nav-link ${isActive('/collection') ? 'active' : ''}`}
          >
            COLLECTION
          </Link>
          <Link 
            to="/profile" 
            className={`nav-link ${isActive('/profile') ? 'active' : ''}`}
          >
            PROFILE
          </Link>
        </div>

        <div className="navbar-wallet">
          {isConnected && address && (
            <div className="points-display">
              <span className="points-icon">💰</span>
              <span className="points-value">{points === null ? '—' : points}</span>
              <span className="points-label">POINTS</span>
            </div>
          )}
          <WalletKitButton />
        </div>
      </div>
    </nav>
  )
}

export default Navbar
