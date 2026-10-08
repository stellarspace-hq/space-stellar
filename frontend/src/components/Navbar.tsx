import { Link, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useWalletKit, WalletKitButton } from '../contexts/WalletContext'
import './Navbar.css'

const Navbar = () => {
  const location = useLocation()
  const { address, disconnect, isConnected } = useWalletKit()
  const [points, setPoints] = useState<number>(2000)

  const isActive = (path: string) => location.pathname === path
  
  // Hide navbar saat game sedang dimainkan
  const isGamePage = location.pathname.startsWith('/game/')

  // Load user points
  useEffect(() => {
    if (isConnected && address) {
      const loadPoints = async () => {
        try {
          const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001'
          const response = await fetch(`${apiUrl}/api/points/${address}`)
          const data = await response.json()
          if (data.success) {
            // A balance of 0 is valid: only fall back when the API did not
            // return a usable numeric balance.
            setPoints(Number.isFinite(data.points) ? data.points : 2000)
          }
        } catch (error) {
          console.error('Error loading points:', error)
        }
      }
      loadPoints()
      // Refresh points every 5 seconds
      const interval = setInterval(loadPoints, 5000)
      return () => clearInterval(interval)
    }
  }, [isConnected, address])

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
              <span className="points-value">{points}</span>
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

