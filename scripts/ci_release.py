"""Select focused/full CI and reuse only exact-tree comprehensive PR artifacts."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


def command(*args: str) -> str:
    """Run a checked command without shell interpolation."""
    return subprocess.check_output(args, text=True).strip()


def api(path: str) -> dict:
    """Read a repository API resource with the workflow token."""
    return json.loads(command("gh", "api", f"repos/{os.environ['GITHUB_REPOSITORY']}/{path}"))


def version_at(ref: str, kind: str) -> str:
    """Read the release version from a committed manifest."""
    path = "modules/harmonybus/module.json" if kind == "hb" else "release.json"
    return json.loads(command("git", "show", f"{ref}:{path}"))["version"]


def filenames(kind: str, version: str) -> list[str]:
    """Return the complete, fixed release asset set."""
    if kind == "hb":
        return [f"dist/harmonybus-v{version}-module.tar.gz", "dist/HarmonyBus-Timing-Guide.pdf"]
    return ["harmonybus-movy-module.tar.gz"]


def verify(proof: dict, root: Path, tree: str, version: str, files: list[str]) -> None:
    """Reject incomplete, stale or modified artifacts before copying anything."""
    assert proof["comprehensive"] is True
    assert proof["tree"] == tree and proof["version"] == version
    assert set(proof["files"]) == {Path(name).name for name in files}
    for name, digest in proof["files"].items():
        path = root / name
        assert path.is_file() and not path.is_symlink()
        assert hashlib.sha256(path.read_bytes()).hexdigest() == digest


def restore(kind: str, version: str, tree: str) -> bool:
    """Find a successful same-repository PR run; failures trigger a full build."""
    workflow = "release.yml" if kind == "hb" else "release-clean.yml"
    repository = os.environ["GITHUB_REPOSITORY"]
    try:
        runs = api(f"actions/workflows/{workflow}/runs?event=pull_request&status=success&per_page=30")["workflow_runs"]
        for run in runs:
            if run["head_repository"]["full_name"] != repository:
                continue
            with tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                try:
                    command("gh", "run", "download", str(run["id"]), "--repo", repository,
                            "--name", "comprehensive-release", "--dir", directory)
                    proof = json.loads((root / "release-proof.json").read_text())
                    verify(proof, root, tree, version, filenames(kind, version))
                    commit = api(f"git/commits/{proof['commit']}")
                    assert commit["tree"]["sha"] == tree
                    # checkout on pull_request is GitHub's synthetic merge commit.
                    assert run["head_sha"] in [parent["sha"] for parent in commit["parents"]]
                    assert proof["run_id"] == str(run["id"])
                    for name in filenames(kind, version):
                        destination = Path(name)
                        destination.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copyfile(root / destination.name, destination)
                    print(f"Reusing comprehensive artifact from run {run['id']}")
                    return True
                except (AssertionError, KeyError, ValueError, OSError, subprocess.CalledProcessError):
                    continue
    except (KeyError, ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f"Artifact lookup unavailable; running full build: {error}")
    return False


def choose(event_name: str, changed_version: bool, full_label: bool) -> tuple[bool, bool]:
    """Manual sweeps never publish; only version-changing pushes publish."""
    return (changed_version or full_label or event_name == "workflow_dispatch",
            changed_version and event_name == "push")


def main() -> None:
    """Plan CI or seal the successful comprehensive run's release files."""
    action, kind = sys.argv[1:]
    version = version_at("HEAD", kind)
    tree = command("git", "rev-parse", "HEAD^{tree}")
    if action == "seal":
        root = Path("ci-release")
        root.mkdir(exist_ok=True)
        proof = {"version": version, "tree": tree, "comprehensive": True,
                 "commit": command("git", "rev-parse", "HEAD"),
                 "run_id": os.environ["GITHUB_RUN_ID"], "files": {}}
        for name in filenames(kind, version):
            path = Path(name)
            shutil.copyfile(path, root / path.name)
            proof["files"][path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
        (root / "release-proof.json").write_text(json.dumps(proof, indent=2))
        return
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    event_name = os.environ["GITHUB_EVENT_NAME"]
    base = event.get("pull_request", {}).get("base", {}).get("sha") or event.get("before") or "HEAD"
    try:
        changed_version = version_at(base, kind) != version
    except subprocess.CalledProcessError:
        changed_version = True  # unknown base requires comprehensive verification
    full_label = any(label["name"] == "full-ci" for label in event.get("pull_request", {}).get("labels", []))
    full, publish = choose(event_name, changed_version, full_label)
    reused = publish and restore(kind, version, tree)
    mode = "reused" if reused else "full" if full else "focused"
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        output.write(f"mode={mode}\npublish={str(publish).lower()}\n")
    with open(os.environ["GITHUB_ENV"], "a") as output:
        output.write(f"VERSION={version}\nHB=dist/harmonybus-v{version}-module.tar.gz\n")
    print(f"CI mode: {mode}; publish: {publish}")


if __name__ == "__main__":
    main()
