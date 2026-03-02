import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '⚔️ idempo — Tactical Arena',
  description: 'Real-time tactical arena game demonstrating distributed systems patterns',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0f1117] text-[#e2e8f0]">
        <nav className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
          <span className="text-xl font-bold tracking-wider">⚔️ 𝔦𝔡𝔢𝔪𝔭𝔬</span>
          <div className="flex gap-6 text-sm text-gray-400">
            <a href="/" className="hover:text-white transition-colors">Arena</a>
            <a href="/leaderboard" className="hover:text-white transition-colors">Leaderboard</a>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
