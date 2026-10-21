"""Regression checks for release gating and artifact reuse fail-closed behavior."""
import hashlib
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch
import tempfile

import ci_release as ci


class ReleaseChecks(unittest.TestCase):
    """Publishing requires a version push and a verified comprehensive package."""

    def test_event_policy(self) -> None:
        self.assertEqual(ci.choose('pull_request', False, False), (False, False))
        self.assertEqual(ci.choose('pull_request', True, False), (True, False))
        self.assertEqual(ci.choose('pull_request', False, True), (True, False))
        self.assertEqual(ci.choose('push', False, False), (False, False))
        self.assertEqual(ci.choose('push', True, False), (True, True))
        self.assertEqual(ci.choose('workflow_dispatch', False, False), (True, False))

    def test_proof_rejects_stale_incomplete_and_corrupt_files(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'package.tar.gz').write_bytes(b'package')
            proof = {'comprehensive': True, 'tree': 'exact-tree', 'version': '1',
                     'files': {'package.tar.gz': hashlib.sha256(b'package').hexdigest()}}
            ci.verify(proof, root, 'exact-tree', '1', ['package.tar.gz'])
            for replacement in ({'tree': 'old-tree'}, {'comprehensive': False},
                                {'version': '0'}, {'files': {}},
                                {'files': {'package.tar.gz': 'wrong-hash'}}):
                with self.subTest(replacement=replacement), self.assertRaises(AssertionError):
                    ci.verify(proof | replacement, root, 'exact-tree', '1', ['package.tar.gz'])

    def test_restore_and_missing_artifact_fallback(self) -> None:
        original = Path.cwd()
        with tempfile.TemporaryDirectory() as directory:
            os.chdir(directory)
            try:
                run = {'id': 42, 'head_sha': 'pr-head',
                       'head_repository': {'full_name': 'owner/repo'}}
                commit = {'tree': {'sha': 'tree'}, 'parents': [{'sha': 'pr-head'}]}

                def mock_api(path: str) -> dict:
                    return {'workflow_runs': [run]} if path.startswith('actions/') else commit

                def download(*args: str) -> str:
                    root = Path(args[-1])
                    name = 'harmonybus-movy-module.tar.gz'
                    (root / name).write_bytes(b'package')
                    proof = {'comprehensive': True, 'version': '1', 'tree': 'tree',
                             'commit': 'merge-commit', 'run_id': '42',
                             'files': {name: hashlib.sha256(b'package').hexdigest()}}
                    (root / 'release-proof.json').write_text(json.dumps(proof))
                    return ''

                with patch.dict(os.environ, GITHUB_REPOSITORY='owner/repo'), \
                     patch.object(ci, 'api', side_effect=mock_api), \
                     patch.object(ci, 'command', side_effect=download):
                    self.assertTrue(ci.restore('movy', '1', 'tree'))
                    self.assertEqual(Path('harmonybus-movy-module.tar.gz').read_bytes(), b'package')
                    self.assertFalse(ci.restore('movy', '1', 'different-tree'))
                    commit['parents'] = [{'sha': 'unrelated'}]
                    self.assertFalse(ci.restore('movy', '1', 'tree'))
                    run['head_repository']['full_name'] = 'fork/repo'
                    self.assertFalse(ci.restore('movy', '1', 'tree'))
                with patch.dict(os.environ, GITHUB_REPOSITORY='owner/repo'), \
                     patch.object(ci, 'api', return_value={'workflow_runs': []}):
                    self.assertFalse(ci.restore('movy', '1', 'tree'))
                run['head_repository']['full_name'] = 'owner/repo'
                with patch.dict(os.environ, GITHUB_REPOSITORY='owner/repo'), \
                     patch.object(ci, 'api', side_effect=mock_api), \
                     patch.object(ci, 'command', side_effect=OSError('expired')):
                    self.assertFalse(ci.restore('movy', '1', 'tree'))
            finally:
                os.chdir(original)


if __name__ == '__main__':
    unittest.main()
