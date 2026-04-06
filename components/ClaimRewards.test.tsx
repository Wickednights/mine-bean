/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import ClaimRewards from './ClaimRewards'
import type { RewardsData } from '@/lib/UserDataContext'

// ── Mock UserDataContext ────────────────────────────────────────────

const mockRewards: RewardsData = {
  pendingETH: '1000000000000000000',
  pendingETHFormatted: '1.0',
  pendingBEAN: {
    unroasted: '500000000000000000',
    unroastedFormatted: '0.5',
    roasted: '200000000000000000',
    roastedFormatted: '0.2',
    gross: '700000000000000000',
    grossFormatted: '0.7',
    fee: '50000000000000000',
    feeFormatted: '0.05',
    net: '650000000000000000',
    netFormatted: '0.65',
  },
  uncheckpointedRound: '0',
}

let currentRewards: RewardsData | null = mockRewards

vi.mock('@/lib/UserDataContext', () => ({
  useUserData: () => ({
    rewards: currentRewards,
    stakeInfo: null,
    profile: null,
    refetchRewards: vi.fn(),
    refetchStakeInfo: vi.fn(),
    refetchProfile: vi.fn(),
  }),
}))

describe('ClaimRewards', () => {
  const onClaimETH = vi.fn()
  const onClaimBEAN = vi.fn()

  beforeEach(() => {
    onClaimETH.mockClear()
    onClaimBEAN.mockClear()
    currentRewards = mockRewards
  })

  it('returns null when userAddress is undefined', () => {
    const { container } = render(
      <ClaimRewards onClaimETH={onClaimETH} onClaimBEAN={onClaimBEAN} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('shows Rewards card when rewards is null (displays zeros)', () => {
    currentRewards = null
    render(
      <ClaimRewards userAddress="0xABC" onClaimETH={onClaimETH} onClaimBEAN={onClaimBEAN} />
    )
    expect(screen.getByText('Rewards')).toBeInTheDocument()
    expect(screen.getByText(/0\.000000 BNB/)).toBeInTheDocument()
  })

  it('shows Rewards card when all rewards are zero (buttons disabled)', () => {
    currentRewards = {
      pendingETH: '0',
      pendingETHFormatted: '0',
      pendingBEAN: {
        unroasted: '0', unroastedFormatted: '0',
        roasted: '0', roastedFormatted: '0',
        gross: '0', grossFormatted: '0',
        fee: '0', feeFormatted: '0',
        net: '0', netFormatted: '0',
      },
      uncheckpointedRound: '0',
    }
    render(
      <ClaimRewards userAddress="0xABC" onClaimETH={onClaimETH} onClaimBEAN={onClaimBEAN} />
    )
    expect(screen.getByText('Rewards')).toBeInTheDocument()
    const claimBeanBtn = screen.getByText('Claim BNBEAN')
    expect(claimBeanBtn).toBeDisabled()
  })

  it('displays BNB rewards amount when non-zero', () => {
    render(
      <ClaimRewards userAddress="0xABC" onClaimETH={onClaimETH} onClaimBEAN={onClaimBEAN} />
    )
    expect(screen.getByText(/1\.000000 BNB/)).toBeInTheDocument()
  })

  it('displays unroasted and roasted BEAN amounts', () => {
    render(
      <ClaimRewards userAddress="0xABC" onClaimETH={onClaimETH} onClaimBEAN={onClaimBEAN} />
    )
    expect(screen.getByText(/0\.5000 BNBEAN/)).toBeInTheDocument()
    expect(screen.getByText(/0\.2000 BNBEAN/)).toBeInTheDocument()
  })

  it('Claim BNBEAN button is enabled when hasBEAN is true', () => {
    render(
      <ClaimRewards userAddress="0xABC" onClaimETH={onClaimETH} onClaimBEAN={onClaimBEAN} />
    )
    const claimBeanBtn = screen.getByText('Claim BNBEAN')
    expect(claimBeanBtn).not.toBeDisabled()
  })

  it('Claim BNB button is enabled when hasBNB is true', () => {
    render(
      <ClaimRewards userAddress="0xABC" onClaimETH={onClaimETH} onClaimBEAN={onClaimBEAN} />
    )
    const claimBnbBtn = screen.getByText('Claim BNB')
    expect(claimBnbBtn).not.toBeDisabled()
  })

  it('Claim BNBEAN button is disabled when no BEAN rewards', () => {
    currentRewards = {
      ...mockRewards,
      pendingBEAN: {
        unroasted: '0', unroastedFormatted: '0',
        roasted: '0', roastedFormatted: '0',
        gross: '0', grossFormatted: '0',
        fee: '0', feeFormatted: '0',
        net: '0', netFormatted: '0',
      },
    }
    render(
      <ClaimRewards userAddress="0xABC" onClaimETH={onClaimETH} onClaimBEAN={onClaimBEAN} />
    )
    const claimBeanBtn = screen.getByText('Claim BNBEAN')
    expect(claimBeanBtn).toBeDisabled()
  })

  it('clicking Claim BNBEAN calls onClaimBEAN', () => {
    render(
      <ClaimRewards userAddress="0xABC" onClaimETH={onClaimETH} onClaimBEAN={onClaimBEAN} />
    )
    fireEvent.click(screen.getByText('Claim BNBEAN'))
    expect(onClaimBEAN).toHaveBeenCalledTimes(1)
  })

  it('clicking Claim BNB calls onClaimETH', () => {
    render(
      <ClaimRewards userAddress="0xABC" onClaimETH={onClaimETH} onClaimBEAN={onClaimBEAN} />
    )
    fireEvent.click(screen.getByText('Claim BNB'))
    expect(onClaimETH).toHaveBeenCalledTimes(1)
  })
})
