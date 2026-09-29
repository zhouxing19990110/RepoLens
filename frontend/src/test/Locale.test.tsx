import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../App';
import { LocaleProvider } from '../i18n';
import { ApiError } from '../apiError';
import { analyzeRepository, assessRepository } from '../api';
import { sample, assessed } from './fixtures';
import type { Analysis } from '../types';

vi.mock('../api', () => ({ analyzeRepository: vi.fn(), assessRepository: vi.fn() }));
const analyze = vi.mocked(analyzeRepository);
const assess = vi.mocked(assessRepository);
const mount = () => render(<LocaleProvider><App /></LocaleProvider>);
const language = () => screen.getByRole('combobox', { name: '语言 / Language' });
beforeEach(() => { localStorage.clear(); analyze.mockReset(); assess.mockReset(); });
afterEach(() => vi.restoreAllMocks());

it('defaults to Chinese and updates document language and title', () => {
  mount();
  expect(screen.getByRole('button', { name: '分析仓库' })).toBeInTheDocument();
  expect(document.documentElement.lang).toBe('zh-CN');
  expect(document.title).toBe('RepoLens · 仓库洞察');
});

it('persists English across remounts and supports returning to Chinese', async () => {
  const view = mount();
  await userEvent.selectOptions(language(), 'en');
  expect(screen.getByRole('button', { name: 'Analyze repository' })).toBeInTheDocument();
  expect(document.documentElement.lang).toBe('en');
  expect(document.title).toBe('RepoLens · Repository metrics');
  expect(localStorage.getItem('repolens.language')).toBe('en');
  view.unmount();
  mount();
  expect(language()).toHaveValue('en');
  await userEvent.selectOptions(language(), 'zh');
  expect(screen.getByRole('button', { name: '分析仓库' })).toBeInTheDocument();
});

it('falls back to Chinese for invalid preferences and works when storage is blocked', async () => {
  localStorage.setItem('repolens.language', 'fr');
  const view = mount();
  expect(language()).toHaveValue('zh');
  view.unmount();
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  mount();
  await userEvent.selectOptions(language(), 'en');
  expect(screen.getByRole('button', { name: 'Analyze repository' })).toBeInTheDocument();
});

it('translates pending and loaded metrics without restarting or aborting a request', async () => {
  let resolve!: (value: Analysis) => void;
  analyze.mockImplementation(() => new Promise(done => { resolve = done; }));
  mount();
  await userEvent.type(screen.getByRole('textbox', { name: '仓库地址' }), sample.url);
  await userEvent.click(screen.getByRole('button', { name: '分析仓库' }));
  expect(screen.getByRole('status')).toHaveTextContent('正在分析仓库');
  const signal = analyze.mock.calls[0][1];
  await userEvent.selectOptions(language(), 'en');
  expect(screen.getByRole('status')).toHaveTextContent('Analyzing repository');
  expect(signal.aborted).toBe(false);
  await act(async () => resolve(sample));
  expect(screen.getByTestId('pull-requests-count')).toHaveTextContent('Unavailable');
  await userEvent.selectOptions(language(), 'zh');
  expect(screen.getByTestId('pull-requests-count')).toHaveTextContent('暂不可用');
  expect(screen.getByRole('table', { name: '各语言字节数' })).toBeInTheDocument();
  expect(screen.getByRole('table', { name: '每周提交数' })).toBeInTheDocument();
  expect(screen.getByText('AI 评估尚未配置，仍可查看上方仓库指标。')).toBeInTheDocument();
  expect(screen.getByText(sample.description!)).toBeInTheDocument();
  expect(analyze).toHaveBeenCalledTimes(1);
});

it('translates existing validation and API errors when language changes', async () => {
  analyze.mockRejectedValue(new ApiError('upstream_rate_limited', 'GitHub rate limit reached.', 120));
  mount();
  const input = screen.getByRole('textbox', { name: '仓库地址' });
  await userEvent.type(input, 'https://example.com/a/b');
  await userEvent.click(screen.getByRole('button', { name: '分析仓库' }));
  expect(screen.getByRole('alert')).toHaveTextContent('请输入公开的 GitHub 仓库地址');
  await userEvent.selectOptions(language(), 'en');
  expect(screen.getByRole('alert')).toHaveTextContent('Enter a public GitHub URL');
  await userEvent.clear(input);
  await userEvent.type(input, sample.url);
  await userEvent.click(screen.getByRole('button', { name: 'Analyze repository' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('GitHub rate limit reached');
  await userEvent.selectOptions(language(), 'zh');
  expect(screen.getByRole('alert')).toHaveTextContent('GitHub 请求额度已用尽');
  expect(screen.getByRole('alert')).toHaveTextContent('120');
});

it('keeps AI results and source evidence intact while translating panel labels', async () => {
  analyze.mockResolvedValue({ ...sample, ai_available: true });
  assess.mockResolvedValue(assessed);
  mount();
  await userEvent.type(screen.getByRole('textbox', { name: '仓库地址' }), sample.url);
  await userEvent.click(screen.getByRole('button', { name: '分析仓库' }));
  await userEvent.click(await screen.findByRole('button', { name: '评估项目健康度' }));
  expect(await screen.findByText('73/100')).toBeInTheDocument();
  expect(screen.getByText('维护情况 (40%)')).toBeInTheDocument();
  await userEvent.selectOptions(language(), 'en');
  expect(screen.getByText('Maintenance (40%)')).toBeInTheDocument();
  expect(screen.getByText('73/100')).toBeInTheDocument();
  expect(screen.getByText(assessed.dimensions.maintenance.explanation)).toBeInTheDocument();
  expect(assess).toHaveBeenCalledTimes(1);
});

it('explains a backend outage in both languages', async () => {
  analyze.mockRejectedValue(new ApiError('service_unavailable', 'The analysis service is unavailable. Check that the backend is running.'));
  mount();
  await userEvent.type(screen.getByRole('textbox', { name: '仓库地址' }), sample.url);
  await userEvent.click(screen.getByRole('button', { name: '分析仓库' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('分析服务暂不可用，请检查后端服务是否运行。');
  await userEvent.selectOptions(language(), 'en');
  expect(screen.getByRole('alert')).toHaveTextContent('Check that the backend is running.');
});

it('requests Chinese assessment prose and explains when the selected language differs', async () => {
  analyze.mockResolvedValue({ ...sample, ai_available: true });
  assess.mockResolvedValue({ ...assessed, language: 'zh', limitations: ['仅依据公开数据。'], dimensions: {
    ...assessed.dimensions, maintenance: { ...assessed.dimensions.maintenance, explanation: '近期仍有公开维护活动。' },
  } });
  mount();
  await userEvent.type(screen.getByRole('textbox', { name: '仓库地址' }), sample.url);
  await userEvent.click(screen.getByRole('button', { name: '分析仓库' }));
  await userEvent.click(await screen.findByRole('button', { name: '评估项目健康度' }));
  expect(await screen.findByText('近期仍有公开维护活动。')).toBeInTheDocument();
  expect(screen.getByText('仅依据公开数据。')).toBeInTheDocument();
  expect(assess).toHaveBeenCalledWith(sample.url, expect.any(AbortSignal), 'zh');
  await userEvent.selectOptions(language(), 'en');
  expect(screen.getByRole('status')).toHaveTextContent('Assess again');
  expect(assess).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('button', { name: 'Assess project health' }));
  expect(assess).toHaveBeenLastCalledWith(sample.url, expect.any(AbortSignal), 'en');
});
