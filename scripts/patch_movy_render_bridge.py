#!/usr/bin/env python3
"""Patch Movy's private chain host so nested HarmonyBus Render To Ch reaches native tracks."""
from __future__ import annotations

import argparse
from pathlib import Path


def replace_once(source: str, before: str, after: str, seam: str) -> str:
    """Replace one exact upstream seam, accepting an already-applied transform."""
    if after in source:
        return source
    count: int = source.count(before)
    if count != 1:
        raise RuntimeError(f"Movy render seam {seam!r} drifted: expected 1 match, found {count}")
    return source.replace(before, after, 1)


def transform(source: str) -> str:
    """Translate cable-2 note injection from nested chains into Movy's safe internal-MIDI path."""
    source = replace_once(
        source,
        "type SendFn = unsafe extern \"C\" fn(msg: *const u8, len: c_int) -> c_int;\n\n"
        "/// Schwung's own `(internal, external)` senders, saved before the copy's\n"
        "/// pointers are overwritten. The drain and the pass-through both go here.\n"
        "static ORIGINALS: OnceLock<(Option<SendFn>, Option<SendFn>)> = OnceLock::new();\n",
        "type SendFn = unsafe extern \"C\" fn(msg: *const u8, len: c_int) -> c_int;\n"
        "type InjectFn = unsafe extern \"C\" fn(msg: *const u8, len: c_int) -> c_int;\n\n"
        "/// Schwung's own `(internal, external)` senders, saved before the copy's\n"
        "/// pointers are overwritten. The drain and the pass-through both go here.\n"
        "static ORIGINALS: OnceLock<(Option<SendFn>, Option<SendFn>)> = OnceLock::new();\n"
        "static ORIGINAL_INJECT: OnceLock<Option<InjectFn>> = OnceLock::new();\n\n"
        "/// Nested chain modules receive Movy's overtake host API, whose\n"
        "/// `midi_inject_to_move` path is not the shadow-chain cable-2 router that\n"
        "/// HarmonyBus normally sees in a native Schwung slot. HarmonyBus uses\n"
        "/// cable 2 note packets specifically to address native tracks by MIDI\n"
        "/// channel. Convert only those note packets into the same safe internal\n"
        "/// MIDI path Movy itself uses for tracks 1-4; preserve every other\n"
        "/// injection verbatim (transport CC, etc.).\n"
        "unsafe extern \"C\" fn shim_inject_to_move(msg: *const u8, len: c_int) -> c_int {\n"
        "    if !msg.is_null() && len == 4 {\n"
        "        let packet = core::slice::from_raw_parts(msg, 4);\n"
        "        let cable = packet[0] & 0xF0;\n"
        "        let cin = packet[0] & 0x0F;\n"
        "        let status = packet[1] & 0xF0;\n"
        "        if cable == 0x20 && (cin == 0x08 || cin == 0x09)\n"
        "            && (status == 0x80 || status == 0x90)\n"
        "        {\n"
        "            let sent = shim_send_internal(packet[1..].as_ptr(), 3);\n"
        "            return if sent == 3 { 4 } else { 0 };\n"
        "        }\n"
        "    }\n"
        "    let Some(inject) = ORIGINAL_INJECT.get() else { return 0 };\n"
        "    match *inject {\n"
        "        Some(f) => f(msg, len),\n"
        "        None => 0,\n"
        "    }\n"
        "}\n",
        "inject wrapper",
    )
    source = replace_once(
        source,
        "    let _ = ORIGINALS.set((copy.midi_send_internal, copy.midi_send_external));\n"
        "    copy.midi_send_internal = Some(shim_send_internal);\n"
        "    copy.midi_send_external = Some(shim_send_external);\n",
        "    let _ = ORIGINALS.set((copy.midi_send_internal, copy.midi_send_external));\n"
        "    let _ = ORIGINAL_INJECT.set(copy.midi_inject_to_move);\n"
        "    copy.midi_send_internal = Some(shim_send_internal);\n"
        "    copy.midi_send_external = Some(shim_send_external);\n"
        "    copy.midi_inject_to_move = Some(shim_inject_to_move);\n",
        "install inject wrapper",
    )
    return source


def main() -> int:
    """Patch a clean or already-patched Movy checkout in place."""
    parser = argparse.ArgumentParser()
    parser.add_argument("movy_root", type=Path)
    args = parser.parse_args()
    path = args.movy_root.resolve() / "engine/crates/movy-dsp/src/chain_host.rs"
    original = path.read_text()
    updated = transform(original)
    path.write_text(updated)
    print(f"HarmonyBus render bridge applied: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
