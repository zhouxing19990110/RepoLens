import type { MessageKey } from '../messages';
import { useLocale } from '../i18n';
import type { Availability, CommitWeek } from '../types';

interface Props { activity: CommitWeek[]; availability: Availability; onRefresh: () => void }
const message: Record<Availability, MessageKey> = {
  available: 'No completed-week activity was returned.', empty: 'No commits in the last 12 completed weeks.',
  pending: 'Commit activity is being prepared by GitHub. Refresh to check again.', unavailable: 'Commit activity is unavailable right now.',
};
export function ActivityChart({ activity, availability, onRefresh }: Props) {
  const { t, number, week } = useLocale();
  const weeks = activity.slice(-12);
  const weekLabel = (seconds: number) => week(seconds * 1000);
  const visible = availability === 'available' && activity.length > 0;
  const max = Math.max(1, ...weeks.map(week => week.commits));
  return <section className="panel" aria-labelledby="activity-heading">
    <div className="panel-heading"><div><div className="section-eyebrow">{t("Momentum")}</div><h3 id="activity-heading">{t("Commit activity")}</h3></div><button className="text-button" type="button" onClick={onRefresh}>{t("Refresh")} <span aria-hidden="true">↗</span></button></div>
    <p className="panel-note">{t("Last 12 completed weeks \u00b7 UTC")}</p>
    {!visible ? <p className="state-copy">{t(message[availability])}</p> : <div className="chart-and-table">
      <div className="activity-graph"><svg role="img" aria-label={t("Weekly commits over the last 12 completed weeks")} viewBox="0 0 480 220" preserveAspectRatio="xMidYMid meet">
        {[0, 1, 2, 3].map(i => <line key={i} x1="26" x2="470" y1={180 - i * 50} y2={180 - i * 50} className="grid-line" />)}
        {weeks.map((week, index) => { const height = week.commits === 0 ? 0 : Math.max(3, (week.commits / max) * 148); const x = 32 + index * 37; return <g key={week.week_start}><title>{`${weekLabel(week.week_start)}: ${number(week.commits)} ${t("commits")}`}</title><rect x={x} y={180 - height} width="24" height={height} rx="3" className="activity-bar" /><text x={x + 12} y="204" textAnchor="middle" className="axis-label">{index % 2 === 0 ? weekLabel(week.week_start) : ''}</text></g>; })}
      </svg></div>
      <div className="table-wrap"><table><caption>{t("Exact weekly commits")}</caption><thead><tr><th scope="col">{t("Week of")}</th><th scope="col">{t("Commits")}</th></tr></thead><tbody>{weeks.map(week => <tr key={week.week_start}><th scope="row">{weekLabel(week.week_start)}</th><td>{number(week.commits)}</td></tr>)}</tbody></table></div>
    </div>}
  </section>;
}
