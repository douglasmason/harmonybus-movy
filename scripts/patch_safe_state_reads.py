"""Separate observational state reads from the UI-owned autosave snapshot."""
import json
from pathlib import Path

from patch_responsive_persistence import replace_once


def patch_safe_state_reads(root: Path) -> None:
    """Keep Manager observation read-only while preserving autosave retry ownership."""
    path: Path = root / 'engine/crates/movy-dsp/src/lib.rs'
    source: str = replace_once(path.read_text(), '''            // Serialize for autosave; reading it clears the dirty flag (the UI
            // is about to persist exactly this snapshot).
            "state" => {
                let s = seq_core::persist::serialize(&self.engine);
                self.engine.dirty = false;
                Some(s)
            }''', '''            // Manager subscribes to state. Observation must not acknowledge a save.
            "state" => Some(seq_core::persist::serialize(&self.engine)),
            // Only the local persistence owner consumes this snapshot. Its retry
            // flag outlives write failures and its next read captures intervening edits.
            "save_state" => {
                let snapshot = seq_core::persist::serialize(&self.engine);
                self.engine.dirty = false;
                Some(snapshot)
            }''')
    tests: str = '''
#[cfg(test)]
mod state_observation_tests {
    use super::*;
    #[test]
    fn observers_cannot_consume_pending_autosave() {
        let mut instance = Instance::new();
        instance.set_param("cmd", "bpm 13700");
        assert!(instance.engine.dirty);
        let expected = seq_core::persist::serialize(&instance.engine);
        for _ in 0..8 {
            assert_eq!(instance.get_param("state").as_deref(), Some(expected.as_str()));
            assert!(instance.engine.dirty);
        }
        assert_eq!(instance.get_param("save_state").as_deref(), Some(expected.as_str()));
        assert!(!instance.engine.dirty);
        instance.set_param("cmd", "bpm 14500");
        assert!(instance.engine.dirty);
        assert_ne!(instance.get_param("state").as_deref(), Some(expected.as_str()));
        assert!(instance.engine.dirty);
        // Loading a successfully persisted Set retains its existing clean state.
        instance.set_param("state", &expected);
        assert!(!instance.engine.dirty);
    }
}
'''
    if tests not in source:
        source += tests
    path.write_text(source)
    path = root / 'src/seq/set-save.ts'
    source = path.read_text().replace("host_module_get_param('state')", "host_module_get_param('save_state')")
    source = source.replace(' * Two rules survive from the persistence rewrite, and both were written against',
        ' * The dedicated save_state snapshot belongs only to this persistence owner.\n * Ordinary state reads (including Manager subscriptions) are non-consuming.\n * Two rules survive from the persistence rewrite, and both were written against')
    path.write_text(source)
    path = root / 'browser-test/mock-engine.mjs'
    source = replace_once(path.read_text(), "        if (key === 'state') return engine.stateBlob;", """        if (key === 'state') return engine.stateBlob;
        if (key === 'save_state') { engine.status.dirty = 0; return engine.stateBlob; }""")
    path.write_text(source)
    path = root / 'browser-test/logic/set-session.mjs'
    source = path.read_text().replace('reading `state` clears', 'reading `save_state` clears')
    marker: str = '    /* R1 — a Set that names itself late'
    regression: str = '''    /* A Manager-like observer cannot consume an edit before the autosave poll. */
    {
        const { fs, eng } = boot({ [ACTIVE]: 'OBSERVED\\nObserved Set\\n', [uuidToStatePath('OBSERVED')]: SAVED });
        eng.stateBlob = EDITED; eng.status.dirty = 1;
        for (let index = 0; index < 5; index++) host_module_get_param('state');
        eq('observation leaves native dirty pending', eng.status.dirty, 1);
        for (let index = 0; index < 8; index++) seqEngineTick();
        sessionFlush();
        eq('observed edit is persisted', readBestState('OBSERVED').payload, EDITED);
        eq('save owner consumes the snapshot', eng.status.dirty, 0);
        const files = { ...fs.files }; teardown();
        const restored = boot(files);
        eq('observed edit survives restart', restored.eng.stateBlob, EDITED);
        teardown();
    }

'''
    if regression not in source:
        source = replace_once(source, marker, regression + marker)
    path.write_text(source)
    path = root / 'module.json'
    map_key_to_metadata: dict = json.loads(path.read_text())
    map_key_to_metadata['browser_transport_v1'] = {'state_read_preserves_dirty': True}
    path.write_text(json.dumps(map_key_to_metadata, indent=4) + '\n')
    for relative_path in ('engine/crates/movy-dsp/src/lib.rs', 'src/seq/constants.ts'):
        path = root / relative_path
        path.write_text(path.read_text().replace('0.101.0-queue-copy1', '0.102.0-safe-state1'))
