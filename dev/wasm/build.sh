#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
: "${MOVY_SOURCE:?Set MOVY_SOURCE to pristine patched Movy source (same as native host)}"
: "${HB_SOURCE:?Set HB_SOURCE to pinned HarmonyBus source}"
MOVY_SOURCE="$(realpath "$MOVY_SOURCE")"
HB_SOURCE="$(realpath "$HB_SOURCE")"
OUT="$ROOT/dev/wasm/build"
mkdir -p "$OUT/seq"
cp "$ROOT/dev/wasm/seq.rs" "$OUT/seq/lib.rs"
cp "$ROOT/dev/wasm/seq-main.rs" "$OUT/seq/main.rs"
cat > "$OUT/seq/Cargo.toml" <<MANIFEST
[package]
name = "hb-browser-seq"
version = "0.1.0"
edition = "2021"
[workspace]
[lib]
path = "lib.rs"
crate-type = ["cdylib", "rlib"]
[[bin]]
name = "seq-oracle"
path = "main.rs"
[dependencies]
seq-core = { path = "$MOVY_SOURCE/engine/crates/seq-core" }
MANIFEST
cargo build --manifest-path "$OUT/seq/Cargo.toml" --lib --release --target wasm32-unknown-unknown
cargo build --manifest-path "$OUT/seq/Cargo.toml" --release --bin seq-oracle
cp "$OUT/seq/target/wasm32-unknown-unknown/release/hb_browser_seq.wasm" "$OUT/seq.wasm"
# HB already declares the host ABI prefix it consumes. Extract that exact
# definition: Schwung's full header asserts a 64-bit hardware ABI on wasm32.
sed -n '/^struct host_api_v1 {$/,/^};$/p' "$HB_SOURCE/modules/harmonybus/dsp/harmonybus.c" > "$OUT/hb-host.h"
test -s "$OUT/hb-host.h"
COMMON=(-O1 -include sys/mman.h -include unistd.h -Dshm_open=browser_shm_open -Dftruncate=browser_ftruncate -Dmmap=browser_mmap -Dclose=browser_close
  -I"$OUT" -I"$HB_SOURCE/modules/harmonybus/dsp" "$ROOT/dev/wasm/hb.c" "$HB_SOURCE/modules/harmonybus/dsp/harmonybus.c" "$HB_SOURCE/src/harmony_core.c" -lm)
cc "${COMMON[@]}" -DNATIVE_ORACLE -o "$OUT/hb-oracle"
emcc "${COMMON[@]}" -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,node -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=4194304 \
  -sEXPORTED_FUNCTIONS='["_hb_init","_hb_midi","_hb_tick","_hb_event","_hb_set","_hb_get"]' \
  -sEXPORTED_RUNTIME_METHODS='["cwrap"]' -o "$OUT/hb.mjs"
printf 'Built real HB and Movy seq-core in %s\n' "$OUT"
