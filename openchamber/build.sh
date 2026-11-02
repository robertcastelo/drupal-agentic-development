#!/bin/bash
#ddev-generated
# Reproduces the `openchamber:local` image from a pinned upstream release so
# the OpenChamber web UI can be rebuilt on any machine with the same result.
#
# Usage: .ddev/openchamber/build.sh          # builds the pinned tag
#        OPENCHAMBER_TAG=v2.6.0 .ddev/openchamber/build.sh
#        .ddev/openchamber/build.sh --if-needed  # skip if image already at tag
set -euo pipefail

TAG="${OPENCHAMBER_TAG:-v2.6.0}"
REPO="https://github.com/openchamber/openchamber.git"

# The image is labelled with its source tag so existing installs rebuild
# automatically when the pinned tag above is bumped.
if [ "${1:-}" = "--if-needed" ]; then
  CURRENT="$(docker image inspect -f '{{ index .Config.Labels "openchamber.tag" }}' openchamber:local 2>/dev/null || true)"
  if [ "${CURRENT}" = "${TAG}" ]; then
    echo "[openchamber] openchamber:local already at ${TAG}"
    exit 0
  fi
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "[openchamber] cloning ${REPO} @ ${TAG}"
git clone --quiet --depth 1 --branch "${TAG}" "${REPO}" "${TMP}"

echo "[openchamber] building openchamber:local from ${TAG}"
docker build --label "openchamber.tag=${TAG}" -t openchamber:local "${TMP}"

echo "[openchamber] built openchamber:local from ${TAG}"