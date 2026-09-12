# DDEV Usage

This DDEV environment runs Drupal plus AI (OpenCode, OpenChamber) and testing
(Playwright) containers.

## Access OpenChamber

OpenChamber runs on **127.0.0.1:3002**.

The UI is password-protected. Get the password from `.ddev/.env`:

```bash
# .ddev/.env
OPENCHAMBER_PASSWORD=...
```

Open your browser to http://127.0.0.1:3002 and enter the password from
`.ddev/.env` when prompted.

## Set the project in OpenChamber

Inside the OpenChamber UI, set the project/working directory to:

```
workspaces/sandbox
```

This maps to the repo root via the bind mount
`../:/home/openchamber/workspaces/sandbox` (see
`docker-compose.openchamber.yaml`).

## Run MCP servers

OpenChamber uses the MCP servers defined in `opencode/mcp/opencode.jsonc`:

- **`playwright`** — browser automation for UI testing.
- **`drush`** — Drupal CLI commands.
- **`drupal_quality`** — code-quality checks (drupal-code-quality).

Their launchers live in `opencode/mcp/` (`playwright-mcp-launch`,
`drupal-quality-mcp.mjs`, `drush-mcp.mjs`).

## Related docs

- See `SETUP.md` in this directory for full setup and configuration details.
