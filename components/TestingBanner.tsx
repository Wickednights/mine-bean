'use client'

export default function TestingBanner() {
  return (
    <div
      style={{
        background: 'linear-gradient(90deg, #F0B90B22 0%, #F0B90B11 100%)',
        borderBottom: '1px solid rgba(240, 185, 11, 0.3)',
        padding: '8px 16px',
        textAlign: 'center',
        fontSize: 13,
        color: '#F0B90B',
        fontWeight: 500,
      }}
    >
      🧪 Still in testing — live soon. Use at your own risk.
    </div>
  )
}
