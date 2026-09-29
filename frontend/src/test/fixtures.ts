import type { Analysis, Assessment } from '../types';

export const sample: Analysis = {
  full_name: 'octocat/Hello-World', url: 'https://github.com/octocat/Hello-World',
  description: 'A small sample repository', license: null, pushed_at: '2026-09-20T12:00:00Z',
  stars: 12, forks: 3, open_issues: 0, open_pull_requests: null,
  languages: [{ name: 'Python', bytes: 300, percentage: 75 }, { name: 'TypeScript', bytes: 100, percentage: 25 }],
  activity: Array.from({ length: 12 }, (_, i) => ({ week_start: 1780000000 + i * 604800, commits: i })),
  availability: { issues: 'available', pull_requests: 'unavailable', languages: 'available', activity: 'available', readme: 'available' },
  warnings: ['Pull request count unavailable.'], retrieved_at: '2026-09-28T01:00:00Z', ai_available: false,
};

export const assessed: Assessment = {
  language: 'en',
  full_name: sample.full_name, status: 'assessed', overall_score: 73,
  dimensions: {
    maintenance: { score: 80, explanation: 'Recent public activity.', evidence: ['metadata'] },
    documentation: { score: 70, explanation: 'README covers usage.', evidence: ['readme'] },
    community: { score: 65, explanation: 'Some public interest.', evidence: ['community'] },
  },
  evidence: { metadata: 'Pushed recently', readme: '<script>unsafe</script> README text', community: 'Open issues: 0.' },
  limitations: ['Private maintenance work is not visible.'], provider: 'Example AI', model: 'example-model',
  assessed_at: '2026-09-28T02:00:00Z',
};
