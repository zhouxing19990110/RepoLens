import { useLocale } from '../i18n';
import { useState, type FormEvent } from 'react';

interface Props { onSubmit: (url: string) => void; loading: boolean }
const GITHUB_REPO = /^https:\/\/github\.com\/[^\s/?#]+\/[^\s/?#]+\/?$/i;

export function RepositoryForm({ onSubmit, loading }: Props) {
  const { t } = useLocale();
  const [url, setUrl] = useState('');
  const [error, setError] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = url.trim();
    if (!GITHUB_REPO.test(candidate)) {
      setError(true);
      return;
    }
    setError(false);
    onSubmit(candidate);
  }

  return <form className="repository-form" onSubmit={submit} noValidate aria-busy={loading}>
    <label htmlFor="repository-url">{t("Repository URL")}</label>
    <div className="form-row">
      <input id="repository-url" type="url" value={url} onChange={event => { setUrl(event.target.value); setError(false); }} placeholder="https://github.com/owner/repository" autoComplete="url" aria-invalid={!!error} aria-describedby={error ? 'url-error' : 'url-help'} />
      <button type="submit">{t("Analyze repository")}</button>
    </div>
    {error ? <p id="url-error" className="field-error" role="alert">{t("Enter a public GitHub URL in the form https://github.com/owner/repository.")}</p> : <p id="url-help" className="hint">{t("Public GitHub repositories only. Paste a URL to explore its public metrics.")}</p>}
  </form>;
}
