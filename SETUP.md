This project is a DDEV based Drupal developer environment that also runs a
set of AI (OpenCode, OpenChamber) and testing (Playwright) containers controlled from the
`.ddev/` directory.

## Prerequisites

- DDEV v1.25+
- Docker

## Setting up a new Drupal site

Note: if you're installing this into an existing Drupal site, see "Setting up an existing Drupal site" below this section.

```bash
git clone git@github.com:robertcastelo/drupal-agentic-development.git <destination-folder>/.ddev
cd <destination-folder>

# 1. Configure ddev (change version to install 10, 11, 12...)
ddev config --project-type=drupal12 --docroot=web

# 2. Add any custom providers and agents (see below)

# 3. Generate the per-machine .ddev/.env and build the OpenChamber image
ddev setup

# 4. Start the stack (web, db, opencode, openchamber, playwright)
ddev start

# 5. Install Drupal (change version to install 10, 11, 12...)
ddev composer create-project "drupal/recommended-project:^12"
ddev composer require drush/drush
ddev drush site:install --account-name=admin --account-pass=admin -y
```

## Setting up an existing Drupal site

If you already have a Drupal codebase, attach this scaffold to it instead of starting fresh. This **replaces** any `.ddev/` the project already has, so first note down anything project-specific from the old `.ddev/config.yaml` (e.g. custom `web_environment` entries) — you'll re-add those in step 3.

```bash
cd <existing-drupal-repo>

# 0. Stop and remove the existing .ddev/. Docker volumes (your database) are
#    keyed by project name, not by .ddev/ contents, so they reattach
#    automatically once you reconfigure below — no need to re-import data
#    if this project has run under DDEV with this name before.
ddev stop
rm -rf .ddev

# 1. Clone the scaffold in as .ddev/
git clone git@github.com:robertcastelo/drupal-agentic-development.git .ddev

# 2. Configure ddev to match your project (docroot, PHP version, etc.)
ddev config --project-type=drupal12 --docroot=web --php-version=<your-php-version>

# 3. Re-add any project-specific values you noted down in step 0
ddev config --web-environment-add="MY_KEY=my-value"

# 4. Generate the per-machine .ddev/.env and build the OpenChamber image
ddev setup

# 5. Start the stack (web, db, opencode, openchamber, playwright)
ddev start

# 6. Install dependencies against your existing codebase
ddev composer install

# 7. Bring in your data (skip if the DB volume reattached automatically)
ddev import-db --file=/path/to/dump.sql.gz
ddev drush cr
ddev drush updb
```

Notes:

## Adding PHPUnit testing

Tests run inside the web container, against the project's own database. Two
things are needed beyond a working site, and one of them is easy to miss.

### Step 1: install the dev dependencies

PHPUnit and Mink are not runtime dependencies — they come from core's dev
metapackage:

```bash
ddev composer require --dev drupal/core-dev
ddev exec -s web vendor/bin/phpunit --version
```

### Step 2: get core's test code

`drupal/core` marks its `tests/` directory as `export-ignore` in its
`.gitattributes`, so **a Composer-installed core contains no `tests/`
directory**. That applies to the GitHub zipball Composer downloads *and* to a
`--prefer-source` clone, and it is deliberate: the tests are not shipped to
sites.

Without it the suite cannot start at all, because the file
`core/phpunit.xml.dist` boots is `core/tests/bootstrap.php`, and the base
classes every test extends (`Drupal\Tests\BrowserTestBase`,
`Drupal\KernelTests\KernelTestBase`) live there too:

```
Cannot open bootstrap script ".../core/tests/bootstrap.php"
```

Fetch the tests from core's git at exactly the revision the project has
locked, so the test code matches the code it will test:

```bash
CORE_REF=$(jq -r '.packages[] | select(.name=="drupal/core") | .source.reference' composer.lock)

WORKDIR=$(mktemp -d)
git init -q "$WORKDIR/core"
(
  cd "$WORKDIR/core"
  git remote add origin https://github.com/drupal/core.git
  git fetch -q --depth 1 origin "$CORE_REF"
  git checkout -q --detach FETCH_HEAD
)

cp -a "$WORKDIR/core/tests" web/core/tests
```

The install profile that functional tests install (`testing`) lives in
`core/profiles/tests/` — under that same `tests/` directory, so it is missing
too and the tests will fail with *"The profile testing does not exist"*:

```bash
cp -a "$WORKDIR/core/profiles/tests" web/core/profiles/tests

rm -rf "$WORKDIR"
```

**Repeat this step after every `ddev composer update drupal/core`**, which
replaces `web/core` and takes both copies with it. If you would rather not
repeat it, keep the two copy commands in a script next to your module.

### Which option you need

| | Where core comes from | Step 2 |
|---|---|---|
| **Option A — Drupal core development** | a git checkout (you cloned the `drupal` repo) | not needed, `core/tests` is in the clone |
| **Option B — your own project** | `composer require drupal/recommended-project` | needed |

#### Option A: Drupal core development

Clone the full `drupal` repository rather than the core-only one. It is a
Composer project that already contains `core/` **and `core/tests/`**, so step 2
does not apply — `vendor/` is created by the `composer install` below:

```bash
git clone --branch 12.x-dev git@git.drupalcode.org:project/drupal.git drupal-core-dev
cd drupal-core-dev

ddev config --project-type=drupal12 --docroot=.
ddev start
ddev composer install
ddev drush site:install --account-name=admin --account-pass=admin -y
```

Core is at `core/` in that layout, so phpunit is invoked with `-c core` and
the paths start at `core/tests/`:

```bash
ddev exec -s web vendor/bin/phpunit -c core core/tests/src/Unit
ddev exec -s web vendor/bin/phpunit -c core core/modules/user/tests/src/Kernel
```

#### Option B: development on your own project

This is the default layout this scaffold generates — `drupal/recommended-project`
with your code in `web/modules/custom`. Do step 2, and phpunit is invoked with
`-c web/core` and paths under your module:

```bash
ddev exec -s web vendor/bin/phpunit -c web/core web/modules/custom/my_module/tests/src/Kernel
```

### Environment variables

Drupal's `phpunit.xml.dist` declares these but leaves them empty, so pass them
in the environment:

| Variable | Value | Notes |
|---|---|---|
| `SIMPLETEST_BASE_URL` | the project's URL, e.g. `https://myproject.ddev.site` | must resolve **from inside the web container**, since that is where the HTTP requests are made |
| `SIMPLETEST_DB` | `mysql://USER:PASS@db:3306/DB` | copy it out of `web/sites/default/settings.ddev.php`; the user needs `CREATE`/`DROP` because tests install into **table prefixes of that same database** |
| `BROWSERTEST_OUTPUT_DIRECTORY` | an **absolute** path to `web/sites/simpletest/browser_output` | absolute matters: phpunit runs from the project root while the directory sits under the docroot |

No special hostname is required for `SIMPLETEST_BASE_URL`. Anything that
serves the project's docroot from inside the container works — the project's
own URL, `http://localhost`, or the web container's service name
(`http://web`). Prefer the project URL: it does not depend on DDEV's internal
service naming, so it survives a rename or a different container layout.

Put them in `.ddev/config.yaml` so no command needs repeating:

```yaml
web_environment:
  - SIMPLETEST_BASE_URL=http://web
  - SIMPLETEST_DB=mysql://db:db@db:3306/db
  - BROWSERTEST_OUTPUT_DIRECTORY=/var/www/html/web/sites/simpletest/browser_output
```

Then `ddev restart`. If the project has a docroot other than `web`, adjust
the paths.

### Running the tests

```bash
# Kernel tests: no HTTP, no site install, fast.
ddev exec -s web vendor/bin/phpunit -c web/core web/modules/custom/my_module/tests/src/Kernel

# Functional tests: install a throwaway site per test method.
ddev exec -s web vendor/bin/phpunit -c web/core web/modules/custom/my_module/tests/src/Functional

# One class, or one method, across both directories.
ddev exec -s web vendor/bin/phpunit -c web/core web/modules/custom/my_module/tests/src
ddev exec -s web vendor/bin/phpunit -c web/core --filter testMyMethod web/modules/custom/my_module/tests/src
```

`-c web/core` selects core's `phpunit.xml.dist`, which is what sets the
bootstrap, the test suites and the (empty) env defaults above.

### Keeping it in a script

Three long environment variables get old fast, so as an alternativer use the one-line: `tools/run-legal-tests.sh`

Which runs:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TESTS=("$@")
[ ${#TESTS[@]} -eq 0 ] && TESTS=(web/modules/custom/my_module/tests/src)

mkdir -p "$ROOT/web/sites/simpletest/browser_output"

ddev exec -s web -- env \
  SIMPLETEST_BASE_URL="https://myproject.ddev.site" \
  SIMPLETEST_DB="mysql://db:db@db:3306/db" \
  BROWSERTEST_OUTPUT_DIRECTORY="$ROOT/web/sites/simpletest/browser_output" \
  ./vendor/bin/phpunit -c web/core "${TESTS[@]}"
```

### Notes and gotchas

- **`web/sites/simpletest/` is disposable.** Tests write per-run directories and
  the failed-test HTML there. Deleting it is safe; a 404 for its pages is
  expected.
- **Drupal 12 requires `#[RunTestsInSeparateProcesses]`** on every kernel and
  functional test class. Put it on the concrete class — an abstract base class
  is not enough, the check reads the class under test.
- **Query strings in `drupalGet()` need an absolute URL.** A relative path
  like `drupalGet('some/path?token=abc')` gets percent-encoded into the path
  and 404s; build the URL with `$this->baseUrl` instead.
- **Functional (browser) tests are slow**: each test method installs a site.
  Keep the kernel tests separate so the fast feedback loop stays fast.
- **JavaScript tests (`FunctionalJavascript`) are not set up here.** They need a
  chromedriver/selenium endpoint via `MINK_DRIVER_ARGS_WEBDRIVER`, which this
  stack does not provide.
- **A leftover deprecation count in the output is not a failure** as long as the
  exit code is 0.

## Project name

The project name is derived from the enclosing folder name.
This lets you keep several clones side-by-side on one machine.

**Important:** each clone must live in a folder with a distinct name (e.g.
`sandbox-11`, `sandbox-12`). If two clones share the same folder name they will
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