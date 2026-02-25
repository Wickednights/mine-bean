/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act } from '@testing-library/react'
import React from 'react'
import BeanpotCelebration from './BeanpotCelebration'

// ── Mocks ────────────────────────────────────────────────────────────

const mockConfetti = vi.fn()
vi.mock('canvas-confetti', () => ({
  default: (...args: any[]) => mockConfetti(...args),
}))

let roundTransitionCallback: ((data: any) => void) | null = null

vi.mock('@/lib/SSEContext', () => ({
  useSSE: () => ({
    subscribeGlobal: (event: string, cb: (data: any) => void) => {
      if (event === 'roundTransition') {
        roundTransitionCallback = cb
      }
      return () => { roundTransitionCallback = null }
    },
    subscribeUser: () => () => {},
  }),
}))

const mockAudioContext = {
  currentTime: 0,
  destination: {},
  createOscillator: () => ({
    connect: vi.fn(), type: '',
    frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    start: vi.fn(), stop: vi.fn(),
  }),
  createGain: () => ({
    connect: vi.fn(),
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
  }),
  createBuffer: () => ({ getChannelData: () => new Float32Array(1000) }),
  createBufferSource: () => ({ connect: vi.fn(), buffer: null, start: vi.fn() }),
  createBiquadFilter: () => ({ connect: vi.fn(), type: '', frequency: { value: 0 }, Q: { value: 0 } }),
  sampleRate: 44100,
}

;(window as any).AudioContext = vi.fn(() => mockAudioContext)

// ── Helpers ──────────────────────────────────────────────────────────

function simulateRoundTransition(settled: Record<string, any> | null) {
  if (roundTransitionCallback) {
    roundTransitionCallback({ settled, newRound: { beanpotPool: '0' } })
  }
}

// ── Tests ────────────────────────────────────────────────────────────

describe('BeanpotCelebration', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    localStorage.clear()
    roundTransitionCallback = null
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders without crashing', () => {
    const { container } = render(<BeanpotCelebration />)
    expect(container).toBeTruthy()
  })

  it('subscribes to roundTransition SSE event on mount', () => {
    render(<BeanpotCelebration />)
    expect(roundTransitionCallback).not.toBeNull()
  })

  describe('trigger logic', () => {
    it('triggers when beanpotAmount is non-zero hex', () => {
      render(<BeanpotCelebration />)
      act(() => {
        simulateRoundTransition({ roundId: '100', beanpotAmount: '0x0de0b6b3a7640000', isSplit: false })
      })
      expect(mockConfetti).toHaveBeenCalled()
    })

    it('triggers when beanpotAmount is non-zero decimal string', () => {
      render(<BeanpotCelebration />)
      act(() => {
        simulateRoundTransition({ roundId: '101', beanpotAmount: '500000000000000000', isSplit: false })
      })
      expect(mockConfetti).toHaveBeenCalled()
    })

    it('does NOT trigger when beanpotAmount is zero hex', () => {
      render(<BeanpotCelebration />)
      act(() => {
        simulateRoundTransition({ roundId: '102', beanpotAmount: '0x0', isSplit: false })
      })
      expect(mockConfetti).not.toHaveBeenCalled()
    })

    it('does NOT trigger when beanpotAmount is "0"', () => {
      render(<BeanpotCelebration />)
      act(() => {
        simulateRoundTransition({ roundId: '103', beanpotAmount: '0', isSplit: false })
      })
      expect(mockConfetti).not.toHaveBeenCalled()
    })

    it('does NOT trigger when beanpotAmount is missing', () => {
      render(<BeanpotCelebration />)
      act(() => {
        simulateRoundTransition({ roundId: '104', isSplit: false })
      })
      expect(mockConfetti).not.toHaveBeenCalled()
    })

    it('does NOT trigger when settled is null (empty round)', () => {
      render(<BeanpotCelebration />)
      act(() => {
        simulateRoundTransition(null)
      })
      expect(mockConfetti).not.toHaveBeenCalled()
    })
  })

  describe('celebration UI', () => {
    it('shows BEANPOT HIT text when triggered', () => {
      const { container } = render(<BeanpotCelebration />)
      act(() => {
        simulateRoundTransition({ roundId: '105', beanpotAmount: '0x0de0b6b3a7640000', isSplit: false })
      })
      expect(container.textContent).toContain('BEANPOT HIT')
    })

    it('hides BEANPOT HIT text after 6 seconds', () => {
      const { container } = render(<BeanpotCelebration />)
      act(() => {
        simulateRoundTransition({ roundId: '106', beanpotAmount: '0x0de0b6b3a7640000', isSplit: false })
      })
      expect(container.textContent).toContain('BEANPOT HIT')
      act(() => { vi.advanceTimersByTime(6100) })
      expect(container.textContent).not.toContain('BEANPOT HIT')
    })
  })

  describe('sound', () => {
    it('does NOT play sound when muted', () => {
      localStorage.setItem('bean_muted', 'true')
      const audioSpy = vi.fn()
      ;(window as any).AudioContext = audioSpy

      render(<BeanpotCelebration />)
      act(() => {
        simulateRoundTransition({ roundId: '107', beanpotAmount: '0x0de0b6b3a7640000', isSplit: false })
      })
      expect(audioSpy).not.toHaveBeenCalled()

      ;(window as any).AudioContext = vi.fn(() => mockAudioContext)
    })
  })

  describe('cleanup', () => {
    it('unsubscribes from SSE on unmount', () => {
      const { unmount } = render(<BeanpotCelebration />)
      expect(roundTransitionCallback).not.toBeNull()
      unmount()
      expect(roundTransitionCallback).toBeNull()
    })
  })
})
