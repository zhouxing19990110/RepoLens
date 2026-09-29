# RepoLens first-version design

Status: Detailed specification approved by the user on 2026-09-28.

## Purpose and scope

RepoLens helps users inspect a public GitHub repository through a React dashboard served by a FastAPI backend. Users submit a repository URL, inspect factual metrics and charts, and optionally request an AI project-health assessment. GitHub and AI credentials stay on the backend.

The first version runs locally. It excludes accounts, private repositories, repository cloning, source-code quality analysis, persistent history, comparisons, and deployment. No database is required.

## User experience

The page contains a repository URL field and an Analyze button, followed by a loading state or actionable error. A successful result shows the repository name and link, description, license, last push time, stars, forks, open issues, and open pull requests. Missing licenses are labeled "Not detected" rather than interpreted as permission to reuse code.

A language chart shows byte-based percentages from GitHub, not percentages of files or lines of code. A commit chart shows weekly activity over the previous 12 completed weeks. Labels state the measurement and time window. Empty repositories and repositories without language data have explicit empty states.

An optional "Assess project health" action requests AI analysis after metrics load. Its loading and failure states do not replace or hide repository metrics. A successful assessment shows the overall score, dimension scores, reasons, evidence references, limitations, provider/model, and assessment time. The interface identifies the score as an AI estimate.

The page works on desktop and mobile, uses labeled inputs, keyboard-accessible controls, and provides textual values alongside charts. Only the most recently submitted repository may update the visible result.

## Architecture

- Frontend: React with TypeScript and Vite. Components cover URL submission, overview cards, charts, and assessment. A small typed API client handles backend requests and errors.
- Backend: FastAPI with separate routes, configuration, response schemas, GitHub client, repository aggregation, and AI assessment services.
- GitHub client: asynchronous HTTP requests with bounded timeouts and concurrency. All upstream requests target fixed GitHub API endpoints.
- Cache: bounded in-memory cache keyed by canonical owner/repository, with a five-minute lifetime for successful metrics. Process restarts clear the cache. Failed responses are not cached.
- AI client: server-configured OpenAI-compatible chat-completion endpoint, API key, and model. It is optional and uses a bounded timeout. The provider URL cannot be supplied by dashboard users.

Development uses Vite's proxy to reach FastAPI. CORS, when needed, is limited to configured local frontend origins. Secrets are loaded from environment variables; only placeholder configuration is checked in.

## Input and data flow

1. Accept HTTPS URLs on github.com with exactly an owner and repository path, allowing a trailing slash or .git suffix. Reject credentials, alternate hosts, nonstandard ports, query strings, fragments, and issue/tree/subdirectory URLs with a helpful message.
2. Normalize the identifier and fetch repository metadata from GitHub. Reject repositories identified as private even if a configured token can access them.
3. Fetch language bytes, separate open issue and pull-request counts, weekly commit activity, and README evidence. GitHub's combined open-issue count must never be mislabeled as issue-only.
4. Return normalized metrics, retrieval time, data availability, and warnings. Optional upstream failures produce partial results with unavailable values, never fabricated zeroes.
5. On the optional assessment request, the backend obtains its own metrics and README evidence, reusing the cache. It never trusts client-provided repository metrics as evidence.

GitHub statistics can be pending. In that case the chart reports "GitHub is preparing activity data" and offers a refresh; the server does not wait indefinitely. No commit activity is inferred from last-push time. README retrieval and processing are size-bounded, and raw HTML is never rendered.

## API contracts

- `GET /api/health`: service availability without secrets.
- `POST /api/repositories/analyze`: accepts `{ "url": "https://github.com/owner/repo" }`; returns repository identity, metadata, counts, language byte totals/percentages, weekly commit buckets, per-section availability, warnings, retrieval time, and whether AI is configured.
- `POST /api/repositories/assess`: accepts the same URL; returns repository identity, overall score, dimension scores and evidence, limitations, model, and assessment time. The request has no client-controlled provider configuration.

API schemas distinguish unavailable numbers from zero. Errors contain a stable code and a user-facing message. Invalid input returns 422; unavailable repositories return 404; upstream rate limits return 429 with retry guidance when available; unconfigured AI returns 503; upstream service failures return 502 or 504. Internal exception details, credentials, and raw provider responses are not exposed.

## AI scoring

The assessment measures adoption-oriented project health, not security, correctness, or source-code quality. Three dimensions use a documented rubric:

- Maintenance (40%): recent push and available weekly commit evidence, with recognition that stable projects may change infrequently.
- Documentation (35%): evidence of purpose, setup, usage, and contribution guidance in the README, plus detected license metadata.
- Community (25%): stars, forks, and issue/PR context; popularity and open counts alone do not prove quality or responsiveness.

The model returns structured dimension scores from 0 to 100, concise explanations, evidence identifiers, and limitations. The backend validates the structure, ranges, and evidence references and computes the weighted overall score itself, rounded to the nearest integer. Missing evidence is disclosed, not invented. If an entire dimension cannot be assessed, the result is marked insufficient evidence and no overall score is shown.

Repository text is untrusted evidence, never instructions. It is delimited and truncated before submission, and the model has no tools or access to secrets. Only the selected repository's public metadata and bounded README text are sent to the configured provider. The interface explains this next to the assessment action. Invalid model output produces an AI-specific error rather than a fallback score.

## Configuration and delivery

Backend configuration includes optional GITHUB_TOKEN and AI_API_KEY, AI_BASE_URL, and AI_MODEL. AI is disabled unless its required settings are supplied. No key is included in a frontend build variable or API response.

Deliverables include backend and frontend source, pinned dependency manifests or lockfiles, placeholder environment configuration, and a README with local setup, run instructions, scoring rubric, and known limitations. Provider choice and credentials are runtime configuration; the dashboard must function without AI credentials.

## Verification and acceptance

- Backend tests cover URL restrictions, normalization, private-repository rejection, separate issue/PR mapping, missing data, empty repositories, pending statistics, cache behavior, rate limits, and upstream failures using controlled HTTP fixtures.
- AI tests cover disabled configuration, malformed output, score bounds, evidence validation, missing dimensions, and deterministic weighted scoring. Tests use a stub provider and do not imply live model verification.
- Frontend validation covers input, loading, successful results, partial data, errors, and optional AI failure. Type checking and a production build must pass.
- Browser inspection checks a narrow and wide viewport, labels, chart readability, and stale-result handling.
- A live public GitHub check and live AI check are reported separately and run only when network access and relevant credentials are available. Unavailable live checks are explicitly reported, not replaced by claims based on fixtures.

Acceptance is a runnable local app that analyzes a public URL and displays truthful metrics and charts; the optional configured AI path returns a validated, explained project-health assessment without exposing credentials.
