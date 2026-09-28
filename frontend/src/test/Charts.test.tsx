import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LanguageChart } from '../components/LanguageChart';
import { ActivityChart } from '../components/ActivityChart';

describe('metrics charts', () => {
  it('shows byte-based language percentages and exact values', () => {
    render(<LanguageChart languages={[{ name: 'Python', bytes: 300, percentage: 75 }, { name: 'TypeScript', bytes: 100, percentage: 25 }]} availability="available" />);
    expect(screen.getByRole('rowheader', { name: 'Python' })).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('300')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('rounds fractional percentage labels while keeping raw bar width and exact bytes', () => {
    render(<LanguageChart languages={[{ name: 'Python', bytes: 1, percentage: 100 / 3 }]} availability="available" />);
    expect(screen.getByText('33.33%')).toBeInTheDocument();
    expect(screen.queryByText(`${100 / 3}%`)).not.toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '1' })).toBeInTheDocument();
    expect(document.querySelector('.bar-fill')).toHaveStyle({ width: `${100 / 3}%` });
  });

  it.each(['empty', 'pending', 'unavailable'] as const)('explains %s language data', (availability) => {
    render(<LanguageChart languages={[]} availability={availability} />);
    expect(screen.getByTestId('language-state')).toHaveTextContent(availability === 'empty' ? /no language data/i : availability === 'pending' ? /being prepared/i : /unavailable/i);
  });

  it('renders a 12-week chart and exact table', () => {
    const activity = Array.from({ length: 12 }, (_, i) => ({ week_start: 1780000000 + i * 604800, commits: i }));
    render(<ActivityChart activity={activity} availability="available" onRefresh={vi.fn()} />);
    expect(screen.getByRole('img', { name: /weekly commits/i })).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(13);
    expect(screen.getByRole('cell', { name: '0' })).toBeInTheDocument();
  });

  it('shows pending activity and offers refresh', () => {
    const onRefresh = vi.fn();
    render(<ActivityChart activity={[]} availability="pending" onRefresh={onRefresh} />);
    expect(screen.getByText(/being prepared/i)).toBeInTheDocument();
    screen.getByRole('button', { name: /refresh/i }).click();
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});
