import type { Metadata } from 'next'
import { Web3Provider } from '@/lib/providers'
import HelpButton from '@/components/HelpButton'
import './globals.css'

export const metadata: Metadata = {
  title: 'MineBean',
  description: 'Decentralized mining protocol on BNB Smart Chain',
  icons: {
    icon: '/favicon.png',
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
