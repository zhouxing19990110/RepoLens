import type { Availability, Language } from '../types';

interface Props { languages: Language[]; availability: Availability }
const message: Record<Availability, string> = {
  available: 'No language data returned.', empty: 'No language data for this repository.',
  pending: 'Language data is being prepared. Refresh to check again.', unavailable: 'Language data is unavailable right now.',
};
export function LanguageChart({ languages, availability }: Props) {
  const visible = availability === 'available' && languages.length > 0;
  return <section className="panel" aria-labelledby="languages-heading">
    <div className="panel-heading"><div><div className="section-eyebrow">Composition</div><h3 id="languages-heading">Languages</h3></div><span className="panel-note">Share of bytes</span></div>
    {!visible ? <p className="state-copy" data-testid="language-state">{message[availability]}</p> : <div className="chart-and-table">
      <div className="language-bars" aria-label="Language byte distribution">{languages.map((language, index) => <div className="language-bar-row" key={language.name}>
        <div className="language-label"><span>{language.name}</span><strong>{Number(language.percentage.toFixed(2))}%</strong></div>
        <div className="bar-track"><span className={`bar-fill color-${index % 5}`} style={{ width: `${Math.max(0, Math.min(100, language.percentage))}%` }} /></div>
      </div>)}</div>
      <div className="table-wrap"><table><caption>Exact language bytes</caption><thead><tr><th scope="col">Language</th><th scope="col">Bytes</th></tr></thead><tbody>{languages.map(language => <tr key={language.name}><th scope="row">{language.name}</th><td>{language.bytes.toLocaleString()}</td></tr>)}</tbody></table></div>
    </div>}
  </section>;
}
