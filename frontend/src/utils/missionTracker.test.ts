import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  claimMission,
  getClaimedMissions,
  getMatchStats,
  initializeMissions,
  updateMatchStats,
} from './missionTracker'

const ADDRESS = 'GTESTADDRESSTESTADDRESSTESTADDRESSTESTADDRESSTESTADDRESSTESTA'

const createLocalStorageMock = (): Storage => {
  const store = new Map<string, string>()

  return {
    get length() {
      return store.size
    },
    clear: () => {
      store.clear()
    },
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key)
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
  }
}

const seedStats = (stats: Record<string, unknown>) => {
  localStorage.setItem(`match_stats_${ADDRESS}`, JSON.stringify(stats))
}

const missionById = (id: string) =>
  initializeMissions(ADDRESS).find((mission) => mission.id === id)!

const THRESHOLDS = [
  { id: 'daily_10_matches', field: 'todayMatches', target: 10 },
  { id: 'weekly_20_wins', field: 'totalWins', target: 20 },
  { id: 'multiplayer_20_matches', field: 'multiplayerMatches', target: 20 },
  { id: 'total_50_matches', field: 'totalMatches', target: 50 },
]

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('initializeMissions', () => {
  it('reports all four missions as incomplete for a fresh address', () => {
    const missions = initializeMissions(ADDRESS)

    expect(missions.map((mission) => mission.id)).toEqual([
      'daily_10_matches',
      'weekly_20_wins',
      'multiplayer_20_matches',
      'total_50_matches',
    ])
    expect(missions.every((mission) => mission.completed === false)).toBe(true)
    expect(missions.every((mission) => mission.claimed === false)).toBe(true)
  })

  describe.each(THRESHOLDS)('$id', ({ id, field, target }) => {
    it(`is incomplete one short of the target (${target - 1})`, () => {
      seedStats({ [field]: target - 1 })
      const mission = missionById(id)

      expect(mission.current).toBe(target - 1)
      expect(mission.completed).toBe(false)
    })

    it(`is complete exactly at the target (${target})`, () => {
      seedStats({ [field]: target })
      const mission = missionById(id)

      expect(mission.current).toBe(target)
      expect(mission.completed).toBe(true)
    })
  })

  it('never reports a completed mission as claimed before claimMission runs', () => {
    seedStats({ todayMatches: 10 })

    expect(missionById('daily_10_matches').completed).toBe(true)
    expect(missionById('daily_10_matches').claimed).toBe(false)

    claimMission(ADDRESS, 'daily_10_matches')

    expect(missionById('daily_10_matches').claimed).toBe(true)
  })
})

describe('updateMatchStats', () => {
  it('increments the counters from the supplied match data', () => {
    updateMatchStats(ADDRESS, { isMultiplayer: true, isWin: true, coins: 7 })

    const stats = getMatchStats(ADDRESS)

    expect(stats.totalMatches).toBe(1)
    expect(stats.totalWins).toBe(1)
    expect(stats.multiplayerMatches).toBe(1)
    expect(stats.totalCoins).toBe(7)
    expect(stats.todayMatches).toBe(1)
    expect(stats.weekMatches).toBe(1)
  })

  it('leaves win and multiplayer counters at zero when the flags are absent', () => {
    updateMatchStats(ADDRESS, {})

    const stats = getMatchStats(ADDRESS)

    expect(stats.totalMatches).toBe(1)
    expect(stats.totalWins).toBe(0)
    expect(stats.multiplayerMatches).toBe(0)
  })

  it('resets todayMatches when the stored stats are from a previous day', () => {
    seedStats({
      totalMatches: 4,
      totalWins: 0,
      multiplayerMatches: 0,
      todayMatches: 9,
      weekMatches: 4,
      totalCoins: 0,
      lastUpdate: new Date('2020-01-01T00:00:00.000Z').toISOString(),
      lastWeekStart: new Date().toDateString(),
    })

    updateMatchStats(ADDRESS, {})

    expect(getMatchStats(ADDRESS).todayMatches).toBe(1)
  })
})

describe('claimMission', () => {
  it('is idempotent for the same mission id', () => {
    claimMission(ADDRESS, 'daily_10_matches')
    claimMission(ADDRESS, 'daily_10_matches')

    expect(getClaimedMissions(ADDRESS)).toEqual(['daily_10_matches'])
  })
})
