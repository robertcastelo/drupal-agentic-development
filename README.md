# Drupal Agentic Development

An isolated DDEV based environment for agentic Drupal development and testing.

Everything runs in containers, giving AI coding agents a complete Drupal environment to work in without access to the rest of your computer.

- **Drupal** — web and database containers provide a live Drupal site for agents to develop against, with Drush available for command-line access.

- **AI agents** — OpenCode provides the agent server, with OpenChamber providing a password protected web interface for interacting with it. The agents run in their own containers and only have access to the project repository, which is mounted as their workspace. Anything they install, run or change stays within the DDEV environment.

- **Testing and quality** — a dedicated Playwright container provides a browser that agents can control through the Playwright MCP server. Drush and Drupal Quality MCP servers give agents access to Drupal CLI operations and code-quality checks, allowing them to build, test and verify changes end to end.

In OpenChamber give the agent a task. It can then develop, test, and validate the Drupal site within an isolated environment **without access to anything else on your machine**.

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
