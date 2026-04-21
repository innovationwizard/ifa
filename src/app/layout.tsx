import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'IFA — Inteligencia Financiera App',
    template: '%s — IFA',
  },
  description:
    'Automatiza la contabilidad de tu MIPYME guatemalteca integrando FEL y transacciones bancarias.',
  applicationName: 'Inteligencia Financiera App',
  authors: [{ name: 'Artificial Intelligence Developments' }],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-GT">
      <body className="antialiased">{children}</body>
    </html>
  );
}
