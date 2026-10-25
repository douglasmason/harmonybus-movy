#!/usr/bin/env bash
# Run dev/local/setup.sh first to obtain the pinned source checkouts.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SOURCES="$ROOT/dev/local/sources"
PREPARED="$(mktemp -d)"
trap 'rm -rf "$PREPARED"' EXIT
[[ "$(git -C "$SOURCES/movy" rev-parse HEAD)" == 5c01a4fe7745b730ee98111194fc64328ea2659b ]]
[[ "$(git -C "$SOURCES/harmonybus" rev-parse HEAD)" == e9c9198fb0cbb2d5ace2d3cc6fb6b6e1140fa925 ]]
git -C "$SOURCES/movy" archive HEAD | tar -x -C "$PREPARED"
git -C "$PREPARED" init -q
SCHWUNG_ROOT="$SOURCES/schwung" HARMONYBUS_ROOT="$SOURCES/harmonybus" python3 "$ROOT/scripts/apply_clean_harmonybus.py" "$PREPARED"
MOVY_SOURCE="$PREPARED" HB_SOURCE="$SOURCES/harmonybus" bash "$ROOT/dev/wasm/build.sh"

MOVY_SOURCE="$PREPARED" HB_SOURCE="$SOURCES/harmonybus" SCHWUNG_SOURCE="$SOURCES/schwung" bash "$ROOT/dev/wasm/full/build.sh"
