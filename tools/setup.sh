#!/bin/sh
# Fetches the pinned upstream Bend compiler into vendor/bend and builds build/bend2.
set -e
cd "$(dirname "$0")/.."
TAG=v2.0.40
if [ ! -d vendor/bend/.git ]; then
  git clone --quiet --depth 1 --branch "$TAG" https://github.com/bendlang/bend vendor/bend
fi
[ "$(git -C vendor/bend describe --tags)" = "$TAG" ] || { echo "vendor/bend is not at $TAG" >&2; exit 1; }
bun tools/build.ts
