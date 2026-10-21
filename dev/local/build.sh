#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MOVY="$(realpath "$1")"
HB="$(realpath "$2")"
SCHWUNG="$(realpath "$3")"
OUTPUT="$ROOT/dev/local/build"
mkdir -p "$OUTPUT"
# Keep the existing full-chain build/test script as the build source of truth.
HB_DEV_OUTPUT="$OUTPUT/modules" bash "$ROOT/scripts/test_full_chain_audio.sh" "$MOVY" "$HB" "$SCHWUNG"
cc -O1 -fPIC -c "$ROOT/dev/local/isolate.c" -o "$OUTPUT/isolate.o"
cc -O1 -shared -fPIC -include sys/mman.h -include unistd.h -Dshm_open=hb_dev_shm_open \
 "$HB/modules/harmonybus/dsp/harmonybus.c" "$HB/src/harmony_core.c" "$OUTPUT/isolate.o" -lm -o "$OUTPUT/modules/midi_fx/harmonybus/dsp.so"
cc -O1 -I"$SCHWUNG/src" "$ROOT/dev/local/host.c" -ldl -o "$OUTPUT/host"
cp "$MOVY/engine/target/debug/libmovy_dsp.so" "$OUTPUT/libmovy_dsp.so"
cp "$HB/modules/harmonybus/web_ui.html" "$OUTPUT/field.html"
cp "$HB/modules/harmonybus/field-web.js" "$OUTPUT/field-web.js"
cp "$SCHWUNG/schwung-manager/static/schwung-remote-api.js" "$OUTPUT/schwung-remote-api.js"
MOVY_SOURCE="$MOVY" node "$ROOT/dev/local/build-ui.mjs"
printf 'Local host built: %s\n' "$OUTPUT"
