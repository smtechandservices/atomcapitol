import type { Metadata } from 'next'
import { Raleway } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const raleway = Raleway({
  variable: '--font-raleway',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
})

export const metadata: Metadata = {
  title: 'Atom Capitol — Admin Portal',
  description: 'Admin portal for plot assignments, KYC review, payments and communication.',
  icons: { icon: '/favicon.png' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${raleway.variable} h-full antialiased`}>
      <body className="h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
