import { useState } from 'react'
import './JoinRoomModal.css'

interface JoinRoomModalProps {
  isOpen: boolean
  onClose: () => void
  onJoin: (roomCode: string) => void
}

const JoinRoomModal = ({ isOpen, onClose, onJoin }: JoinRoomModalProps) => {
  const [roomCode, setRoomCode] = useState('')
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Room codes are case-insensitive; normalise before handing off to the caller
    const normalizedCode = roomCode.trim().toUpperCase()

    // Validate room code
    if (!normalizedCode) {
      setError('Please enter a room code')
      return
    }

    if (normalizedCode.length < 4) {
      setError('Room code must be at least 4 characters')
      return
    }

    // Join room
    onJoin(normalizedCode)
    setRoomCode('')
  }

  const handleClose = () => {
    setRoomCode('')
    setError('')
    onClose()
  }

  return (
    <div className="join-room-modal-overlay" onClick={handleClose}>
      <div className="join-room-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="join-room-modal-header">
          <h2>JOIN ROOM</h2>
          <button className="join-room-modal-close" onClick={handleClose}>
            ✕
          </button>
        </div>
        
        <form className="join-room-modal-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="roomCode">ROOM CODE</label>
            <input
              id="roomCode"
              type="text"
              value={roomCode}
              onChange={(e) => {
                setRoomCode(e.target.value)
                setError('')
              }}
              placeholder="Enter room code"
              className={error ? 'error' : ''}
              autoFocus
            />
            {error && <div className="error-message">{error}</div>}
          </div>
          
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={!roomCode.trim()}>
              JOIN
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleClose}>
              CANCEL
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default JoinRoomModal



