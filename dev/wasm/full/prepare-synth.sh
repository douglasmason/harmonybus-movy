#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PIN=e3787739dfc099afe2eb447bab498d875afd8136
SOURCE="$ROOT/dev/wasm/build/nusaw-source"
mkdir -p "$SOURCE"
if [[ ! -d "$SOURCE/.git" ]]; then git -C "$SOURCE" init -q; git -C "$SOURCE" remote add origin https://github.com/charlesvestal/schwung-nusaw.git; fi
if ! git -C "$SOURCE" cat-file -e "$PIN^{commit}" 2>/dev/null; then git -C "$SOURCE" fetch --depth 1 origin "$PIN"; fi
git -C "$SOURCE" archive "$PIN" | tar -x -C "$SOURCE"
