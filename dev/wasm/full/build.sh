#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
: "${MOVY_SOURCE:?Prepared Movy source required}"
: "${HB_SOURCE:?Pinned HB source required}"
: "${SCHWUNG_SOURCE:?Pinned Schwung source required}"
OUT="$ROOT/dev/wasm/build/full"
mkdir -p "$OUT/engine" "$OUT/schwung" "$OUT/objects"
tar -C "$MOVY_SOURCE/engine" --exclude=target -cf - . | tar -C "$OUT/engine" -xf -
tar -C "$SCHWUNG_SOURCE" -cf - src | tar -C "$OUT/schwung" -xf -
node "$ROOT/dev/wasm/full/port.mjs" "$OUT/engine" "$OUT/schwung"
RUSTFLAGS='-C panic=abort' cargo build --manifest-path "$OUT/engine/Cargo.toml" -p movy-dsp --target wasm32-unknown-emscripten --release
CHAIN="$OUT/schwung/src/modules/chain/dsp"
COMMON=(-O1 -I"$OUT/schwung/src" -I"$CHAIN" -Ddlopen=browser_dlopen -Ddlsym=browser_dlsym -Ddlclose=browser_dlclose -Ddlerror=browser_dlerror)
for component in chain_host chain_json chain_synth_load chain_fx_load chain_params chain_mod chain_midi chain_patch chain_reorder chain_bus chain_scene chain_chance chain_lanes; do
  EXTRA=()
  if [[ "$component" == chain_host ]]; then EXTRA=(-Dmove_plugin_init_v2=browser_chain_init -Dmove_plugin_init=browser_chain_init_v1); fi
  emcc "${COMMON[@]}" "${EXTRA[@]}" -c "$CHAIN/$component.c" -o "$OUT/objects/$component.o"
done
for component in lane_store lane_serial lane_edit unified_log; do
  emcc "${COMMON[@]}" -c "$OUT/schwung/src/host/$component.c" -o "$OUT/objects/$component.o"
done
emcc "${COMMON[@]}" -Dmove_plugin_init_v2=browser_probe_init -c "$ROOT/tests/audio_probe.c" -o "$OUT/objects/probe.o"
emcc "${COMMON[@]}" -include sys/mman.h -include unistd.h -Dshm_open=browser_shm_open -Dftruncate=browser_ftruncate -Dmmap=browser_mmap -Dclose=browser_close -c "$HB_SOURCE/modules/harmonybus/dsp/harmonybus.c" -o "$OUT/objects/hb.o"
emcc "${COMMON[@]}" -c "$HB_SOURCE/src/harmony_core.c" -o "$OUT/objects/core.o"
emcc "${COMMON[@]}" -c "$ROOT/dev/wasm/memory.c" -o "$OUT/objects/memory.o"
for component in registry host; do
  emcc "${COMMON[@]}" -c "$ROOT/dev/wasm/full/$component.c" -o "$OUT/objects/$component.o"
done
MODULES="$OUT/modules"
mkdir -p "$MODULES/chain" "$MODULES/movy" "$MODULES/midi_fx/harmonybus" "$MODULES/sound_generators/probe"
cp "$HB_SOURCE/modules/harmonybus/module.json" "$MODULES/midi_fx/harmonybus/module.json"
printf '%s' '{"id":"probe","name":"PCM Probe","version":"1.0.0","api_version":2,"capabilities":{"chain_params":[],"component_type":"sound_generator"}}' > "$MODULES/sound_generators/probe/module.json"
# Existence/copy metadata only; registry resolves entry points, never these bytes.
for path in chain/dsp.so midi_fx/harmonybus/dsp.so sound_generators/probe/dsp.so; do printf 'static registry\n' > "$MODULES/$path"; done
emcc "$OUT"/objects/*.o "$OUT/engine/target/wasm32-unknown-emscripten/release/libmovy_dsp.a" -lm \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,node -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=8388608 \
  -sEXPORTED_FUNCTIONS='["_full_init","_full_set","_full_get","_full_step","_full_midi","_full_clear","_full_count","_full_event","_full_overflow"]' \
  -sEXPORTED_RUNTIME_METHODS='["cwrap"]' --embed-file "$MODULES@/modules" -o "$OUT/engine.mjs"
