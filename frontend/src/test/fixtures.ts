import type { Analysis } from '../types';

export const sample: Analysis = {
  full_name: 'octocat/Hello-World', url: 'https://github.com/octocat/Hello-World',
  description: 'A small sample repository', license: null, pushed_at: '2026-09-20T12:00:00Z',
  stars: 12, forks: 3, open_issues: 0, open_pull_requests: null,
  languages: [{ name: 'Python', bytes: 300, percentage: 75 }, { name: 'TypeScript', bytes: 100, percentage: 25 }],
  activity: Array.from({ length: 12 }, (_, i) => ({ week_start: 1780000000 + i * 604800, commits: i })),
  availability: { issues: 'available', pull_requests: 'unavailable', languages: 'available', activity: 'available', readme: 'available' },
  warnings: ['Pull request count unavailable.'], retrieved_at: '2026-09-28T01:00:00Z', ai_available: false,
};
