import { useEffect, useRef, useState } from 'react';
import { analyzeRepository } from './api';
import { RepositoryForm } from './components/RepositoryForm';
import { Overview } from './components/Overview';
import { LanguageChart } from './components/LanguageChart';
import { ActivityChart } from './components/ActivityChart';
import type { Analysis } from './types';
import './styles.css';

function retrieved(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
}

export default function App() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const requestGeneration = useRef(0);
  const activeController = useRef<AbortController | null>(null);

  useEffect(() => () => { ++requestGeneration.current; activeController.current?.abort(); }, []);

  async function load(url: string, refresh = false) {
    const generation = ++requestGeneration.current;
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    if (!refresh) setAnalysis(null);
    setError('');
    setLoading(true);
    try {
      const result = await analyzeRepository(url, controller.signal);
      if (generation === requestGeneration.current) setAnalysis(result);
    } catch (cause) {
      if (generation === requestGeneration.current && !controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Repository analysis failed. Please try again.');
      }
    } finally {
      if (generation === requestGeneration.current) { setLoading(false); activeController.current = null; }
    }
  }

  return <div className="app-shell">
    <header className="site-header"><div className="brand"><span className="brand-mark" aria-hidden="true">R<span>◦</span></span><span>RepoLens</span></div><span className="header-caption">GITHUB REPOSITORY INTELLIGENCE</span></header>
    <main>
      <section className="hero"><div className="hero-copy"><div className="eyebrow">Public data, clear perspective</div><h1>See the story behind <em>the repository.</em></h1><p>Explore activity, language mix, and public signals in one focused view.</p></div><div className="hero-art" aria-hidden="true"><span className="art-ring ring-one"/><span className="art-ring ring-two"/><span className="art-center">R</span></div></section>
      <div className="search-card"><RepositoryForm onSubmit={url => void load(url)} loading={loading} /></div>
      {error && <div className="notice error-notice" role="alert">{error}</div>}
      {loading && <div className="loading-notice" role="status"><span className="spinner"/>Analyzing repository…</div>}
      {analysis ? <div className="results">
        <div className="results-head"><span className="eyebrow">Repository report</span><span className="retrieved">Retrieved {retrieved(analysis.retrieved_at)}</span></div>
        <Overview analysis={analysis} />
        {analysis.warnings.length > 0 && <div className="notice warning-notice" aria-label="Partial data warnings"><strong>Some data could not be retrieved</strong><ul>{analysis.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
        <div className="chart-grid"><LanguageChart languages={analysis.languages} availability={analysis.availability.languages} /><ActivityChart activity={analysis.activity} availability={analysis.availability.activity} onRefresh={() => void load(analysis.url, true)} /></div>
      </div> : !loading && !error && <div className="empty-prompt"><span aria-hidden="true">⌁</span><p>Your repository report will appear here.</p></div>}
    </main>
    <footer>RepoLens <span>·</span> Public GitHub data, retrieved on demand</footer>
  </div>;
}
