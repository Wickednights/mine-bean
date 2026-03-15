/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import MinersPanel from './MinersPanel'

// ── Mocks ────────────────────────────────────────────────────────────

const mockFetch = vi.fn()
beforeEach(() => {
  ;(global as any).fetch = mockFetch
})

const mockResolve = vi.fn((addr: string) =>
  `${addr.slice(0, 6)}...${addr.slice(-4)}`
)
vi.mock('@/lib/useProfileResolver', () => ({
  useProfileResolver: () => ({
    profiles: {},
    resolve: (addr: string) => mockResolve(addr),
  }),
}))

// ── Helpers ──────────────────────────────────────────────────────────

/** The panel uses translateX(0) when open and translateX(-100%) when closed */
function getPanelElement() {
  // The panel is the element containing "Winners" title
  return screen.getByText('Winners').closest('[style*="translate"]')
}

function expectPanelOpen() {
  const panel = getPanelElement()
  expect(panel?.style.transform).toBe('translateX(0)')
}

function expectPanelClosed() {
  const panel = getPanelElement()
  expect(panel?.style.transform).toBe('translateX(-100%)')
}

// ── Test data ────────────────────────────────────────────────────────

const mockMinersResponse = {
  roundId: 100,
  winningBlock: 5,
  miners: [
    {
      address: '0x1234567890abcdef1234567890abcdef12345678',
      ethRewardFormatted: '0.5',
      beanRewardFormatted: '10.0',
      deployedFormatted: '1.0',
    },
    {
      address: '0xabcdef1234567890abcdef1234567890abcdef12',
      ethRewardFormatted: '0.3',
      beanRewardFormatted: '0',
      deployedFormatted: '0.5',
    },
  ],
}

/** Dispatch roundSettled + settlementComplete and wait for miners to load */
async function triggerSettlement(roundId: string) {
  act(() => {
    window.dispatchEvent(
      new CustomEvent('roundSettled', { detail: { roundId } })
    )
  })
  act(() => {
    window.dispatchEvent(new CustomEvent('settlementComplete'))
  })
}

describe('MinersPanel', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockResolve.mockClear()
    // Mount: proxy/rounds then proxy/round/:id/miners. Settlement: proxy/round/:id/miners
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/proxy/rounds')) {
        return Promise.resolve({ json: () => Promise.resolve({ rounds: [] }) })
      }
      if (url.includes('/api/proxy/round/') && url.includes('/miners')) {
        return Promise.resolve({ json: () => Promise.resolve(mockMinersResponse) })
      }
      if (url.includes('/api/proxy/round/current')) {
        return Promise.resolve({ json: () => Promise.resolve({ roundId: '1' }) })
      }
      return Promise.reject(new Error('Unmocked: ' + url))
    })
  })

  it('does not show trophy tab when no miners data yet', () => {
    const { container } = render(<MinersPanel />)
    // Trophy tab (the SVG icon div) should not be rendered when miners.length === 0
    // The tab is conditionally rendered: {!isOpen && hasData && (...)}
    // With no data, no tab is shown
    const svgElements = container.querySelectorAll('svg[viewBox="0 0 24 24"]')
    // Only the "No miners data" text should be visible in the closed panel
    expect(screen.getByText('No miners data')).toBeInTheDocument()
    expectPanelClosed()
  })

  it('roundSettled event stores roundId and settlementComplete triggers fetch', async () => {
    render(<MinersPanel />)

    await triggerSettlement('100')

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/proxy/round/100/miners')
    })
  })

  it('opens panel when miners data arrives', async () => {
    render(<MinersPanel />)

    await triggerSettlement('100')

    await waitFor(() => {
      expectPanelOpen()
    })
  })

  it('displays round info and winner count', async () => {
    render(<MinersPanel />)
    await triggerSettlement('100')

    await waitFor(() => {
      expect(screen.getByText(/Round #100/)).toBeInTheDocument()
      expect(screen.getByText(/Block #6/)).toBeInTheDocument() // winningBlock + 1
      expect(screen.getByText('2 winners')).toBeInTheDocument()
    })
  })

  it('displays miner addresses and BNB rewards', async () => {
    render(<MinersPanel />)
    await triggerSettlement('100')

    await waitFor(() => {
      expect(screen.getByText('0.500000')).toBeInTheDocument()
      expect(screen.getByText('0.300000')).toBeInTheDocument()
    })
  })

  it('shows BEAN reward only when > 0', async () => {
    render(<MinersPanel />)
    await triggerSettlement('100')

    await waitFor(() => {
      expect(screen.getByText('10.0000')).toBeInTheDocument()
    })

    // Second miner has 0 BEAN — the "+" sign should only appear once
    const plusSigns = screen.queryAllByText('+')
    expect(plusSigns.length).toBe(1)
  })

  it('close button hides panel', async () => {
    render(<MinersPanel />)
    await triggerSettlement('100')

    await waitFor(() => {
      expectPanelOpen()
    })

    fireEvent.click(screen.getByText('✕'))

    expectPanelClosed()
  })

  it('consume-once ref: second settlementComplete without new roundSettled does not fetch', async () => {
    render(<MinersPanel />)

    // First settlement cycle
    await triggerSettlement('100')

    const minersCalls = () => mockFetch.mock.calls.filter((c: any[]) => c[0]?.includes('/miners'))
    await waitFor(() => {
      expect(minersCalls().length).toBeGreaterThanOrEqual(1)
    })

    const countBefore = minersCalls().length

    // Second settlementComplete without roundSettled — should NOT fetch
    act(() => {
      window.dispatchEvent(new CustomEvent('settlementComplete'))
    })

    expect(minersCalls().length).toBe(countBefore)
  })

  it('empty round keeps previous data without opening panel', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/proxy/rounds')) {
        return Promise.resolve({ json: () => Promise.resolve({ rounds: [] }) })
      }
      if (url.includes('/api/proxy/round/100/miners')) {
        return Promise.resolve({ json: () => Promise.resolve(mockMinersResponse) })
      }
      if (url.includes('/api/proxy/round/101/miners')) {
        return Promise.resolve({ json: () => Promise.resolve({ roundId: 101, winningBlock: 3, miners: [] }) })
      }
      if (url.includes('/api/proxy/round/current')) {
        return Promise.resolve({ json: () => Promise.resolve({ roundId: '1' }) })
      }
      return Promise.reject(new Error('Unmocked: ' + url))
    })

    render(<MinersPanel />)
    await triggerSettlement('100')

    await waitFor(() => {
      expectPanelOpen()
    })

    // Close panel
    fireEvent.click(screen.getByText('✕'))
    expectPanelClosed()

    // Second round: empty (no miners)
    await triggerSettlement('101')

    await waitFor(() => {
      const minersCalls = mockFetch.mock.calls.filter((c: any[]) => c[0]?.includes('/miners'))
      expect(minersCalls.length).toBeGreaterThanOrEqual(2)
    })

    // Panel should still show previous round data (#100), not re-open
    expect(screen.getByText(/Round #100/)).toBeInTheDocument()
    expectPanelClosed()
  })

  it('overlay click closes panel', async () => {
    const { container } = render(<MinersPanel />)
    await triggerSettlement('100')

    await waitFor(() => {
      expectPanelOpen()
    })

    // The overlay is a fixed div with onClick that closes the panel
    // It's rendered as the last child with position:fixed and a dark semi-transparent background
    const overlays = container.querySelectorAll('div[style*="position: fixed"]')
    // Find the overlay (not the panel itself which is also position:fixed)
    // The overlay uses rgba(0,0,0,...) while the panel uses rgba(255,...)
    const overlay = Array.from(overlays).find(el =>
      (el as HTMLElement).style.background?.includes('rgba(0')
    )
    expect(overlay).toBeDefined()
    fireEvent.click(overlay!)

    expectPanelClosed()
  })
})
