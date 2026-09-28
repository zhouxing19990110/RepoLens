import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { analyzeRepository } from '../api';
import { sample } from './fixtures';
import type { Analysis } from '../types';

vi.mock('../api', () => ({ analyzeRepository: vi.fn() }));
const analyze = vi.mocked(analyzeRepository);
const submit = async (url = sample.url) => {
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: /repository url/i }), url);
  await user.click(screen.getByRole('button', { name: /analyze repository/i }));
  return user;
};

beforeEach(() => { analyze.mockReset(); });
describe('repository workflow', () => {
  it('submits, shows loading, then metadata and zero versus null counts', async () => {
    let finish!: (value: Analysis) => void;
    analyze.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<App />);
    await submit();
    expect(analyze).toHaveBeenCalledWith(sample.url, expect.any(AbortSignal));
    expect(screen.getByText(/analyzing repository/i)).toBeInTheDocument();
    finish(sample);
    expect(await screen.findByRole('link', { name: sample.full_name })).toHaveAttribute('href', sample.url);
    expect(screen.getByText(sample.description!)).toBeInTheDocument();
    expect(screen.getByText(/license not specified/i)).toBeInTheDocument();
    expect(screen.getByTestId('issues-count')).toHaveTextContent('0');
    expect(screen.getByTestId('pull-requests-count')).toHaveTextContent('Unavailable');
    expect(screen.getByText(/pull request count unavailable/i)).toBeInTheDocument();
  });

  it('rejects invalid input before requesting and shows API errors', async () => {
    analyze.mockRejectedValue(new Error('Repository could not be found.'));
    render(<App />);
    await submit('https://example.com/not-github');
    expect(analyze).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/github.com\/owner\/repository/i);
    const user = userEvent.setup();
    await user.clear(screen.getByRole('textbox', { name: /repository url/i }));
    await submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Repository could not be found.');
  });

  it('keeps the newest result if an older request resolves later', async () => {
    const requests: Array<(value: Analysis) => void> = [];
    analyze.mockImplementation(() => new Promise(resolve => { requests.push(resolve); }));
    render(<App />);
    const user = await submit();
    await user.clear(screen.getByRole('textbox', { name: /repository url/i }));
    await submit('https://github.com/acme/new-repo');
    expect(requests).toHaveLength(2);
    requests[1]({ ...sample, full_name: 'acme/new-repo', url: 'https://github.com/acme/new-repo' });
    expect(await screen.findByRole('link', { name: 'acme/new-repo' })).toBeInTheDocument();
    requests[0](sample);
    await waitFor(() => expect(screen.queryByRole('link', { name: sample.full_name })).not.toBeInTheDocument());
  });

  it('refreshes pending activity and retains it until the new result arrives', async () => {
    let finish!: (value: Analysis) => void;
    analyze.mockResolvedValueOnce({ ...sample, activity: [], availability: { ...sample.availability, activity: 'pending' } });
    analyze.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<App />);
    await submit();
    await screen.findByText(/being prepared/i);
    await userEvent.click(screen.getByRole('button', { name: /refresh/i }));
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/being prepared/i)).toBeInTheDocument();
    finish(sample);
    expect(await screen.findByRole('img', { name: /weekly commits/i })).toBeInTheDocument();
  });
});
