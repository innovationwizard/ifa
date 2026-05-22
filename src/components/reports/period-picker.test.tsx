import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

const replace = vi.fn();
let currentParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  usePathname: () => '/reportes/flujo',
  useRouter: () => ({ replace }),
  useSearchParams: () => currentParams,
}));

import { PeriodPicker } from './period-picker';

const MESSAGES = {
  reports: {
    period: {
      label: 'Periodo',
      month: 'Mes',
      threeMonths: '3 meses',
      sixMonths: '6 meses',
      year: 'Año',
      custom: 'Personalizado',
    },
  },
};

function renderPicker(current: '1m' | '3m' | '6m' | '12m' | 'custom' = '6m') {
  return render(
    <NextIntlClientProvider locale="es-GT" messages={MESSAGES} timeZone="America/Guatemala">
      <PeriodPicker current={current} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  replace.mockReset();
  currentParams = new URLSearchParams();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('<PeriodPicker />', () => {
  it('renders the four preset options + their Spanish labels', () => {
    renderPicker('6m');
    expect(screen.getByRole('button', { name: 'Mes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3 meses' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '6 meses' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Año' })).toBeInTheDocument();
  });

  it('marks the active button with aria-pressed=true', () => {
    renderPicker('3m');
    expect(screen.getByRole('button', { name: '3 meses' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '6 meses' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('writes ?period=<key> to the URL when a different preset is clicked', () => {
    renderPicker('6m');
    fireEvent.click(screen.getByRole('button', { name: '3 meses' }));
    expect(replace).toHaveBeenCalledWith('/reportes/flujo?period=3m', { scroll: false });
  });

  it('clicking the already-active preset is a no-op', () => {
    renderPicker('6m');
    fireEvent.click(screen.getByRole('button', { name: '6 meses' }));
    expect(replace).not.toHaveBeenCalled();
  });

  it('strips leftover from/to when switching from custom to a preset', () => {
    currentParams = new URLSearchParams('period=custom&from=2026-01-01&to=2026-02-28');
    renderPicker('custom');
    fireEvent.click(screen.getByRole('button', { name: 'Mes' }));
    expect(replace).toHaveBeenCalledTimes(1);
    const [url] = replace.mock.calls[0] as [string, unknown];
    expect(url).toBe('/reportes/flujo?period=1m');
    expect(url).not.toContain('from=');
    expect(url).not.toContain('to=');
  });

  it('renders a visible "Personalizado" pill only when current=custom', () => {
    const { rerender } = renderPicker('6m');
    expect(screen.queryByText('Personalizado')).not.toBeInTheDocument();
    rerender(
      <NextIntlClientProvider locale="es-GT" messages={MESSAGES} timeZone="America/Guatemala">
        <PeriodPicker current="custom" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText('Personalizado')).toBeInTheDocument();
  });
});
