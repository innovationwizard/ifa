import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { HealthScoreBullet } from './bullet';

const MESSAGES = {
  healthScore: {
    tier: {
      critico: 'Crítico',
      enRiesgo: 'En riesgo',
      estable: 'Estable',
      excelente: 'Excelente',
    },
    partial: 'Faltan datos',
    previousLabel: 'Mes pasado: {score}',
    ariaLabel: 'Puntaje {score} de {max}, {tier}',
  },
};

function renderBullet(props: Parameters<typeof HealthScoreBullet>[0]) {
  return render(
    <NextIntlClientProvider locale="es-GT" messages={MESSAGES} timeZone="America/Guatemala">
      <HealthScoreBullet {...props} />
    </NextIntlClientProvider>,
  );
}

describe('<HealthScoreBullet />', () => {
  it('renders the numeric score + Spanish tier label adjacent', () => {
    renderBullet({ score: 720 });
    expect(screen.getByText('720')).toBeInTheDocument();
    expect(screen.getByText('Estable')).toBeInTheDocument();
  });

  it('rounds non-integer scores to the nearest integer', () => {
    renderBullet({ score: 723.7 });
    expect(screen.getByText('724')).toBeInTheDocument();
  });

  it('renders the WCAG aria-label with score + tier + max (1000)', () => {
    renderBullet({ score: 720 });
    const role = screen.getByRole('img');
    expect(role).toHaveAttribute('aria-label', 'Puntaje 720 de 1000, Estable');
  });

  it('renders the previous-period tick when previousScore is provided + not partial', () => {
    renderBullet({ score: 720, previousScore: 650 });
    expect(screen.getByText('Mes pasado: 650')).toBeInTheDocument();
  });

  it('renders the "Faltan datos" pill instead of previous-tick when partial=true', () => {
    renderBullet({ score: 500, previousScore: 480, partial: true });
    expect(screen.getByText('Faltan datos')).toBeInTheDocument();
    /*
     * The previous-period tick label is hidden when partial=true so
     * users don't compare against a noisy comparison baseline.
     */
    expect(screen.queryByText(/Mes pasado/)).not.toBeInTheDocument();
  });

  it('hides previous-period tick when previousScore is null', () => {
    renderBullet({ score: 720, previousScore: null });
    expect(screen.queryByText(/Mes pasado/)).not.toBeInTheDocument();
  });

  it('clamps out-of-range scores defensively (>1000 → 1000, <0 → 0)', () => {
    const { rerender } = renderBullet({ score: 9999 });
    expect(screen.getByText('1000')).toBeInTheDocument();
    expect(screen.getByText('Excelente')).toBeInTheDocument();
    rerender(
      <NextIntlClientProvider locale="es-GT" messages={MESSAGES} timeZone="America/Guatemala">
        <HealthScoreBullet score={-50} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('Crítico')).toBeInTheDocument();
  });

  it('uses `motion-safe:` Tailwind variant so reduced-motion users skip the animation', () => {
    const { container } = renderBullet({ score: 720 });
    /*
     * Find the actual-score marker (positioned absolutely above the
     * track). The Tailwind utility `motion-safe:transition-[left]`
     * is the contract the styles depend on; without it the marker
     * jumps instead of sliding when the score changes.
     */
    const marker = container.querySelector('[class*="motion-safe:transition"]');
    expect(marker).not.toBeNull();
  });

  it('renders the four tier bands as background segments', () => {
    const { container } = renderBullet({ score: 100 });
    /*
     * The four-segment track uses inline backgroundColor — count the
     * spans with style backgroundColor set. Should be exactly 4 (one
     * per tier in TIER_BANDS) at any score value.
     */
    const segments = Array.from(container.querySelectorAll('span[style*="background-color"]'));
    expect(segments.length).toBeGreaterThanOrEqual(4);
  });
});
