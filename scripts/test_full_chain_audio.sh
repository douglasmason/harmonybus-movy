#!/usr/bin/env bash
set -euo pipefail
# Arguments are source checkouts; the instrument fixture is the only substitute.
INTEGRATION_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOVY_SOURCE="$(realpath "$1")"
HB_SOURCE="$(realpath "$2")"
SCHWUNG_SOURCE="$(realpath "$3")"
FIXTURE_ROOT="$(mktemp -d)"
trap 'rm -rf "$FIXTURE_ROOT"' EXIT
mkdir -p "$FIXTURE_ROOT/chain" "$FIXTURE_ROOT/movy" "$FIXTURE_ROOT/sound_generators/probe" "$FIXTURE_ROOT/midi_fx/harmonybus"
CHAIN_SOURCE="$SCHWUNG_SOURCE/src/modules/chain/dsp"
cc -O1 -shared -fPIC "$CHAIN_SOURCE/chain_host.c" "$CHAIN_SOURCE/chain_json.c" \
  "$CHAIN_SOURCE/chain_params.c" "$CHAIN_SOURCE/chain_mod.c" "$CHAIN_SOURCE/chain_midi.c" \
  "$CHAIN_SOURCE/chain_patch.c" "$CHAIN_SOURCE/chain_reorder.c" "$CHAIN_SOURCE/chain_bus.c" \
  "$SCHWUNG_SOURCE/src/host/unified_log.c" -I"$SCHWUNG_SOURCE/src" -lm -ldl -lpthread -o "$FIXTURE_ROOT/chain/dsp.so"
cc -O1 -shared -fPIC -include sys/mman.h -include unistd.h \
  "$HB_SOURCE/modules/harmonybus/dsp/harmonybus.c" "$HB_SOURCE/src/harmony_core.c" \
  -lm -o "$FIXTURE_ROOT/midi_fx/harmonybus/dsp.so"
cp "$HB_SOURCE/modules/harmonybus/module.json" "$FIXTURE_ROOT/midi_fx/harmonybus/module.json"
cc -O1 -shared -fPIC -I"$SCHWUNG_SOURCE/src" "$INTEGRATION_ROOT/tests/audio_probe.c" -o "$FIXTURE_ROOT/sound_generators/probe/dsp.so"
cat > "$FIXTURE_ROOT/sound_generators/probe/module.json" <<'JSON'
{"id":"probe","name":"PCM Probe","version":"1.0.0","api_version":2,"capabilities":{"chain_params":[],"component_type":"sound_generator"}}
JSON
cc -O1 -I"$SCHWUNG_SOURCE/src" "$INTEGRATION_ROOT/tests/full_chain_audio.c" -ldl -o "$FIXTURE_ROOT/full-chain-test"
cargo build --manifest-path "$MOVY_SOURCE/engine/Cargo.toml" -p movy-dsp
"$FIXTURE_ROOT/full-chain-test" "$MOVY_SOURCE/engine/target/debug/libmovy_dsp.so" "$FIXTURE_ROOT" restored
