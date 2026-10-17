#!/usr/bin/env python3
"""Exact web06a, closed Round2 rotation. --check is read-only; apply is user TTY-only."""
import copy
import ctypes
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import plistlib
import re
import stat
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.request

_spec = importlib.util.spec_from_file_location('r2_user_stage', Path(__file__).with_name('round2-eight-key-user-stage.py'))
stage = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(stage)
NAMES = stage.NAMES
WEB_SHA = '06a3369f5c5e1c3ca49045f370f0ce12f049c805'
BUILD = 'prelaunch-06a3369f5c5e-EWuEsS'
WORKER_PID = 49750
_deadline = None
_phase = 'precheck'
PHASES = frozenset(('precheck', 'user_terminal', 'deploy_lock', 'control_lock', 'locked_precheck',
    'old_consumer_census', 'prepare_journal', 'install_fence', 'drain_web', 'install_candidate',
    'start_and_verify_web', 'commit_verified_state'))
SAFE_ERRORS = frozenset('R2_APPLY_' + code for code in (
    'ACTIVE_FENCE_CHANGED', 'ACTIVE_FENCE_MISSING', 'ARGUMENTS', 'BOOTSTRAP_UNCONFIRMED',
    'CANDIDATE_KEYS', 'COLLECTOR_NOT_CLOSED', 'COMMAND_FAILED', 'COMMAND_TIMEOUT', 'CONSUMER_CENSUS',
    'CONTROL_CHANGED', 'DEADLINE_EXCEEDED', 'DUPLICATE_PROCESS_KEY', 'EXTRA_CONSUMER', 'FENCE_CHANGED',
    'FENCE_INVALID', 'FENCE_REPAIR_UNCONFIRMED', 'FOREIGN_LISTENER', 'HTTP_LISTENER', 'HTTP_PARENT',
    'LAUNCHER_PARENT', 'LIVE_CHANGED', 'LOCK_OWNER_CHANGED', 'MAC_ONLY', 'MUST_STAY_OFF',
    'OLD_KEYS_CHANGED', 'OPERATION_CHANGED', 'POSTCHECK_CHANGED', 'PREFLIGHT_OPEN', 'PRIVATE_DIRECTORY',
    'PRIVATE_PARENT', 'PROCESS_BUFFER', 'PROCESS_CHANGED', 'PROCESS_CWD', 'PROCESS_EIGHT_MISSING',
    'PROCESS_KEYS_NOT_LOADED', 'PROCESS_OWNER', 'PROCESS_PROOF_UNAVAILABLE', 'PROCESS_TREE_CHANGED',
    'STAGE_CHANGED', 'STAGE_RECEIPT', 'STATE_CHANGED', 'SYMLINK', 'UNEXPECTED_PROCESS_TREE',
    'UNRELATED_SETTING_CHANGED', 'USER_CANCELLED', 'USER_TTY_REQUIRED', 'WEB_BUILD', 'WEB_IDENTITY',
    'WEB_NOT_RUNNING', 'WORKER_CHANGED')) | frozenset('R2_STAGE_' + code for code in (
    'PATH_INVALID', 'SYMLINK_REJECTED', 'FILE_INVALID', 'FILE_CHANGED'))


def phase(name):
    global _phase
    _phase = name if name in PHASES else 'precheck'


def safe_failure_reason(error):
    # Never echo arbitrary exception text (parser/OS messages can include private inputs).
    if isinstance(error, ValueError) and str(error) in SAFE_ERRORS:
        return str(error)
    for kind, code in ((KeyboardInterrupt, 'USER_INTERRUPTED'), (EOFError, 'USER_INPUT_EOF'),
                       (FileExistsError, 'FILESYSTEM_ALREADY_EXISTS'), (PermissionError, 'FILESYSTEM_PERMISSION'),
                       (FileNotFoundError, 'FILESYSTEM_MISSING')):
        if isinstance(error, kind):
            return 'R2_APPLY_' + code
    return 'R2_APPLY_UNCLASSIFIED'


def require(ok, code):
    if not ok:
        raise ValueError('R2_APPLY_' + code)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def private_dir(path):
    for part in [path, *path.parents]:
        require(not part.is_symlink(), 'SYMLINK')
    s = path.lstat()
    require(stat.S_ISDIR(s.st_mode) and s.st_uid == os.getuid()
            and stat.S_IMODE(s.st_mode) == 0o700, 'PRIVATE_DIRECTORY')


def atomic_private(path, data):
    for part in [path.parent, *path.parent.parents]:
        require(not part.is_symlink(), 'SYMLINK')
    parent = path.parent.lstat()
    require(stat.S_ISDIR(parent.st_mode) and parent.st_uid == os.getuid()
            and not (stat.S_IMODE(parent.st_mode) & 0o022), 'PRIVATE_PARENT')
    if os.path.lexists(path):
        stage.private_file(path)
    temporary = path.with_name('.' + path.name + '.r2-apply-' + str(os.getpid()))
    stage.exclusive_write(temporary, data)
    os.replace(temporary, path)
    fd = os.open(path.parent, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def command(args, *, environment=None):
    result = bounded_run(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=environment)
    require(result.returncode == 0, 'COMMAND_FAILED')
    return result.stdout


def io_timeout(limit=5):
    remaining = limit if _deadline is None else min(limit, _deadline - time.monotonic())
    require(remaining > 0, 'DEADLINE_EXCEEDED')
    return remaining


def bounded_run(args, **options):
    try:
        return subprocess.run(args, timeout=io_timeout(), **options)
    except subprocess.TimeoutExpired:
        raise ValueError('R2_APPLY_COMMAND_TIMEOUT') from None


@contextmanager
def time_budget(seconds):
    global _deadline
    previous = _deadline
    end = time.monotonic() + seconds
    _deadline = end if previous is None else min(previous, end)
    try:
        yield
    finally:
        _deadline = previous


def services():
    found = {}
    for line in command(['/bin/launchctl', 'list']).decode().splitlines():
        fields = line.split()
        if len(fields) == 3 and fields[2] in ('com.homecook.production', 'com.homecook.youtube-extraction-worker'):
            found[fields[2]] = int(fields[0]) if fields[0].isdigit() else None
    require(found.get('com.homecook.youtube-extraction-worker') == WORKER_PID, 'WORKER_CHANGED')
    return found.get('com.homecook.production')


def process_identity(pid, cwd):
    # ps localizes lstart; pin only this read subprocess rather than weakening identity checks.
    environment = {**os.environ, 'LC_ALL': 'C', 'LANG': 'C', 'TZ': 'UTC'}
    fields = command(['/bin/ps', '-p', str(pid), '-o', 'pid=,ppid=,uid=,lstart='], environment=environment).decode().split()
    require(len(fields) == 8 and int(fields[0]) == pid and int(fields[2]) == os.getuid(), 'PROCESS_OWNER')
    directory = command(['/usr/sbin/lsof', '-a', '-p', str(pid), '-d', 'cwd', '-Fn']).decode().splitlines()
    require([line[1:] for line in directory if line.startswith('n')] == [str(cwd)], 'PROCESS_CWD')
    return {'pid': pid, 'ppid': int(fields[1]), 'start': ' '.join(fields[3:])}


def census(cwd):
    parent = services()
    require(parent is not None, 'WEB_NOT_RUNNING')
    top = process_identity(parent, cwd)
    require(top['ppid'] == 1, 'LAUNCHER_PARENT')
    child_result = bounded_run(['/usr/bin/pgrep', '-P', str(parent)], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    children = child_result.stdout.split()
    require(child_result.returncode == 0 and len(children) == 1 and children[0].isdigit(), 'CONSUMER_CENSUS')
    child = int(children[0])
    bottom = process_identity(child, cwd)
    require(bottom['ppid'] == parent, 'HTTP_PARENT')
    grandchildren = bounded_run(['/usr/bin/pgrep', '-P', str(child)], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    require(grandchildren.returncode == 1 and not grandchildren.stdout, 'EXTRA_CONSUMER')
    listener = command(['/usr/sbin/lsof', '-nP', '-t', '-iTCP:3100', '-sTCP:LISTEN']).split()
    require(listener == [str(child).encode()], 'HTTP_LISTENER')
    return [top, bottom]


def owned_stop_census(cwd):
    """A partial instance may have no listener/child, but must still be our exact launchd tree."""
    parent = services()
    if parent is None:
        return []
    pending, found = [parent], []
    while pending:
        pid = pending.pop(0)
        require(len(found) < 8 and pid not in [p['pid'] for p in found], 'UNEXPECTED_PROCESS_TREE')
        record = process_identity(pid, cwd)
        require(record['ppid'] == 1 if pid == parent else record['ppid'] in [p['pid'] for p in found], 'PROCESS_TREE_CHANGED')
        found.append(record)
        result = bounded_run(['/usr/bin/pgrep', '-P', str(pid)], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        require(result.returncode in (0, 1) and all(item.isdigit() for item in result.stdout.split()), 'PROCESS_TREE_CHANGED')
        pending.extend(int(item) for item in result.stdout.split())
    listener = bounded_run(['/usr/sbin/lsof', '-nP', '-t', '-iTCP:3100', '-sTCP:LISTEN'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    require(listener.returncode in (0, 1) and all(item.isdigit() and int(item) in [p['pid'] for p in found]
                                               for item in listener.stdout.split()), 'FOREIGN_LISTENER')
    return found


def prepared_fence_repair_allowed(journal, live_hash, receipt, state_hash):
    return (journal is not None and journal.get('phase') == 'prepared'
            and live_hash == receipt['source_plist_sha256'] and state_hash == journal.get('state_before_sha256'))


def eight_startup_fingerprints(raw):
    """Darwin argv/env buffer -> eight digests only. No other env fields are decoded/returned."""
    require(len(raw) >= 5, 'PROCESS_BUFFER')
    argc = struct.unpack_from('i', raw)[0]
    require(0 < argc <= 128, 'PROCESS_BUFFER')
    pos = raw.index(b'\0', 4) + 1
    while pos < len(raw) and raw[pos] == 0:
        pos += 1
    for _ in range(argc):
        pos = raw.index(b'\0', pos) + 1
    fingerprints = {}
    for entry in raw[pos:].split(b'\0'):
        for name in NAMES:
            prefix = name.encode() + b'='
            if entry.startswith(prefix):
                require(name not in fingerprints, 'DUPLICATE_PROCESS_KEY')
                fingerprints[name] = sha(entry[len(prefix):])
    require(set(fingerprints) == set(NAMES), 'PROCESS_EIGHT_MISSING')
    return fingerprints


def process_fingerprints(identity, cwd):
    require(process_identity(identity['pid'], cwd) == identity, 'PROCESS_CHANGED')
    libc = ctypes.CDLL('/usr/lib/libSystem.B.dylib', use_errno=True)
    mib = (ctypes.c_int * 3)(1, 49, identity['pid'])  # CTL_KERN / KERN_PROCARGS2, own exact web PID only.
    size = ctypes.c_size_t()
    require(libc.sysctl(mib, 3, None, ctypes.byref(size), None, 0) == 0
            and 0 < size.value <= 1024 * 1024, 'PROCESS_PROOF_UNAVAILABLE')
    buffer = ctypes.create_string_buffer(size.value)
    require(libc.sysctl(mib, 3, buffer, ctypes.byref(size), None, 0) == 0, 'PROCESS_PROOF_UNAVAILABLE')
    result = eight_startup_fingerprints(buffer.raw[:size.value])
    require(process_identity(identity['pid'], cwd) == identity, 'PROCESS_CHANGED')
    return result


def validate_candidate(before, candidate, fence):
    require(set(fence) == {'version', 'purpose', 'denied_fingerprints', 'approved_fingerprints'}
            and fence['version'] == 1 and fence['purpose'] == 'round2-eight-key-incident-20261017', 'FENCE_INVALID')
    denied, approved = fence['denied_fingerprints'], fence['approved_fingerprints']
    require(set(denied) == set(NAMES) and set(approved) == set(NAMES)
            and all(isinstance(v, str) and re.fullmatch('[a-f0-9]{64}', v) for v in [*denied.values(), *approved.values()])
            and len(set(denied.values())) == 8 and len(set(approved.values())) == 8
            and not set(denied.values()).intersection(approved.values()), 'FENCE_INVALID')
    env = candidate.get('EnvironmentVariables', {})
    require(all(isinstance(env.get(name), str) and sha(env[name].encode()) == approved[name] for name in NAMES), 'CANDIDATE_KEYS')
    require(all(env.get(name) == 'false' for name in ('MUMEOK_ROUND2_ENABLED', 'MUMEOK_ROUND2_LEADS_ENABLED')), 'MUST_STAY_OFF')
    if before is not None:
        old = before.get('EnvironmentVariables', {})
        require(all(isinstance(old.get(name), str) and sha(old[name].encode()) == denied[name] for name in NAMES), 'OLD_KEYS_CHANGED')
        expected = copy.deepcopy(before)
        expected['EnvironmentVariables'].update({name: env[name] for name in NAMES})
        require(expected == candidate, 'UNRELATED_SETTING_CHANGED')


def load_bundle():
    require(sys.platform == 'darwin', 'MAC_ONLY')
    home = Path.home()
    root = home / '.homecook/prelaunch-web'
    private_dir(root)
    staging = root / 'round2-eight-key-rotation-stage-20261017'
    private_dir(staging)
    op = root / 'round2-eight-key-rotation-apply-20261017'
    live_path = home / 'Library/LaunchAgents/com.homecook.production.plist'
    candidate_bytes = stage.private_file(staging / 'candidate.plist')
    fence_bytes = stage.private_file(staging / 'fence.json')
    receipt_bytes = stage.private_file(staging / 'receipt.json')
    receipt, candidate, fence = json.loads(receipt_bytes), plistlib.loads(candidate_bytes), json.loads(fence_bytes)
    require(set(receipt) == {'version', 'status', 'source_plist_sha256', 'candidate_plist_sha256', 'control_sha256', 'collection_enabled', 'lead_enabled'}
            and receipt['version'] == 1 and receipt['status'] == 'staged_not_applied'
            and receipt['collection_enabled'] is False and receipt['lead_enabled'] is False
            and sha(candidate_bytes) == receipt['candidate_plist_sha256'], 'STAGE_RECEIPT')
    live_bytes = stage.private_file(live_path)
    live_hash = sha(live_bytes)
    journal = None
    if os.path.lexists(op):
        private_dir(op)
        journal = json.loads(stage.private_file(op / 'journal.json'))
        require(journal['candidate_sha256'] == sha(candidate_bytes) and journal['fence_sha256'] == sha(fence_bytes)
                and journal['stage_receipt_sha256'] == sha(receipt_bytes)
                and journal['source_sha256'] == receipt['source_plist_sha256'], 'OPERATION_CHANGED')
    require(live_hash == receipt['source_plist_sha256'] or (journal is not None and live_hash == sha(candidate_bytes)), 'LIVE_CHANGED')
    validate_candidate(plistlib.loads(live_bytes) if live_hash == receipt['source_plist_sha256'] else None, candidate, fence)
    cwd = root / 'releases/06a3369f5c5e-EWuEsS/checkout'
    require(candidate.get('WorkingDirectory') == str(cwd)
            and command(['/usr/bin/git', '-C', str(cwd), 'rev-parse', 'HEAD']).strip().decode() == WEB_SHA
            and (cwd / '.next/BUILD_ID').read_text().strip() == BUILD, 'WEB_IDENTITY')
    command(['/usr/bin/git', '-C', str(cwd), 'diff', '--quiet', 'HEAD'])
    env = candidate['EnvironmentVariables']
    control_path = Path(env['MUMEOK_ROUND2_CONTROL_PATH'])
    control_bytes = stage.private_file(control_path)
    control = json.loads(control_bytes)
    require(sha(control_bytes) == receipt['control_sha256'] and control.get('collection_enabled') is False
            and control.get('lead_enabled') is False, 'CONTROL_CHANGED')
    arm = env.get('MUMEOK_ROUND2_PREFLIGHT_ARM_PATH')
    require(not arm or not os.path.lexists(arm), 'PREFLIGHT_OPEN')
    state_path = root / 'state.json'
    state_bytes = stage.private_file(state_path)
    state = json.loads(state_bytes)
    require(state.get('ref') == WEB_SHA and state.get('buildId') == BUILD
            and not os.path.lexists(root / 'recovery.json'), 'STATE_CHANGED')
    active_fence = root / 'round2-eight-key-rotation-fence.json'
    if os.path.lexists(active_fence):
        require(stage.private_file(active_fence) == fence_bytes, 'ACTIVE_FENCE_CHANGED')
    else:
        require(journal is None or prepared_fence_repair_allowed(journal, live_hash, receipt, sha(state_bytes)), 'ACTIVE_FENCE_MISSING')
    if journal is not None:
        require(sha(state_bytes) in (journal['state_before_sha256'], journal['state_after_sha256']), 'STATE_CHANGED')
    return {'root': root, 'op': op, 'live_path': live_path, 'candidate': candidate_bytes, 'fence': fence_bytes,
            'receipt': receipt_bytes, 'source_hash': receipt['source_plist_sha256'], 'state_path': state_path,
            'state_bytes': state_bytes, 'state': state, 'control_path': control_path, 'control_bytes': control_bytes,
            'cwd': cwd, 'journal': journal, 'approved': fence['approved_fingerprints']}


@contextmanager
def held_directory(path, owner=False):
    phase('control_lock' if owner else 'deploy_lock')
    private_dir(path.parent)
    os.mkdir(path, 0o700)  # Existing/stale locks are never stolen.
    initial = path.lstat()
    token = sha((str(path) + str(os.getpid()) + str(time.monotonic_ns())).encode())
    if owner:
        stage.exclusive_write(path / 'owner', token.encode())
    try:
        yield
    finally:
        current = path.lstat()
        require(current.st_ino == initial.st_ino and current.st_dev == initial.st_dev
                and current.st_uid == os.getuid() and not path.is_symlink(), 'LOCK_OWNER_CHANGED')
        if owner:
            require(stage.private_file(path / 'owner') == token.encode(), 'LOCK_OWNER_CHANGED')
            os.unlink(path / 'owner')
        os.rmdir(path)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


def web_smoke(cwd):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    manifest = '/_next/static/' + BUILD + '/_buildManifest.js'
    with opener.open('http://127.0.0.1:3100' + manifest, timeout=io_timeout(3)) as response:
        require(response.status == 200 and sha(response.read(1024 * 1024))
                == sha((cwd / ('.next/static/' + BUILD + '/_buildManifest.js')).read_bytes()), 'WEB_BUILD')
    request = urllib.request.Request('http://127.0.0.1:3100/api/v1/marketing/round2', data=b'{}', method='POST',
        headers={'Host': 'app.mumeok.kr', 'Origin': 'https://app.mumeok.kr', 'Content-Type': 'application/json'})
    try:
        opener.open(request, timeout=io_timeout(3))
        require(False, 'COLLECTOR_NOT_CLOSED')
    except urllib.error.HTTPError as error:
        body = json.loads(error.read(8192))
        require(error.code == 503 and body.get('error', {}).get('code') == 'ROUND2_DISABLED', 'COLLECTOR_NOT_CLOSED')


def checkpoint(bundle, phase, **extra):
    bundle['journal'].update({'phase': phase, **extra})
    atomic_private(bundle['op'] / 'journal.json', json_bytes(bundle['journal']))


def verify_loaded(bundle):
    web_smoke(bundle['cwd'])  # Child is initialized before startup-env proof.
    observed = census(bundle['cwd'])
    for process in observed:
        require(process_fingerprints(process, bundle['cwd']) == bundle['approved'], 'PROCESS_KEYS_NOT_LOADED')
    require(census(bundle['cwd']) == observed and stage.private_file(bundle['live_path']) == bundle['candidate']
            and stage.private_file(bundle['control_path']) == bundle['control_bytes']
            and stage.private_file(bundle['root'] / 'round2-eight-key-rotation-fence.json') == bundle['fence'], 'POSTCHECK_CHANGED')
    arm = plistlib.loads(bundle['candidate'])['EnvironmentVariables'].get('MUMEOK_ROUND2_PREFLIGHT_ARM_PATH')
    require(not arm or not os.path.lexists(arm), 'PREFLIGHT_OPEN')
    return observed


def apply_user(bundle):
    phase('user_terminal')
    require(all(stream.isatty() for stream in (sys.stdin, sys.stdout, sys.stderr)), 'USER_TTY_REQUIRED')
    print('Web06a restarts briefly. Round2/lead stay OFF. Old keys will never be restored.')
    require(input('Type APPLY to install the staged eight keys: ') == 'APPLY', 'USER_CANCELLED')
    root = bundle['root']
    with time_budget(120), held_directory(root / 'deploy.lock'), held_directory(Path(str(bundle['control_path']) + '.lock'), owner=True):
        phase('locked_precheck')
        current = load_bundle()  # Re-read every private binding under both locks.
        require(current['candidate'] == bundle['candidate'] and current['fence'] == bundle['fence'], 'STAGE_CHANGED')
        bundle = current
        if bundle['journal'] is None:
            phase('old_consumer_census')
            old_processes = census(bundle['cwd'])
            state_after = copy.deepcopy(bundle['state'])
            state_after['targetPlistHash'] = sha(bundle['candidate'])
            state_after['round2EightKeyRotation'] = {'version': 1, 'fenceSha256': sha(bundle['fence']),
                'candidatePlistSha256': sha(bundle['candidate']), 'stageReceiptSha256': sha(bundle['receipt']),
                'collectionEnabled': False, 'leadEnabled': False, 'reactivationReady': False}
            phase('prepare_journal')
            os.mkdir(bundle['op'], 0o700)
            stage.exclusive_write(bundle['op'] / 'state-before.json', bundle['state_bytes'])
            stage.exclusive_write(bundle['op'] / 'state-after.json', json_bytes(state_after))
            bundle['journal'] = {'version': 1, 'phase': 'prepared', 'candidate_sha256': sha(bundle['candidate']),
                'fence_sha256': sha(bundle['fence']), 'stage_receipt_sha256': sha(bundle['receipt']),
                'source_sha256': bundle['source_hash'], 'state_before_sha256': sha(bundle['state_bytes']),
                'state_after_sha256': sha(json_bytes(state_after)), 'old_processes': old_processes}
            atomic_private(bundle['op'] / 'journal.json', json_bytes(bundle['journal']))
        active_fence = root / 'round2-eight-key-rotation-fence.json'
        phase('install_fence')
        if not os.path.lexists(active_fence):
            require(bundle['journal']['phase'] == 'prepared'
                    and sha(stage.private_file(bundle['live_path'])) == bundle['source_hash']
                    and census(bundle['cwd']) == bundle['journal']['old_processes'], 'FENCE_REPAIR_UNCONFIRMED')
            atomic_private(active_fence, bundle['fence'])
        try:
            # Re-entry may only complete this exact candidate. Never use previous.plist.
            if stage.private_file(bundle['live_path']) == bundle['candidate']:
                try:
                    observed = verify_loaded(bundle)
                except Exception:
                    observed = None
            else:
                observed = None
            if observed is None:
                phase('drain_web')
                old = owned_stop_census(bundle['cwd'])
                if old:
                    target = 'gui/' + str(os.getuid()) + '/com.homecook.production'
                    bounded_run(['/bin/launchctl', 'bootout', target], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                with time_budget(30):
                    while True:
                        gone = services() is None
                        for identity in old:
                            try:
                                os.kill(identity['pid'], 0)
                                gone = False
                            except ProcessLookupError:
                                pass
                        listener = bounded_run(['/usr/sbin/lsof', '-nP', '-t', '-iTCP:3100', '-sTCP:LISTEN'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
                        if gone and not listener.stdout:
                            break
                        time.sleep(min(0.25, io_timeout()))
                checkpoint(bundle, 'drained', last_possible_counter_write_at=int(time.time()) + 1)
                require(stage.private_file(bundle['control_path']) == bundle['control_bytes'], 'CONTROL_CHANGED')
                phase('install_candidate')
                atomic_private(bundle['live_path'], bundle['candidate'])
                checkpoint(bundle, 'installed')
                require(stage.private_file(root / 'round2-eight-key-rotation-fence.json') == bundle['fence'], 'FENCE_CHANGED')
                phase('start_and_verify_web')
                result = bounded_run(['/bin/launchctl', 'bootstrap', 'gui/' + str(os.getuid()), str(bundle['live_path'])], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                require(result.returncode == 0 or services() is not None, 'BOOTSTRAP_UNCONFIRMED')
                with time_budget(40):
                    while True:
                        try:
                            observed = verify_loaded(bundle)
                            break
                        except Exception:
                            time.sleep(min(0.5, io_timeout()))
            phase('commit_verified_state')
            after_state = stage.private_file(bundle['op'] / 'state-after.json')
            require(sha(after_state) == bundle['journal']['state_after_sha256'], 'STATE_CHANGED')
            atomic_private(bundle['state_path'], after_state)
            checkpoint(bundle, 'committed', new_processes=observed, startup_eight_match=True,
                collector_disabled_verified=True, worker_pid=WORKER_PID,
                rate_resume_not_before=bundle['journal'].get('last_possible_counter_write_at', int(time.time())) + 3600,
                completed_at=datetime.now(timezone.utc).isoformat(), reactivation_ready=False)
        except Exception:
            # New config/fence remain. No rollback, key regeneration, DB restore, or collection activation.
            checkpoint(bundle, 'unresolved')
            raise
    print('R2_APPLY_COMMITTED_OFF')


def main():
    require(sys.argv[1:] in ([], ['--check'], ['--check-terminal']), 'ARGUMENTS')
    if sys.argv[1:] == ['--check-terminal']:
        print(json.dumps({'status': 'R2_TERMINAL_READ_ONLY', 'stdinTTY': sys.stdin.isatty(),
            'stdoutTTY': sys.stdout.isatty(), 'stderrTTY': sys.stderr.isatty(), 'operationalWrites': 0}))
        return
    bundle = load_bundle()
    if sys.argv[1:] == ['--check']:
        observed = census(bundle['cwd'])
        print(json.dumps({'status': 'R2_APPLY_READY_FOR_USER', 'stagedEightVerified': True,
            'unrelatedSettingsPreserved': True, 'collectionEnabled': False, 'leadEnabled': False,
            'consumerCount': len(observed), 'webSha': WEB_SHA, 'workerPid': WORKER_PID,
            'operationalWrites': 0, 'runtimeKeyProof': 'not_checked_by_preflight'}))
    else:
        apply_user(bundle)


if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        print('R2_APPLY_STOPPED_REVIEW_REQUIRED', file=sys.stderr)
        print('R2_APPLY_FAILURE phase=' + _phase + ' reason=' + safe_failure_reason(error), file=sys.stderr)
        sys.exit(1)
