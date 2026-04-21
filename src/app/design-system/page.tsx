import { notFound } from 'next/navigation';

interface ColorToken {
  name: string;
  hex: string;
  utility: string;
  textOn: 'light' | 'dark';
}

interface ColorGroup {
  title: string;
  subtitle: string;
  tokens: ColorToken[];
}

const COLOR_GROUPS: ColorGroup[] = [
  {
    title: 'Primary — Navy',
    subtitle: 'Trust, authority, structural surfaces (sidebar, headers, hero)',
    tokens: [
      { name: '--ifa-navy-900', hex: '#0F1A2E', utility: 'bg-ifa-navy-900', textOn: 'dark' },
      { name: '--ifa-navy-800', hex: '#1B2D4A', utility: 'bg-ifa-navy-800', textOn: 'dark' },
      { name: '--ifa-navy-700', hex: '#264573', utility: 'bg-ifa-navy-700', textOn: 'dark' },
      { name: '--ifa-navy-600', hex: '#2E5A8F', utility: 'bg-ifa-navy-600', textOn: 'dark' },
      { name: '--ifa-navy-100', hex: '#E8EEF6', utility: 'bg-ifa-navy-100', textOn: 'light' },
      { name: '--ifa-navy-50', hex: '#F4F7FB', utility: 'bg-ifa-navy-50', textOn: 'light' },
    ],
  },
  {
    title: 'Secondary — Teal',
    subtitle: 'Innovation, action, positive trends (buttons, links, success)',
    tokens: [
      { name: '--ifa-teal-600', hex: '#0D847A', utility: 'bg-ifa-teal-600', textOn: 'dark' },
      { name: '--ifa-teal-500', hex: '#0FA698', utility: 'bg-ifa-teal-500', textOn: 'dark' },
      { name: '--ifa-teal-400', hex: '#2EC4B6', utility: 'bg-ifa-teal-400', textOn: 'dark' },
      { name: '--ifa-teal-100', hex: '#D1F5F0', utility: 'bg-ifa-teal-100', textOn: 'light' },
    ],
  },
  {
    title: 'Accent — Gold',
    subtitle: 'Prosperity, achievement (badges, streaks, premium)',
    tokens: [
      { name: '--ifa-gold-500', hex: '#D4A843', utility: 'bg-ifa-gold-500', textOn: 'dark' },
      { name: '--ifa-gold-400', hex: '#E5C06E', utility: 'bg-ifa-gold-400', textOn: 'dark' },
      { name: '--ifa-gold-100', hex: '#FDF5E3', utility: 'bg-ifa-gold-100', textOn: 'light' },
    ],
  },
  {
    title: 'Semantic',
    subtitle: 'State-communicating colors (feedback, alerts, status)',
    tokens: [
      { name: '--ifa-success', hex: '#16A34A', utility: 'bg-ifa-success', textOn: 'dark' },
      { name: '--ifa-warning', hex: '#E5930B', utility: 'bg-ifa-warning', textOn: 'dark' },
      { name: '--ifa-error', hex: '#DC2626', utility: 'bg-ifa-error', textOn: 'dark' },
      { name: '--ifa-info', hex: '#2563EB', utility: 'bg-ifa-info', textOn: 'dark' },
    ],
  },
  {
    title: 'Neutral',
    subtitle: 'Text, borders, alternating rows, surfaces',
    tokens: [
      { name: '--ifa-gray-900', hex: '#111827', utility: 'bg-ifa-gray-900', textOn: 'dark' },
      { name: '--ifa-gray-700', hex: '#374151', utility: 'bg-ifa-gray-700', textOn: 'dark' },
      { name: '--ifa-gray-500', hex: '#6B7280', utility: 'bg-ifa-gray-500', textOn: 'dark' },
      { name: '--ifa-gray-300', hex: '#D1D5DB', utility: 'bg-ifa-gray-300', textOn: 'light' },
      { name: '--ifa-gray-100', hex: '#F3F4F6', utility: 'bg-ifa-gray-100', textOn: 'light' },
      {
        name: '--ifa-white',
        hex: '#FFFFFF',
        utility: 'bg-ifa-white border border-ifa-gray-300',
        textOn: 'light',
      },
    ],
  },
];

const RADII: { name: string; utility: string; value: string }[] = [
  { name: '--radius-ifa-card', utility: 'rounded-ifa-card', value: '8px' },
  { name: '--radius-ifa-button', utility: 'rounded-ifa-button', value: '6px' },
  { name: '--radius-ifa-input', utility: 'rounded-ifa-input', value: '6px' },
  { name: '--radius-ifa-pill', utility: 'rounded-ifa-pill', value: '9999px' },
];

const SHADOWS: { name: string; utility: string; description: string }[] = [
  {
    name: '--shadow-ifa-card',
    utility: 'shadow-ifa-card',
    description: 'Default elevation for cards and surfaces',
  },
  {
    name: '--shadow-ifa-modal',
    utility: 'shadow-ifa-modal',
    description: 'High elevation for modals and overlays',
  },
  {
    name: '--shadow-ifa-dropdown',
    utility: 'shadow-ifa-dropdown',
    description: 'Medium elevation for dropdowns and menus',
  },
];

function Swatch({ token }: { token: ColorToken }) {
  const textClass = token.textOn === 'dark' ? 'text-ifa-white' : 'text-ifa-gray-900';
  return (
    <div className="rounded-ifa-card shadow-ifa-card overflow-hidden">
      <div className={`${token.utility} ${textClass} flex h-24 items-end p-3`}>
        <code className="font-mono text-xs">{token.utility}</code>
      </div>
      <div className="bg-ifa-white p-3">
        <div className="text-ifa-gray-900 font-mono text-xs">{token.name}</div>
        <div className="text-ifa-gray-500 mt-1 font-mono text-xs uppercase">{token.hex}</div>
      </div>
    </div>
  );
}

export default function DesignSystemPage() {
  if (process.env.NODE_ENV !== 'development') {
    notFound();
  }

  const totalTokens = COLOR_GROUPS.reduce((acc, group) => acc + group.tokens.length, 0);

  return (
    <main className="bg-ifa-navy-50 min-h-dvh px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10">
          <h1 className="text-ifa-navy-900 text-3xl font-bold tracking-tight">
            IFA Design System — Confianza
          </h1>
          <p className="text-ifa-gray-700 mt-2">
            Source of truth:{' '}
            <code className="font-mono text-sm">docs/genesis_docs/_IFA_SCAFFOLDING.md §5</code>.
            This page is dev-only and returns 404 in production.
          </p>
          <p className="text-ifa-gray-500 mt-1 text-sm">
            {totalTokens} color tokens · {RADII.length} radii · {SHADOWS.length} shadows · 1 focus
            ring
          </p>
        </header>

        <section className="mb-12 space-y-10">
          <h2 className="text-ifa-navy-900 text-xl font-semibold">Colors</h2>
          {COLOR_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-ifa-navy-800 text-lg font-semibold">{group.title}</h3>
              <p className="text-ifa-gray-500 mb-4 text-sm">{group.subtitle}</p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {group.tokens.map((token) => (
                  <Swatch key={token.name} token={token} />
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="mb-12">
          <h2 className="text-ifa-navy-900 mb-4 text-xl font-semibold">Border radii</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {RADII.map((r) => (
              <div
                key={r.name}
                className="bg-ifa-white shadow-ifa-card rounded-ifa-card p-4 text-center"
              >
                <div className={`bg-ifa-navy-700 mx-auto h-16 w-16 ${r.utility}`} aria-hidden />
                <div className="text-ifa-gray-900 mt-3 font-mono text-xs">{r.utility}</div>
                <div className="text-ifa-gray-500 font-mono text-xs">{r.value}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-ifa-navy-900 mb-4 text-xl font-semibold">Elevation (shadows)</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {SHADOWS.map((s) => (
              <div key={s.name} className={`bg-ifa-white rounded-ifa-card p-6 ${s.utility}`}>
                <div className="text-ifa-gray-900 font-mono text-xs">{s.utility}</div>
                <div className="text-ifa-gray-500 mt-1 text-sm">{s.description}</div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-ifa-navy-900 mb-4 text-xl font-semibold">Focus ring</h2>
          <p className="text-ifa-gray-700 mb-4 text-sm">
            Tab into the button below to see the global{' '}
            <code className="font-mono">:focus-visible</code> ring: 2px solid{' '}
            <code className="font-mono">--ifa-teal-500</code>, 2px offset.
          </p>
          <button
            type="button"
            className="bg-ifa-navy-700 text-ifa-white hover:bg-ifa-navy-600 rounded-ifa-button px-5 py-2 text-sm font-medium transition-colors"
          >
            Hazme foco con Tab
          </button>
        </section>
      </div>
    </main>
  );
}
