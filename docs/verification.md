# Verification

Date: 2026-09-28 (Asia/Shanghai). This page separates deterministic checks from actual browser and upstream checks. Commands assume the repository root unless the table says `frontend`. Local verification used Python 3.10.4, bundled Node 24.19.0, and npm 12.1.0.

| Check | Command | Result |
| --- | --- | --- |
| Backend | `.\.venv\Scripts\python.exe -m pytest backend/tests -q` | **90 passed**, 1 dependency warning; no failures. |
| Frontend tests | `npm test` in `frontend` | **22 passed** across 3 files. |
| TypeScript | `npm run typecheck` in `frontend` | Passed. |
| Frontend build | `npm run build` in `frontend` | Passed; Vite 7.1.7 built 35 modules. |

The backend warning comes from FastAPI's test client importing Starlette's deprecated `httpx` integration. It does not affect these test results. On this verification host, Node 24.19.0 was bundled without `npm` on `PATH`; the same npm 12.1.0 CLI was invoked with that Node executable to run the three frontend commands. On a normal Node installation, use the commands shown in the table.

## Repaired cases and offline evidence

The first live GitHub request through the app returned a sanitized 502 because inherited proxy settings caused `httpx` connection failure on this host. A direct diagnostic request to the same GitHub endpoint returned HTTP 200 with `trust_env=False`. The app's GitHub and AI lifecycle clients now use `trust_env=False` while retaining TLS verification. A lifecycle regression test checks this setting on both clients. The missing-license label now reads **Not detected**. The frontend assessment fixture now uses the backend's `metadata`, `readme`, and `community` evidence IDs; its weighted score is **73** for 80/70/65. The community evidence string matches the backend's open-count format. Malformed server-configured AI URLs, including an empty trailing `?` or `#`, now disable assessment before any GitHub fetch; route tests check this behavior.

The final review added a UTC snapshot retrieval time to the existing `metadata` evidence. A fixed-clock regression checks the actual outgoing AI prompt for both pending and unavailable activity, when no `activity` evidence entry exists. A chart rendering regression checks a fractional percentage label (`33.33%`) while retaining raw bar width and exact bytes. The README now states Vite 7.1.7's installed Node engine requirement (`^20.19.0 || >=22.12.0`).

The automated suite covers URL validation, GitHub response mappings, partial and pending data, cache timing, evidence and weighted score validation, route errors, frontend request races, charts, and AI disabled/error states. Mocked transport and fixture values in these tests are **offline evidence**, not claims about live GitHub or an AI provider.

## Actual browser inspection

At **2026-09-28 06:39:52 UTC**, Chrome headless via Playwright rendered the local frontend at `http://127.0.0.1:5173` with **intercepted API fixtures** at 1440×1000 and 375×812. The checked interactions passed: keyboard focus and Enter submission, loading, zero versus unavailable counts, both exact-value tables, 75% byte share, pending activity Refresh, input and 404 errors, AI-disabled state, AI error retaining metrics, scored dimensions and provenance, and insufficient evidence without an overall number. A README string containing markup rendered as text. There was no mobile horizontal overflow or page JavaScript error. Desktop and mobile screenshots were visually inspected. These are real browser interactions with fixture-backed responses, **not live GitHub or AI results**.

At **2026-09-28 06:41:50 UTC**, the actual browser sent a request through Vite and FastAPI to live GitHub. The UI displayed the safe message “GitHub rate limit reached. Try again later.” This confirms the visible rate-limit path, not repository metrics.

After the quota reset, at **2026-09-28 07:09:56 UTC**, Chrome rendered a **live, unintercepted** `pallets/flask` response through the same Vite → FastAPI → GitHub path. At both 1440×1000 and 375×812, the report showed 74,803 stars, 17,007 forks, all five data sections available, no warnings, and the AI-disabled message. There was no horizontal overflow or page JavaScript error; both live screenshots were visually inspected.

## Live GitHub verification

At **2026-09-28 07:08:52 UTC**, after the anonymous quota reset, the actual app returned **200** for `pallets/flask`; independent upstream metadata and language requests also returned **200**. The app and upstream values matched exactly: **74,803 stars**, **17,007 forks**, and language bytes of **Python 565,759**, **HTML 405**, **Shell 193**, and **CSS 18**. GitHub was still preparing commit activity at that instant, so the app reported `activity: pending` with a refresh warning. At **07:09:56 UTC**, a subsequent live browser request returned all five sections as `available` with no warnings. The upstream comparison directly verifies stars, forks, and language bytes; it does not independently compare the issue, pull request, README, or commit activity payloads.

The earlier post-repair attempt at **06:39:12 UTC** returned **429** with `upstream_rate_limited`; independent upstream metadata and language requests returned **403**. GitHub's `/rate_limit` response showed the anonymous quota exhausted: limit 60, used 60, remaining 0, with reset at **07:06:58 UTC**. The app mapped that condition to a safe, actionable error. No automatic retry was made during the exhausted-quota period.

Before the repair, the app returned a 502 caused by inherited proxy settings. A separate direct diagnostic around **2026-09-28 05:14 UTC** reached GitHub and observed 74,803 stars and 17,007 forks, but it did not pass through the repaired app and is **not** a live app-to-upstream metrics comparison.

## Live AI verification

Live AI verification not run: credentials or connectivity unavailable. No `backend/.env` was present during this verification, so the AI-disabled path was exercised offline. A real AI assessment requires server-side `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL`; only then can validated dimensions, computed score, evidence, and model label be checked against a live response.

## Chinese / English interface (2026-09-28)

- Added Chinese as the first-visit default, an accessible header language selector, and local-storage persistence with a safe fallback when storage is unavailable.
- Centralized typed interface messages and cached locale-specific number/date formatting. Structured API errors preserve error codes and retry timing for localized display. Activity graph scaling uses the same 12-week slice as its table.
- Validation: all 28 frontend tests passed; an additional API error-metadata test was then added and the updated 7-test API suite passed (29 tests total across the current suites). TypeScript checking and production build passed.
- Headless Chrome checked both languages at 1440px and 375px, with no horizontal overflow or browser errors. Language switching preserved metrics and AI results, caused no additional API calls, and persisted English after reload.
- Browser verification used intercepted fixture responses, not live GitHub or AI calls. Repository descriptions, evidence, and AI response prose remain in their original language.

## Backend outage recovery (2026-09-28)

- Reproduced the reported generic Chinese failure: only Vite was listening; port 8000 had no service. The Vite analysis proxy returned HTTP 500 with an empty body.
- Restarted uvicorn. Health checks through the frontend proxy passed; a real `pallets/flask` analysis returned HTTP 200 with no warnings. Live Chrome also loaded the repository report without an error alert; no AI request was made.
- Added a localized service-unavailable fallback for unstructured HTTP 5xx responses while preserving structured backend errors.
- Targeted API and locale suites: 19 passed. TypeScript checking and production build passed.

## AI assessment language (2026-09-28)

- Assessment requests now accept validated `language: zh | en` (default `zh`). The server instructs the provider to generate every explanation and limitation in the requested language, while preserving schema keys and evidence identifiers; responses include the requested language.
- The UI passes its selected language. Existing results remain visible on a switch, with a regenerate notice when languages differ; there is no automatic AI call. Original evidence is explicitly labeled and expandable.
- Backend suite: 95 passed. Frontend: API 12, locale 8, charts 7 passed; after correcting the unchanged analyze-call expectation, the 9-test App suite passed. TypeScript checking and production build passed.
- Restarted the local backend and made one real Chinese AI assessment through the frontend proxy for `pallets/flask`: HTTP 200, language `zh`, all three dimension explanations and all four limitations returned in Chinese. Original evidence and identifiers remain unchanged. Provider language adherence is instructed, not mechanically guaranteed for all future responses.
