# Task 4 report: optional AI assessment

## Scope and implementation

- Added `backend/app/assessment.py` with `AssessmentService(client, settings)` and `weighted_score`.
- Sends only the snapshot evidence JSON as a separate user message under a rubric system message. No tools, client-supplied provider URL, or credentials enter the prompt.
- Uses one streamed POST to the server-configured chat-completion endpoint with bearer authentication, a 45-second timeout, redirects disabled, and a 128 KiB response limit. It does not retry billable requests. Configured URL userinfo is rejected because `httpx` otherwise replaces the bearer header with Basic authentication.
- Accepts only a stopped completion with strict three-dimension JSON. Extra fields, missing dimensions, invalid scores, blank explanations, unknown evidence IDs, and scored dimensions without evidence fail with a safe AI-specific error. Any null dimension score yields `insufficient_evidence` and no overall score. The server calculates decimal half-up 40/35/25 weighting and supplies evidence, UTC timestamp, configured model, and hostname-only provider label.

## Red/green evidence

1. `./.venv/Scripts/python.exe -m pytest backend/tests/test_assessment.py -q`: **red**, collection error `ModuleNotFoundError: No module named 'app.assessment'` after writing the tests first.
2. Same command after first implementation: **red**, 10 passed and one failed. The captured request used `Basic` auth because URL userinfo overrode the intended `Bearer` header.
3. Rejected URL userinfo, extended boundary tests, and reran the same command: **green**, 20 passed in 0.40 seconds. Pytest emitted its existing `pytest-asyncio` fixture-loop-scope deprecation warning.

## Self-review and limits

- The tests use `httpx.MockTransport`; they prove request shape, bounded parsing, validation, safe errors, and no retry in these cases. They do not establish live provider compatibility or model behavior.
- The service assumes an HTTPS AI base URL with its API prefix (for example `/v1`). Unsupported JSON mode is surfaced as `ai_provider_error`; it is never retried with weaker formatting.
- API route wiring and end-to-end checks belong to Task 5 and later tasks. No unrelated application files were changed here.

## Review fix round 1

- New compressed-response and slow-stream tests were run first with `./.venv/Scripts/python.exe -m pytest backend/tests/test_assessment.py -q`: **red**, `2 failed, 20 passed in 0.54s`. The gzip response was accepted, and the stream exceeded the intended total deadline without an error.
- The first implementation switched to raw streaming but exposed a fixture detail: `httpx.MockTransport` returns already-buffered responses whose raw iterator raises `StreamConsumed`. Focused rerun: **red**, `16 failed, 6 passed in 1.22s`. Added a bounded path for those already-buffered responses; live streaming still uses bounded raw bytes.
- Final focused rerun with the same command: **green**, `22 passed in 0.43s`. Pytest continued to emit the existing `pytest-asyncio` fixture-loop-scope deprecation warning.
- `Accept-Encoding: identity` is sent, any non-identity `Content-Encoding` is rejected before reading, and the response is capped as raw bytes. `asyncio.wait_for` imposes a total 45-second deadline over the provider exchange while the existing per-operation HTTP timeout remains 45 seconds. Timeout returns `ai_timeout` without retry.
- This scratch report was removed from Git tracking with `git rm --cached` while preserving this local file, per the task-file-only scope.
