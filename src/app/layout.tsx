import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import CandidateLogger from '@/components/CandidateLogger';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'NextFlow - Workflow Builder',
  description: 'NextFlow is a pixel-perfect workflow builder clone of Galaxy.ai',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={inter.className}>
          <CandidateLogger />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
