import { useLocale } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { assessRepository } from '../api';
import type { Assessment } from '../types';

interface Props { repositoryUrl: string; enabled: boolean }
const dimensions = [
  { key: 'maintenance', label: 'Maintenance', weight: '40%' },
  { key: 'documentation', label: 'Documentation', weight: '35%' },
  { key: 'community', label: 'Community', weight: '25%' },
] as const;


export function AssessmentPanel({ repositoryUrl, enabled }: Props) {
  const { t, datetime, warning, errorMessage, language } = useLocale();
  const [result, setResult] = useState<Assessment | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);

  useEffect(() => () => { ++generation.current; controller.current?.abort(); }, []);
  useEffect(() => {
    ++generation.current;
    controller.current?.abort();
    controller.current = null;
    setResult(null);
    setError(null);
    setLoading(false);
  }, [repositoryUrl, enabled]);

  async function assess() {
    const current = ++generation.current;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const response = await assessRepository(repositoryUrl, request.signal, language);
      if (current === generation.current && !request.signal.aborted) setResult(response);
    } catch (cause) {
      if (current === generation.current && !request.signal.aborted) {
        setError(cause instanceof Error ? cause : new Error());
      }
    } finally {
      if (current === generation.current) { setLoading(false); controller.current = null; }
    }
  }

  return <section className="panel assessment-panel" aria-label={t("AI project health assessment")}>
    <div className="panel-heading"><div><span className="section-eyebrow">{t("Optional perspective")}</span><h3>{t("AI project health")}</h3></div></div>
    {!enabled ? <p className="state-copy">{t("AI assessment is not configured. Repository metrics are available above.")}</p> : <>
      <div className="assessment-action">
        <button type="button" onClick={() => void assess()} disabled={loading}>{t("Assess project health")}</button>
        <p>{t("Sends this repository's public metadata and a limited README excerpt to the configured AI provider.")}</p>
      </div>
      {loading && <p role="status" className="assessment-state">{t("Assessing project health\u2026")}</p>}
      {error && <p role="alert" className="assessment-error">{errorMessage(error, "AI assessment failed. Please try again.")}</p>}
      {result && <div className="assessment-result">
        {result.language !== language && <p className="notice" role="status">{t("This assessment is in another language. Assess again to generate it in the selected language.")}</p>}
        <div className="assessment-summary"><span className="assessment-label">{t("AI estimate")}</span>
          {result.status === 'assessed' && result.overall_score !== null
            ? <strong className="assessment-score">{result.overall_score}/100</strong>
            : <strong className="assessment-unavailable">{t("Insufficient evidence for an overall score")}</strong>}
        </div>
        <div className="assessment-dimensions">{dimensions.map(({ key, label, weight }) => {
          const dimension = result.dimensions[key];
          return <div className="assessment-dimension" key={key}>
            <div className="assessment-dimension-head"><h4>{t(label)} ({weight})</h4><strong>{dimension.score === null ? t("Score unavailable") : `${dimension.score}/100`}</strong></div>
            <p>{dimension.explanation}</p>
            {dimension.evidence.length > 0 && <details><summary>{t("Original evidence (source language)")}</summary><ul className="assessment-evidence">{dimension.evidence.map(id => <li key={id}><span className="evidence-id">{warning(id)}:</span> {result.evidence[id] ?? t("Evidence detail unavailable")}</li>)}</ul></details>}
          </div>;
        })}</div>
        {result.limitations.length > 0 && <div className="assessment-limitations"><h4>{t("Limitations")}</h4><ul>{result.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
        <p className="hint">{t("Assessment explanations follow the language selected when generated. Original evidence is preserved.")}</p><p className="assessment-provenance">{result.provider} · {result.model} · <time dateTime={result.assessed_at}>{datetime(result.assessed_at)}</time></p>
      </div>}
    </>}
  </section>;
}
