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
    pointer: dict[str, Any] = api(f'repos/{repository}/contents/release.json?ref=main')
    previous: dict[str, Any] = json.loads(base64.b64decode(pointer['content']))
    assert previous['version'] in (previous_version, version), 'Installer changed during validation'
    asset: Path = Path(asset_name)
    shutil.copyfile(archive, asset)
    tag: str = f'v{version}'
    existing: subprocess.CompletedProcess[str] = subprocess.run(['gh', 'release', 'view', tag, '--repo', repository], capture_output=True, text=True)
    if existing.returncode != 0:
        command('gh', 'release', 'create', tag, str(asset), '--repo', repository, '--target', source_commit, '--prerelease',
                '--title', f'Field Play candidate {version}', '--notes',
                'Field Play: fixed-coordinate 3D layered noise; momentary pad speed/reverse/stop and feature-size gestures; native Move, Launchpad X and Remote UI mirror support. Existing operation lanes accept field probability/amount mappings, including phrase-stable Clip Weave decisions. Install HB 0.2.283-dev.1 then Movy 0.34.1-hbclean.205-dev.1 and restart. Sample-distribution presets, categorical mappings and arbitrary instrument destinations are future increments. Hardware validation is outstanding; no device was deployed. See docs/field-play.md in the Movy integration branch for controls and inherited upstream app-loop test limitations.')
    Path('published-package').mkdir(exist_ok=True)
    command('gh', 'release', 'download', tag, '--repo', repository, '--pattern', asset_name, '--dir', 'published-package', '--clobber')
    assert hashlib.sha256((Path('published-package') / asset_name).read_bytes()).hexdigest() == digest
    release: dict[str, Any] = api(f'repos/{repository}/releases/tags/{tag}')
    assert not release['draft']
    assets: list[dict[str, Any]] = [item for item in release['assets'] if item['name'] == asset_name]
    assert len(assets) == 1 and assets[0]['size'] == archive.stat().st_size
    updated: dict[str, str] = {'version': version, 'download_url': assets[0]['browser_download_url']}
    if previous != updated:
        request: dict[str, str] = {'message': f'Publish verified Field Play candidate {version}', 'branch': 'main', 'sha': pointer['sha'],
                                  'content': base64.b64encode((json.dumps(updated, indent=2)+'\n').encode()).decode()}
        request_path: Path = Path('installer-update.json')
        request_path.write_text(json.dumps(request))
        command('gh', 'api', '--method', 'PUT', f'repos/{repository}/contents/release.json', '--input', str(request_path))
    print(json.dumps(updated, indent=2))
    print(f'Verified published sha256: {digest}')


if __name__ == '__main__':
    main()
