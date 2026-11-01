"""Exercise release ancestry and changed-file guards using real git histories."""
from pathlib import Path
import subprocess
import tempfile
import unittest

from check_release_base import check_release_base


class ReleaseBaseTest(unittest.TestCase):
    """Browser merges are safe; device, installer and divergent changes are not."""

    def setUp(self) -> None:
        """Create an isolated repository with an initial device source."""
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.git('init', '-q')
        self.git('config', 'user.name', 'Release test')
        self.git('config', 'user.email', 'release@example.invalid')
        self.base = self.commit_file('integration/device.ts', 'tested')

    def git(self, *args: str) -> str:
        """Run git without shell expansion."""
        return subprocess.check_output(['git', *args], cwd=self.root, stderr=subprocess.STDOUT).decode().strip()

    def commit_file(self, name: str, value: str) -> str:
        """Commit one fixture file and return its revision."""
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(value)
        self.git('add', '--', name)
        self.git('commit', '-qm', 'Fixture change')
        return self.git('rev-parse', 'HEAD')

    def test_same_revision_and_browser_merge(self) -> None:
        """An actual browser merge preserves the tested device inputs."""
        check_release_base(self.root, self.base, self.base)
        self.git('checkout', '-qb', 'browser')
        self.commit_file('dev/local/theme.css', 'theme')
        self.commit_file('dev/wasm/test.mjs', 'browser test')
        self.commit_file('.github/workflows/local-processor.yml', 'browser workflow')
        self.git('checkout', '--detach', self.base)
        self.git('merge', '--no-ff', '-m', 'Merge browser', 'browser')
        check_release_base(self.root, self.base, 'HEAD')

    def test_device_installer_and_guard_changes(self) -> None:
        """No device input or release safety rule can bypass the guard."""
        for name in ('integration/device.ts', 'integration/harmonybus.ref',
                     'release.json', 'scripts/check_release_base.py',
                     '.github/workflows/chord-play.yml'):
            with self.subTest(name=name):
                self.git('checkout', '--detach', self.base)
                self.commit_file(name, 'changed')
                with self.assertRaisesRegex(ValueError, 'inputs changed'):
                    check_release_base(self.root, self.base, 'HEAD')

    def test_rename_into_browser_is_not_hidden(self) -> None:
        """Moving a production file into the browser still changes production."""
        (self.root / 'dev/local').mkdir(parents=True)
        self.git('mv', 'integration/device.ts', 'dev/local/device.ts')
        self.git('commit', '-qm', 'Move device input')
        with self.assertRaisesRegex(ValueError, 'inputs changed'):
            check_release_base(self.root, self.base, 'HEAD')

    def test_divergent_history(self) -> None:
        """Identical production files do not authorize replacing tested history."""
        tested = self.commit_file('dev/local/a.css', 'tested browser')
        self.git('checkout', '--detach', self.base)
        self.commit_file('dev/local/b.css', 'different browser')
        with self.assertRaisesRegex(ValueError, 'no longer descends'):
            check_release_base(self.root, tested, 'HEAD')


if __name__ == '__main__':
    unittest.main()
