#!/bin/bash
#ddev-generated
# Reproduces the `openchamber:local` image from a pinned upstream release so
# the OpenChamber web UI can be rebuilt on any machine with the same result.
#
# Usage: .ddev/openchamber/build.sh          # builds the pinned tag
#        OPENCHAMBER_TAG=v1.2.3 .ddev/openchamber/build.sh
set -euo pipefail

TAG="${OPENCHAMBER_TAG:-v1.21.1}"
REPO="https://github.com/openchamber/openchamber.git"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "[openchamber] cloning ${REPO} @ ${TAG}"
git clone --quiet --depth 1 --branch "${TAG}" "${REPO}" "${TMP}"

echo "[openchamber] building openchamber:local from ${TAG}"
docker build -t openchamber:local "${TMP}"

echo "[openchamber] built openchamber:local from ${TAG}"