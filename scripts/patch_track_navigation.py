"""Keep the open hosted module panel when selecting another track."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_track_navigation(root: Path) -> None:
    """Transfer navigation only; each controller retains its own track port."""
    path: Path = root / 'src/track/switch.ts'
    source: str = path.read_text()
    source = replace_once(source, 'appState, VIEW_BROWSE', 'appState, VIEW_BROWSE, VIEW_KNOBS')
    source = replace_once(source, '/** Everything a momentary track peek', '''import { CHAIN_SLOTS, moduleReadKey } from '../chain/config.js';
import { portFor } from './registry.js';
import { schwungActiveFor, schwungPageFor, schwungGridMode } from '../renderer/schwung-grid.js';

interface ModulePanel {
    moduleId: string;
    chainIndex: number;
    name: string;
    keys: string[];
}

function captureModulePanel(): ModulePanel | null {
    if (appState.currentView !== VIEW_KNOBS || seqState.sessionMode) return null;
    const track = appState.activeTrack.index;
    const chainIndex = appState.trackChainIndex[track];
    const component = CHAIN_SLOTS[chainIndex];
    if (!component?.scanDir) return null;
    const moduleId = portFor(track).getParam(moduleReadKey(component.componentKey));
    if (!moduleId) return null;
    const page = schwungActiveFor(track, component.componentKey);
    if (!page) return null;
    return { moduleId, chainIndex, name: page.ctl.page?.name ?? '',
        keys: [...(page.ctl.page?.keys ?? [])] };
}

function followModulePanel(track: number, panel: ModulePanel | null): boolean {
    if (!panel || schwungGridMode() !== 'page') return false;
    const port = portFor(track);
    // Prefer the same slot when a module is installed more than once.
    const candidates = [panel.chainIndex, ...CHAIN_SLOTS.map((_, index) => index)
        .filter(index => index !== panel.chainIndex)];
    for (const index of candidates) {
        const component = CHAIN_SLOTS[index];
        if (!component?.scanDir || port.getParam(moduleReadKey(component.componentKey)) !== panel.moduleId) continue;
        const page = schwungPageFor(track, component.componentKey);
        // Re-plan only when the installed module has changed.
        if (page.moduleId !== panel.moduleId) page.reload();
        if (!page.ready) continue;
        const pages = page.ctl.pages;
        const exact = pages.findIndex((candidate: any) => candidate.name === panel.name
            && JSON.stringify(candidate.keys ?? []) === JSON.stringify(panel.keys));
        const named = pages.findIndex((candidate: any) => candidate.name === panel.name);
        page.ctl.goToPage(exact >= 0 ? exact : named >= 0 ? named : 0, { remember: false });
        page.ctl.revalue();
        appState.trackChainIndex[track] = index;
        return true;
    }
    return false;
}

/** Everything a momentary track peek''')
    source = replace_once(source, '    loop: boolean;\n}', '    loop: boolean;\n    modulePanel: ModulePanel | null;\n}')
    source = replace_once(source, '        loop: seqState.loopMode,', '        loop: seqState.loopMode,\n        modulePanel: captureModulePanel(),')
    source = replace_once(source, '    appState.currentView = appState.trackView[track];', '''    appState.currentView = followModulePanel(track, prev.modulePanel)
        ? VIEW_KNOBS : appState.trackView[track];''')
    path.write_text(source)

    path = root / 'src/renderer/schwung-page.ts'
    source = path.read_text()
    source = replace_once(source, '    readonly pageCount: number;', '    readonly moduleId: string | null;\n    readonly pageCount: number;')
    source = replace_once(source, '        get pageIndex()', '        get moduleId() { return hostedModuleId; },\n        get pageIndex()')
    path.write_text(source)
