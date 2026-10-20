"""Publish a pinned tested archive and then advance the Schwung installer pointer."""
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
from typing import Any


def command(*arguments: str) -> str:
    """Run a checked GitHub command without shell interpolation."""
    return subprocess.check_output(arguments, text=True).strip()


def api(resource: str) -> dict[str, Any]:
    """Read a repository API object using the workflow's scoped token."""
    return json.loads(command('gh', 'api', resource))


def main() -> None:
    """Verify provenance, publish identical bytes, and update only release.json."""
    repository: str = os.environ['GITHUB_REPOSITORY']
    source_commit: str = os.environ['SOURCE_COMMIT']
    run_id: str = os.environ['TESTED_RUN']
    version: str = os.environ['INSTALL_VERSION']
    previous_version: str = os.environ['PREVIOUS_VERSION']
    asset_name: str = os.environ['ASSET_NAME']
    run: dict[str, Any] = api(f'repos/{repository}/actions/runs/{run_id}')
    assert run['head_sha'] == source_commit and run['conclusion'] == 'success', run
    command('gh', 'run', 'download', run_id, '--repo', repository, '--name', os.environ['ARTIFACT_NAME'], '--dir', 'tested-package')
    package_root: Path = Path('tested-package')
    archives: list[Path] = list(package_root.glob('*.tar.gz'))
    assert len(archives) == 1, archives
    archive: Path = archives[0]
    archive_digest: str = hashlib.sha256(archive.read_bytes()).hexdigest()
    # HB's comprehensive seal and Movy's checksum file protect downloaded bytes.
    if repository.endswith('/harmonybus'):
        proof_files: list[Path] = list(package_root.glob('*.json'))
        assert len(proof_files) == 1, proof_files
        proof: dict[str, Any] = json.loads(proof_files[0].read_text())
        assert proof['comprehensive'] is True and proof['version'] == version
        assert proof['commit'] == source_commit and str(proof['run_id']) == run_id
        assert proof['files'][archive.name] == archive_digest
    else:
        assert (package_root / 'SHA256SUMS').read_text().split()[0] == archive_digest
    with tarfile.open(archive, 'r:gz') as package:
        manifests: list[tarfile.TarInfo] = [member for member in package.getmembers() if member.name.lstrip('./') in ('harmonybus/module.json', 'movy/module.json')]
        assert len(manifests) == 1, manifests
        manifest_stream = package.extractfile(manifests[0])
        assert manifest_stream is not None
        manifest: dict[str, Any] = json.load(manifest_stream)
        assert manifest['version'] == version, manifest['version']
    release_asset: Path = Path(asset_name)
    shutil.copyfile(archive, release_asset)
    tag: str = f'v{version}'
    release_check: subprocess.CompletedProcess[str] = subprocess.run(['gh', 'release', 'view', tag, '--repo', repository], capture_output=True, text=True)
    if release_check.returncode != 0:
        command('gh', 'release', 'create', tag, str(release_asset), '--repo', repository, '--target', source_commit,
                '--title', f'Clip Weave install build {version}', '--notes',
                'Tested Clip Weave install point: destination notes with donor clip rhythm using existing Conditions. Includes conductor inversion and shared-surface fixes. Update both HarmonyBus and HarmonyBus Movy. No FM-1 firmware flash required. Hardware testing remains necessary.')
    Path('published-package').mkdir(exist_ok=True)
    command('gh', 'release', 'download', tag, '--repo', repository, '--pattern', asset_name, '--dir', 'published-package', '--clobber')
    assert hashlib.sha256((Path('published-package') / asset_name).read_bytes()).hexdigest() == archive_digest
    release: dict[str, Any] = api(f'repos/{repository}/releases/tags/{tag}')
    assert not release['draft']
    assets: list[dict[str, Any]] = [asset for asset in release['assets'] if asset['name'] == asset_name]
    assert len(assets) == 1 and assets[0]['size'] == archive.stat().st_size
    pointer: dict[str, Any] = api(f'repos/{repository}/contents/release.json?ref=main')
    previous: dict[str, Any] = json.loads(base64.b64decode(pointer['content']))
    updated: dict[str, str] = {'version': version, 'download_url': assets[0]['browser_download_url']}
    assert previous['version'] in (previous_version, version), 'Refusing to replace an unexpected installer version'
    if previous != updated:
        request: dict[str, str] = {'message': f'Publish tested Clip Weave installer {version}', 'branch': 'main', 'sha': pointer['sha'],
                                  'content': base64.b64encode((json.dumps(updated, indent=2)+'\n').encode()).decode()}
        request_path: Path = Path('installer-update.json')
        request_path.write_text(json.dumps(request))
        command('gh', 'api', '--method', 'PUT', f'repos/{repository}/contents/release.json', '--input', str(request_path))
    print(json.dumps(updated, indent=2))
    print(f'Published archive sha256: {archive_digest}')


if __name__ == '__main__':
    main()
