#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SOURCES="$ROOT/dev/local/sources"
mkdir -p "$SOURCES"
checkout() {
  local name="$1" url="$2" revision="$3"
  if [[ ! -d "$SOURCES/$name" ]]; then
    git clone "$url" "$SOURCES/$name"
    git -C "$SOURCES/$name" checkout "$revision"
  elif [[ "$(git -C "$SOURCES/$name" rev-parse HEAD)" != "$revision" ]]; then
    printf 'Unexpected source revision in %s; use a fresh sources directory.\n' "$SOURCES/$name" >&2
    exit 1
  fi
}
checkout movy https://github.com/DimaDake/schwung-movy.git 5c01a4fe7745b730ee98111194fc64328ea2659b
checkout harmonybus https://github.com/douglasmason/harmonybus.git 3ddca0001fd62ce07bb2ab09c91f64dfb1726436
checkout schwung https://github.com/charlesvestal/schwung.git e877ed64b2b727f5f928c7faa87fef1e12171286
python3 "$ROOT/scripts/apply_clean_harmonybus.py" "$SOURCES/movy"
npm ci --prefix "$SOURCES/movy"
npm ci --prefix "$ROOT/dev/local"
bash "$ROOT/dev/local/build.sh" "$SOURCES/movy" "$SOURCES/harmonybus" "$SOURCES/schwung"
node --test "$ROOT/dev/local/test.mjs"
