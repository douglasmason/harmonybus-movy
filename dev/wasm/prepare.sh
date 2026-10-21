#!/usr/bin/env bash
# Run dev/local/setup.sh first to obtain the pinned source checkouts.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SOURCES="$ROOT/dev/local/sources"
PREPARED="$(mktemp -d)"
trap 'rm -rf "$PREPARED"' EXIT
[[ "$(git -C "$SOURCES/movy" rev-parse HEAD)" == 5c01a4fe7745b730ee98111194fc64328ea2659b ]]
[[ "$(git -C "$SOURCES/harmonybus" rev-parse HEAD)" == b1619b9b73f305a7ddbf5f7a8fcd25fe88f60d50 ]]
git -C "$SOURCES/movy" archive HEAD | tar -x -C "$PREPARED"
git -C "$PREPARED" init -q
HARMONYBUS_ROOT="$SOURCES/harmonybus" python3 "$ROOT/scripts/apply_clean_harmonybus.py" "$PREPARED"
MOVY_SOURCE="$PREPARED" HB_SOURCE="$SOURCES/harmonybus" bash "$ROOT/dev/wasm/build.sh"

MOVY_SOURCE="$PREPARED" HB_SOURCE="$SOURCES/harmonybus" SCHWUNG_SOURCE="$SOURCES/schwung" bash "$ROOT/dev/wasm/full/build.sh"
