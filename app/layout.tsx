import type { Metadata } from 'next'
import { Web3Provider } from '@/lib/providers'
import HelpButton from '@/components/HelpButton'
import TestingBanner from '@/components/TestingBanner'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://mine-bean.vercel.app'),
  title: 'MineBean',
  description: 'Decentralized mining protocol on BNB Chain (Binance Smart Chain). Deploy BNB, compete for blocks, win rewards every 60 seconds.',
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    title: 'MineBean — Mine. Win. Earn.',
    description: 'Decentralized mining protocol on BNB Chain (Binance Smart Chain). Deploy BNB, compete for blocks, win rewards every 60 seconds.',
    url: 'https://mine-bean.vercel.app',
    siteName: 'MineBean',
    type: 'website',
    images: ['/og-hero.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MineBean — Mine. Win. Earn.',
    description: 'Decentralized mining protocol on BNB Chain (Binance Smart Chain). Deploy BNB, compete for blocks, win rewards every 60 seconds.',
    images: ['/og-hero.png'],
  },
  other: {
    'telegram:channel': '@minebean',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <TestingBanner />
        <Web3Provider>
          {children}
          <HelpButton />
        </Web3Provider>
      </body>
    </html>
  )
}
