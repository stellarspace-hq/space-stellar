import { beforeEach, describe, expect, it, vi } from 'vitest'

const ioMock = vi.hoisted(() => vi.fn())

vi.mock('socket.io-client', () => ({
  io: ioMock,
  Socket: class {},
}))

const createFakeSocket = () => ({
  id: 'socket-id',
  on: vi.fn(),
  disconnect: vi.fn(),
  io: { on: vi.fn() },
})

beforeEach(() => {
  vi.resetModules()
  ioMock.mockReset()
})

const loadSocketModule = () => import('./socket')

describe('socket singleton', () => {
  it('creates the socket once and reuses it across getSocket calls', async () => {
    const fake = createFakeSocket()
    ioMock.mockReturnValue(fake)
    const { getSocket } = await loadSocketModule()

    const first = getSocket()
    const second = getSocket()

    expect(first).toBe(second)
    expect(ioMock).toHaveBeenCalledTimes(1)
    expect(fake.disconnect).not.toHaveBeenCalled()
  })

  it('disconnectSocket disconnects and clears the cached instance', async () => {
    const first = createFakeSocket()
    const second = createFakeSocket()
    ioMock.mockReturnValueOnce(first).mockReturnValueOnce(second)
    const { getSocket, disconnectSocket } = await loadSocketModule()

    const socket = getSocket()
    disconnectSocket()

    expect(first.disconnect).toHaveBeenCalledTimes(1)

    const recreated = getSocket()

    expect(recreated).not.toBe(socket)
    expect(ioMock).toHaveBeenCalledTimes(2)
  })

  it('does not construct a socket until getSocket is called', async () => {
    const { disconnectSocket } = await loadSocketModule()

    disconnectSocket()

    expect(ioMock).not.toHaveBeenCalled()
  })
})
