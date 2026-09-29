import { useLocale } from '../i18n';
import type { Analysis } from '../types';

function canonicalGitHubUrl(analysis: Analysis): string | null {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(analysis.full_name)) return null;
  const canonical = `https://github.com/${analysis.full_name}`;
  return analysis.url === canonical ? canonical : null;
}
export function Overview({ analysis }: { analysis: Analysis }) {
  const { t, number, date } = useLocale();
  const count = (value: number | null) => value === null ? t("Unavailable") : number(value);
  const link = canonicalGitHubUrl(analysis);
  return <section className="overview" aria-labelledby="repository-heading">
    <div className="section-eyebrow">{t("Repository overview")}</div>
    <div className="repository-heading-row">
      <h2 id="repository-heading">{link ? <a href={link} target="_blank" rel="noopener noreferrer">{analysis.full_name}<span aria-hidden="true" className="external-mark">↗</span></a> : analysis.full_name}</h2>
      <span className="repository-pill">{t("Public repository")}</span>
    </div>
    <p className="description">{analysis.description || t("No repository description provided.")}</p>
    <div className="meta-line"><span>{t("License:")} {analysis.license || t("Not detected")}</span><span>{t("Last push:")} {analysis.pushed_at ? date(analysis.pushed_at) : t("Unavailable")}</span></div>
    <div className="metric-grid">
      <div className="metric-card"><span>{t("Stars")}</span><strong>{count(analysis.stars)}</strong></div>
      <div className="metric-card"><span>{t("Forks")}</span><strong>{count(analysis.forks)}</strong></div>
      <div className="metric-card"><span>{t("Open issues")}</span><strong data-testid="issues-count">{count(analysis.open_issues)}</strong></div>
      <div className="metric-card"><span>{t("Open pull requests")}</span><strong data-testid="pull-requests-count">{count(analysis.open_pull_requests)}</strong></div>
    </div>
  </section>;
}
