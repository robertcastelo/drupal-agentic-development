#!/usr/bin/env bash
#
# Fetches core's test code into web/core/tests.
#
# drupal/core marks its tests directory as export-ignore, so a Composer install
# of core (dist zipball or git source) never unpacks it. PHPUnit needs it: the
# bootstrap that web/core/phpunit.xml.dist points at lives there, as do the
# Drupal\Tests and Drupal\TestTools namespaces that every test class extends.
#
# Run this after any 'composer update' or 'composer reinstall drupal/core',
# because those replace web/core and take the copy with them.
#
# Usage: tools/get-core-tests.sh [path ...]
#   No arguments copies core/tests plus the tests of core's own modules,
#   themes and profiles, which is what core's test runner and its module tests
#   need. Pass explicit paths to copy only those.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CORE="$ROOT/web/core"

if [ ! -f "$CORE/composer.json" ]; then
  echo "web/core does not look like a Drupal core checkout." >&2
  exit 1
fi

# Pin to whatever version of core this project actually has installed, so the
# test code always matches the code it will run against.
read_core_ref() {
  if command -v jq >/dev/null 2>&1; then
    jq -r '[(.packages // [])[], (.["packages-dev"] // [])[]] | map(select(.name == "drupal/core")) | .[0].source.reference // empty' composer.lock
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c '
import json
lock = json.load(open("composer.lock"))
for section in ("packages", "packages_dev"):
    for package in lock.get(section, []):
        if package["name"] == "drupal/core":
            print(package.get("source", {}).get("reference", ""))
            raise SystemExit
'
  else
    echo "Need jq or python3 to read composer.lock." >&2
    exit 1
  fi
}

REF="$(read_core_ref)"

if [ -z "$REF" ]; then
  echo "Could not find drupal/core in composer.lock." >&2
  exit 1
fi

echo "Fetching drupal/core $REF"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

git init -q "$WORKDIR/core-src"
(
  cd "$WORKDIR/core-src"
  git remote add origin https://github.com/drupal/core.git
  git fetch -q --depth 1 origin "$REF"
  git checkout -q --detach FETCH_HEAD
)

if [ ! -d "$WORKDIR/core-src/tests" ]; then
  echo "The fetched checkout has no tests directory." >&2
  exit 1
fi

copy() {
  local path="$1"
  mkdir -p "$CORE/$(dirname "$path")"
  cp -a "$WORKDIR/core-src/$path" "$CORE/$path"
  echo "  copied $path"
}

if [ $# -gt 0 ]; then
  for path in "$@"; do
    copy "$path"
  done
else
  copy tests
  for dir in modules/* themes/* profiles/*; do
    if [ -d "$WORKDIR/core-src/$dir/tests" ]; then
      copy "$dir/tests"
    fi
  done
fi

echo "Done. $CORE/tests/bootstrap.php now exists:"
ls -l "$CORE/tests/bootstrap.php"
