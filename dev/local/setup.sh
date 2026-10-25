#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SOURCES="$ROOT/dev/local/sources"
for tool in git cc cargo node npm python3 tar; do
  command -v "$tool" >/dev/null || { printf "Missing build tool: %s\n" "$tool" >&2; exit 1; }
done
mkdir -p "$SOURCES"
checkout() {
  local name="$1" url="$2" revision="$3"
  if [[ ! -d "$SOURCES/$name" ]]; then
    git init -q "$SOURCES/$name"
    git -C "$SOURCES/$name" remote add origin "$url"
    git -C "$SOURCES/$name" fetch --depth 1 origin "$revision"
    git -C "$SOURCES/$name" checkout --detach "$revision"
  elif [[ "$(git -C "$SOURCES/$name" rev-parse HEAD)" != "$revision" ]]; then
    printf 'Unexpected source revision in %s; use a fresh sources directory.\n' "$SOURCES/$name" >&2
    exit 1
  fi
}
checkout movy https://github.com/DimaDake/schwung-movy.git 5c01a4fe7745b730ee98111194fc64328ea2659b
checkout harmonybus https://github.com/douglasmason/harmonybus.git d0fa77f762fe2628ca0be818c9de4bf0b6e84326
checkout schwung https://github.com/charlesvestal/schwung.git a6f7ec9e5cf4d0df172a1dbc00b29d0b5eb67124
# Always patch a pristine export: the integration patch stack is not idempotent.
# The cached source checkout and any local edits are left untouched.
PREPARED="$(mktemp -d "$SOURCES/movy-prepared.XXXXXX")"
trap 'rm -rf "$PREPARED"' EXIT
git -C "$SOURCES/movy" archive HEAD | tar -x -C "$PREPARED"
git -C "$PREPARED" init -q
SCHWUNG_ROOT="$SOURCES/schwung" HARMONYBUS_ROOT="$SOURCES/harmonybus" python3 "$ROOT/scripts/apply_clean_harmonybus.py" "$PREPARED"
npm ci --no-audit --no-fund --prefix "$PREPARED"
npm ci --no-audit --no-fund --prefix "$ROOT/dev/local"
bash "$ROOT/dev/local/build.sh" "$PREPARED" "$SOURCES/harmonybus" "$SOURCES/schwung"
node --test "$ROOT/dev/local/test.mjs"
