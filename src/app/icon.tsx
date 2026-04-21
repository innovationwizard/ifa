import { ImageResponse } from 'next/og';
import { HandCoinsGlyph } from '@/lib/branding/hand-coins-glyph';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1B2D4A',
        color: '#FFFFFF',
        borderRadius: '6px',
      }}
    >
      <HandCoinsGlyph size={22} color="#FFFFFF" strokeWidth={2.25} />
    </div>,
    { ...size },
  );
}
