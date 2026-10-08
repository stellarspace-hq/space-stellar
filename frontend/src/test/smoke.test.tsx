import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('frontend test harness', () => {
  it('renders a div into jsdom', () => {
    render(<div>space-stellar test harness</div>)

    expect(screen.getByText('space-stellar test harness')).toBeTruthy()
  })
})
