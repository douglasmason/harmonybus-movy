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
            if (laneEdit || operationEdit) ctl.revalue();
            if (laneEdit || operationEdit) {
                const key = ctl.keyAt(slot);
                const options = ctl.metaAt(slot)?.options || [];
                const current = options.indexOf(String(port.getParam(qualify(componentKey + ':' + key))));
                if (current < 0) return;
                const index = Math.max(0, Math.min(options.length - 1, current + delta));
                ctl.commitEnum(key, index);
                ctl.revalue();
                // commitEnum bypasses onKnobTurn, which normally opens the
                // native peek. Reuse its overlay, timeout and dismissal state.
                ctl.state.peek = { key, title: ctl.metaAt(slot)?.name || key,
                    options, index, at: Date.now() };
                return;
            }
            const dir = delta > 0 ? 1 : -1;""")
    source = replace_once(source,
        "            for (let i = 0; i < n; i++) ctl.onKnobTurn(slot, dir);",
        """            for (let i = 0; i < n; i++) ctl.onKnobTurn(slot, dir);
            // Commit the cursor and reload all dependent controls before another turn.
            if (laneEdit || operationEdit) ctl.revalue();""")
    path.write_text(source)
