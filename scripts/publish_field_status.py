"""Publish a verified Field Play candidate artifact, then advance its installer."""
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
from typing import Any, BinaryIO


def command(*arguments: str) -> str:
    """Run GitHub CLI without shell interpolation."""
    return subprocess.check_output(arguments, text=True).strip()


def api(resource: str) -> dict[str, Any]:
    """Read the repository-scoped GitHub API."""
    return json.loads(command('gh', 'api', resource))


def main() -> None:
    """Verify source, checksum, package version, and the existing installer lease."""
    repository: str = os.environ['GITHUB_REPOSITORY']
    source_commit: str = os.environ['SOURCE_COMMIT']
    run_id: str = os.environ['TESTED_RUN']
    version: str = os.environ['INSTALL_VERSION']
    previous_version: str = os.environ['PREVIOUS_VERSION']
    asset_name: str = os.environ['ASSET_NAME']
    run: dict[str, Any] = api(f'repos/{repository}/actions/runs/{run_id}')
    assert run['head_sha'] == source_commit and run['conclusion'] == 'success'
    if os.environ.get('SECOND_TESTED_RUN'):
        secondary: dict[str, Any] = api(f"repos/{repository}/actions/runs/{os.environ['SECOND_TESTED_RUN']}")
        assert secondary['head_sha'] == source_commit and secondary['conclusion'] == 'success'
    command('gh', 'run', 'download', run_id, '--repo', repository, '--name', os.environ['ARTIFACT_NAME'], '--dir', 'tested-package')
    root: Path = Path('tested-package')
    archive: Path = root / os.environ['ARTIFACT_FILE']
    checksum_lines: list[str] = (root / 'SHA256SUMS').read_text().splitlines()
    expected: list[str] = [line.split()[0] for line in checksum_lines if Path(line.split()[-1]).name == archive.name]
    digest: str = hashlib.sha256(archive.read_bytes()).hexdigest()
    assert expected == [digest]
    with tarfile.open(archive, 'r:gz') as package:
        manifests: list[tarfile.TarInfo] = [member for member in package.getmembers() if member.name.lstrip('./') in ('harmonybus/module.json', 'movy/module.json')]
        assert len(manifests) == 1
        manifest_stream: BinaryIO | None = package.extractfile(manifests[0])
        assert manifest_stream is not None
        manifest: dict[str, Any] = json.load(manifest_stream)
        assert manifest['version'] == version
        if manifest['id'] == 'harmonybus':
            names: set[str] = {member.name.lstrip('./') for member in package.getmembers()}
            assert {'harmonybus/web_ui.html','harmonybus/field-web.js','harmonybus/choice-web.js'} <= names
    # Publishing may advance only the installer on top of the already
    # integrated source baseline; concurrent source changes need a new candidate.
    main_ref: dict[str, Any] = api(f'repos/{repository}/git/ref/heads/main')
    main_sha: str = main_ref['object']['sha']
    comparison: dict[str, Any] = api(f"repos/{repository}/compare/{os.environ['INTEGRATED_BASE']}...{main_sha}")
    assert comparison['status'] in ('ahead', 'identical'), 'Main no longer descends from integrated source'
    assert all(change['filename'] == 'release.json' for change in comparison.get('files', [])), 'Concurrent source landed; re-integrate and test'
    pointer: dict[str, Any] = api(f'repos/{repository}/contents/release.json?ref=main')
    previous: dict[str, Any] = json.loads(base64.b64decode(pointer['content']))
    assert previous['version'] in (previous_version, version), 'Installer changed during validation'
    asset: Path = Path(asset_name)
    shutil.copyfile(archive, asset)
    tag: str = f'v{version}'
    existing: subprocess.CompletedProcess[str] = subprocess.run(['gh', 'release', 'view', tag, '--repo', repository], capture_output=True, text=True)
    if existing.returncode != 0:
        command('gh', 'release', 'create', tag, str(asset), '--repo', repository, '--target', source_commit,
                '--title', f'Field route status {version}', '--notes', os.environ['RELEASE_NOTES'])
    Path('published-package').mkdir(exist_ok=True)
    command('gh', 'release', 'download', tag, '--repo', repository, '--pattern', asset_name, '--dir', 'published-package', '--clobber')
    assert hashlib.sha256((Path('published-package') / asset_name).read_bytes()).hexdigest() == digest
    release: dict[str, Any] = api(f'repos/{repository}/releases/tags/{tag}')
    assert not release['draft'] and not release['prerelease']
    assets: list[dict[str, Any]] = [item for item in release['assets'] if item['name'] == asset_name]
    assert len(assets) == 1 and assets[0]['size'] == archive.stat().st_size
    updated: dict[str, str] = {'version': version, 'download_url': assets[0]['browser_download_url']}
    if previous != updated:
        command('git', 'fetch', 'origin', 'main')
        assert command('git', 'rev-parse', 'origin/main') == main_sha, 'Main moved during asset verification; installer unchanged'
        command('git', 'switch', '-C', 'installer-pointer', main_sha)
        Path('release.json').write_text(json.dumps(updated, indent=2) + '\n')
        command('git', 'config', 'user.name', 'github-actions[bot]')
        command('git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
        command('git', 'add', 'release.json')
        command('git', 'commit', '-m', f'Publish verified Field routing overview {version} [skip ci]')
        # Ordinary fast-forward push rejects a concurrent change to any main file.
        command('git', 'push', 'origin', 'HEAD:main')
    print(json.dumps(updated, indent=2))
    print(f'Verified published sha256: {digest}')


if __name__ == '__main__':
    main()
