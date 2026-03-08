'use client'

export default function BeanLogo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      <ellipse cx="50" cy="50" rx="38" ry="45" fill="url(#beanLogoGrad)" />
      <path d="M50 20C45 35 45 65 50 80" stroke="#CC8800" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.6" />
      <ellipse cx="38" cy="35" rx="8" ry="6" fill="white" opacity="0.25" />
      <defs>
        <linearGradient id="beanLogoGrad" x1="50" y1="5" x2="50" y2="95" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFD54F" />
          <stop offset="100%" stopColor="#F0B90B" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function BeansTextLogo({ height = 24 }: { height?: number }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', fontWeight: 800, fontSize: height, letterSpacing: '-0.02em', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <span style={{ color: '#fff' }}>BE</span>
      <span style={{ color: '#F0B90B' }}>AN</span>
      <span style={{ color: '#fff', marginLeft: '2px' }}>.</span>
    </span>
  )
}
