# MiFi Design System — Claude Code Reference

> **App:** MiFi — "Tu Dinero, Bajo Control"
> **Platform:** Mobile-first (iOS/Android via Capacitor)
> **Language:** Spanish (Guatemala market)
> **Aesthetic:** Dark fintech with cyan/teal accents — premium, trust-forward, clean

---

## Color Palette

### Core Backgrounds

| Token             | Hex       | Usage                                |
| ----------------- | --------- | ------------------------------------ |
| `--bg-primary`    | `#0A0E1A` | App background, deepest layer        |
| `--bg-card`       | `#0F1629` | Cards, containers, elevated surfaces |
| `--bg-card-hover` | `#141C35` | Card hover/press states              |
| `--bg-input`      | `#1A2240` | Input fields, form elements          |
| `--bg-surface`    | `#111827` | Bottom nav bar, secondary surfaces   |

### Accent Colors

| Token                     | Hex                       | Usage                                                  |
| ------------------------- | ------------------------- | ------------------------------------------------------ |
| `--accent-primary`        | `#00E5FF`                 | CTAs, primary buttons, active tab icons, key metrics   |
| `--accent-primary-muted`  | `#00B8D4`                 | Secondary emphasis, progress bars, links               |
| `--accent-glow`           | `rgba(0, 229, 255, 0.15)` | Glow effects behind buttons, badge backgrounds         |
| `--accent-gradient-start` | `#00E5FF`                 | Gradient left/top                                      |
| `--accent-gradient-end`   | `#0077B6`                 | Gradient right/bottom — used on onboarding CTA buttons |

### Text Colors

| Token              | Hex       | Usage                                    |
| ------------------ | --------- | ---------------------------------------- |
| `--text-primary`   | `#FFFFFF` | Headlines, balances, primary content     |
| `--text-secondary` | `#8899B4` | Labels, descriptions, inactive nav text  |
| `--text-tertiary`  | `#4A5A7A` | Placeholders, disabled text              |
| `--text-accent`    | `#00E5FF` | Links, positive deltas, interactive text |

### Semantic Colors

| Token       | Hex       | Usage                                       |
| ----------- | --------- | ------------------------------------------- |
| `--success` | `#00E676` | Positive change indicators, completed goals |
| `--warning` | `#FFB300` | Soft warnings, approaching limits           |
| `--danger`  | `#FF5252` | Alerts, over-budget, errors                 |
| `--info`    | `#29B6F6` | Informational badges, tips                  |

### Category Colors (Spending Breakdown)

| Token                 | Hex       | Category        |
| --------------------- | --------- | --------------- |
| `--cat-food`          | `#00E5FF` | Comida          |
| `--cat-transport`     | `#7C4DFF` | Transporte      |
| `--cat-home`          | `#29B6F6` | Hogar           |
| `--cat-shopping`      | `#00E676` | Compras         |
| `--cat-entertainment` | `#FF5252` | Entretenimiento |

---

## Typography

### Font Stack

```
--font-display: 'Plus Jakarta Sans', sans-serif;   /* Headlines, balances, scores */
--font-body: 'Plus Jakarta Sans', sans-serif;       /* Body, labels, descriptions */
--font-mono: 'JetBrains Mono', monospace;           /* Account numbers, amounts */
```

> If Plus Jakarta Sans is unavailable, substitute with **Satoshi** or **General Sans**. Never use Inter, Roboto, or system defaults.

### Type Scale

| Role            | Size | Weight | Tracking | Example                                          |
| --------------- | ---- | ------ | -------- | ------------------------------------------------ |
| Balance / Hero  | 40px | 700    | -0.02em  | `Q 12,480.50`                                    |
| Screen Title    | 28px | 700    | -0.01em  | `Tu salud financiera`                            |
| Section Header  | 18px | 600    | 0        | `Gastos por categoría`                           |
| Card Title      | 16px | 600    | 0        | `Fondo de emergencia`                            |
| Body            | 14px | 400    | 0.01em   | Descriptions, labels                             |
| Caption / Label | 12px | 600    | 0.08em   | `BALANCE TOTAL`, `SCORE MIFI` — always uppercase |
| Small / Meta    | 11px | 400    | 0.04em   | Account numbers, dates                           |

### Key Conventions

- **Section labels** (`BALANCE TOTAL`, `TUS CUENTAS`, `COACH FINANCIERO`): always uppercase, `--text-secondary`, 12px, weight 600, letter-spacing 0.08em.
- **Monetary values**: weight 700, `--text-primary`. Decimal portion rendered at ~60% of integer size.
- **Percentages on goals**: colored by status — `--success` when on track, `--accent-primary` for neutral, `--danger` for behind.

---

## Layout & Spacing

### Spacing Scale (8px base)

```
--space-xs: 4px;
--space-sm: 8px;
--space-md: 16px;
--space-lg: 24px;
--space-xl: 32px;
--space-2xl: 48px;
```

### Screen Structure

```
┌─────────────────────────┐
│  Status Bar              │
│  Screen Header (24px px) │
│─────────────────────────│
│                          │
│  Scrollable Content      │
│  (16px horizontal pad)   │
│                          │
│                          │
│─────────────────────────│
│  Bottom Nav (56px h)     │
└─────────────────────────┘
```

- **Horizontal padding:** 16px (content area)
- **Card internal padding:** 16px–20px
- **Card gap (vertical):** 12px–16px
- **Bottom nav height:** 56px with safe area inset below
- **Card border-radius:** 16px
- **Button border-radius:** 12px (large CTAs), 8px (small actions)

---

## Component Patterns

### Cards

```css
.card {
  background: var(--bg-card);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  padding: 16px;
}
```

No drop shadows. Depth is communicated through background luminance steps and subtle 1px borders.

### Buttons

**Primary CTA (e.g., "Empezar", "Entrar"):**

```css
.btn-primary {
  background: linear-gradient(135deg, var(--accent-gradient-start), var(--accent-gradient-end));
  color: #0a0e1a;
  font-weight: 700;
  border-radius: 12px;
  padding: 16px;
  width: 100%;
}
```

**Ghost / Secondary (e.g., "Ya tengo una cuenta"):**

```css
.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  font-weight: 500;
}
```

### Quick Action Icons (Pagar, Recibir, Transferir, Ahorrar)

- Circular container: `48px`, background `var(--bg-card)`, border `1px solid rgba(255, 255, 255, 0.08)`
- Icon: 20px, stroke-only, `var(--accent-primary)`
- Label below: 12px, `--text-secondary`

### Progress Bars (Goals)

```css
.progress-track {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  height: 6px;
}
.progress-fill {
  border-radius: 4px;
  height: 6px;
  background: var(--accent-primary);
  /* Width set dynamically */
}
```

### Bottom Navigation

- 5 tabs: Inicio, Cuentas, Análisis, Metas, Tú
- Icons: 24px, stroke style
- Inactive: `var(--text-tertiary)`
- Active: `var(--accent-primary)` with label visible
- Active indicator: label color matches icon, no underline/pill — just color shift

### Score Ring (SCORE MIFI)

- SVG donut: 120px diameter, 8px stroke
- Track: `rgba(255, 255, 255, 0.08)`
- Fill: conic gradient `var(--accent-primary)` proportional to score
- Center: score number in 36px/700, `/100` in 14px/400 `--text-secondary`

---

## Iconography

- Style: **Outlined / stroke-only**, 1.5px–2px stroke weight
- Size: 20px (in-card), 24px (navigation)
- Source: Lucide, Phosphor, or Heroicons outline set
- Color: `var(--text-secondary)` default, `var(--accent-primary)` when active/interactive
- Category icons use a subtle tinted background circle: `rgba(category-color, 0.12)`, 36px

---

## Effects & Atmosphere

### Background Gradient (Onboarding / Splash)

```css
.bg-onboarding {
  background: radial-gradient(
    ellipse at 50% 40%,
    rgba(0, 119, 182, 0.25) 0%,
    rgba(10, 14, 26, 1) 70%
  );
}
```

### Glow Effect (Splash Logo, Orb)

The onboarding screen features a soft radial glow orb:

```css
.glow-orb {
  width: 240px;
  height: 240px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(0, 229, 255, 0.3) 0%,
    rgba(0, 119, 182, 0.15) 40%,
    transparent 70%
  );
  filter: blur(40px);
}
```

### Positive Delta Badge

```css
.delta-badge {
  background: rgba(0, 230, 118, 0.12);
  color: var(--success);
  border-radius: 20px;
  padding: 4px 12px;
  font-size: 13px;
  font-weight: 600;
}
```

### Warning Banner

```css
.warning-banner {
  background: var(--bg-card);
  border-left: 3px solid var(--warning);
  border-radius: 12px;
  padding: 12px 16px;
}
```

---

## Motion Guidelines

- **Transitions:** 200ms ease-out for interactive states (hover, press)
- **Page transitions:** 300ms slide-left (forward), slide-right (back)
- **Card entrance:** Staggered fade-up, 60ms delay between siblings, 400ms duration
- **Progress bars:** Animate width on mount, 600ms ease-out
- **Score ring:** Animate stroke-dashoffset on mount, 800ms ease-in-out
- **Avoid:** Bounce, spring physics, parallax — keep it banking-grade smooth

---

## Dark Mode Notes

This is a **dark-only** app. There is no light theme. All designs assume dark backgrounds. Ensure all text meets WCAG AA contrast against `--bg-primary` (minimum 4.5:1 for body, 3:1 for large text).

Contrast checks:

- `#FFFFFF` on `#0A0E1A` → 18.3:1 ✓
- `#8899B4` on `#0A0E1A` → 5.8:1 ✓
- `#4A5A7A` on `#0A0E1A` → 3.2:1 ✓ (large text / icons only)
- `#00E5FF` on `#0A0E1A` → 10.4:1 ✓

---

## File / Asset Naming Convention

```
icons/      → ic-{name}-{size}.svg          (e.g., ic-wallet-24.svg)
screens/    → screen-{name}.tsx             (e.g., screen-home.tsx)
components/ → {PascalName}.tsx              (e.g., ScoreRing.tsx)
tokens/     → tokens.css or tailwind.config (centralized variables)
```

---

## Quick Reference: Do & Don't

| Do                                        | Don't                                      |
| ----------------------------------------- | ------------------------------------------ |
| Use `--bg-card` for all elevated surfaces | Use box-shadow for depth                   |
| Keep labels uppercase + tracked out       | Mix casing styles for labels               |
| Tint category icons with low-opacity bg   | Use solid colored icon backgrounds         |
| Animate score ring and progress on mount  | Add decorative animations with no purpose  |
| Use cyan accent sparingly for emphasis    | Overuse accent on non-interactive elements |
| Maintain 16px horizontal content padding  | Vary padding per screen                    |
| Render decimals smaller than integers     | Use uniform sizing for money values        |
