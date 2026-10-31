"""Verify the offline shared-UI delta against both exact upstream releases."""
from __future__ import annotations

import argparse
import shutil
import subprocess
import tempfile
from pathlib import Path

from patch_settings_case import SCHWUNG_BASE_REF, SCHWUNG_REF


def main() -> None:
    """Require the normalized 1.7.3 source to equal upstream 1.8.2 byte for byte."""
    parser: argparse.ArgumentParser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('baseline', type=Path)
    parser.add_argument('updated', type=Path)
    arguments: argparse.Namespace = parser.parse_args()
    source: Path
    expected_revision: str
    for source, expected_revision in ((arguments.baseline, SCHWUNG_BASE_REF),
                                      (arguments.updated, SCHWUNG_REF)):
        revision: str = subprocess.check_output(
            ['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
        if revision != expected_revision:
            raise AssertionError(f'Unexpected reference source: {revision}')
        if subprocess.check_output(['git', '-C', str(source), 'diff', 'HEAD', '--',
                                    'src/shared'], text=True):
            raise AssertionError(f'Modified reference source: {source}')
    delta: Path = Path(__file__).resolve().parents[1] / 'integration/schwung-host/shared-ui-1.8.2.patch'
    with tempfile.TemporaryDirectory(prefix='schwung-shared-') as directory:
        normalized: Path = Path(directory)
        shutil.copytree(arguments.baseline / 'src/shared', normalized / 'shared')
        subprocess.run(['git', 'apply', '-p2', '--directory=' + str(normalized),
                        '--unsafe-paths', str(delta)], check=True)
        expected_files: set[Path] = {
            filename.relative_to(arguments.updated / 'src/shared')
            for filename in (arguments.updated / 'src/shared').rglob('*.mjs')}
        actual_files: set[Path] = {
            filename.relative_to(normalized / 'shared')
            for filename in (normalized / 'shared').rglob('*.mjs')}
        assert actual_files == expected_files, 'shared module inventory differs'
        filename: Path
        for filename in expected_files:
            assert (normalized / 'shared' / filename).read_bytes() == (
                arguments.updated / 'src/shared' / filename).read_bytes(), filename
        print(f'All {len(expected_files)} shared modules match Schwung 1.8.2 exactly')


if __name__ == '__main__':
    main()
