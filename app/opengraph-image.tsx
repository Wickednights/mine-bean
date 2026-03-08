import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'MineBean - Gamified Mining on BNB Smart Chain'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0a',
          position: 'relative',
        }}
      >
        {/* Background glow */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -60%)',
            width: 600,
            height: 600,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(240,185,11,0.15) 0%, transparent 70%)',
          }}
        />

        {/* Bean shape */}
        <svg width="180" height="210" viewBox="0 0 100 120" fill="none">
          <ellipse cx="50" cy="60" rx="38" ry="45" fill="url(#bGold)" />
          <path d="M50 25C45 40 45 80 50 95" stroke="#CC8800" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.6" />
          <ellipse cx="38" cy="45" rx="8" ry="6" fill="white" opacity="0.25" />
          <defs>
            <linearGradient id="bGold" x1="50" y1="10" x2="50" y2="110" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFD54F" />
              <stop offset="100%" stopColor="#F0B90B" />
            </linearGradient>
          </defs>
        </svg>

        {/* Title */}
        <div
          style={{
            display: 'flex',
            marginTop: 24,
            fontSize: 72,
            fontWeight: 800,
            letterSpacing: '-2px',
          }}
        >
          <span style={{ color: '#ffffff' }}>Mine</span>
          <span style={{ color: '#F0B90B' }}>Bean</span>
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 26,
            color: 'rgba(255,255,255,0.5)',
            marginTop: 12,
          }}
        >
          Gamified Mining Protocol on BNB Smart Chain
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#F0B90B',
            marginTop: 20,
            letterSpacing: '6px',
          }}
        >
          MINE. WIN. EARN.
        </div>
      </div>
    ),
    { ...size }
  )
}
