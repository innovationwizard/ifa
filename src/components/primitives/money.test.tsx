import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Money } from './money';

describe('<Money />', () => {
  it('renders a positive GTQ amount with thousands separator and two decimals', () => {
    render(<Money amount={1234.56} />);
    expect(screen.getByText('Q 1,234.56')).toBeInTheDocument();
  });

  it('renders zero correctly', () => {
    render(<Money amount={0} />);
    expect(screen.getByText('Q 0.00')).toBeInTheDocument();
  });

  it('renders negative amounts with parentheses (Latin-American accounting)', () => {
    render(<Money amount={-1234.56} />);
    expect(screen.getByText('(Q 1,234.56)')).toBeInTheDocument();
  });

  it('renders USD with the dollar symbol', () => {
    render(<Money amount={9876.5} currency="USD" />);
    expect(screen.getByText('$9,876.50')).toBeInTheDocument();
  });

  it('prefixes a plus sign when showSign is true and amount is positive', () => {
    render(<Money amount={500} showSign />);
    expect(screen.getByText('+Q 500.00')).toBeInTheDocument();
  });

  it('does not double-prefix negative amounts when showSign is true', () => {
    render(<Money amount={-500} showSign />);
    expect(screen.getByText('(Q 500.00)')).toBeInTheDocument();
  });

  it('handles large amounts with multiple grouping separators', () => {
    render(<Money amount={1234567.89} />);
    expect(screen.getByText('Q 1,234,567.89')).toBeInTheDocument();
  });

  it('applies the tabular-nums class so decimals align in columns', () => {
    render(<Money amount={42} />);
    const el = screen.getByText('Q 42.00');
    expect(el).toHaveClass('tabular-nums');
    expect(el).toHaveClass('font-mono');
  });

  it('sets data-negative attribute only when amount is negative', () => {
    const { rerender } = render(<Money amount={100} />);
    expect(screen.getByText('Q 100.00')).not.toHaveAttribute('data-negative');
    rerender(<Money amount={-100} />);
    expect(screen.getByText('(Q 100.00)')).toHaveAttribute('data-negative', 'true');
  });

  it('always renders exactly two decimal places', () => {
    render(<Money amount={1.005} />);
    // 1.005 rounds to 1.00 or 1.01 depending on float/Intl — either is acceptable,
    // what matters is that we get exactly two decimal digits.
    expect(screen.getByText(/^Q 1\.(00|01)$/)).toBeInTheDocument();
  });
});
