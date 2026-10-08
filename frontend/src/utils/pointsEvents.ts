// Cross-component points notifications.
//
// The Navbar polls the backend every few seconds. Spend/earn flows already
// know the new balance from their own API response, so they broadcast it here
// and the Navbar updates immediately instead of waiting for the next poll.

export const POINTS_CHANGED_EVENT = 'space-stellar:points-changed'

export interface PointsChangedDetail {
  address: string
  points: number
}

export const notifyPointsChanged = (detail: PointsChangedDetail) => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<PointsChangedDetail>(POINTS_CHANGED_EVENT, { detail }))
}
