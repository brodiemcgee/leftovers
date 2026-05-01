import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Leftovers',
  description: "How much can I spend this month without going backwards?",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-AU">
      <body className="bg-canvas text-ink antialiased">{children}</body>
    </html>
  );
}
