# Cloudflare deployment

This project is deployed as a private self-hosted application. FastAPI and
SQLite stay on the machine running the app; Cloudflare Tunnel only provides
the inbound connection and Access protects the hostname.

## 1. Install cloudflared

On macOS:

```bash
brew install cloudflared
```

## 2. Create a named tunnel

Authenticate against the Cloudflare account that owns the domain:

```bash
cloudflared tunnel login
cloudflared tunnel create dash-v
```

The second command prints a tunnel UUID and creates a credential file under
`~/.cloudflared/`. Keep that JSON file private.

Copy the repository template and replace the placeholders:

```bash
cp deploy/cloudflared/config.yml.example ~/.cloudflared/config.yml
```

Set the DNS route. Replace `dash.example.com` with a hostname in a zone
managed by the same Cloudflare account:

```bash
cloudflared tunnel route dns dash-v dash.example.com
```

## 3. Protect the hostname with Access

In Cloudflare Zero Trust:

1. Open **Access > Applications > Add an application > Self-hosted**.
2. Add the exact hostname, for example `dash.example.com`.
3. Create an **Allow** policy whose selector is your email address.
4. Keep the default action for users who do not match the policy as deny.

The Access application must cover the same hostname used by the tunnel. Both
the page and `/api/*` endpoints are then protected by the same login.

## 4. Start the app and tunnel

Build the frontend once, then run the API on loopback only:

```bash
cd frontend
bun install
bun run build
cd ..
uv run uvicorn app:app --host 127.0.0.1 --port 8000
```

In a second terminal:

```bash
cloudflared tunnel run dash-v
```

Do not use `--reload` for the long-running process. The app is reachable at
the Access-protected hostname while the two processes are running.

## Database and privacy

- The default database is `<repository>/data/dash.db`.
- Set `DASH_DB_PATH` to a persistent absolute path when using a VPS or a
  service manager.
- The SQLite file is not stored in Cloudflare. Tunnel traffic does pass
  through Cloudflare, and Access may retain authentication/access metadata.
- `DASH_ALLOWED_ORIGINS` is optional. Leave it empty for this same-origin
  deployment; set it to a comma-separated list only when using a separate
  frontend origin.

Create a backup before upgrades or migrations:

```bash
uv run python scripts/backup_db.py
```

For a machine that may be rebuilt, copy the resulting `backups/` files to a
separate encrypted location. Cloudflare Tunnel is not a database backup.
