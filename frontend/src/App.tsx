import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { WalletProvider } from './contexts/WalletContext'
import Navbar from './components/Navbar'
import SpaceBackground from './components/SpaceBackground'
import Home from './pages/Home'
import Store from './pages/Store'
import Collection from './pages/Collection'
import Profile from './pages/Profile'
import Room from './pages/Room'
import Game from './pages/Game'
import Leaderboard from './pages/Leaderboard'
import History from './pages/History'
import Events from './pages/Events'
import Missions from './pages/Missions'
import SpecialLaunchEvent from './pages/SpecialLaunchEvent'
import NewYear2026Event from './pages/NewYear2026Event'
import SpaceExplorerS1Event from './pages/SpaceExplorerS1Event'
import WalletGuide from './pages/WalletGuide'
import './App.css'

function App() {
  return (
    <WalletProvider>
      <Router>
        <div className="app">
          <SpaceBackground />
          <Navbar />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/wallet-guide" element={<WalletGuide />} />
              <Route path="/store" element={<Store />} />
              <Route path="/collection" element={<Collection />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/history" element={<History />} />
              <Route path="/events" element={<Events />} />
              <Route path="/events/special-launch" element={<SpecialLaunchEvent />} />
              <Route path="/events/new-year-2026" element={<NewYear2026Event />} />
              <Route path="/events/space-explorer-s1" element={<SpaceExplorerS1Event />} />
              <Route path="/missions" element={<Missions />} />
              <Route path="/room/:roomCode" element={<Room />} />
              <Route path="/game/:roomCode" element={<Game />} />
            </Routes>
          </main>
        </div>
      </Router>
    </WalletProvider>
  )
}

export default App
