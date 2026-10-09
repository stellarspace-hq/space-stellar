import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import JoinRoomModal from './JoinRoomModal'

const renderModal = (onJoin = vi.fn(), onClose = vi.fn()) => {
  render(<JoinRoomModal isOpen onClose={onClose} onJoin={onJoin} />)
  return { onJoin, onClose }
}

const getInput = () => screen.getByLabelText(/room code/i)
const getJoinButton = () => screen.getByRole('button', { name: /join/i }) as HTMLButtonElement

describe('JoinRoomModal', () => {
  it('uppercases and trims the room code before handing it to onJoin', () => {
    const { onJoin } = renderModal()

    fireEvent.change(getInput(), { target: { value: '  ab12cd  ' } })
    fireEvent.submit(getInput().closest('form') as HTMLFormElement)

    expect(onJoin).toHaveBeenCalledWith('AB12CD')
    expect(onJoin).toHaveBeenCalledTimes(1)
  })

  it('disables submit while the room code is empty', () => {
    renderModal()

    expect(getJoinButton().disabled).toBe(true)

    fireEvent.change(getInput(), { target: { value: 'abcd' } })

    expect(getJoinButton().disabled).toBe(false)
  })

  it('does not call onJoin for a blank code and shows an error', () => {
    const { onJoin } = renderModal()

    fireEvent.change(getInput(), { target: { value: '   ' } })
    fireEvent.submit(getInput().closest('form') as HTMLFormElement)

    expect(onJoin).not.toHaveBeenCalled()
    expect(screen.getByText(/please enter a room code/i)).toBeTruthy()
  })

  it('does not call onJoin for a code shorter than four characters', () => {
    const { onJoin } = renderModal()

    fireEvent.change(getInput(), { target: { value: 'abc' } })
    fireEvent.submit(getInput().closest('form') as HTMLFormElement)

    expect(onJoin).not.toHaveBeenCalled()
    expect(screen.getByText(/at least 4 characters/i)).toBeTruthy()
  })

  it('renders nothing when it is closed', () => {
    render(<JoinRoomModal isOpen={false} onClose={vi.fn()} onJoin={vi.fn()} />)

    expect(screen.queryByLabelText(/room code/i)).toBeNull()
  })
})
