/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import React from 'react'
import Header from './Header'

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => {
    return React.createElement('a', { href, ...props }, children)
  },
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

// Mock RainbowKit
vi.mock('@rainbow-me/rainbowkit', () => ({
  useConnectModal: () => ({ openConnectModal: vi.fn() }),
  ConnectButton: () => <div data-testid="connect-button">Connect</div>,
  RainbowKitProvider: ({ children }: any) => children,
  darkTheme: () => ({}),
  getDefaultConfig: vi.fn(() => ({})),
}))

// Mock WalletButton component
vi.mock('@/components/WalletButton', () => ({
  default: () => <div data-testid="wallet-button">Wallet</div>
}))

vi.mock('./WalletButton', () => ({
  default: () => <div data-testid="wallet-button">Wallet</div>
}))

// Mock BeanLogo components
vi.mock('@/components/BeanLogo', () => ({
  default: ({ size }: { size: number }) => <div data-testid="bean-logo" style={{ width: size, height: size }} />,
  BeansTextLogo: ({ height }: { height: number }) => <div data-testid="beans-text-logo" style={{ height }} />
}))

vi.mock('./BeanLogo', () => ({
  default: ({ size }: { size: number }) => <div data-testid="bean-logo" style={{ width: size, height: size }} />,
  BeansTextLogo: ({ height }: { height: number }) => <div data-testid="beans-text-logo" style={{ height }} />
}))

// Mock BottomNav component
vi.mock('@/components/BottomNav', () => ({
  default: () => <div data-testid="bottom-nav">BottomNav</div>
}))

vi.mock('./BottomNav', () => ({
  default: () => <div data-testid="bottom-nav">BottomNav</div>
}))

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset fetch mock
    ;(global.fetch as any).mockClear()
  })

  it('renders logo', async () => {
    render(<Header isMobile={false} />)

    await waitFor(() => {
      const beanLogos = screen.getAllByTestId('bean-logo')
      expect(beanLogos.length).toBeGreaterThan(0)
      expect(screen.getByTestId('beans-text-logo')).toBeInTheDocument()
    })
  })

  it('renders navigation links (About, Global, Stake)', async () => {
    render(<Header />)

    await waitFor(() => {
      expect(screen.getByText('About')).toBeInTheDocument()
      expect(screen.getByText('Global')).toBeInTheDocument()
      expect(screen.getByText('Stake')).toBeInTheDocument()
    })

    // Check that links have correct href attributes
    const aboutLink = screen.getByText('About').closest('a')
    const globalLink = screen.getByText('Global').closest('a')
    const stakeLink = screen.getByText('Stake').closest('a')

    expect(aboutLink).toHaveAttribute('href', '/about')
    expect(globalLink).toHaveAttribute('href', '/global')
    expect(stakeLink).toHaveAttribute('href', '/stake')
  })

  it('fetches BNB price from same-origin /api/price/bnb proxy', async () => {
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/price/bnb')) {
        return Promise.resolve({
          json: () => Promise.resolve({ usd: 595.5 }),
        })
      }
      // DexScreener fallback
      return Promise.resolve({
        json: () => Promise.resolve({ pair: { priceUsd: '0.0264' } }),
      })
    })

    render(<Header />)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/price/bnb')
    })
  })

  it('fetches BEAN price from DexScreener', async () => {
    const mockDexScreenerResponse = {
      pairs: [{ priceUsd: '0.0275', liquidity: { usd: 1000 } }]
    }

    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('dexscreener.com')) {
        return Promise.resolve({
          json: () => Promise.resolve(mockDexScreenerResponse)
        })
      }
      // Binance fallback
      return Promise.resolve({
        json: () => Promise.resolve({ price: '600.00' })
      })
    })

    render(<Header />)

    // Wait for BEANS price to be fetched and displayed
    await waitFor(() => {
      expect(screen.getByText(/0\.03/)).toBeInTheDocument()
    }, { timeout: 3000 })

    // Verify fetch was called with DexScreener tokens API
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('api.dexscreener.com/latest/dex/tokens/'),
      expect.anything()
    )
  })

  it('shows price values when loaded', async () => {
    const mockDexScreenerResponse = { pairs: [{ priceUsd: '0.0300', liquidity: { usd: 1000 } }] }

    ;(global.fetch as any).mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/price/bnb')) {
        return Promise.resolve({
          json: () => Promise.resolve({ usd: 600 }),
        })
      }
      if (url.includes('dexscreener.com')) {
        return Promise.resolve({
          json: () => Promise.resolve(mockDexScreenerResponse)
        })
      }
      return Promise.reject(new Error('Unknown API'))
    })

    render(<Header />)

    // BEAN price is displayed in the header
    await waitFor(() => {
      expect(screen.getByText(/0\.03/)).toBeInTheDocument()
    }, { timeout: 3000 })

    // Check for BEAN price label
    expect(screen.getByText('BNBEAN')).toBeInTheDocument()
  })

  it('shows fallback prices on API error', async () => {
    ;(global.fetch as any).mockRejectedValue(new Error('Network error'))

    render(<Header />)

    // BEAN price renders as "$--" when DexScreener fails; BNB falls back to 600.00 in catch.
    await waitFor(() => {
      expect(screen.getByText('$--')).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('renders social links', async () => {
    render(<Header />)

    // Wait for component to render
    await waitFor(() => {
      expect(screen.getByText('About')).toBeInTheDocument()
    })

    // Find all social links (Twitter, GitHub, Discord)
    const socialLinks = document.querySelectorAll('a[href*="x.com"], a[href*="github.com"]')
    expect(socialLinks.length).toBeGreaterThan(0)
  })

  it('renders WalletButton component', async () => {
    render(<Header />)

    await waitFor(() => {
      expect(screen.getByTestId('wallet-button')).toBeInTheDocument()
    })
  })

  it('highlights active tab when currentPage is set', async () => {
    render(<Header currentPage="about" />)

    await waitFor(() => {
      const aboutLink = screen.getByText('About').closest('a')
      expect(aboutLink).toHaveStyle({ color: '#fff' })
    })
  })

  it('renders mobile layout when isMobile prop is true', async () => {
    const { container } = render(<Header isMobile={true} />)

    await waitFor(() => {
      expect(screen.getByTestId('bean-logo')).toBeInTheDocument()
    })

    // Mobile layout should have different structure - no navigation links visible in mobile header
    const nav = container.querySelector('nav')
    expect(nav).not.toBeInTheDocument()
  })

  it('renders desktop layout by default', async () => {
    const { container } = render(<Header isMobile={false} />)

    await waitFor(() => {
      const beanLogos = screen.getAllByTestId('bean-logo')
      expect(beanLogos.length).toBeGreaterThan(0)
    })

    // Desktop layout should have navigation
    const nav = container.querySelector('nav')
    expect(nav).toBeInTheDocument()
  })

  it('displays price tags with correct icons', async () => {
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/price/bnb')) {
        return Promise.resolve({
          json: () => Promise.resolve({ usd: 580 }),
        })
      }
      if (url.includes('dexscreener.com')) {
        return Promise.resolve({
          json: () => Promise.resolve({ pairs: [{ priceUsd: '0.0264', liquidity: { usd: 1000 } }] })
        })
      }
      return Promise.reject(new Error('Unknown API'))
    })

    render(<Header isMobile={false} />)

    // BEAN price tag is displayed
    await waitFor(() => {
      const beanLogos = screen.getAllByTestId('bean-logo')
      expect(beanLogos.length).toBeGreaterThan(0)
      expect(screen.getByText('BNBEAN')).toBeInTheDocument()
    })
  })

  it('updates BNB price on interval', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    let bnbProxyCallCount = 0
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/price/bnb')) {
        bnbProxyCallCount++
        return Promise.resolve({
          json: () => Promise.resolve({ usd: 580 + bnbProxyCallCount }),
        })
      }
      return Promise.resolve({
        json: () => Promise.resolve({ pairs: [{ priceUsd: '0.0264', liquidity: { usd: 1000 } }] })
      })
    })

    render(<Header isMobile={false} />)

    await waitFor(() => {
      expect(bnbProxyCallCount).toBeGreaterThanOrEqual(1)
    })

    const countAfterInitial = bnbProxyCallCount

    await act(async () => {
      vi.advanceTimersByTime(10000)
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    await waitFor(() => {
      expect(bnbProxyCallCount).toBeGreaterThan(countAfterInitial)
    })

    vi.useRealTimers()
  })

  it('updates BEAN price on interval', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    let callCount = 0
    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('dexscreener.com')) {
        callCount++
        // Use values that are distinguishable after .toFixed(2)
        const prices = ['1.11', '2.22', '3.33']
        return Promise.resolve({
          json: () => Promise.resolve({ pairs: [{ priceUsd: prices[callCount - 1] || '1.00', liquidity: { usd: 1000 } }] })
        })
      }
      if (typeof url === 'string' && url.includes('/api/price/bnb')) {
        return Promise.resolve({ json: () => Promise.resolve({ usd: 600 }) })
      }
      return Promise.resolve({ json: () => Promise.resolve({ pairs: [] }) })
    })

    render(<Header isMobile={false} />)

    // Wait for initial fetch to complete
    await waitFor(() => {
      expect(screen.getByText(/1\.11/)).toBeInTheDocument()
    })

    // Advance timers by 30 seconds and flush promises
    await act(async () => {
      vi.advanceTimersByTime(30000)
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    // Second fetch should happen with updated price
    await waitFor(() => {
      expect(screen.getByText(/2\.22/)).toBeInTheDocument()
    })

    vi.useRealTimers()
  })
})
