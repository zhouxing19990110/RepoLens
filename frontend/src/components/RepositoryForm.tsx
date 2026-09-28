import { useState, type FormEvent } from 'react';

interface Props { onSubmit: (url: string) => void; loading: boolean }
const GITHUB_REPO = /^https:\/\/github\.com\/[^\s/?#]+\/[^\s/?#]+\/?$/i;

export function RepositoryForm({ onSubmit, loading }: Props) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = url.trim();
    if (!GITHUB_REPO.test(candidate)) {
      setError('Enter a public GitHub URL in the form https://github.com/owner/repository.');
      return;
    }
    setError('');
    onSubmit(candidate);
  }

  return <form className="repository-form" onSubmit={submit} noValidate aria-busy={loading}>
    <label htmlFor="repository-url">Repository URL</label>
    <div className="form-row">
      <input id="repository-url" type="url" value={url} onChange={event => { setUrl(event.target.value); setError(''); }} placeholder="https://github.com/owner/repository" autoComplete="url" aria-invalid={!!error} aria-describedby={error ? 'url-error' : 'url-help'} />
      <button type="submit">Analyze repository</button>
    </div>
    {error ? <p id="url-error" className="field-error" role="alert">{error}</p> : <p id="url-help" className="hint">Public GitHub repositories only. Paste a URL to explore its public metrics.</p>}
  </form>;
}
