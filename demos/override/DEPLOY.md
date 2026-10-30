# Deploy The Banana Mystery

There are two ways to deploy the Override demo. The AgentVerse Python simulation is not required for either.

- **[One Mac for a 200-player event](#hosting-200-players-on-a-mac).** The game server, admin page and metrics run on one Mac, reached over a Cloudflare Tunnel or a closed LAN. Use this for a study.
- **One Docker web service for a small colleague demo.** The [Dockerfile](Dockerfile) builds the browser game and serves it with the Node.js interview API from the same origin. Sections 1–5 use Render; a [local Docker smoke test](#local-docker-smoke-test) checks the container before deployment or on another Docker host.

## Current deployment limits

- **Every browser has its own game.** Players do not share or reset each other's case.
- **Run one instance.** Games live in process memory and are replayed from the logs; multiple replicas would not share them.
- **Restarts resume games from the logs on the persistent disk.** Sign-ins also survive when `OVERRIDE_SECRET` is set; without it they reset.
- **The access code is shared.** It protects the API and session exports; static game assets remain publicly accessible. It does not provide separate participant accounts or an administrator-only export role.


## 1. Prepare the repository

Commit and push the complete `demos/override/` directory to the branch you intend to deploy. The current demo branch is `demo/override`. Include `package-lock.json`, the server and client sources, and all PNG assets under `public/assets/banana/` and `public/assets/tower/`.

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

The Docker image does not carry the whole 200-player backend yet:

- `ops/` is not copied into the image. For [several endpoints with failover](README.md#llm-fallback), mount your endpoints file into the container and point `OVERRIDE_ENDPOINTS` at it. Single-endpoint mode works as is.
- `scripts/` is not copied into the image. Run the preflight check from a checkout.
- The admin listener binds 127.0.0.1 inside the container, so it cannot be reached from outside. `GET /api/health` returns `{"ok":true}` and also works as the health check path.

## 3. Configure environment variables

Set these in the service's environment settings. Replace the angle-bracket placeholders with actual values; keep credentials in the hosting platform rather than committing them to Git.

```dotenv
HOST=0.0.0.0
PORT=3001
OVERRIDE_DATA_DIR=/app/data
OVERRIDE_ACCESS_CODE=<strong shared demo password>

OVERRIDE_LLM_BASE_URL=https://ai.cloud.sdu.dk/v1
OVERRIDE_LLM_MODEL=zai-org/GLM-5.3-Flash
OVERRIDE_LLM_REASONING_EFFORT=low
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
3. Ask each monkey a question.
4. Confirm the interview badge matches the intended mode: live or scripted rehearsal.
5. Submit a guess, read the debrief, and export the session's JSONL file.
6. Start a new case for the next investigator. Confirm the earlier JSONL file remains in `/app/data`.

Share the HTTPS URL and access code with colleagues. Keep the model API key in the service configuration.

## Updates, logs, and rollback

Deploy updates between players. Push the new source and assets to the configured branch, then trigger a deployment, or let the service's auto-deploy setting do so. Use manual deployments if you need to control when an active investigation is interrupted.

Record the Git commit associated with a working release. To roll back, redeploy that known-good commit using the hosting platform. Recheck the environment settings and disk attachment, then repeat the smoke test. Rolling back the application does not restore an unfinished session or revert its log files.

Logs are stored as `/app/data/live/sessions/<session-id>.jsonl` (see the README's research records for the rest of the layout). **Export session** downloads the current session only; older sessions remain on disk after reset. Copy older logs through the host's supported file-access or backup tools. Keep backups before deleting a service or disk. Logs contain submitted questions, answers, and verdicts.

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

The game server runs straight from a checkout with `npm start`, without Docker. Not included yet: launchd units, off-machine backup, and Grafana. Prometheus config and alert examples are in [ops/prometheus.yml](ops/prometheus.yml). Back up `data/` by hand until a backup job exists, and restart the server by hand after a crash; games resume from their logs.

### 1. Install and check

On the host Mac, with Node.js 22.6 or newer, from the repository root on `demo/override`:

```sh
git pull origin demo/override
cd demos/override
npm ci
npm test
npm run build
```

`npm start` serves the built `dist/` folder, so rebuild after every pull.

### 2. Configure `.env`

`npm start` reads `demos/override/.env`. Start from the example with `cp .env.example .env`, then set:

```dotenv
NODE_ENV=production
OVERRIDE_ACCESS_CODE=<shared player password>
OVERRIDE_SECRET=<output of: openssl rand -hex 32>
OVERRIDE_ADMIN_TOKEN=<output of: openssl rand -hex 32>
OVERRIDE_APP_COMMIT=<output of: git rev-parse --short HEAD>
HOST=127.0.0.1
OVERRIDE_TRUST_PROXY=1
```

- `NODE_ENV=production` keeps draft cases hidden, whatever `OVERRIDE_DEV_TOOLS` says.
- `OVERRIDE_SECRET` keeps sign-ins valid across restarts. Without it, every restart signs all players out.
- `OVERRIDE_ADMIN_TOKEN` starts the admin listener on `127.0.0.1:3002`. Without it, there is no admin page and no `/metrics`.
- `HOST=127.0.0.1` with `OVERRIDE_TRUST_PROXY=1` is for a Cloudflare Tunnel: the login limiter then sees each player's own address. On a closed LAN, set `HOST=0.0.0.0` and leave `OVERRIDE_TRUST_PROXY` empty.
- `OVERRIDE_PUBLIC_URL` (optional) is the public address of the game, for example `https://override.example.org`. The command centre uses it for its big-screen link (`/?view=board`).
- `OVERRIDE_APP_COMMIT` is recorded in every `session_started`. Update it after each pull.

For the model, choose one:

- **One endpoint:** set `OVERRIDE_LLM_BASE_URL`, `OVERRIDE_LLM_API_KEY` and `OVERRIDE_LLM_MODEL`, as in [section 3](#3-configure-environment-variables).
- **Failover across several endpoints:** copy `ops/endpoints.example.json` to `ops/endpoints.json` and replace the example URLs and models. Then set `OVERRIDE_ENDPOINTS=ops/endpoints.json` and one `OVERRIDE_ENDPOINT_<X>_KEY` for each `keyEnv` in the file. The file holds no keys. When `OVERRIDE_ENDPOINTS` is set, the single-endpoint variables are ignored. See [LLM fallback](README.md#llm-fallback).

### 3. Prepare the machine

- Raise the connection queue limit: `sudo sysctl -w kern.ipc.somaxconn=1024`. macOS defaults to 128 and the server asks for 1024; below that, a burst of arrivals gets connection resets. The setting resets on reboot, so check it with `sysctl -n kern.ipc.somaxconn` before each event.
- Run `caffeinate -dims` for the whole event. Turn Power Nap off, keep the power adapter connected and the lid open.
- Turn off automatic macOS updates and scheduled restarts. Freeze the configuration 48 hours before, and do no development on the machine during the event.
- Use Ethernet, not Wi-Fi.

### 4. Rehearse

- `npm run loadtest` plays 200 simulated players against a mock model, including endpoint failures and a server restart. All scenarios must pass.
- `node --env-file-if-exists=.env scripts/preflight.mjs --capacity --out preflight.json` sends real questions to each configured endpoint, measures capacity in steps, and checks the connection queue limit. It exits with code 2 when the limit is below 1024. Review the report.
- Do a full test session with `OVERRIDE_ENV=rehearsal`, so it is logged under `data/rehearsal/` instead of `data/live/`. `OVERRIDE_ENV` only chooses the data folder: interviews stay live while the model keys are set. For scripted answers, leave the model variables empty.
- Test the backup target (a manual copy of `data/`).

### 5. Start and expose

```sh
npm start
```

The startup line names the interview mode and both listeners, for example `The Banana Mystery: http://127.0.0.1:3001 · live interviews · admin http://127.0.0.1:3002`. A warning about `OVERRIDE_SECRET` means sign-ins will not survive a restart.

- **Over the internet:** run a named Cloudflare Tunnel (`cloudflared`) to `http://localhost:3001` only. Cloudflare's 100 s proxy timeout exceeds the 60 s LLM deadline.
- **On a closed LAN:** give players a fixed address or `.local` name, and check that the Wi-Fi does not isolate clients.

From a machine outside, `curl --fail https://<your-host>/api/health` must return `{"ok":true}`.

### 6. Run the event

The admin page is `http://127.0.0.1:3002/admin`; paste the admin token into it. From another machine, open an SSH tunnel first with `ssh -L 3002:127.0.0.1:3002 user@mac`. Never expose the admin port through the Cloudflare Tunnel. The page is the command centre, with a failover banner and a big-screen link: players, tiles, message log, funnel and rounds (see [README](README.md#the-command-centre)). Prometheus scrapes `/metrics` on the same port with the token ([ops/prometheus.yml](ops/prometheus.yml)).

Makers get the editor page at `http://127.0.0.1:3002/admin/maker.html?case=<caseId>`. The admin port is never on the public (player) tunnel. Makers reach it either over the same SSH forward as the operator (`ssh -L 3002:127.0.0.1:3002 user@mac`), or over Tailscale, or over a separate hostname that an identity policy protects (for example Cloudflare Access requiring a login) and that points at `http://127.0.0.1:3002`. In the last case set `OVERRIDE_ADMIN_HOSTS=<that hostname>` so the listener accepts the `Host` header. Give each maker their own token in `OVERRIDE_MAKER_TOKENS=name:secret,…` (see [README](README.md#tuning-a-case-from-the-admin-page)).

One hour before:
- Start the server and confirm `/admin/health` is green.
- Open the command centre over the SSH forward and check the tiles are green.
- Press *Start round* for each session, with a clear label.

During:
- Watch the command centre, above all the LLM error-rate tile, and `/metrics`. When pinning or moving endpoints, type the reason.
- If a player sees an error, they reload the page; the game resumes from its log.
- Never delete `data/`.

After:
1. `POST /admin/sessions/pause` and let pending answers finish.
2. Copy `data/` off the machine.
3. Review incidents in `system.jsonl`.
4. Rotate the keys.

For case details and research-event fields, see [README.md](README.md).
