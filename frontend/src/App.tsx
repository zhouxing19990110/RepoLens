import { useLocale } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { analyzeRepository } from './api';
import { RepositoryForm } from './components/RepositoryForm';
import { Overview } from './components/Overview';
import { LanguageChart } from './components/LanguageChart';
import { ActivityChart } from './components/ActivityChart';
import { AssessmentPanel } from './components/Assessment';
import type { Analysis } from './types';
import './styles.css';


export default function App() {
  const { t, datetime, warning: warningText, errorMessage, language, setLanguage } = useLocale();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<Error | null>(null);
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
    setError(null);
    setLoading(true);
    try {
      const result = await analyzeRepository(url, controller.signal);
      if (generation === requestGeneration.current) setAnalysis(result);
    } catch (cause) {
      if (generation === requestGeneration.current && !controller.signal.aborted) {
        setError(cause instanceof Error ? cause : new Error());
      }
    } finally {
      if (generation === requestGeneration.current) { setLoading(false); activeController.current = null; }
    }
  }

  return <div className="app-shell">
    <header className="site-header"><div className="brand"><span className="brand-mark" aria-hidden="true">R<span>◦</span></span><span>RepoLens</span></div><div className="header-tools"><span className="header-caption">{t("GITHUB REPOSITORY INTELLIGENCE")}</span><select className="language-select" aria-label="语言 / Language" value={language} onChange={event => setLanguage(event.target.value === "en" ? "en" : "zh")}><option value="zh">中文</option><option value="en">English</option></select></div></header>
    <main>
      <section className="hero"><div className="hero-copy"><div className="eyebrow">{t("Public data, clear perspective")}</div><h1>{t("See the story behind ")}<em>{t("the repository.")}</em></h1><p>{t("Explore activity, language mix, and public signals in one focused view.")}</p></div><div className="hero-art" aria-hidden="true"><span className="art-ring ring-one"/><span className="art-ring ring-two"/><span className="art-center">R</span></div></section>
      <div className="search-card"><RepositoryForm onSubmit={url => void load(url)} loading={loading} /></div>
      {error && <div className="notice error-notice" role="alert">{errorMessage(error, "Repository analysis failed. Please try again.")}</div>}
      {loading && <div className="loading-notice" role="status"><span className="spinner"/>{t("Analyzing repository\u2026")}</div>}
      {analysis ? <div className="results">
        <div className="results-head"><span className="eyebrow">{t("Repository report")}</span><span className="retrieved">{t("Retrieved")} {datetime(analysis.retrieved_at)}</span></div>
        <Overview analysis={analysis} />
        {analysis.warnings.length > 0 && <div className="notice warning-notice" aria-label={t("Partial data warnings")}><strong>{t("Some data could not be retrieved")}</strong><ul>{analysis.warnings.map((warning, index) => <li key={index}>{warningText(warning)}</li>)}</ul></div>}
        <div className="chart-grid"><LanguageChart languages={analysis.languages} availability={analysis.availability.languages} /><ActivityChart activity={analysis.activity} availability={analysis.availability.activity} onRefresh={() => void load(analysis.url, true)} /></div>
        <AssessmentPanel key={analysis.full_name} repositoryUrl={analysis.url} enabled={analysis.ai_available} />
      </div> : !loading && !error && <div className="empty-prompt"><span aria-hidden="true">⌁</span><p>{t("Your repository report will appear here.")}</p></div>}
    </main>
    <footer>RepoLens <span>·</span> {t("Public GitHub data, retrieved on demand")}</footer>
  </div>;
}
