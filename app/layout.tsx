import type { Metadata } from 'next'
import { Web3Provider } from '@/lib/providers'
import HelpButton from '@/components/HelpButton'
import './globals.css'

export const metadata: Metadata = {
  title: 'MineBean',
  description: 'Gamified mining protocol on BNB Smart Chain. Compete in 60-second rounds, deploy BNB on a 5×5 grid, and earn BNBEAN tokens.',
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    title: 'MineBean — Mine. Win. Earn.',
    description: 'Gamified mining protocol on BNB Smart Chain. Compete in 60-second rounds, deploy BNB on a 5×5 grid, and earn BNBEAN tokens.',
    url: 'https://minebean.io',
    siteName: 'MineBean',
    type: 'website',
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MineBean — Mine. Win. Earn.',
    description: 'Gamified mining protocol on BNB Smart Chain. Compete in 60-second rounds, deploy BNB on a 5×5 grid, and earn BNBEAN tokens.',
    images: ['/opengraph-image'],
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
        <Web3Provider>
          {children}
          <HelpButton />
        </Web3Provider>
      </body>
    </html>
  )
}
