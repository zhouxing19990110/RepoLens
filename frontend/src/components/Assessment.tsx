import { useEffect, useRef, useState } from 'react';
import { assessRepository } from '../api';
import type { Assessment } from '../types';

interface Props { repositoryUrl: string; enabled: boolean }
const dimensions = [
  { key: 'maintenance', label: 'Maintenance', weight: '40%' },
  { key: 'documentation', label: 'Documentation', weight: '35%' },
  { key: 'community', label: 'Community', weight: '25%' },
] as const;

function assessedAt(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
}

export function AssessmentPanel({ repositoryUrl, enabled }: Props) {
  const [result, setResult] = useState<Assessment | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);

  useEffect(() => () => { ++generation.current; controller.current?.abort(); }, []);
  useEffect(() => {
    ++generation.current;
    controller.current?.abort();
    controller.current = null;
    setResult(null);
    setError('');
    setLoading(false);
  }, [repositoryUrl, enabled]);

  async function assess() {
    const current = ++generation.current;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const response = await assessRepository(repositoryUrl, request.signal);
      if (current === generation.current && !request.signal.aborted) setResult(response);
    } catch (cause) {
      if (current === generation.current && !request.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'AI assessment failed. Please try again.');
      }
    } finally {
      if (current === generation.current) { setLoading(false); controller.current = null; }
    }
  }

  return <section className="panel assessment-panel" aria-label="AI project health assessment">
    <div className="panel-heading"><div><span className="section-eyebrow">Optional perspective</span><h3>AI project health</h3></div></div>
    {!enabled ? <p className="state-copy">AI assessment is not configured. Repository metrics are available above.</p> : <>
      <div className="assessment-action">
        <button type="button" onClick={() => void assess()} disabled={loading}>Assess project health</button>
        <p>Sends this repository&apos;s public metadata and a limited README excerpt to the configured AI provider.</p>
      </div>
      {loading && <p role="status" className="assessment-state">Assessing project health…</p>}
      {error && <p role="alert" className="assessment-error">{error}</p>}
      {result && <div className="assessment-result">
        <div className="assessment-summary"><span className="assessment-label">AI estimate</span>
          {result.status === 'assessed' && result.overall_score !== null
            ? <strong className="assessment-score">{result.overall_score}/100</strong>
            : <strong className="assessment-unavailable">Insufficient evidence for an overall score</strong>}
        </div>
        <div className="assessment-dimensions">{dimensions.map(({ key, label, weight }) => {
          const dimension = result.dimensions[key];
          return <div className="assessment-dimension" key={key}>
            <div className="assessment-dimension-head"><h4>{label} ({weight})</h4><strong>{dimension.score === null ? 'Score unavailable' : `${dimension.score}/100`}</strong></div>
            <p>{dimension.explanation}</p>
            {dimension.evidence.length > 0 && <ul className="assessment-evidence">{dimension.evidence.map(id => <li key={id}><span className="evidence-id">{id.replaceAll('_', ' ')}:</span> {result.evidence[id] ?? 'Evidence detail unavailable'}</li>)}</ul>}
          </div>;
        })}</div>
        {result.limitations.length > 0 && <div className="assessment-limitations"><h4>Limitations</h4><ul>{result.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
        <p className="assessment-provenance">{result.provider} · {result.model} · <time dateTime={result.assessed_at}>{assessedAt(result.assessed_at)}</time></p>
      </div>}
    </>}
  </section>;
}
