"""Verify once, promote exact-tree packages, and advance the installer last."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from typing import Any

from check_release_base import check_release_base


def command(*arguments: str) -> str:
    """Run a checked command without shell interpolation."""
    return subprocess.check_output(arguments, text=True).strip()


def configuration() -> dict[str, Any]:
    """Load the single candidate description shared by verification and release."""
    map_key_to_value: dict[str, Any] = json.loads(Path('integration/release-candidate.json').read_text())
    return map_key_to_value


def api(path: str) -> dict[str, Any]:
    """Read a resource in the current repository using the Actions token."""
    return json.loads(command('gh', 'api', f"repos/{os.environ['GITHUB_REPOSITORY']}/{path}"))


def verify(map_key_to_proof: dict[str, Any], root: Path, tree: str,
           map_key_to_config: dict[str, Any]) -> None:
    """Reject a different source tree, version, asset set, or modified bytes."""
    if (map_key_to_proof.get('schema') != 1 or map_key_to_proof.get('tree') != tree
            or map_key_to_proof.get('version') != map_key_to_config['version']):
        raise ValueError('Candidate identity mismatch')
    map_name_to_digest: dict[str, str] = map_key_to_proof['files']
    expected_names: set[str] = {Path(name).name for name in map_key_to_config['assets']}
    if set(map_name_to_digest) != expected_names:
        raise ValueError('Candidate asset set mismatch')
    for name, digest in map_name_to_digest.items():
        asset: Path = root / name
        if asset.is_symlink() or not asset.is_file() or hashlib.sha256(asset.read_bytes()).hexdigest() != digest:
            raise ValueError(f'Candidate checksum mismatch: {name}')


def restore(map_key_to_config: dict[str, Any], tree: str) -> bool:
    """Recover a successful same-repository PR artifact or fall back to a build."""
    repository: str = os.environ['GITHUB_REPOSITORY']
    try:
        runs: list[dict[str, Any]] = api(
            f"actions/workflows/{map_key_to_config['workflow']}/runs?event=pull_request&status=success&per_page=30"
        )['workflow_runs']
        for map_key_to_run in runs:
            if (map_key_to_run.get('head_repository') or {}).get('full_name') != repository:
                continue
            with tempfile.TemporaryDirectory() as directory:
                root: Path = Path(directory)
                try:
                    command('gh', 'run', 'download', str(map_key_to_run['id']), '--repo', repository,
                            '--name', 'verified-candidate', '--dir', directory)
                    map_key_to_proof: dict[str, Any] = json.loads((root / 'release-proof.json').read_text())
                    verify(map_key_to_proof, root, tree, map_key_to_config)
                    map_key_to_commit: dict[str, Any] = api(f"git/commits/{map_key_to_proof['commit']}")
                    if (map_key_to_commit['tree']['sha'] != tree
                            or map_key_to_run['head_sha'] not in [parent['sha'] for parent in map_key_to_commit['parents']]
                            or map_key_to_proof['run_id'] != str(map_key_to_run['id'])):
                        raise ValueError('Candidate provenance mismatch')
                    for filename in map_key_to_config['assets']:
                        destination: Path = Path(filename)
                        destination.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copyfile(root / destination.name, destination)
                    shutil.copyfile(root / 'release-proof.json', 'release-proof.json')
                    print(f"Reusing verified package from run {map_key_to_run['id']}")
                    return True
                except (KeyError, TypeError, ValueError, OSError, subprocess.CalledProcessError) as error:
                    print(f"Candidate {map_key_to_run['id']} not reusable: {error}")
    except (KeyError, TypeError, ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f'Artifact lookup unavailable: {error}')
    return False


def seal(map_key_to_config: dict[str, Any], tree: str) -> None:
    """Record the tested tree and exact package bytes after all checks pass."""
    root: Path = Path('ci-release')
    root.mkdir(exist_ok=True)
    map_name_to_digest: dict[str, str] = {}
    for filename in map_key_to_config['assets']:
        asset: Path = Path(filename)
        shutil.copyfile(asset, root / asset.name)
        map_name_to_digest[asset.name] = hashlib.sha256(asset.read_bytes()).hexdigest()
    map_key_to_proof: dict[str, Any] = {
        'schema': 1, 'version': map_key_to_config['version'], 'tree': tree,
        'commit': command('git', 'rev-parse', 'HEAD'), 'run_id': os.environ['GITHUB_RUN_ID'],
        'files': map_name_to_digest,
    }
    serialized: str = json.dumps(map_key_to_proof, indent=2) + '\n'
    (root / 'release-proof.json').write_text(serialized)
    Path('release-proof.json').write_text(serialized)


def publish(map_key_to_config: dict[str, Any], tree: str) -> None:
    """Publish immutable verified assets, verify downloads, then update the pointer."""
    if os.environ.get('GITHUB_EVENT_NAME') != 'push' or os.environ.get('GITHUB_REF') != 'refs/heads/main':
        raise ValueError('Only a main push can publish')
    map_key_to_installer: dict[str, str] = json.loads(Path('release.json').read_text())
    if map_key_to_installer['version'] == map_key_to_config['version']:
        print('Candidate already installed; no release mutation')
        return
    if map_key_to_installer['version'] != map_key_to_config['previous_version']:
        raise ValueError('Unexpected installer predecessor')
    tested: str = command('git', 'rev-parse', 'HEAD')
    command('git', 'fetch', 'origin', 'main')
    check_release_base(Path.cwd(), tested, 'origin/main')
    tag: str = f"v{map_key_to_config['version']}"
    map_key_to_proof: dict[str, Any] = json.loads(Path('release-proof.json').read_text())
    with tempfile.TemporaryDirectory() as directory:
        root: Path = Path(directory)
        for filename in map_key_to_config['assets']:
            shutil.copyfile(filename, root / Path(filename).name)
        verify(map_key_to_proof, root, tree, map_key_to_config)
    existing: subprocess.CompletedProcess[str] = subprocess.run(
        ['gh', 'release', 'view', tag, '--json', 'isDraft'], text=True, capture_output=True, check=False)
    if existing.returncode:
        command('gh', 'release', 'create', tag, *map_key_to_config['assets'], 'release-proof.json',
                '--target', tested, '--title', map_key_to_config['title'], '--notes-file', map_key_to_config['notes'])
    elif json.loads(existing.stdout)['isDraft']:
        raise ValueError('Existing draft requires review; never overwrite assets')
    # Retrying after upload is safe only if every public asset is byte-identical.
    with tempfile.TemporaryDirectory() as directory:
        command('gh', 'release', 'download', tag, '--dir', directory)
        verify(map_key_to_proof, Path(directory), tree, map_key_to_config)
    command('git', 'fetch', 'origin', 'main')
    check_release_base(Path.cwd(), tested, 'origin/main')
    command('git', 'switch', '-C', 'installer-pointer', 'origin/main')
    map_key_to_current: dict[str, str] = json.loads(Path('release.json').read_text())
    if map_key_to_current['version'] != map_key_to_config['previous_version']:
        raise ValueError('Installer moved concurrently')
    repository: str = os.environ['GITHUB_REPOSITORY']
    package: str = Path(map_key_to_config['assets'][0]).name
    Path('release.json').write_text(json.dumps({
        'version': map_key_to_config['version'],
        'download_url': f'https://github.com/{repository}/releases/download/{tag}/{package}',
    }, indent=2) + '\n')
    command('git', 'config', 'user.name', 'github-actions[bot]')
    command('git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
    command('git', 'add', 'release.json')
    command('git', 'commit', '-m', f"Publish verified {map_key_to_config['version']} [skip ci]")
    command('git', 'push', 'origin', 'HEAD:main')  # Non-fast-forward races fail closed.


def main() -> None:
    """Plan, seal, or publish one candidate with no device installation."""
    map_key_to_config: dict[str, Any] = configuration()
    tree: str = command('git', 'rev-parse', 'HEAD^{tree}')
    action: str = sys.argv[1]
    if action == 'seal':
        seal(map_key_to_config, tree)
    elif action == 'publish':
        publish(map_key_to_config, tree)
    elif action == 'plan':
        reused: bool = os.environ['GITHUB_EVENT_NAME'] == 'push' and restore(map_key_to_config, tree)
        with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
            output.write(f"mode={'reused' if reused else 'full'}\n")
        with open(os.environ['GITHUB_ENV'], 'a') as output:
            output.write(f"SOURCE_VERSION={map_key_to_config['version']}\nVERSION={map_key_to_config['version']}\n")
            output.write(f"HB={map_key_to_config['assets'][0]}\n")
    else:
        raise ValueError(f'Unknown action: {action}')


if __name__ == '__main__':
    main()
