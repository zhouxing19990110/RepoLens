# RepoLens

RepoLens is a dashboard for **public** GitHub repositories. Enter a URL such as `https://github.com/pallets/flask` to view repository metadata, language bytes, and recent commit activity. An optional server-configured AI provider can estimate project health from the collected public evidence. Repository metrics work without AI credentials. The first version has no database, accounts, private-repository access, persistent history, or repository cloning.

Docker Desktop 本地运行、腾讯云子路径部署、更新和回滚步骤见 [Docker 与腾讯云部署手册](docs/deployment.md)。

## Requirements and setup

Install Python 3.10+ and Node.js with npm. Vite 7.1.7 requires Node.js `^20.19.0 || >=22.12.0`. From the repository root in PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
cd frontend
npm ci
cd ..
```

`backend/requirements-dev.txt` includes the pinned runtime dependencies and test tools; `frontend/package-lock.json` pins the npm tree. If PowerShell prevents script execution, invoke the Python executable as above and use `npm.cmd` for npm commands.

Credentials are optional. If needed, copy `backend/.env.example` to `backend/.env` and fill in values **on the server only**:

```dotenv
GITHUB_TOKEN=
AI_API_KEY=
AI_BASE_URL=
AI_MODEL=
```

`GITHUB_TOKEN` may increase the GitHub API allowance. To enable AI, set all three `AI_*` fields. `AI_BASE_URL` must be the provider's HTTPS API base including its prefix, commonly `/v1`; for example, `https://provider.example/v1`. The app appends `/chat/completions`. Do not put credentials in the browser or repository URL. Configuration loads from `backend/.env` regardless of the shell's current directory; shell environment variables can also supply these names. Never commit `backend/.env`.

## Run locally

In two terminals, from the repository root:

```powershell
# Terminal 1
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

```powershell
# Terminal 2
cd frontend
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173`. Vite forwards `/api` requests to `http://127.0.0.1:8000`. The backend has a health route at `http://127.0.0.1:8000/api/health`. Analyze a public repository by entering its canonical GitHub URL, then use **Refresh** to retry activity that GitHub is still preparing. When AI is configured, **Assess project health** sends public metadata and a bounded README excerpt to that provider.

## API and data meaning

`POST /api/repositories/analyze` accepts `{"url":"https://github.com/owner/repository"}`. It returns a public `Analysis` with metadata, separate open issue and pull request counts, language bytes and percentages, weekly commit counts, availability states, warnings, retrieval time, and whether AI is configured. `POST /api/repositories/assess` accepts the same request and returns an `Assessment`; it responds with `ai_unavailable` when AI is not configured. `GET /api/health` returns `{"status":"ok"}`. Errors use `{"error":{"code":"...","message":"...","retry_after_seconds":null}}`. The browser cannot choose the AI provider or submit its own metrics.

Language percentages are calculated from the **byte totals** reported by GitHub's language endpoint, not lines of code. Display labels show at most two decimal places; bar widths use the underlying percentages and the table retains exact bytes. Activity uses the last 12 **completed** GitHub Sunday-start UTC weeks; the current week is excluded. Missing weeks are disclosed rather than filled with zero. A count of zero means a confirmed value; an unknown count is `null` and appears as **Unavailable**. Availability can be `available`, `empty`, `pending`, or `unavailable`; a `pending` activity response can be refreshed.

The AI rubric scores maintenance (40%), documentation (35%), and community (25%). The evidence sent to the provider includes the snapshot retrieval time in UTC, so maintenance can interpret the last push even when weekly activity is pending or unavailable. The backend validates the three dimensions and their evidence references, then computes the weighted overall score using decimal round-half-up. If a dimension has insufficient evidence, the overall score is unavailable. This is an AI estimate from limited public data, not an audit of source quality, correctness, or security. Repository text is treated as untrusted evidence.

Complete, successful snapshots are held in a bounded **in-memory** cache for five minutes (up to 128 repositories). Partial or pending results and failed responses are not cached, so a refresh can retry immediately. Cache contents disappear when the backend restarts.

## Checks

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests -q
cd frontend
npm test
npm run typecheck
npm run build
```

See [verification results](docs/verification.md) for the tested environment and separate offline, browser, live GitHub, and live AI outcomes.

### 界面语言 / Interface language

页面首次访问默认显示中文。右上角的「中文 / English」选择器可即时切换，语言偏好保存在当前浏览器中，刷新后仍然生效。浏览器禁止本地存储时，当前页面仍可切换语言。

切换语言不会重新请求 GitHub 或 AI，也不会清空已加载的结果。界面文案、日期、数字及已知错误提示随语言更新；仓库描述和 README 原始证据保留原文；AI 评估说明和局限性按生成时选择的语言输出。切换语言后，可重新评估以生成对应语言的结果。GitHub 返回重试等待时间时，错误提示会显示等待秒数。

The interface defaults to Chinese and supports English from the header selector. Language preferences persist in browser local storage. Switching preserves loaded results and does not trigger API requests. Repository descriptions and original evidence retain their source language. AI explanations and limitations use the language selected when generating the assessment. After switching languages, assess again to generate a new result.

### 分析服务暂不可用

本地运行时，需要同时保持前端（5173）和后端（8000）两个进程运行。若提示「分析服务暂不可用，请检查后端服务是否运行」，先访问 `http://127.0.0.1:8000/api/health`，正常应返回 `{"status":"ok"}`。若无法连接，请在项目根目录按上方 Terminal 1 命令启动后端，再重新分析。HTTP 5xx 且没有标准错误内容时，页面会显示此提示；后端返回的明确错误（如 GitHub 限流）仍会单独显示。
# RepoLens
