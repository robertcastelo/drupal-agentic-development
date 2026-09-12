This project is a DDEV based Drupal developer environment that also runs a
set of AI (OpenCode, OpenChamber) and testing (Playwright) containers controlled from the
`.ddev/` directory.

## Prerequisites

- DDEV v1.25+
- Docker

## Basic steps

```bash
git clone <repository-url> <destination-folder>
cd <destination-folder>

# 1. Install Drupal (change version to install 10, 11, 12...)
ddev config --project-type=drupal10 --docroot=web

# 2. Generate the per-machine .ddev/.env and build the OpenChamber image
ddev setup

# 3. Start the stack (web, db, opencode, openchamber, playwright)
ddev start

# 4. Add Drupal (change version to install 10, 11, 12...)
ddev composer create-project "drupal/recommended-project:^10"
ddev composer require drush/drush
ddev drush site:install --account-name=admin --account-pass=admin -y
```

Notes:

- `ddev setup` creates `.ddev/.env` with a fresh `OPENCHAMBER_PASSWORD` from
  `.ddev/.env.example` (the existing file is never overwritten) and ensures the
  `openchamber:local` Docker image is built.
- `ddev start` auto-builds the OpenCode and Playwright images and starts sshd
  in the web container for the AI SSH transport (ddev-ai-ssh addon).

## Project name

The project name is derived from the enclosing folder name.
This lets you keep several clones side-by-side on one machine.

**Important:** each clone must live in a folder with a distinct name (e.g.
`sandbox-10`, `sandbox-11`). If two clones share the same folder name they will
collide in the DDEV project registry:

```
Failed to start sandbox: project sandbox project root is already set to ...
```

If you ever hit that error, run `ddev stop --unlist <project-name>` from the
older location and start again.

## Running multiple clones

The AI containers bind fixed host ports, so **only one clone should be running
at a time** on a given machine:

| Container  | Host port |
|------------|-----------|
| opencode   | 3001      |
| openchamber| 3002      |
| web sshd   | 127.0.0.1:2222 |

`ddev stop` one project before `ddev start`-ing another.

## Common commands

```bash
ddev start              # start everything
ddev stop               # stop everything
ddev restart            # stop + start
ddev setup              # generate .env + ensure openchamber image (idempotent)
ddev ai-ssh-status      # check sshd + SSH keys in the web container
ddev playwright         # run Playwright E2E tests in the playwright container
```

## Notes on the AI environment

- OpenCode MCP servers (Drush, Drupal Quality, Playwright→chromium) are wired via the
  tracked `.ddev/opencode/mcp/opencode.jsonc` plus the launch scripts
  (`playwright-mcp-launch`, `drupal-quality-mcp.mjs`, `drush-mcp.mjs`) in the same dir,
  bind-mounted at `~/.config/opencode` and work on any fresh clone automatically.
  This file is meant to stay portable — it only contains shared, repo-wide settings
  and is safe to commit.

## Custom providers + agents (per-machine, not tracked)

Providers and agents are **machine-specific**, so they are **not** stored in the
tracked `opencode.jsonc`. Instead they live in a gitignored local overrides file:

- **File to edit:** `.ddev/opencode/mcp/opencode.local.jsonc`
- **Not tracked:** it is ignored via `.ddev/.gitignore`, so it never enters the repo.
- **How it merges:** the whole `mcp/` dir is bind-mounted at `~/.config/opencode`, and
  `docker-compose.opencode.yaml` sets `OPENCODE_CONFIG` to
  `/home/opencode/.config/opencode/opencode.local.jsonc`. opencode loads this custom
  config *after* the global (tracked) config and **deep-merges** both: your `provider`
  and `agent` keys combine with the tracked file's `mcp` servers.
- **Schema:** it uses the same `https://opencode.ai/config.json` schema as the tracked file.

Example — point opencode at a local LLM on the host (e.g. `host.docker.internal:8000`):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "local": {
      "name": "My local LLM",
      "npm": "@ai-sdk/openai-compatible",
      "options": { "baseURL": "http://host.docker.internal:8000/v1", "apiKey": "local" },
      "models": { "my-model": { "name": "my-model" } }
    }
  },
  "agent": {
    "my-agent": { "description": "...", "model": "local/my-model" }
  }
}
```

For real API keys, prefer `{env:VAR}` substitution so the key never sits in a file
(e.g. `"apiKey": "{env:ANTHROPIC_API_KEY}"`).

After editing either config file, **quit and restart opencode** — config is loaded
once at startup and not hot-reloaded.

The default clone ships with no `opencode.local.jsonc`; each user creates their own.
If the file is absent, opencode skips it — nothing breaks on a fresh clone.