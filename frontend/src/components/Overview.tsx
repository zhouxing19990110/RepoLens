import type { Analysis } from '../types';

function canonicalGitHubUrl(analysis: Analysis): string | null {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(analysis.full_name)) return null;
  const canonical = `https://github.com/${analysis.full_name}`;
  return analysis.url === canonical ? canonical : null;
}
const count = (value: number | null) => value === null ? 'Unavailable' : value.toLocaleString();
const date = (value: string | null) => value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'Unavailable';

export function Overview({ analysis }: { analysis: Analysis }) {
  const link = canonicalGitHubUrl(analysis);
  return <section className="overview" aria-labelledby="repository-heading">
    <div className="section-eyebrow">Repository overview</div>
    <div className="repository-heading-row">
      <h2 id="repository-heading">{link ? <a href={link} target="_blank" rel="noopener noreferrer">{analysis.full_name}<span aria-hidden="true" className="external-mark">↗</span></a> : analysis.full_name}</h2>
      <span className="repository-pill">Public repository</span>
    </div>
    <p className="description">{analysis.description || 'No repository description provided.'}</p>
    <div className="meta-line"><span>License: {analysis.license || 'Not detected'}</span><span>Last push: {date(analysis.pushed_at)}</span></div>
    <div className="metric-grid">
      <div className="metric-card"><span>Stars</span><strong>{count(analysis.stars)}</strong></div>
      <div className="metric-card"><span>Forks</span><strong>{count(analysis.forks)}</strong></div>
      <div className="metric-card"><span>Open issues</span><strong data-testid="issues-count">{count(analysis.open_issues)}</strong></div>
      <div className="metric-card"><span>Open pull requests</span><strong data-testid="pull-requests-count">{count(analysis.open_pull_requests)}</strong></div>
    </div>
  </section>;
}
