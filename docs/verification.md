# Verification

Date: 2026-09-28 (Asia/Shanghai). This page separates deterministic checks from actual browser and upstream checks. Commands assume the repository root unless the table says `frontend`. Local verification used Python 3.10.4, bundled Node 24.19.0, and npm 12.1.0.

| Check | Command | Result |
| --- | --- | --- |
| Backend | `.\.venv\Scripts\python.exe -m pytest backend/tests -q` | **88 passed**, 1 dependency warning; no failures. |
| Frontend tests | `npm test` in `frontend` | **21 passed** across 3 files. |
| TypeScript | `npm run typecheck` in `frontend` | Passed. |
| Frontend build | `npm run build` in `frontend` | Passed; Vite 7.1.7 built 35 modules. |

The backend warning comes from FastAPI's test client importing Starlette's deprecated `httpx` integration. It does not affect these test results. On this verification host, Node 24.19.0 was bundled without `npm` on `PATH`; the same npm 12.1.0 CLI was invoked with that Node executable to run the three frontend commands. On a normal Node installation, use the commands shown in the table.

## Repaired cases and offline evidence

The first live GitHub request through the app returned a sanitized 502 because inherited proxy settings caused `httpx` connection failure on this host. A direct diagnostic request to the same GitHub endpoint returned HTTP 200 with `trust_env=False`. The app's GitHub and AI lifecycle clients now use `trust_env=False` while retaining TLS verification. A lifecycle regression test checks this setting on both clients. The missing-license label now reads **Not detected**. The frontend assessment fixture now uses the backend's `metadata`, `readme`, and `community` evidence IDs; its weighted score is **73** for 80/70/65. The community evidence string matches the backend's open-count format. Malformed server-configured AI URLs, including an empty trailing `?` or `#`, now disable assessment before any GitHub fetch; route tests check this behavior.

The automated suite covers URL validation, GitHub response mappings, partial and pending data, cache timing, evidence and weighted score validation, route errors, frontend request races, charts, and AI disabled/error states. Mocked transport and fixture values in these tests are **offline evidence**, not claims about live GitHub or an AI provider.

## Actual browser inspection

At **2026-09-28 06:39:52 UTC**, Chrome headless via Playwright rendered the local frontend at `http://127.0.0.1:5173` with **intercepted API fixtures** at 1440×1000 and 375×812. The checked interactions passed: keyboard focus and Enter submission, loading, zero versus unavailable counts, both exact-value tables, 75% byte share, pending activity Refresh, input and 404 errors, AI-disabled state, AI error retaining metrics, scored dimensions and provenance, and insufficient evidence without an overall number. A README string containing markup rendered as text. There was no mobile horizontal overflow or page JavaScript error. Desktop and mobile screenshots were visually inspected. These are real browser interactions with fixture-backed responses, **not live GitHub or AI results**.

At **2026-09-28 06:41:50 UTC**, the actual browser sent a request through Vite and FastAPI to live GitHub. The UI displayed the safe message “GitHub rate limit reached. Try again later.” This confirms the visible rate-limit path, not repository metrics.

## Live GitHub verification

At **2026-09-28 06:39:12 UTC**, after the proxy repair and backend restart, an actual app request for `pallets/flask` returned **429** with `upstream_rate_limited`. Independent upstream metadata and language requests both returned **403**. GitHub's `/rate_limit` response showed the anonymous quota exhausted: limit 60, used 60, remaining 0, with reset at **2026-09-28 07:06:58 UTC**. The app mapped this condition to a safe, actionable error. **Live stars, forks, and language-byte comparison could not be verified** because GitHub was rate limited; commit activity and other optional sections were not obtained in this attempt. No automatic retry was made.

Before the repair, the app returned a 502 caused by inherited proxy settings. A separate direct diagnostic around **2026-09-28 05:14 UTC** reached GitHub and observed 74,803 stars and 17,007 forks, but it did not pass through the repaired app and is **not** a live app-to-upstream metrics comparison.

## Live AI verification

Live AI verification not run: credentials or connectivity unavailable. No `backend/.env` was present during this verification, so the AI-disabled path was exercised offline. A real AI assessment requires server-side `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL`; only then can validated dimensions, computed score, evidence, and model label be checked against a live response.
