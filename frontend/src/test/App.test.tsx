import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { analyzeRepository, assessRepository } from '../api';
import { AssessmentPanel } from '../components/Assessment';
import { assessed, sample } from './fixtures';
import type { Analysis, Assessment } from '../types';

vi.mock('../api', () => ({ analyzeRepository: vi.fn(), assessRepository: vi.fn() }));
const analyze = vi.mocked(analyzeRepository);
const assess = vi.mocked(assessRepository);
const submit = async (url = sample.url) => {
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: /repository url/i }), url);
  await user.click(screen.getByRole('button', { name: /analyze repository/i }));
  return user;
};

beforeEach(() => { analyze.mockReset(); assess.mockReset(); });
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
    await act(async () => { requests[0](sample); });
    expect(screen.queryByRole('link', { name: sample.full_name })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'acme/new-repo' })).toBeInTheDocument();
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

describe('independent AI assessment', () => {
  it('explains unconfigured AI', () => {
    render(<AssessmentPanel repositoryUrl={sample.url} enabled={false} />);
    expect(screen.getByText(/AI assessment is not configured/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /assess project health/i })).toBeNull();
  });

  it('discloses data transfer and shows loading, score, evidence, limitations, and provenance', async () => {
    let finish!: (value: Assessment) => void;
    assess.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<AssessmentPanel repositoryUrl={sample.url} enabled />);
    expect(screen.getByText(/public metadata and a limited README excerpt/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /assess project health/i }));
    expect(assess).toHaveBeenCalledWith(sample.url, expect.any(AbortSignal));
    expect(screen.getByRole('status')).toHaveTextContent(/assessing/i);
    expect(screen.getByRole('button', { name: /assess project health/i })).toBeDisabled();
    await act(async () => { finish(assessed); });
    expect(screen.getByText('72/100')).toBeInTheDocument();
    expect(screen.getByText(/AI estimate/i)).toBeInTheDocument();
    expect(screen.getByText(/Maintenance \(40%\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Documentation \(35%\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Community \(25%\)/i)).toBeInTheDocument();
    expect(screen.getByText('Recent public activity.')).toBeInTheDocument();
    expect(screen.getByText('<script>unsafe</script> README text')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText('Private maintenance work is not visible.')).toBeInTheDocument();
    expect(screen.getByText(/Example AI.*example-model/i)).toBeInTheDocument();
    expect(document.querySelector('time')).toHaveAttribute('dateTime', assessed.assessed_at);
  });

  it('shows insufficient evidence without an overall number', async () => {
    assess.mockResolvedValue({ ...assessed, status: 'insufficient_evidence', overall_score: null,
      dimensions: { ...assessed.dimensions, maintenance: { ...assessed.dimensions.maintenance, score: null } } });
    render(<AssessmentPanel repositoryUrl={sample.url} enabled />);
    await userEvent.click(screen.getByRole('button', { name: /assess project health/i }));
    expect(await screen.findByText(/insufficient evidence/i)).toBeInTheDocument();
    expect(screen.queryByText('72/100')).toBeNull();
    expect(screen.getByText('Score unavailable')).toBeInTheDocument();
  });

  it('keeps repository metrics visible after an AI failure', async () => {
    analyze.mockResolvedValue({ ...sample, ai_available: true });
    assess.mockRejectedValue(new Error('AI provider is unavailable.'));
    render(<App />);
    await submit();
    await screen.findByRole('link', { name: sample.full_name });
    await userEvent.click(screen.getByRole('button', { name: /assess project health/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('AI provider is unavailable.');
    expect(screen.getByTestId('issues-count')).toHaveTextContent('0');
    expect(screen.getByRole('img', { name: /weekly commits/i })).toBeInTheDocument();
  });

  it('aborts and ignores stale assessment after repository changes', async () => {
    analyze.mockResolvedValueOnce({ ...sample, ai_available: true })
      .mockResolvedValueOnce({ ...sample, full_name: 'acme/new-repo', url: 'https://github.com/acme/new-repo', ai_available: true });
    let finish!: (value: Assessment) => void;
    let signal!: AbortSignal;
    assess.mockImplementation((_url, requestSignal) => { signal = requestSignal; return new Promise(resolve => { finish = resolve; }); });
    render(<App />);
    const user = await submit();
    await screen.findByRole('link', { name: sample.full_name });
    await user.click(screen.getByRole('button', { name: /assess project health/i }));
    await user.clear(screen.getByRole('textbox', { name: /repository url/i }));
    await submit('https://github.com/acme/new-repo');
    await screen.findByRole('link', { name: 'acme/new-repo' });
    await waitFor(() => expect(signal.aborted).toBe(true));
    await act(async () => { finish(assessed); });
    expect(screen.queryByText('72/100')).toBeNull();
    expect(screen.getByRole('button', { name: /assess project health/i })).toBeInTheDocument();
  });
});
