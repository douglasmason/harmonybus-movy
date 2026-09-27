"""Describe assigned touch operations and format named numeric enums faithfully."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_touch_labels(root: Path) -> None:
    """Use one bounded label snapshot; touch/release/render remain read-free."""
    path: Path = root / 'src/renderer/schwung-page.ts'
    source: str = "import { appState } from '../app/state.js';\n" + path.read_text()
    source = source.replace('/^follow_touch_[1-9]$/', '/^follow_touch_(?:[1-9]|10)$/')
    source = replace_once(source, '    const lib = schwungLib();', '''    let touchLabelsAt = -Infinity;
    let touchLabelsPage = -1;
    function refreshTouchLabels(force = false): void {
        if (hostedModuleId !== 'harmonybus' || !ctl.page?.keys?.some((key: string) => /^follow_touch_/.test(key))) return;
        const now = Date.now();
        if (!force && touchLabelsPage === ctl.pageIndex && now >= touchLabelsAt && now - touchLabelsAt < 500) return;
        touchLabelsAt = now; touchLabelsPage = ctl.pageIndex;
        const fields = String(port.getParam(qualify('follow_touch_labels')) ?? '').split('|');
        if (fields.length !== 10) return;
        ctl.page.keys.forEach((key: string, slot: number) => {
            const match = /^follow_touch_(\\d+)$/.exec(key);
            if (!match) return;
            const field = fields[Number(match[1]) - 1];
            const split = field.indexOf(':');
            const lane = Number(field.slice(0, split));
            if (split < 1 || lane < 1 || lane > 16 || !field.slice(split + 1)) return;
            const meta = ctl.metaAt(slot);
            if (meta) { meta.label = field.slice(split + 1); meta.short_name = meta.label; }
            ctl.state.values[key] = String(lane);
            readCache.set(qualify(key), String(lane));
        });
        appState.dirty = true;
    }
    const lib = schwungLib();''')
    source = replace_once(source, '        announce: () => {},', '''        // Schwung's compact enum/peek respects named values, but its generic
        // formatter interprets numeric names as indices ("5" becomes "6").
        // Resolve actual option names before that fallback, on every surface.
        formatValue: (fullKey: string, raw: unknown) => {
            const key = fullKey.split(':').pop() || '';
            const meta = ctl.metaIndex?.getOrGuess(key);
            return meta?.options_as_string && raw != null && meta.options?.includes(String(raw)) ? String(raw) : null;
        },
        announce: () => {},''')
    source = replace_once(source, '        const contractNow = Date.now();', '        refreshTouchLabels();\n        const contractNow = Date.now();')
    source = replace_once(source, '                ctl.revalue();\n                laneTouchSlots.add(slot);', '                ctl.revalue();\n                refreshTouchLabels(true);\n                laneTouchSlots.add(slot);')
    path.write_text(source)
