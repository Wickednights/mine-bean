'use client'

export default function BeanLogo({ size = 32 }: { size?: number }) {
  return (
    <img 
      src="https://imagedelivery.net/GyRgSdgDhHz2WNR4fvaN-Q/b2af3765-f7ce-4727-063f-01b23ac8a500/public"
      height={size}
      alt="BEAN"
      style={{ display: 'block', height: size, width: 'auto' }}
    />
  )
}

export function BeansTextLogo({ height = 24 }: { height?: number }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', fontWeight: 800, fontSize: height, letterSpacing: '-0.02em', fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <span style={{ color: '#fff' }}>BE</span>
      <span style={{ color: '#0052FF' }}>AN</span>
      <span style={{ color: '#fff', marginLeft: '2px' }}>.</span>
    </span>
  )
}
