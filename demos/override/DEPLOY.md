# Deploy The Banana Mystery

Deploy the Override demo as one Docker web service. The [Dockerfile](Dockerfile) builds the browser game and serves it with the Node.js interview API from the same origin. The AgentVerse Python simulation is not required.

This guide uses Render for a hosted colleague demo. A [local Docker smoke test](#local-docker-smoke-test) is included below for checking the container before deployment or using another Docker host.

## Current deployment limits

- **Every browser has its own game.** Players do not share or reset each other's case.
- **Run one instance.** Games live in process memory and are replayed from the logs; multiple replicas would not share them.
- **Restarts resume games from the logs on the persistent disk.** Sign-ins also survive when `OVERRIDE_SECRET` is set; without it they reset.
- **The access code is shared.** It protects the API and session exports; static game assets remain publicly accessible. It does not provide separate participant accounts or an administrator-only export role.


## 1. Prepare the repository

Commit and push the complete `demos/override/` directory to the branch you intend to deploy. The current demo branch is `demo/override`. Include `package-lock.json`, the server and client sources, and all PNG assets under `public/assets/banana/`.

Keep `.env`, `node_modules/`, `dist/`, `data/`, and test outputs out of the commit. The demo's [.gitignore](.gitignore) and [.dockerignore](.dockerignore) cover these generated files and the local environment file.

Optional local validation, from the repository root, with a current Node.js 22 installation or newer:

```sh
cd demos/override
npm ci
npm test
npm run build
```

For browser verification, use the commands in [README.md](README.md#validate). These checks use a separate rehearsal server and do not require the live model key.

## 2. Create the Render web service

In Render, create a **Web Service**, connect the AgentVerse repository, and select the branch containing the committed demo. Configure:

| Setting | Value |
| --- | --- |
| Branch | `demo/override`, or the branch you pushed |
| Root Directory | `demos/override` |
| Language / Runtime | Docker |
| Dockerfile Path | `./Dockerfile` |
| Docker Build Context | `.` |
| Docker Command | Leave unset; use the Dockerfile's `CMD` |
| Health Check Path | `/api/access` |
| Instances | 1 |

Docker paths are relative to the selected root directory. Render builds the image using the Dockerfile, so a separate dashboard build command is unnecessary. See [Render's Docker guide](https://render.com/docs/docker) and [root-directory settings](https://render.com/docs/monorepo-support#root-relative-settings).

Choose a paid web service if you need persistent investigation logs: Render's persistent disks require a paid service. See [persistent disk setup](https://render.com/docs/disks).

## 3. Configure environment variables

Set these in the service's environment settings. Replace the angle-bracket placeholders with actual values; keep credentials in the hosting platform rather than committing them to Git.

```dotenv
HOST=0.0.0.0
PORT=3001
OVERRIDE_DATA_DIR=/app/data
OVERRIDE_ACCESS_CODE=<strong shared demo password>

OVERRIDE_LLM_BASE_URL=https://ai.cloud.sdu.dk/v1
OVERRIDE_LLM_MODEL=zai-org/GLM-5.3
OVERRIDE_LLM_API_KEY=<your model API key>

OVERRIDE_LLM_MAX_COMPLETION_TOKENS=2048
OVERRIDE_LLM_TIMEOUT_MS=60000
```

The SDU endpoint and model above match the demo's existing configuration. The deployed server must have network access to that endpoint, and its API key must have permission to use the model. Another HTTPS endpoint can be used if it implements OpenAI-compatible `POST /chat/completions`. The base URL includes `/v1`, but not `/chat/completions`.

For **scripted rehearsal**, leave both `OVERRIDE_LLM_API_KEY` and `OVERRIDE_LLM_MODEL` empty or unset. Setting only one prevents startup. Keep the access code configured if the shared case and exports should require a password. An empty access code leaves the API open.

The token budget includes model reasoning tokens. A truncated answer is retried once at up to twice the initial budget, capped at 8,192 tokens; both attempts share the configured timeout. Live errors are shown to the player rather than replaced with scripted answers.

The production image receives settings through environment variables. It does not contain the local `.env` file or load one at startup. Redeploy or restart after changing settings.

## 4. Attach persistent storage

Add a persistent disk with mount path **`/app/data`**, matching `OVERRIDE_DATA_DIR`. Choose a size suitable for the expected number of text logs.

Only files under that mount path persist across deploys and restarts. Without a disk, logs written to the container filesystem are temporary. A Render disk is attached to one instance and prevents zero-downtime deployments, so deploy between investigators. See [disk limitations](https://render.com/docs/disks#disk-limitations-and-considerations).

The container runs as the `node` user. The mounted directory must be writable by that user. If the first case fails with a storage-permission error, check mount ownership and permissions instead of making the directory world-writable.

## 5. Deploy and verify

Deploy the service and open its HTTPS URL. Render's [web-service guide](https://render.com/docs/web-services) explains service creation and port binding.

Check the unauthenticated health endpoint, replacing the hostname:

```sh
curl --fail --silent --show-error https://YOUR-SERVICE.onrender.com/api/access
```

With an access code configured and no login cookie, the expected response is:

```json
{"authorized":false,"protected":true}
```

This endpoint checks that the API responds. It does not test model credentials or the ability to write a session log. Complete one smoke-test investigation before sharing the URL:

1. Sign in with the shared access code and start a case.
2. Confirm the grove, detective walk cycle, and monkey idle animations load.
3. Reveal the three clues and ask each monkey a question.
4. Confirm the interview badge matches the intended mode: live or scripted rehearsal.
5. Submit a guess, read the debrief, and export the session's JSONL file.
6. Start a new case for the next investigator. Confirm the earlier JSONL file remains in `/app/data`.

Share the HTTPS URL and access code with colleagues. Keep the model API key in the service configuration.

## Updates, logs, and rollback

Deploy updates between players. Push the new source and assets to the configured branch, then trigger a deployment, or let the service's auto-deploy setting do so. Use manual deployments if you need to control when an active investigation is interrupted.

Record the Git commit associated with a working release. To roll back, redeploy that known-good commit using the hosting platform. Recheck the environment settings and disk attachment, then repeat the smoke test. Rolling back the application does not restore an unfinished session or revert its log files.

Logs are stored as `/app/data/live/sessions/<session-id>.jsonl` (see the README's research records for the rest of the layout). **Export session** downloads the current session only; older sessions remain on disk after reset. Copy older logs through the host's supported file-access or backup tools. Keep backups before deleting a service or disk. Logs contain submitted questions, answers, evidence selections, and verdicts.

Restarting the service preserves files on the mounted disk. Games resume from their logs; players must sign in again unless `OVERRIDE_SECRET` is set.

## Local Docker smoke test

Run these commands from `demos/override/`. Docker must be installed and running. Keep an existing `.env`; copy the example only if the file does not exist, then edit its values for the intended mode.

```sh
test -f .env || cp .env.example .env
docker build -t agentverse-override .
docker run --detach --name override-demo --restart unless-stopped \
  --publish 127.0.0.1:3002:3001 \
  --env-file .env \
  --env HOST=0.0.0.0 \
  --env PORT=3001 \
  --env OVERRIDE_DATA_DIR=/app/data \
  --mount type=volume,source=override-data,target=/app/data \
  agentverse-override
```

Open [http://127.0.0.1:3002](http://127.0.0.1:3002). Port 3002 avoids the demo's usual local development port, 3001. The explicit overrides also prevent the local `.env` values for `HOST` and the data directory from breaking container access or persistence.

```sh
docker logs --tail 50 override-demo
curl --fail --silent --show-error http://127.0.0.1:3002/api/access
```

Stop the smoke-test container when finished:

```sh
docker stop override-demo
docker rm override-demo
```

These commands preserve the named `override-data` volume. Reuse it for subsequent runs to keep the logs. If a container with this name already exists, stop and remove that specific container before repeating `docker run`.

For a VPS deployment, place an HTTPS reverse proxy in front of the loopback-bound port. Forward the original HTTPS scheme so the application marks its login cookie secure. Allow enough response time for the configured model deadline; a 90-second proxy response timeout accommodates the default 60-second model timeout.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Docker build cannot find `package.json`, `client`, or `public` | Set the root directory to `demos/override`, Dockerfile path to `./Dockerfile`, and build context to `.`. Include all demo sources and assets in the pushed commit. |
| Service starts but the URL is unavailable | Bind to `HOST=0.0.0.0` inside the container and use the configured `PORT`. Check the deployment logs and `/api/access`. |
| First case fails to save, or logs disappear after deployment | Match the disk mount and `OVERRIDE_DATA_DIR` to `/app/data`; verify that the `node` user can write there. |
| Startup reports missing model configuration | Set both the model and API key for live mode, or leave both empty for rehearsal. |
| UI shows scripted rehearsal unexpectedly | Check that both live-mode variables were saved and the service restarted. |
| Interviews fail with credential, rate-limit, or timeout errors | Check the provider-specific message, key permissions, endpoint reachability, and configured model. The health endpoint alone does not validate these. |
| Changes or new sprites do not appear | Confirm the intended commit was deployed, PNGs under `public/` were committed, and reload the page to load the new browser bundle. |

## Hosting 200 players on a Mac

Not included yet: launchd units, off-machine backup, and Grafana. Prometheus config and alert examples are in [ops/prometheus.yml](ops/prometheus.yml). Back up `data/` by hand until a backup job exists, and restart the server by hand after a crash.

**Machine**

- Run `caffeinate -dims` for the whole event. Turn Power Nap off, keep the power adapter connected and the lid open.
- Turn off automatic macOS updates and scheduled restarts. Freeze the configuration 48 hours before, and do no development on the machine during the event.
- Use Ethernet, not Wi-Fi.
- Raise the connection queue limit: `sudo sysctl -w kern.ipc.somaxconn=1024` (the server asks for a queue of 1024).

**Configuration**

- Set `OVERRIDE_SECRET` to a fixed random value so sign-ins survive restarts.
- Set `OVERRIDE_ENDPOINTS` and the endpoint keys (see the README's LLM fallback section).
- Set `OVERRIDE_ADMIN_TOKEN`. The admin listener binds 127.0.0.1 only: reach it with `ssh -L 3002:127.0.0.1:3002 user@mac`, never through the tunnel.
- Over the internet, use a named Cloudflare Tunnel (`cloudflared`) to the game port only, and set `OVERRIDE_TRUST_PROXY=1` so the login limiter sees each player's own address. Cloudflare's 100 s proxy timeout exceeds the 60 s LLM deadline. On a closed LAN, use a fixed address or `.local` name, and check that the Wi-Fi does not isolate clients.

**Runbook**

Before:
- Run `npm run loadtest` and `node --env-file-if-exists=.env scripts/preflight.mjs --capacity --out preflight.json`; review the report.
- Test the backup target (a manual copy of `data/`).

One hour before:
- Start the server and confirm `/admin/health` is green. Smoke-test in rehearsal (`OVERRIDE_ENV=rehearsal`), then switch to live.

During:
- Watch the admin page and `/metrics`. When pinning or moving endpoints, type the reason.
- If a player sees an error, they reload the page; the game resumes from its log.
- Never delete `data/`.

After:
1. `POST /admin/sessions/pause` and let pending answers finish.
2. Copy `data/` off the machine.
3. Review incidents in `system.jsonl`.
4. Rotate the keys.

For case details and research-event fields, see [README.md](README.md).
