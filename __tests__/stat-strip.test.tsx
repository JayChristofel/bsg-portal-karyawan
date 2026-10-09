import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Activity, Clock } from 'lucide-react';

import { StatStrip } from '@/app/admin/components/ui';

/**
 * The strip replaced a row of metric cards. The regression that matters is a
 * label breaking onto a second line ("TOTAL RECIPIENTS" used to wrap inside a
 * narrow card), so the assertions check the label is rendered whole and the
 * nowrap guard is present on every label element.
 */

const ITEMS = [
  { label: 'Recipients', value: 1552, icon: Activity },
  { label: 'Pending', value: 1552, icon: Clock },
  { label: 'Forms', value: 12, hint: '4%' },
];

describe('StatStrip', () => {
  it('renders every label and value', () => {
    render(<StatStrip items={ITEMS} />);

    expect(screen.getByText('Recipients')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Forms')).toBeInTheDocument();
    expect(screen.getAllByText('1552')).toHaveLength(2);
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('never lets a label wrap onto a second line', () => {
    render(<StatStrip items={ITEMS} />);

    for (const label of ['Recipients', 'Pending', 'Forms']) {
      expect(screen.getByText(label).className).toContain('whitespace-nowrap');
    }
  });

  it('shows the hint only when data has loaded', () => {
    const { rerender } = render(<StatStrip items={ITEMS} loading />);
    expect(screen.queryByText('4%')).not.toBeInTheDocument();

    rerender(<StatStrip items={ITEMS} />);
    expect(screen.getByText('4%')).toBeInTheDocument();
  });
});