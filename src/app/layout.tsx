import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ChatWidget } from '@/components/ChatWidget';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'CES Essentials — Legal help, tax prep, and protection for your whole team',
  description:
    'Company benefits for teams of 5 or more: a family legal plan, tax prep, credit monitoring with a VPN, CESgpt, Streamify Me, and the Discount Club.',
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
