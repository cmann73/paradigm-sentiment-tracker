import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Paradigm Sentiment Tracker',
  description: 'Live sentiment monitoring for Paradigm and Matt Huang',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
