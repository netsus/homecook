import importlib.util
from contextlib import contextmanager, ExitStack
import io
import json
from pathlib import Path
import plistlib
import stat
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import warnings

spec = importlib.util.spec_from_file_location('r2_user_stage', Path(__file__).parents[1] / 'scripts/round2-eight-key-user-stage.py')
stage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage)


def baseline():
    return {'WorkingDirectory': '/fixture/web06a', 'ProgramArguments': ['fixture-node', 'fixture-start'],
            'EnvironmentVariables': {**{name: 'fixture-old-value-' + str(i) + '-never-a-real-secret'
                                       for i, name in enumerate(stage.NAMES)},
                'MUMEOK_ROUND2_ENABLED': 'false', 'MUMEOK_ROUND2_LEADS_ENABLED': 'false',
                'AUTH_KEY': 'fixture-auth-unchanged', 'C05_ENABLED': 'false',
                'MUMEOK_ROUND2_CONTROL_PATH': '/fixture-private/control.json',
                'MUMEOK_ROUND2_PREFLIGHT_ARM_PATH': '/fixture-private/arm.json',
                'NEXT_PUBLIC_MUMEOK_ROUND2_TURNSTILE_SITE_KEY': 'fixture-public-sitekey-never-server-secret'}}


class UserStageFixtureTest(unittest.TestCase):
    def make_hmac(self):
        value = self.sequence
        self.sequence += 1
        return format(value, '064x')  # Deliberately weak deterministic fixture. No RNG.

    def setUp(self):
        self.sequence = 1

    def test_exact_eight_only_and_no_baseline_mutation(self):
        before = baseline()
        candidate, fence = stage.build_stage(before, 'fixture-new-turnstile-never-a-real-secret', self.make_hmac)
        changed = {name for name in candidate['EnvironmentVariables']
                   if candidate['EnvironmentVariables'][name] != before['EnvironmentVariables'][name]}
        self.assertEqual(changed, set(stage.NAMES))
        self.assertEqual(candidate['WorkingDirectory'], before['WorkingDirectory'])
        self.assertEqual(candidate['ProgramArguments'], before['ProgramArguments'])
        self.assertEqual(before, baseline())
        self.assertEqual(set(fence['approved_fingerprints']), set(stage.NAMES))
        self.assertFalse(set(fence['approved_fingerprints'].values()) & set(fence['denied_fingerprints'].values()))

    def test_old_key_public_sitekey_and_bad_input_rejected(self):
        before = baseline()
        for value in (before['EnvironmentVariables'][stage.TURNSTILE],
                      before['EnvironmentVariables']['NEXT_PUBLIC_MUMEOK_ROUND2_TURNSTILE_SITE_KEY'],
                      'short', 'fixture-secret-with-newline-which-is-rejected\n'):
            with self.assertRaises(ValueError):
                stage.build_stage(before, value, self.make_hmac)

    def test_on_flag_duplicate_or_malformed_generated_hmac_rejected(self):
        for name in ('MUMEOK_ROUND2_ENABLED', 'MUMEOK_ROUND2_LEADS_ENABLED'):
            before = baseline()
            before['EnvironmentVariables'][name] = 'true'
            with self.assertRaises(ValueError):
                stage.build_stage(before, 'fixture-new-turnstile-never-a-real-secret', self.make_hmac)
        for make in (lambda: '0' * 64, lambda: 'invalid-fixture-hmac'):
            with self.assertRaises(ValueError):
                stage.build_stage(baseline(), 'fixture-new-turnstile-never-a-real-secret', make)


class FixtureTTY(io.StringIO):
    def isatty(self):
        return True


@contextmanager
def user_io_fixture(tty=True):
    """All user_main I/O and RNG are replaced; never reads real runtime files."""
    before = plistlib.dumps(baseline())
    control = json.dumps({'version': 1, 'collection_enabled': False,
                          'lead_enabled': False, 'consent_generation': 1}).encode()
    output = FixtureTTY()
    with ExitStack() as stack:
        replace = lambda name, **kwargs: stack.enter_context(patch(name, **kwargs))
        replace('sys.argv', new=['fixture-user-stage'])
        replace('sys.platform', new='darwin')
        replace('sys.stdin', new=FixtureTTY() if tty else io.StringIO())
        replace('sys.stdout', new=output)
        replace('sys.stderr', new=FixtureTTY())
        replace('pathlib.Path.home', return_value=Path('/fixture-home'))
        replace('pathlib.Path.is_symlink', return_value=False)
        replace('pathlib.Path.stat', return_value=SimpleNamespace(st_uid=99, st_mode=stat.S_IFDIR | 0o700))
        replace('pathlib.Path.is_dir', return_value=True)
        replace('os.getuid', return_value=99)
        replace('os.path.lexists', return_value=False)
        opened = replace('os.open', return_value=123)
        replace('os.fsync')
        replace('os.close')
        mkdir = replace('os.mkdir')
        reads = stack.enter_context(patch.object(stage, 'private_file', side_effect=[before, control, before, control]))
        writes = stack.enter_context(patch.object(stage, 'exclusive_write'))
        inputs = replace('getpass.getpass', side_effect=['fixture-new-turnstile-never-a-real-secret'] * 2)
        rng = replace('secrets.token_hex', side_effect=[format(i, '064x') for i in range(1, 8)])
        yield SimpleNamespace(before=before, control=control, output=output, reads=reads, writes=writes,
                              inputs=inputs, rng=rng, mkdir=mkdir, opened=opened)


class UserInputBoundaryFixtureTest(unittest.TestCase):
    def assert_no_generation_or_writes(self, f):
        f.rng.assert_not_called()
        f.writes.assert_not_called()
        f.mkdir.assert_not_called()

    def test_non_tty_stops_before_any_file_read_input_rng_or_write(self):
        with user_io_fixture(tty=False) as f:
            with self.assertRaisesRegex(ValueError, 'USER_TTY_REQUIRED'):
                stage.user_main()
            f.reads.assert_not_called()
            f.inputs.assert_not_called()
            self.assert_no_generation_or_writes(f)

    def test_getpass_echo_fallback_warning_stops_without_rng_or_write(self):
        with user_io_fixture() as f:
            def echo_fallback(*_):
                warnings.warn('fixture-only-getpass-warning', stage.getpass.GetPassWarning)
                return 'fixture-value-must-not-be-used'
            f.inputs.side_effect = echo_fallback
            with self.assertRaises(stage.getpass.GetPassWarning):
                stage.user_main()
            self.assert_no_generation_or_writes(f)

    def test_eof_and_keyboard_cancel_stop_without_rng_or_write(self):
        for error in (EOFError(), KeyboardInterrupt()):
            with self.subTest(error=type(error).__name__), user_io_fixture() as f:
                f.inputs.side_effect = error
                with self.assertRaises(type(error)):
                    stage.user_main()
                self.assert_no_generation_or_writes(f)

    def test_input_mismatch_stops_before_rng_or_write(self):
        with user_io_fixture() as f:
            f.inputs.side_effect = ['fixture-first-input-never-real-secret', 'fixture-second-input-never-real-secret']
            with self.assertRaisesRegex(ValueError, 'INPUT_MISMATCH'):
                stage.user_main()
            self.assert_no_generation_or_writes(f)

    def test_source_or_control_change_stops_before_rng_or_write(self):
        for changed in ('source', 'control'):
            with self.subTest(changed=changed), user_io_fixture() as f:
                f.reads.side_effect = [f.before, f.control,
                    b'fixture-source-changed' if changed == 'source' else f.before,
                    b'fixture-control-changed' if changed == 'control' else f.control]
                with self.assertRaisesRegex(ValueError, 'SOURCE_CHANGED'):
                    stage.user_main()
                self.assert_no_generation_or_writes(f)

    def test_user_staging_calls_only_private_new_stage_writers_and_prints_fixed_status(self):
        with user_io_fixture() as f:
            stage.user_main()
            self.assertEqual(f.rng.call_count, 7)
            self.assertTrue(all(call.args == (32,) for call in f.rng.call_args_list))
            f.mkdir.assert_called_once_with(Path('/fixture-home/.homecook/prelaunch-web/round2-eight-key-rotation-stage-20261017'), 0o700)
            self.assertEqual([call.args[0].name for call in f.writes.call_args_list],
                             ['candidate.plist', 'fence.json', 'receipt.json'])
            self.assertEqual(f.output.getvalue(), 'R2_STAGE_STAGED_NOT_APPLIED\n')
            self.assertEqual(f.reads.call_count, 4)


if __name__ == '__main__':
    unittest.main()
