/**
 * HandCoins glyph — direct SVG rendering for static asset generation.
 *
 * `next/og` uses Satori, which renders JSX to SVG/PNG but doesn't resolve
 * every React component the way the main renderer does. Inlining the paths
 * here guarantees pixel-perfect output for icon.tsx, apple-icon.tsx, and
 * opengraph-image.tsx without depending on lucide-react's runtime.
 *
 * Paths copied verbatim from lucide-react@1.8.0 HandCoins source
 * (node_modules/lucide-react/dist/esm/icons/hand-coins.js) — if lucide
 * changes the glyph in a future release, update these paths to match.
 */

interface HandCoinsGlyphProps {
  size: number;
  color?: string;
  strokeWidth?: number;
}

export function HandCoinsGlyph({
  size,
  color = 'currentColor',
  strokeWidth = 2,
}: HandCoinsGlyphProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17" />
      <path d="m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9" />
      <path d="m2 16 6 6" />
      <circle cx="16" cy="9" r="2.9" />
      <circle cx="6" cy="5" r="3" />
    </svg>
  );
}
