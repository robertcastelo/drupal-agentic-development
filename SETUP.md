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

# 2. Add any custom providers and agents (see below)

# 3. Generate the per-machine .ddev/.env and build the OpenChamber image
ddev setup

# 4. Start the stack (web, db, opencode, openchamber, playwright)
ddev start

# 5. Add Drupal (change version to install 10, 11, 12...)
ddev composer create-project "drupal/recommended-project:^10"
ddev composer require drush/drush
ddev drush site:install --account-name=admin --account-pass=admin -y
```

Notes:

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

## Connect a provider + default model

Provider keys and the default model are **per-developer** and never committed.
Three gitignored files are involved — two are created by copying the tracked
examples:

```bash
# 1. Compose override: passes env vars from .ddev/.env into the opencode container
cp .ddev/docker-compose.local.yaml.example .ddev/docker-compose.local.yaml

# 2. opencode config: sets the default model (read from the env var below)
cp .ddev/opencode/mcp/opencode.local.jsonc.example .ddev/opencode/mcp/opencode.local.jsonc
```

```bash
# 3. Fill in your values in .ddev/.env (created by `ddev setup`):
OPENROUTER_API_KEY=sk-or-v1-...
OPENCODE_DEFAULT_MODEL=openrouter/qwen/qwen3.8-max-0902
```

Then `ddev restart` — config and environment are read once at container start.

Notes:

- Model IDs use the `provider/model-id` format. Run
  `ddev exec -s opencode opencode models` to see what's available once your
  key is set.
- The example files work as-is for OpenRouter; amend them for other providers.
- OpenChamber needs no separate configuration — it uses the same opencode
  server, so it inherits providers and the default model.

## Adding another provider

Three ways, in order of simplicity:

1. **`opencode auth login`** — run
   `ddev exec -s opencode opencode auth login` and pick the provider
   (Anthropic, OpenAI, Bedrock, ...). Credentials are stored in
   `opencode/data/share/` which is bind-mounted from the host and gitignored,
   so they survive restarts and rebuilds. Then point
   `OPENCODE_DEFAULT_MODEL` in `.ddev/.env` at the new model if desired.

2. **Env-var key in `.ddev/.env`** — for keys opencode reads automatically
   (e.g. `ANTHROPIC_API_KEY`). A variable only reaches the container if a
   compose file passes it through, so add it to your
   `.ddev/docker-compose.local.yaml`:

   ```yaml
   services:
     opencode:
       environment:
         ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
   ```

3. **Custom providers** (self-hosted or anything opencode doesn't know):
   define them in `opencode.local.jsonc` — see "Custom providers + agents"
   below.


## Custom providers + agents

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