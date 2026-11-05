"""Exercise artifact identity, provenance, fallback and publication boundaries."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import tempfile
from typing import Any
import unittest
from unittest.mock import patch

import candidate_release as release


class CandidateReleaseTest(unittest.TestCase):
    """Promotion must never replace verification with an unrelated artifact."""

    def setUp(self) -> None:
        """Build a minimal fixture with an actual checksummed asset."""
        self.directory: tempfile.TemporaryDirectory[str] = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root: Path = Path(self.directory.name)
        self.original: Path = Path.cwd()
        self.addCleanup(os.chdir, self.original)
        os.chdir(self.root)
        self.map_key_to_config: dict[str, Any] = {
            'version': '2', 'previous_version': '1', 'assets': ['package.tar.gz'],
            'workflow': 'candidate.yml',
        }
        self.map_key_to_proof: dict[str, Any] = {
            'schema': 1, 'version': '2', 'tree': 'tree', 'commit': 'merge', 'run_id': '42',
            'files': {'package.tar.gz': hashlib.sha256(b'package').hexdigest()},
        }
        (self.root / 'package.tar.gz').write_bytes(b'package')

    def test_modified_stale_or_incomplete_package(self) -> None:
        """Identity, complete asset coverage, bytes, and symlinks all matter."""
        release.verify(self.map_key_to_proof, self.root, 'tree', self.map_key_to_config)
        for replacement in ({'schema': 0}, {'tree': 'old'}, {'version': 'old'}, {'files': {}},
                            {'files': {'package.tar.gz': 'bad'}}, {'files': {'../escape': 'bad'}}):
            with self.subTest(replacement=replacement), self.assertRaises(ValueError):
                release.verify(self.map_key_to_proof | replacement, self.root, 'tree', self.map_key_to_config)
        (self.root / 'package.tar.gz').rename(self.root / 'target')
        (self.root / 'package.tar.gz').symlink_to(self.root / 'target')
        with self.assertRaises(ValueError):
            release.verify(self.map_key_to_proof, self.root, 'tree', self.map_key_to_config)

    def test_restore_provenance_and_fallback(self) -> None:
        """Only the successful same-repository PR's exact merge tree is usable."""
        map_key_to_run: dict[str, Any] = {'id': 42, 'head_sha': 'head', 'head_repository': {'full_name': 'owner/repo'}}
        map_key_to_commit: dict[str, Any] = {'tree': {'sha': 'tree'}, 'parents': [{'sha': 'head'}]}

        def mock_api(path: str) -> dict[str, Any]:
            """Supply Actions provenance separately from downloaded claims."""
            return {'workflow_runs': [map_key_to_run]} if path.startswith('actions/') else map_key_to_commit

        def mock_download(*arguments: str) -> str:
            """Create the candidate download without touching the working asset."""
            destination: Path = Path(arguments[-1])
            (destination / 'package.tar.gz').write_bytes(b'package')
            (destination / 'release-proof.json').write_text(json.dumps(self.map_key_to_proof))
            return ''

        with patch.dict(os.environ, GITHUB_REPOSITORY='owner/repo'), \
                patch.object(release, 'api', side_effect=mock_api), \
                patch.object(release, 'command', side_effect=mock_download):
            self.assertTrue(release.restore(self.map_key_to_config, 'tree'))
            self.assertFalse(release.restore(self.map_key_to_config, 'other-tree'))
            self.map_key_to_proof['run_id'] = '43'
            self.assertFalse(release.restore(self.map_key_to_config, 'tree'))
            self.map_key_to_proof['run_id'] = '42'
            map_key_to_commit['parents'] = [{'sha': 'unrelated'}]
            self.assertFalse(release.restore(self.map_key_to_config, 'tree'))
            map_key_to_commit['parents'] = [{'sha': 'head'}]
            map_key_to_run['head_repository']['full_name'] = 'fork/repo'
            self.assertFalse(release.restore(self.map_key_to_config, 'tree'))
            map_key_to_run['head_repository']['full_name'] = 'owner/repo'
        with patch.dict(os.environ, GITHUB_REPOSITORY='owner/repo'), \
                patch.object(release, 'api', side_effect=mock_api), \
                patch.object(release, 'command', side_effect=OSError('expired')):
            self.assertFalse(release.restore(self.map_key_to_config, 'tree'))

    def test_publication_event_and_installer_gates(self) -> None:
        """PR/manual events, already-published versions and stale predecessors cannot write."""
        for event, ref in [('pull_request', 'refs/pull/1/merge'), ('workflow_dispatch', 'refs/heads/main'), ('push', 'refs/heads/topic')]:
            with patch.dict(os.environ, GITHUB_EVENT_NAME=event, GITHUB_REF=ref), self.assertRaises(ValueError):
                release.publish(self.map_key_to_config, 'tree')
        with patch.dict(os.environ, GITHUB_EVENT_NAME='push', GITHUB_REF='refs/heads/main'), \
                patch.object(release, 'command') as mocked:
            Path('release.json').write_text('{"version":"2"}')
            release.publish(self.map_key_to_config, 'tree')
            mocked.assert_not_called()
            Path('release.json').write_text('{"version":"3"}')
            with self.assertRaises(ValueError):
                release.publish(self.map_key_to_config, 'tree')
            mocked.assert_not_called()


if __name__ == '__main__':
    unittest.main()
