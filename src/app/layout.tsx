import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'CES Essentials — Healthcare, legal help, and protection for your whole family',
  description:
    'Unlimited $0-copay doctor visits, a family legal plan, tax prep, and credit monitoring, starting at $25.99 a month.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://cesessentials.com'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
