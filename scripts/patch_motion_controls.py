"""Refresh the shared HarmonyBus editors when their selected lane changes."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_motion_controls(root: Path) -> None:
    """Flush old lane writes before selection and re-read dependent controls."""
    path: Path = root / "src/renderer/schwung-page.ts"
    source: str = path.read_text()
    source = replace_once(source, "            const dir = delta > 0 ? 1 : -1;", """            // Flush the previous lane before changing the editor cursor.
            const laneEdit = ctl.keyAt(slot) === 'motion_lane';
            const operationEdit = ctl.keyAt(slot) === 'motion_operation';
            const conditionEdit = ['motion_every','motion_from','motion_through'].includes(ctl.keyAt(slot));
            if (laneEdit || operationEdit || conditionEdit) {
                // Flush pending writes to the OLD lane, warming from the local
                // cache only. A synchronous page reread here delayed every detent.
                for (const [name, value] of Object.entries(ctl.state.values))
                    readCache.set(componentKey + ':' + name, String(value));
                touchReadOnly = true;
                try { ctl.revalue(); } finally { touchReadOnly = false; }
                const key = ctl.keyAt(slot);
                const options = ctl.metaAt(slot)?.options || [];
                const current = options.indexOf(String(ctl.state.values[key]));
                if (current < 0) return;
                const index = Math.max(0, Math.min(options.length - 1, current + delta));
                ctl.commitEnum(key, index);
                const pageIndex = ctl.state.pageIndex;
                let snapshot: any = null;
                try { snapshot = JSON.parse(port.getParam(qualify(componentKey + ':motion_editor')) || 'null'); } catch (_) {}
                if (snapshot && Array.isArray(snapshot.params) && snapshot.values &&
                    typeof snapshot.values[key] === 'string') {
                    readCache.set(componentKey + ':chain_params', JSON.stringify(snapshot.params));
                    for (const [name, value] of Object.entries(snapshot.values))
                        readCache.set(componentKey + ':' + name, String(value));
                    // Replan from the new contract and values without more IPC.
                    touchReadOnly = true;
                    try { ctl.load({ slot: port.track.index, component: componentKey }); ctl.goToPage(pageIndex); ctl.revalue(); }
                    finally { touchReadOnly = false; }
                } else {
                    // Older HB retains a working editor without the bulk API.
                    reload();ctl.goToPage(pageIndex);ctl.revalue();
                }
                const refreshedOptions = ctl.metaAt(slot)?.options || [];
                const refreshedIndex = refreshedOptions.indexOf(String(ctl.state.values[key]));
                ctl.state.peek = { key, title: ctl.metaAt(slot)?.name || key,
                    options: refreshedOptions, index: Math.max(0, refreshedIndex), at: Date.now() };
                return;
            }
            const dir = delta > 0 ? 1 : -1;""")
    path.write_text(source)
