import copy
from contextlib import contextmanager, ExitStack
import importlib.util
import io
import json
from pathlib import Path
import plistlib
import struct
import os
import stat
import tempfile
import subprocess
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('r2_apply', Path(__file__).parents[1] / 'scripts/round2-eight-key-user-apply.py')
apply = importlib.util.module_from_spec(spec)
spec.loader.exec_module(apply)


def values(epoch):
    return {name: 'fixture-' + epoch + '-key-' + str(i) + '-never-a-real-secret' for i, name in enumerate(apply.NAMES)}


def fixture():
    old, new = values('old'), values('new')
    before = {'WorkingDirectory': '/fixture/web06a', 'ProgramArguments': ['fixture-node', 'fixture-start'],
              'EnvironmentVariables': {**old, 'MUMEOK_ROUND2_ENABLED': 'false', 'MUMEOK_ROUND2_LEADS_ENABLED': 'false',
                                       'AUTH_KEY': 'fixture-auth-unchanged'}}
    candidate = copy.deepcopy(before)
    candidate['EnvironmentVariables'].update(new)
    fence = {'version': 1, 'purpose': 'round2-eight-key-incident-20261017',
             'denied_fingerprints': {n: apply.sha(v.encode()) for n, v in old.items()},
             'approved_fingerprints': {n: apply.sha(v.encode()) for n, v in new.items()}}
    return before, candidate, fence


class CandidateAndProcessFixtureTest(unittest.TestCase):
    def test_failure_report_never_echoes_arbitrary_exception_input(self):
        self.assertEqual(apply.safe_failure_reason(ValueError('R2_APPLY_USER_CANCELLED')), 'R2_APPLY_USER_CANCELLED')
        for error in (ValueError('fixture-private-input'), ValueError('R2_APPLY_UNKNOWN_PRIVATE_TEXT'),
                      OSError('fixture-private-path'), RuntimeError('fixture-private-input')):
            self.assertEqual(apply.safe_failure_reason(error), 'R2_APPLY_UNCLASSIFIED')
        self.assertEqual(apply.safe_failure_reason(EOFError('fixture-private')), 'R2_APPLY_USER_INPUT_EOF')
        apply.phase('fixture-private-phase')
        self.assertEqual(apply._phase, 'precheck')

    def test_terminal_check_reads_no_bundle_and_performs_no_mutation(self):
        output = FixtureTTY()
        with patch.object(apply, 'load_bundle') as load, patch.object(apply, 'apply_user') as mutate, \
                patch('sys.argv', ['fixture-script', '--check-terminal']), patch('sys.stdin', FixtureTTY()), \
                patch('sys.stdout', output), patch('sys.stderr', FixtureTTY()):
            apply.main()
            load.assert_not_called(); mutate.assert_not_called()
        self.assertEqual(json.loads(output.getvalue()), {'status': 'R2_TERMINAL_READ_ONLY', 'stdinTTY': True,
            'stdoutTTY': True, 'stderrTTY': True, 'operationalWrites': 0})

    def test_only_exact_eight_may_change(self):
        before, candidate, fence = fixture()
        apply.validate_candidate(before, candidate, fence)
        for change in ('auth', 'flag', 'argv', 'old', 'other', 'fence'):
            modified, f = copy.deepcopy(candidate), copy.deepcopy(fence)
            if change == 'auth': modified['EnvironmentVariables']['AUTH_KEY'] = 'fixture-changed'
            if change == 'flag': modified['EnvironmentVariables']['MUMEOK_ROUND2_ENABLED'] = 'true'
            if change == 'argv': modified['ProgramArguments'].append('fixture-injected')
            if change == 'old': modified['EnvironmentVariables'][apply.NAMES[0]] = values('old')[apply.NAMES[0]]
            if change == 'other': modified['EnvironmentVariables'][apply.NAMES[0]] = 'fixture-unapproved-value'
            if change == 'fence': f['approved_fingerprints'][apply.NAMES[0]] = f['denied_fingerprints'][apply.NAMES[0]]
            with self.subTest(change=change), self.assertRaises(ValueError):
                apply.validate_candidate(before, modified, f)

    def raw(self, entries):
        argv = [b'fixture-node', b'fixture-start']
        return struct.pack('i', len(argv)) + b'/fixture/node\0\0\0' + b'\0'.join(argv) + b'\0' + b'\0'.join(entries) + b'\0'

    def test_process_parser_returns_only_fixed_eight_digests_and_rejects_missing_duplicate_truncated(self):
        new = values('new')
        entries = [(n + '=' + v).encode() for n, v in new.items()]
        expected = {n: apply.sha(v.encode()) for n, v in new.items()}
        self.assertEqual(apply.eight_startup_fingerprints(self.raw([b'UNRELATED=fixture-private-not-returned', *entries])), expected)
        for raw in (self.raw(entries[:-1]), self.raw(entries + entries[:1]), b'bad', struct.pack('i', 0) + b'\0'):
            with self.assertRaises((ValueError, IndexError)):
                apply.eight_startup_fingerprints(raw)
        self.assertFalse(any(v in json.dumps(expected) for v in new.values()))

    def test_non_tty_or_cancel_cannot_acquire_locks_or_write(self):
        with patch('sys.stdin', io.StringIO()), patch.object(apply, 'held_directory') as locks:
            with self.assertRaisesRegex(ValueError, 'USER_TTY_REQUIRED'):
                apply.apply_user({})
            locks.assert_not_called()

    def test_loaded_proof_requires_both_processes_eight_hashes_and_closed_files(self):
        with apply_fixture() as f:
            f.files[f.bundle['live_path']] = f.bundle['candidate']
            f.files[f.bundle['root'] / 'round2-eight-key-rotation-fence.json'] = f.bundle['fence']
            # Exercise the real verifier, bypassing the transition fixture's mock for this test only.
            verifier = ORIGINAL_VERIFY_LOADED
            with patch.object(apply, 'web_smoke'), patch.object(apply, 'census', return_value=f.new), \
                    patch.object(apply, 'process_fingerprints', return_value=f.bundle['approved']) as proofs:
                self.assertEqual(verifier(f.bundle), f.new)
                self.assertEqual([call.args[0] for call in proofs.call_args_list], f.new)
            with patch.object(apply, 'web_smoke'), patch.object(apply, 'census', return_value=f.new), \
                    patch.object(apply, 'process_fingerprints', side_effect=[f.bundle['approved'], {}]):
                with self.assertRaisesRegex(ValueError, 'PROCESS_KEYS_NOT_LOADED'):
                    verifier(f.bundle)
        with patch('sys.stdin', FixtureTTY()), patch('sys.stdout', FixtureTTY()), patch('sys.stderr', FixtureTTY()), \
                patch('builtins.input', return_value='CANCEL'), patch.object(apply, 'held_directory') as locks:
            with self.assertRaisesRegex(ValueError, 'USER_CANCELLED'):
                apply.apply_user({})
            locks.assert_not_called()


class FixtureTTY(io.StringIO):
    def isatty(self):
        return True


ORIGINAL_VERIFY_LOADED = apply.verify_loaded


class PrivateWriteAndLockFixtureTest(unittest.TestCase):
    def test_private_atomic_replace_accepts_owned755_launchagent_parent_and_rejects_symlink(self):
        with tempfile.TemporaryDirectory(dir='/private/tmp') as directory:
            parent = Path(directory) / 'fixture-LaunchAgents'
            parent.mkdir(mode=0o755)
            target = parent / 'fixture.plist'
            apply.stage.exclusive_write(target, b'fixture-old')
            apply.atomic_private(target, b'fixture-new')
            self.assertEqual(target.read_bytes(), b'fixture-new')
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o600)
            link = parent / 'fixture-link.plist'
            link.symlink_to(target)
            with self.assertRaises(ValueError):
                apply.atomic_private(link, b'fixture-must-not-write')
            self.assertEqual(target.read_bytes(), b'fixture-new')

    def test_existing_lock_is_not_stolen_and_owned_control_lock_releases_on_exception(self):
        with tempfile.TemporaryDirectory(dir='/private/tmp') as directory:
            path = Path(directory) / 'fixture-control.lock'
            path.mkdir(mode=0o700)
            with self.assertRaises(FileExistsError):
                with apply.held_directory(path, owner=True):
                    self.fail('existing lock acquired')
            self.assertTrue(path.is_dir())
            path.rmdir()
            with self.assertRaisesRegex(ValueError, 'fixture-stop'):
                with apply.held_directory(path, owner=True):
                    self.assertTrue((path / 'owner').is_file())
                    raise ValueError('fixture-stop')
            self.assertFalse(path.exists())


@contextmanager
def noop_lock(*_args, **_kwargs):
    yield


@contextmanager
def apply_fixture(fail_bootstrap=False, fail_proof=False, timeout_bootstrap=False):
    before, candidate, fence = fixture()
    root, live, state_path = Path('/fixture/private'), Path('/fixture/LaunchAgents/web.plist'), Path('/fixture/private/state.json')
    state = {'ref': apply.WEB_SHA, 'buildId': apply.BUILD, 'targetPlistHash': apply.sha(plistlib.dumps(before)), 'closedR2': {'fixture': True}}
    bundle = {'root': root, 'op': root / 'round2-eight-key-rotation-apply-20261017', 'live_path': live,
              'candidate': plistlib.dumps(candidate), 'fence': json.dumps(fence).encode(), 'receipt': b'fixture-receipt',
              'source_hash': apply.sha(plistlib.dumps(before)), 'state_path': state_path,
              'state_bytes': json.dumps(state).encode(), 'state': state, 'control_path': root / 'control.json',
              'control_bytes': b'fixture-control-off', 'cwd': Path('/fixture/web06a'), 'journal': None,
              'approved': fence['approved_fingerprints']}
    files = {live: plistlib.dumps(before), state_path: bundle['state_bytes'], bundle['control_path']: bundle['control_bytes']}
    actions, writes = [], []
    old = [{'pid': 100, 'ppid': 1, 'start': 'fixture-old'}, {'pid': 101, 'ppid': 100, 'start': 'fixture-old'}]
    new = [{'pid': 200, 'ppid': 1, 'start': 'fixture-new'}, {'pid': 201, 'ppid': 200, 'start': 'fixture-new'}]
    output = FixtureTTY()
    clock = SimpleNamespace(now=0.0)
    def write(path, content):
        files[path] = content
        writes.append((path, content))
    def run(args, **_kwargs):
        actions.append(args)
        if timeout_bootstrap and 'bootstrap' in args:
            raise subprocess.TimeoutExpired(args, _kwargs['timeout'])
        return SimpleNamespace(returncode=13 if fail_bootstrap and 'bootstrap' in args else 0, stdout=b'')
    with ExitStack() as stack:
        replace = lambda name, **kwargs: stack.enter_context(patch(name, **kwargs))
        replace('sys.stdin', new=FixtureTTY()); replace('sys.stdout', new=output); replace('sys.stderr', new=FixtureTTY())
        replace('builtins.input', return_value='APPLY')
        stack.enter_context(patch.object(apply, 'held_directory', side_effect=noop_lock))
        stack.enter_context(patch.object(apply, 'load_bundle', return_value=bundle))
        stack.enter_context(patch.object(apply, 'census', return_value=old))
        stack.enter_context(patch.object(apply, 'owned_stop_census', return_value=old))
        stack.enter_context(patch.object(apply, 'services', return_value=None))
        stack.enter_context(patch.object(apply.stage, 'private_file', side_effect=lambda path: files[path]))
        stack.enter_context(patch.object(apply.stage, 'exclusive_write', side_effect=write))
        stack.enter_context(patch.object(apply, 'atomic_private', side_effect=write))
        stack.enter_context(patch.object(apply, 'verify_loaded', side_effect=ValueError('fixture-proof-failed') if fail_proof else None, return_value=new))
        replace('os.mkdir'); replace('os.kill', side_effect=ProcessLookupError())
        replace('os.path.lexists', side_effect=lambda path: path in files)
        replace('subprocess.run', side_effect=run)
        replace('time.sleep', side_effect=lambda seconds: setattr(clock, 'now', clock.now + seconds))
        replace('time.monotonic', side_effect=lambda: clock.now)
        yield SimpleNamespace(bundle=bundle, files=files, writes=writes, actions=actions, output=output, before=before, old=old, new=new)


class ApplyTransitionFixtureTest(unittest.TestCase):
    def test_success_installs_exact_candidate_keeps_history_and_records_both_consumers(self):
        with apply_fixture() as f:
            apply.apply_user(f.bundle)
            self.assertEqual(f.files[f.bundle['live_path']], f.bundle['candidate'])
            self.assertEqual(f.files[f.bundle['root'] / 'round2-eight-key-rotation-fence.json'], f.bundle['fence'])
            published = json.loads(f.files[f.bundle['state_path']])
            self.assertEqual(published['closedR2'], {'fixture': True})
            self.assertEqual(published['targetPlistHash'], apply.sha(f.bundle['candidate']))
            self.assertFalse(published['round2EightKeyRotation']['reactivationReady'])
            journal = json.loads(f.files[f.bundle['op'] / 'journal.json'])
            self.assertEqual(journal['phase'], 'committed')
            self.assertEqual(journal['new_processes'], f.new)
            self.assertTrue(journal['startup_eight_match'])
            self.assertIn('R2_APPLY_COMMITTED_OFF', f.output.getvalue())
            self.assertTrue(all('com.homecook.youtube-extraction-worker' not in arg for args in f.actions for arg in args))
            for value in values('new').values():
                self.assertNotIn(value, f.output.getvalue())

    def test_bootstrap_or_load_failure_keeps_new_keys_off_and_never_restores_old_plist(self):
        for failure in ('bootstrap', 'proof', 'timeout'):
            with self.subTest(failure=failure), apply_fixture(fail_bootstrap=failure == 'bootstrap', fail_proof=failure == 'proof', timeout_bootstrap=failure == 'timeout') as f:
                with self.assertRaises(ValueError):
                    apply.apply_user(f.bundle)
                self.assertEqual(f.files[f.bundle['live_path']], f.bundle['candidate'])
                self.assertEqual(f.files[f.bundle['root'] / 'round2-eight-key-rotation-fence.json'], f.bundle['fence'])
                self.assertEqual(json.loads(f.files[f.bundle['op'] / 'journal.json'])['phase'], 'unresolved')
                self.assertNotIn('R2_APPLY_COMMITTED_OFF', f.output.getvalue())
                self.assertFalse(any(path == f.bundle['live_path'] and data == plistlib.dumps(f.before) for path, data in f.writes))

    def test_prepared_fence_failure_can_complete_same_operation_forward(self):
        with apply_fixture() as f:
            real_write = apply.atomic_private.side_effect
            active = f.bundle['root'] / 'round2-eight-key-rotation-fence.json'
            def fail_fence_once(path, content):
                if path == active:
                    raise OSError('fixture-fence-write-failed')
                real_write(path, content)
            with patch.object(apply, 'atomic_private', side_effect=fail_fence_once):
                with self.assertRaises(OSError):
                    apply.apply_user(f.bundle)
            journal = json.loads(f.files[f.bundle['op'] / 'journal.json'])
            self.assertEqual(journal['phase'], 'prepared')
            self.assertNotIn(active, f.files)
            self.assertEqual(f.files[f.bundle['live_path']], plistlib.dumps(f.before))
            receipt = {'source_plist_sha256': f.bundle['source_hash']}
            self.assertTrue(apply.prepared_fence_repair_allowed(journal, f.bundle['source_hash'], receipt, apply.sha(f.bundle['state_bytes'])))
            self.assertFalse(apply.prepared_fence_repair_allowed({**journal, 'phase': 'installed'}, f.bundle['source_hash'], receipt, apply.sha(f.bundle['state_bytes'])))
            self.assertFalse(apply.prepared_fence_repair_allowed(journal, 'fixture-different', receipt, apply.sha(f.bundle['state_bytes'])))
            apply.apply_user(f.bundle)
            self.assertEqual(json.loads(f.files[f.bundle['op'] / 'journal.json'])['phase'], 'committed')


class RepairAndDeadlineFixtureTest(unittest.TestCase):
    def test_process_identity_is_locale_independent_and_keeps_uid_pid_and_cwd_checks(self):
        def run(args, **options):
            if args[0] == '/bin/ps':
                forced = options.get('env', {})
                start = 'Sat Oct 17 08:59:03 2026' if forced.get('LC_ALL') == 'C' and forced.get('TZ') == 'UTC' else '2026년 10월 17일 토요일 08시 59분 03초'
                return SimpleNamespace(returncode=0, stdout=('100 1 501 ' + start).encode())
            return SimpleNamespace(returncode=0, stdout=b'p100\nn/fixture/web06a\n')
        with patch('os.getuid', return_value=501), patch('subprocess.run', side_effect=run), \
                patch.dict(os.environ, {'LC_ALL': 'ko_KR.UTF-8', 'TZ': 'Asia/Seoul'}):
            self.assertEqual(apply.process_identity(100, Path('/fixture/web06a')),
                {'pid': 100, 'ppid': 1, 'start': 'Sat Oct 17 08:59:03 2026'})
        for line in (b'100 1 502 Sat Oct 17 08:59:03 2026', b'999 1 501 Sat Oct 17 08:59:03 2026'):
            with patch('os.getuid', return_value=501), patch.object(apply, 'bounded_run', return_value=SimpleNamespace(returncode=0, stdout=line)):
                with self.assertRaisesRegex(ValueError, 'PROCESS_OWNER'):
                    apply.process_identity(100, Path('/fixture/web06a'))
        with patch('os.getuid', return_value=501), patch.object(apply, 'bounded_run', side_effect=[
                SimpleNamespace(returncode=0, stdout=b'100 1 501 Sat Oct 17 08:59:03 2026'),
                SimpleNamespace(returncode=0, stdout=b'p100\nn/fixture/foreign\n')]):
            with self.assertRaisesRegex(ValueError, 'PROCESS_CWD'):
                apply.process_identity(100, Path('/fixture/web06a'))

    def test_partial_owned_launcher_can_be_drained_but_foreign_listener_rejected(self):
        parent = {'pid': 100, 'ppid': 1, 'start': 'fixture-parent'}
        for listener, allowed in ((b'', True), (b'100\n', True), (b'999\n', False)):
            with self.subTest(listener=listener), patch.object(apply, 'services', return_value=100), \
                    patch.object(apply, 'process_identity', return_value=parent), \
                    patch.object(apply, 'bounded_run', side_effect=[SimpleNamespace(returncode=1, stdout=b''), SimpleNamespace(returncode=0 if listener else 1, stdout=listener)]):
                if allowed:
                    self.assertEqual(apply.owned_stop_census(Path('/fixture/web06a')), [parent])
                else:
                    with self.assertRaisesRegex(ValueError, 'FOREIGN_LISTENER'):
                        apply.owned_stop_census(Path('/fixture/web06a'))

    def test_deadline_bounds_nested_commands_and_timeout_is_fixed_error(self):
        clock = SimpleNamespace(now=0.0)
        with patch('time.monotonic', side_effect=lambda: clock.now):
            with apply.time_budget(30):
                self.assertEqual(apply.io_timeout(), 5)
                clock.now = 28
                with apply.time_budget(40), patch('subprocess.run', side_effect=subprocess.TimeoutExpired('fixture', 2)) as run:
                    with self.assertRaisesRegex(ValueError, '^R2_APPLY_COMMAND_TIMEOUT$'):
                        apply.bounded_run(['fixture'])
                    self.assertEqual(run.call_args.kwargs['timeout'], 2)
                clock.now = 30
                with self.assertRaisesRegex(ValueError, 'DEADLINE_EXCEEDED'):
                    apply.io_timeout()
            self.assertIsNone(apply._deadline)


if __name__ == '__main__':
    unittest.main()
