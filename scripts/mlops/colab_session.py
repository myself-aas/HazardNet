#!/usr/bin/env python3
"""Driving a Colab VM from a GitHub runner: the official CLI, wrapped for unattended use.

WHAT THIS IS
------------
A thin, dependency-free wrapper around `google-colab-cli` (Google's official CLI:
`colab new -s NAME --gpu T4`, `colab exec`, `colab console`, `colab upload`,
`colab download`, `colab status`, `colab stop`). It adds the four things a scheduled
workflow needs and an interactive shell does not:

* **Every call has a timeout.** A GitHub-hosted job is killed at six hours with no
  warning, so a CLI call that hangs must fail in minutes, not consume the job.
* **Every failure is actionable.** `ColabCliError` carries the command, the exit code
  and the tail of the output — which is the whole of what a maintainer sees in a
  workflow log at 02:00, since the VM is long gone.
* **Nothing that touches the kernel is called during training.** A Jupyter kernel runs
  one thing at a time, so `colab exec` issued at hour four queues behind the training
  cell and does not return until it finishes. Every observation the watcher makes
  therefore goes through the Jupyter *Contents API* (`ls`, `download`, `status`) or the
  tmux shell (`console`), neither of which needs the kernel. This is the single most
  important rule in the file: break it and a healthy run looks dead.
* **Nothing secret is printed.** The OAuth token arrives as a repository secret and is
  written to `~/.config/colab-cli/token.json` with 0600 permissions; it is never echoed,
  never passed on a command line, never included in an error message.

TWO LIMITS OF THE CLI, DESIGNED AROUND
--------------------------------------
1. **`colab exec -f notebook.ipynb` blocks until the notebook finishes.** An eight-hour
   training run cannot be blocked on inside a six-hour job, so the notebook is launched
   *detached* with `setsid nohup jupyter nbconvert` over `colab console` (see
   `launch_training`) and observed afterwards through the files it writes.
2. **`colab drivemount` and `colab auth` are interactive** — the CLI's own demo record
   skips both because they need a TTY and browser consent. A headless session therefore
   has no Google Drive, which is why the durable store for checkpoints and bundles is
   GitHub (workflow artifacts, fetched and pushed by the watcher) rather than Drive. The
   notebook still mirrors to Drive when a human has mounted it interactively; it just
   never depends on it.

AUTH
----
`--auth=oauth2` with a refresh token captured once by a human and stored as the
`COLAB_TOKEN_JSON` secret. The CLI's other provider, `--auth=adc`, needs a Google service
account, and Colab sessions draw on a *person's* quota — a service account has no
free-tier GPU allocation to draw on. So: one personal OAuth token for the VM, and the
repository's `GITHUB_TOKEN` for everything on the GitHub side. No third credential.
"""

from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Sequence

#: Where the CLI keeps its cached OAuth credentials. Overridable so a test (or a runner
#: that wants an isolated config) can point it somewhere else.
TOKEN_PATH = Path(os.environ.get('COLAB_CLI_TOKEN_PATH', '~/.config/colab-cli/token.json')).expanduser()

#: `colab new -s NAME` prints `[colab] Session READY.` when the VM is usable.
READY_RE = re.compile(r'Session READY', re.IGNORECASE)
#: `colab status -s NAME` prints one line of hardware, variant and kernel state.
STATUS_RE = re.compile(
    r'\[(?P<name>[^\]]+)\]\s+(?P<endpoint>\S+)\s+\|\s+Hardware:\s+(?P<hardware>[^|]+?)\s+\|'
    r'\s+Variant:\s+(?P<variant>[^|]+?)\s+\|\s+Status:\s+(?P<state>\S+)'
)
LAST_EXEC_RE = re.compile(r'Last Execution:\s+(?P<what>.+?)\s+at\s+(?P<when>[\d\- :]+)')
#: `colab console` is a tmux-wrapped pty, so its stdout carries terminal control bytes.
ANSI_RE = re.compile(r'\x1b\[[0-9;?]*[a-zA-Z]|\x1b[=>]|\r')

#: Defaults chosen against the six-hour job cap and a free-tier T4's patience.
DEFAULT_TIMEOUT = 300          # provisioning, ls, download, status, stop
SHELL_TIMEOUT = 180            # a one-shot `colab console` command
EXEC_TIMEOUT = 900             # a short kernel exec (provisioning only — never mid-run)
TRANSFER_TIMEOUT = 900         # uploading a notebook, downloading a checkpoint

GPU = 'T4'


class ColabCliError(RuntimeError):
    """A Colab CLI call failed. The message is the diagnosis, not a stack trace."""

    def __init__(self, command: Sequence[str], returncode: int | None, output: str):
        self.command = [str(part) for part in command]
        self.returncode = returncode
        self.output = output
        tail = '\n'.join(line for line in clean(output).strip().splitlines()[-12:])
        super().__init__(f'`{" ".join(self.command)}` failed (exit {returncode}):\n{tail}')


def clean(text: str) -> str:
    """Strip the terminal-control bytes a tmux-wrapped pty leaves in the output."""
    return ANSI_RE.sub('', text or '')


@dataclass
class ColabSession:
    """One Colab VM, addressed by the name we gave it (`colab new -s <name>`)."""

    name: str
    gpu: str = GPU
    calls: list[str] = field(default_factory=list)

    # ── plumbing ─────────────────────────────────────────────────────────────

    def _run(
        self,
        args: Sequence[str],
        *,
        timeout: int = DEFAULT_TIMEOUT,
        check: bool = True,
        stdin: str | None = None,
    ) -> subprocess.CompletedProcess[str]:
        command = ['colab', *args]
        self.calls.append(' '.join(command))
        try:
            proc = subprocess.run(command, input=stdin, capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired as exc:
            raise ColabCliError(command, None,
                                f'timed out after {timeout}s\n{(exc.stdout or "") + (exc.stderr or "")}') from exc
        except FileNotFoundError as exc:
            raise ColabCliError(command, None, _INSTALL_HINT) from exc
        if check and proc.returncode != 0:
            raise ColabCliError(command, proc.returncode, (proc.stdout or '') + (proc.stderr or ''))
        return proc

    def _args(self) -> list[str]:
        """The addressing every subcommand takes: `-s <session name>`."""
        return ['-s', self.name]

    # ── lifecycle ────────────────────────────────────────────────────────────

    @classmethod
    def create(cls, name: str, gpu: str = GPU, timeout: int = DEFAULT_TIMEOUT) -> 'ColabSession':
        """Provision a VM and give it a name we choose.

        Naming it after the run is what lets a later job address the same VM without
        having been the one that created it. The CLI raises when no GPU is available,
        which on the free tier is a real possibility at busy hours rather than a bug.
        """
        args = ['new', '-s', name] + (['--gpu', gpu] if gpu else [])
        proc = _standalone(args, timeout=timeout)
        output = (proc.stdout or '') + (proc.stderr or '')
        if proc.returncode != 0 or not READY_RE.search(output):
            raise ColabCliError(['colab', *args], proc.returncode, output or 'no output')
        return cls(name=name, gpu=gpu)

    def status(self, timeout: int = DEFAULT_TIMEOUT) -> dict[str, Any] | None:
        """Hardware, machine shape and kernel state — without touching the kernel.

        Returns None when the session is gone, which is the normal way a recycled
        free-tier VM announces itself: the metadata call simply stops resolving.
        """
        proc = self._run(['status', *self._args()], timeout=timeout, check=False)
        text = clean((proc.stdout or '') + (proc.stderr or ''))
        match = STATUS_RE.search(text)
        if proc.returncode != 0 or not match:
            return None
        info: dict[str, Any] = {key: value.strip() for key, value in match.groupdict().items()}
        last = LAST_EXEC_RE.search(text)
        if last:
            info['last_execution'] = last.group('what').strip()
            info['last_execution_at'] = last.group('when').strip()
        return info

    def alive(self, timeout: int = DEFAULT_TIMEOUT) -> bool:
        return self.status(timeout=timeout) is not None

    def keepalive(self, timeout: int = DEFAULT_TIMEOUT) -> bool:
        """Re-touch the session so its tunnel stays warm, and report whether it exists.

        The CLI runs a keep-alive daemon per session, but that daemon lives on the
        machine that started it — and no GitHub job stays alive for eight hours. So the
        watcher re-touches the session every twenty minutes instead. If Colab recycles
        the VM anyway, the notebook's heartbeat goes stale and the watcher relaunches it
        from its checkpoints: liveness here is an optimisation, not the safety net.
        """
        return self.alive(timeout=timeout)

    def stop(self, timeout: int = DEFAULT_TIMEOUT) -> bool:
        """Release the VM. Failing to stop is not a failure of the run."""
        proc = self._run(['stop', *self._args()], timeout=timeout, check=False)
        return proc.returncode == 0

    # ── files (Contents API: no kernel involved) ─────────────────────────────

    def upload(self, local: Path | str, remote: str, timeout: int = TRANSFER_TIMEOUT) -> None:
        self._run(['upload', *self._args(), str(local), remote], timeout=timeout)

    def download(self, remote: str, local: Path | str, timeout: int = TRANSFER_TIMEOUT) -> bool:
        """Fetch a file off the VM. Returns False when it is not there yet."""
        Path(local).parent.mkdir(parents=True, exist_ok=True)
        proc = self._run(['download', *self._args(), remote, str(local)], timeout=timeout, check=False)
        return proc.returncode == 0 and Path(local).is_file()

    def ls(self, remote: str, timeout: int = DEFAULT_TIMEOUT) -> list[str]:
        proc = self._run(['ls', *self._args(), remote], timeout=timeout, check=False)
        if proc.returncode != 0:
            return []
        return [line.strip() for line in clean(proc.stdout or '').splitlines() if line.strip()]

    def rm(self, remote: str, timeout: int = DEFAULT_TIMEOUT) -> bool:
        return self._run(['rm', *self._args(), remote], timeout=timeout, check=False).returncode == 0

    # ── execution ────────────────────────────────────────────────────────────

    def shell(self, command: str, timeout: int = SHELL_TIMEOUT) -> str:
        """One shell command on the VM, through the tmux console.

        Kernel-free, which is why the detached launch and the directory setup go through
        here rather than through `exec`: a shell command works while the kernel is busy
        training, and `exec` would queue behind it for hours.
        """
        proc = self._run(['console', *self._args()], stdin=command + '\n', timeout=timeout, check=False)
        output = clean((proc.stdout or '') + (proc.stderr or ''))
        if proc.returncode != 0:
            raise ColabCliError(['colab', 'console', *self._args()], proc.returncode, output)
        return output

    def exec_code(self, code: str, timeout: int = EXEC_TIMEOUT) -> str:
        """Run Python on the VM's kernel. **Provisioning only** — see the module docstring.

        Calling this while the notebook is executing blocks until the notebook finishes,
        because a Jupyter kernel runs one cell at a time.
        """
        proc = self._run(['exec', *self._args()], stdin=code, timeout=timeout, check=False)
        output = clean((proc.stdout or '') + (proc.stderr or ''))
        if proc.returncode != 0:
            raise ColabCliError(['colab', 'exec', *self._args()], proc.returncode, output)
        return output

    def mkdir(self, remote: str, timeout: int = SHELL_TIMEOUT) -> None:
        self.shell(f'mkdir -p {shlex.quote(remote)}', timeout=timeout)

    def launch_training(self, remote_notebook: str, log_path: str, *,
                        env: dict[str, str] | None = None, timeout: int = SHELL_TIMEOUT) -> int:
        """Start the notebook executing on the VM and return immediately.

        This is what makes an eight-hour run survivable inside a six-hour job limit: the
        notebook is handed to `jupyter nbconvert` under `setsid nohup`, so the process
        belongs to the VM rather than to this shell, and keeps running after the call
        returns and after the workflow job ends. Progress is observed afterwards through
        the heartbeat the notebook writes (`mlops.retrain_state.write_heartbeat`) and the
        log file this call redirects into.

        `--ExecutePreprocessor.timeout=-1` because a cell may run for hours, and
        `--inplace` so an interrupted attempt leaves its executed outputs behind.
        """
        assignments = ' '.join(f'{key}={shlex.quote(str(value))}' for key, value in (env or {}).items())
        inner = (
            f'{assignments} setsid nohup jupyter nbconvert --to notebook --execute --inplace '
            f'--ExecutePreprocessor.timeout=-1 {shlex.quote(remote_notebook)} '
            f'> {shlex.quote(log_path)} 2>&1 < /dev/null & echo HN_PID=$!'
        )
        output = self.shell(inner, timeout=timeout)
        match = re.search(r'HN_PID=(\d+)', output)
        if not match:
            raise ColabCliError(['colab', 'console', *self._args()], None,
                                f'the detached launch printed no pid; output was: {output.strip()[-400:]}')
        return int(match.group(1))

    def tail_log(self, log_path: str, lines: int = 40, timeout: int = TRANSFER_TIMEOUT,
                 scratch: Path | str | None = None) -> str:
        """The last lines of the training log — the only trace a dead VM leaves.

        Downloaded rather than exec'd, for the kernel reason above.
        """
        target = Path(scratch or '/tmp') / f'{self.name}.run.log'
        if not self.download(log_path, target, timeout=timeout):
            return f'<could not download {log_path}>'
        text = target.read_text(encoding='utf-8', errors='replace').splitlines()
        return '\n'.join(text[-int(lines):])


_INSTALL_HINT = ('the `colab` CLI is not on PATH — install it with '
                 '`python -m pip install google-colab-cli` (needs Python 3.12+)')


# ── module-level helpers ─────────────────────────────────────────────────────


def _standalone(args: Sequence[str], timeout: int) -> subprocess.CompletedProcess[str]:
    command = ['colab', *args]
    try:
        return subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        raise ColabCliError(command, None,
                            f'timed out after {timeout}s\n{(exc.stdout or "") + (exc.stderr or "")}') from exc
    except FileNotFoundError as exc:
        raise ColabCliError(command, None, _INSTALL_HINT) from exc


def install_cli(python: str = 'python3', timeout: int = 600) -> str:
    """`pip install google-colab-cli`, returning the version it reported."""
    try:
        subprocess.run([python, '-m', 'pip', 'install', '--quiet', '--disable-pip-version-check',
                        'google-colab-cli'], check=True, capture_output=True, text=True, timeout=timeout)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError) as exc:
        raise ColabCliError([python, '-m', 'pip', 'install', 'google-colab-cli'], None,
                            str(getattr(exc, 'stderr', '') or exc)) from exc
    return version(timeout=60)


def version(timeout: int = 60) -> str:
    return clean((_standalone(['version'], timeout=timeout).stdout or '')).strip()


def write_token(token_json: str, path: Path | None = None) -> Path:
    """Put the OAuth refresh token where the CLI expects it, unreadable by others.

    `token_json` comes from a repository secret and is never printed. The file is written
    0600 because a runner workspace can be inspected by a later step, and a refresh token
    is a standing credential for a person's Google account.
    """
    if not token_json or not token_json.strip():
        raise ColabCliError(['write_token'], None, 'the Colab OAuth token is empty — is COLAB_TOKEN_JSON set?')
    try:
        document: Any = json.loads(token_json)
    except json.JSONDecodeError as exc:
        raise ColabCliError(['write_token'], None, f'the Colab OAuth token is not valid JSON: {exc}') from exc
    if not isinstance(document, dict):
        raise ColabCliError(['write_token'], None, 'the Colab OAuth token is not a JSON object')
    # Resolved at call time, not at import: a module constant bound as a default argument
    # is frozen into the signature, which makes the path impossible to redirect in a test.
    target = Path(path) if path else TOKEN_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(document), encoding='utf-8')
    os.chmod(target, 0o600)
    return target


def token_present(path: Path | None = None) -> bool:
    target = Path(path) if path else TOKEN_PATH
    return target.is_file() and target.stat().st_size > 0


def session_name(run_id: str) -> str:
    """A Colab session name derived from a run id.

    The CLI's own names look like `m-s-kkb-usw1c0-…`; ours are the run id, so a watcher
    that never saw the launch can still address the VM, and `colab sessions` reads as a
    list of runs rather than of opaque endpoints.
    """
    return re.sub(r'[^A-Za-z0-9_.-]', '-', run_id)[:60]
