# Docker 与腾讯云部署

本项目将 React 生产资源与 FastAPI 打包为一个镜像，由 FastAPI 同时提供页面和 API。构建阶段使用 Node.js 22，运行阶段使用 Python 3.12；运行容器无需 Node.js、数据库或数据卷。仓库分析的缓存仅保存在内存中，容器重启后自动清空。

## 部署位置与当前验证范围

| 环境 | 镜像与 Compose 项目 | 入口 |
| --- | --- | --- |
| Docker Desktop，`desktop-linux` context | `repolens:local`；项目 `repolens-local`；容器 `repolens-local-app-1` | `http://127.0.0.1:8081/` |
| 腾讯云，目录 `/home/ubuntu/repolens` | 镜像 `repolens:20260928-initial`；项目 `repolens`；容器 `repolens-app-1` | https://203.195.219.128/repolens/ |

2026-09-28 已完成本地容器化和腾讯云上线。后端 96 项、前端 38 项测试通过（共 134 项），TypeScript 检查通过。Docker Desktop 和腾讯云容器均为 `running / healthy`；两端各完成 10 项页面、资源、健康与敏感路径检查，真实 GitHub 分析和中文 AI 评估均返回 HTTP 200。公网检查启用 TLS 证书验证，`/repolens` 正确返回 308 并跳转到 `/repolens/`。

上线前后原网关、沃林 Web、MySQL 和月白容器的 ID、启动时间、镜像及挂载完全一致；原首页和两个原应用 Compose 的 SHA-256 一致。主页、决战21点、月白页面及健康接口仍为 200，沃林保留原 401 认证响应。没有登录沃林验证内部 CRUD，也没有重新逐项测试其他应用功能。首次发布前备份与回滚脚本已保留；本次没有人为制造线上失败来演练回滚。

验收记录：[本地 HTTP 与真实服务](docker-deployment-verification.json)、[本地容器状态](docker-runtime-verification.json)、[腾讯云 HTTP 与真实服务](tencent-http-verification.json)、[腾讯云容器与其他应用隔离](tencent-runtime-verification.json)。

线上浏览器已验证仓库报告、语言与活动图表、中文 AI 三维评估，以及中英文切换和刷新后的语言偏好；控制台警告/错误为 0。当前产品没有持久化分析历史，刷新页面会清空报告，这是原有行为。记录：[浏览器验收](tencent-browser-verification.json)、[中文报告截图](tencent-browser-verification.png)。

## 2026-09-28 首页入口更新

应用上线后，在腾讯云首页新增了 RepoLens 卡片，链接到 `/repolens/`。桌面四个应用按两行两列排列，手机保留单列；原决战21点、沃林和月白入口保留。首页源码保存于 `deploy/tencent/portal-index.html`。本次仅更新 `/home/ubuntu/wolin/deploy/site/index.html`，未修改 Caddy 配置或重启容器；七项公网路径检查通过，沃林保持原 401 认证响应。

本次首页备份为 `/home/ubuntu/repolens/backups/20260928-portal/index.html`，撤销此次首页更新可执行 `bash /home/ubuntu/repolens/backups/20260928-portal/rollback.sh`。该回滚只恢复首页；若首页之后又有修改，脚本会停止并要求合并，避免覆盖新内容。记录：[首页验收](tencent-portal-verification.json)、[首页截图](tencent-portal-repolens.png)。上文“原首页未改变”对应首次应用发布时的验收，本次是随后单独授权的首页更新。

## Docker Desktop 本地运行

在项目根目录的 PowerShell 执行。Docker Desktop 应已启动并使用 Linux containers。

```powershell
docker context ls
docker --context desktop-linux compose -f compose.yaml config --quiet
docker --context desktop-linux compose -f compose.yaml up -d --build --wait
docker --context desktop-linux compose -f compose.yaml ps
Invoke-RestMethod http://127.0.0.1:8081/api/health
```

健康接口应返回 `status: ok`，然后打开 `http://127.0.0.1:8081/`。本地仅绑定 `127.0.0.1:8081`，前后端无需额外启动。Docker Desktop 的 Containers 页面中可查看 `repolens-local` 项目和 `repolens-local-app-1` 容器。

本地 Compose 将 `backend/.env` 作为可选的运行时配置文件；没有该文件也可以启动并分析公开仓库。启用 AI 时，在该文件中配置 `AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL`；可选配置 `GITHUB_TOKEN`。`AI_BASE_URL` 需为 HTTPS API 基址，通常包含 `/v1`。这些值不进入前端资源或镜像，`.dockerignore` 也排除了环境文件。

```powershell
# 查看运行日志
docker --context desktop-linux compose -f compose.yaml logs --tail 100 app

# 临时停止或重新启动本项目
docker --context desktop-linux compose -f compose.yaml stop app
docker --context desktop-linux compose -f compose.yaml start app

# 修改运行时配置后重新创建容器
docker --context desktop-linux compose -f compose.yaml up -d --force-recreate --wait app
```

## 构建与传输云端镜像

云端入口包含 `/repolens/`。这个路径必须在构建时写入前端，后端运行时同时设置 `ROOT_PATH=/repolens`；本地根路径镜像不能直接替代云端镜像。以下在项目根目录 PowerShell 执行，后续发布将 `$release` 改为新的唯一标签。

```powershell
$release = '20260928-initial'
New-Item -ItemType Directory -Force .deployment | Out-Null
docker --context desktop-linux build --build-arg APP_BASE_PATH=/repolens/ --tag "repolens:$release" .
docker --context desktop-linux image save --output .deployment/image.tar "repolens:$release"

@'
import gzip
import shutil
from pathlib import Path
with Path('.deployment/image.tar').open('rb') as source, gzip.open('.deployment/image.tar.gz', 'wb') as target:
    shutil.copyfileobj(source, target)
'@ | .\.venv\Scripts\python.exe -

# 只打包指定源码和部署文件，不打包 .env、.git 或本地依赖目录。
tar -czf .deployment/source.tar.gz --exclude=__pycache__ --exclude=*.pyc Dockerfile .dockerignore .gitignore compose.yaml README.md backend/app backend/requirements.txt frontend/package.json frontend/package-lock.json frontend/index.html frontend/tsconfig.json frontend/vite.config.ts frontend/src deploy docs

$hashes = @('source.tar.gz', 'image.tar.gz') | ForEach-Object {
    $digest = (Get-FileHash -Algorithm SHA256 -LiteralPath ".deployment/$_").Hash.ToLowerInvariant()
    "$digest  $_"
}
[IO.File]::WriteAllText((Join-Path (Resolve-Path .deployment).Path 'SHA256SUMS'), ($hashes -join "`n") + "`n", [Text.Encoding]::ASCII)

ssh ubuntu@203.195.219.128 'mkdir -p /home/ubuntu/repolens'
scp .deployment/source.tar.gz .deployment/image.tar.gz .deployment/SHA256SUMS ubuntu@203.195.219.128:/home/ubuntu/repolens/
```

每条命令成功后再执行下一条。`.deployment/` 是不入 Git 的本地发布临时目录；`source.tar.gz` 包含当前工作区源码，能够保留尚未提交的实际发布修改。SSH 使用已配置的服务器认证方式。

## 腾讯云配置与启动

以下在服务器执行。首次发布先校验传输完整性，再解包和加载镜像；更新已有部署时，先完成下文的备份步骤。

```bash
cd /home/ubuntu/repolens
sha256sum -c SHA256SUMS
tar -xzf source.tar.gz
sudo docker load --input image.tar.gz
sudo docker image inspect repolens:20260928-initial --format '{{.Id}}'
sudo docker network inspect wolin-cloud_frontend --format '{{.Name}}'
```

云端配置保存在 `/home/ubuntu/repolens/.env`，权限为 `600`。首次创建时使用受限权限文件，再通过编辑器填写；文件已经存在时保留原内容。不要将配置内容写入终端输出、Git、镜像或发布压缩包。

```bash
cd /home/ubuntu/repolens
umask 077
test -e .env || touch .env
chmod 600 .env
nano .env
```

`.env` 中包含 `REPOLENS_IMAGE=repolens:20260928-initial`，以及所需的 `GITHUB_TOKEN`、`AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL`。后四项按实际配置填写；其中 AI 三项需同时有效才会启用评估。Compose 的 `env_file` 将该文件作为运行时配置注入。下面的 `--env-file .env` 还用于解析镜像变量，因此所有云端 Compose 命令都保留此参数。

```bash
cd /home/ubuntu/repolens
sudo docker compose --env-file .env -f deploy/tencent/compose.yaml config --quiet
sudo docker compose --env-file .env -f deploy/tencent/compose.yaml up -d --wait app
sudo docker compose --env-file .env -f deploy/tencent/compose.yaml ps
sudo docker compose --env-file .env -f deploy/tencent/compose.yaml logs --tail 100 app
```

云端容器仅连接现有外部网络 `wolin-cloud_frontend`，使用专用别名 `repolens`；未发布宿主端口，也没有数据库依赖。该 Compose 项目独立于其他应用，运行上述命令只管理 RepoLens。

## 现有 Caddy 网关接入

现有网关容器为 `wolin-cloud-gateway-1`。宿主配置 `/home/ubuntu/wolin/deploy/Caddyfile.ip` 通过单文件 bind mount 挂载到容器 `/etc/caddy/Caddyfile`。修改前备份配置；把 [repolens.caddy](../deploy/tencent/repolens.caddy) 中的片段合并到现有目标站点块内，并保留原有站点规则。

```caddyfile
redir /repolens /repolens/ 308
handle /repolens/* {
    reverse_proxy repolens:8000 {
        transport http {
            response_header_timeout 120s
        }
    }
}
```

这里使用 `handle` 保留 `/repolens` 前缀，配合 FastAPI 的 `ROOT_PATH=/repolens`。不要改成会剥离前缀的 `handle_path`。构建参数 `APP_BASE_PATH=/repolens/` 则让页面资源和浏览器请求使用 `/repolens/assets/...`、`/repolens/api/...`。

配置更新需要保留宿主文件 inode；将确认过的候选配置内容原位写入已有文件，避免用重命名或替换文件的方式使单文件挂载继续引用旧内容。现有首页 `/home/ubuntu/wolin/deploy/site/index.html` 无需修改。配置写入后执行校验，仅校验成功才 reload；若失败，恢复备份内容后再次校验。

```bash
sudo docker exec wolin-cloud-gateway-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo docker exec wolin-cloud-gateway-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

使用 reload 应用配置，无需重启网关或其他应用。以后仅更新 RepoLens 镜像时，无需再次修改网关。

## 上线验收

在可信 TLS 连接下检查公网入口；若证书验证失败，应先确认实际证书和客户端信任配置，不能把跳过验证的请求当作证书有效的证据。

```bash
curl --fail --show-error --silent https://203.195.219.128/repolens/api/health
curl --fail --show-error --silent https://203.195.219.128/repolens/
curl --fail --show-error --silent https://203.195.219.128/repolens/api/repositories/analyze \
  --header 'Content-Type: application/json' \
  --data '{"url":"https://github.com/pallets/flask"}'
```

健康接口应返回 `{"status":"ok"}`。浏览器还需确认 `/repolens` 跳转到 `/repolens/`、页面资源全部成功加载、真实仓库分析显示、刷新行为正常、中文和英文切换及偏好保存正常。已配置 AI 时，可在页面触发一次中文评估，检查返回语言、三项维度与总体分数；仅健康接口成功不能证明 GitHub 或 AI 可用。

将上线前后的其他应用容器状态、重启次数、首页和已知公开路径响应逐一对比。GitHub 若返回限流或 activity pending，应如实记录上游状态；不要把它记为完整仓库数据验收。应分别记录接口结果、浏览器检查、真实 GitHub 和真实 AI 结果。

## 后续更新与回滚

每次更新使用新镜像标签，保留旧镜像。先记录当前状态并备份配置，再传输新产物、校验 SHA-256、加载新镜像。以下服务器命令不会输出配置值：

```bash
cd /home/ubuntu/repolens
umask 077
backup_dir="backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"
cp .env "$backup_dir/.env"
cp deploy/tencent/compose.yaml "$backup_dir/compose.yaml"
chmod 600 "$backup_dir/.env"
sudo docker compose --env-file .env -f deploy/tencent/compose.yaml ps
```

新镜像加载成功后，仅将 `.env` 的 `REPOLENS_IMAGE` 改为新标签，保留其他配置，然后检查并更新 `app`：

```bash
sudo docker compose --env-file .env -f deploy/tencent/compose.yaml config --quiet
sudo docker compose --env-file .env -f deploy/tencent/compose.yaml up -d --no-deps --wait app
```

完成健康、真实分析和浏览器验收后再结束发布。若更新失败，将本次备份的 `.env` 与 `compose.yaml` 恢复到原位置（`.env` 继续保持 `600`），再执行相同的 `config --quiet` 与 `up -d --no-deps --wait app`，即可恢复旧镜像和配置。选择实际对应的备份目录；不要在回滚前删除旧镜像。

首次接入的专项回滚脚本为 `/home/ubuntu/repolens/backups/20260928-initial/rollback.sh`：

```bash
sudo bash /home/ubuntu/repolens/backups/20260928-initial/rollback.sh
```

该脚本用于撤销首次新增的 RepoLens 网关路由并停止 RepoLens，不修改首页或其他应用。后续已有其他网关变更时，应使用当次发布的备份并只撤销对应改动，避免用旧快照覆盖新配置。无需执行任何服务器范围的容器清理、网络清理或数据卷删除。

## 资源与日常运行

两套 Compose 均以 UID/GID `10001:10001` 的非 root 用户运行镜像，根文件系统只读，提供 32 MiB 的临时 `/tmp`。每个容器限制为 512 MiB 内存、1 CPU 和 128 个进程，丢弃全部 Linux capabilities 并禁止提升权限。日志采用 `json-file`，每个文件最多 10 MiB，最多保留 3 个文件；重启策略为 `unless-stopped`。

日常检查使用 `compose ps`、`compose logs --tail 100 app` 和 `docker stats --no-stream`。修改 AI/GitHub 运行时配置后，使用 `up -d --force-recreate --wait app` 使环境变量生效。仓库缓存无需备份；需要保留的是发布标签、镜像、Compose、受限访问的环境配置以及各次网关配置备份。
