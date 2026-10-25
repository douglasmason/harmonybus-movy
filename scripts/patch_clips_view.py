"""Add the Clips performance/setup pages before the existing Master pipeline."""
from pathlib import Path
import subprocess


def patch_clips_view(root: Path) -> None:
    """Apply the tested UI integration after Chord Play and panel navigation."""
    patch: Path = Path(__file__).resolve().parents[1] / 'integration/clips-view/clips-view.patch'
    applied: subprocess.CompletedProcess[bytes] = subprocess.run(
        ['git', 'apply', '--reverse', '--check', str(patch)], cwd=root, capture_output=True)
    if applied.returncode != 0:
        subprocess.run(['git', 'apply', str(patch)], cwd=root, check=True)

    assets: Path = patch.parent
    (root / 'src/seq/clips-settings.ts').write_text((assets / 'clips-settings.ts').read_text())
    view: Path = root / 'src/seq/clips-view.ts'
    source: str = view.read_text()
    source = "import { clipsSettingsPage } from './clips-settings.js';\n" + source
    start: int = source.index("        line(12, '1 Row: '")
    end: int = source.index("    } else {", start)
    source = source[:start] + "        const settings=clipsSettingsPage();settings.ctl.revalue();settings.tick();settings.render('Clips');line(43,'Launch: bar / now');line(51,'Tap playing: relaunch');line(58,'Jog > Master / Back');\n" + source[end:]
    source = source.replace("            fontPrint(slot * 16 + 2, 33, String(slot + 1), 1);", """            const selected=seqState.session[track].selected===slot;
            if(selected)fill_rect(slot*16,31,14,12,1);
            fontPrint(slot*16+4,33,String(slot+1),selected?0:1);""")
    source = source.replace("            fontPrint(slot * 16 + 2, 42, clipsSlotStatus(track, slot), 1);", """            const status=clipsSlotStatus(track,slot);
            if(status==='P') {fill_rect(slot*16+4,44,2,5,1);fill_rect(slot*16+6,45,2,3,1);fill_rect(slot*16+8,46,1,1,1);}
            else if(status==='Q')fontPrint(slot*16+4,44,'Q',1);
            else if(status==='+')fill_rect(slot*16+6,46,2,2,1);""")
    source = source.replace("L/R: Bank | P:Play Q:Queue", "Box: Selected Q:Queued")
    view.write_text(source)
