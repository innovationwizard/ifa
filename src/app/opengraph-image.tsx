import { ImageResponse } from 'next/og';
import { HandCoinsGlyph } from '@/lib/branding/hand-coins-glyph';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Inteligencia Financiera App — automatiza tu contabilidad en Guatemala';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0F1A2E 0%, #1B2D4A 60%, #264573 100%)',
        color: '#FFFFFF',
        padding: '80px 96px',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          marginBottom: 48,
        }}
      >
        <HandCoinsGlyph size={96} color="#2EC4B6" strokeWidth={2} />
        <span
          style={{
            fontSize: 64,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: '#FFFFFF',
          }}
        >
          IFA
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 56,
          fontWeight: 600,
          lineHeight: 1.15,
          letterSpacing: '-0.01em',
          color: '#FFFFFF',
          maxWidth: 900,
        }}
      >
        Inteligencia Financiera App
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 28,
          fontWeight: 400,
          lineHeight: 1.4,
          color: '#D1F5F0',
          marginTop: 24,
          maxWidth: 900,
        }}
      >
        Automatiza la contabilidad de tu MIPYME guatemalteca integrando FEL y transacciones
        bancarias.
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 'auto',
          fontSize: 20,
          fontWeight: 500,
          color: '#D4A843',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        Artificial Intelligence Developments · Guatemala
      </div>
    </div>,
    { ...size },
  );
}
