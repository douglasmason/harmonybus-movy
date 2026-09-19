"""Prevent stale native set identities from resurrecting Movy sequences."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_deleted_set(root: Path) -> None:
    """Start a fresh working state only after confirmed absence on every page."""
    path: Path = root / 'src/seq/set-session.ts'
    source: str = path.read_text()
    source = source.replace('import { collectDeadSets }', 'import { collectDeadSets, setUuidAlive }')
    source = source.replace('    BLANK_STATE, fileExists,', '    BLANK_STATE, MOVE_SETS_DIR, fileExists,')
    source = replace_once(source, 'let collected = false;', 'let collected = false;\nlet missingSetId = "";\nlet missingSetSince = 0;')
    source = replace_once(source, '    collected = false;', '    collected = false;\n    missingSetId = ""; missingSetSince = 0;')
    source = replace_once(source, 'collectDeadSets(setId);', 'collectDeadSets(setId.startsWith("__deleted-") ? setId.slice(10) : setId);')
    source = replace_once(source, "        const id = active ? active.id.uuid : '_default';\n        const name = active ? active.id.name : '';\n        const provisional = active ? active.provisional : true;", '''        let id = active ? active.id.uuid : '_default';
        let name = active ? active.id.name : '';
        let provisional = active ? active.provisional : true;
        // Schwung can retain the old UUID when a set is deleted without a pad
        // change. Missing from the active page alone is NOT deletion: check
        // every stashed page and tolerate a two-second page-move interval.
        if (!provisional && typeof host_file_exists === 'function' &&
            fileExists(MOVE_SETS_DIR) && !setUuidAlive(id)) {
            const now = Date.now();
            if (missingSetId !== id || now < missingSetSince) {
                missingSetId = id; missingSetSince = now;
            }
            if (now - missingSetSince < 2000) return;
            id = '__deleted-' + id;
            name = ''; provisional = true;
        } else { missingSetId = ''; missingSetSince = 0; }
''')
    path.write_text(source)
    path = root / 'browser-test/logic/set-session.mjs'
    source = path.read_text()
    marker: str = '    /* R15 — a Set deleted in Move'
    regression: str = '''    /* Deleting the active native set may leave active_set.txt unchanged. */
    {
        const SETS = '/data/UserData/UserLibrary/Sets';
        const PAGES = '/data/UserData/schwung/set_pages';
        const originalNow = Date.now;
        let now = 100000;
        Date.now = () => now;
        try {
            const { fs, eng } = boot({[ACTIVE]: 'DELETED-LIVE\\nSong\\n',
                [SETS]: DIR, [SETS + '/DELETED-LIVE']: DIR,
                [uuidToStatePath('DELETED-LIVE')]: SAVED});
            delete fs.files[SETS + '/DELETED-LIVE'];
            run();
            eq('missing set waits through page-move grace', eng.stateBlob, SAVED);
            fs.files[PAGES] = DIR;
            fs.files[PAGES + '/page_3/DELETED-LIVE'] = DIR;
            now += 2500; run();
            eq('stashed active set is preserved', eng.stateBlob, SAVED);
            delete fs.files[PAGES + '/page_3/DELETED-LIVE'];
            run(); now += 2500; run();
            eq('deleted set starts a fresh working state', eng.stateBlob, BLANK);
            eq('deleted set UUID is not reused', currentSetUuid(), '__deleted-DELETED-LIVE');
            eq('previous data remains separate', readBestState('DELETED-LIVE').payload, SAVED);
            fs.files[SETS + '/NEW-LIVE'] = DIR;
            fs.files[ACTIVE] = 'NEW-LIVE\\nNew Song\\n';
            run();
            eq('newly materialized set stays blank', eng.stateBlob, BLANK);
            teardown();
        } finally { Date.now = originalNow; }
    }

'''
    source = replace_once(source, marker, regression + marker)
    path.write_text(source)
