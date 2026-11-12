import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ChatWidget } from '@/components/ChatWidget';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'CES Essentials — Legal help, tax prep, and protection for your whole family',
  description:
    'A family legal plan, tax prep, credit monitoring, and a VPN, starting at $25.99 a month.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://cesessentials.com'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">
        {children}
        {process.env.ANTHROPIC_API_KEY ? <ChatWidget /> : null}
      </body>
    </html>
  );
}
