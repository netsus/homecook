import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('v85_web_census', Path(__file__).parents[1] / 'scripts/round2-eight-key-user-apply.py')
apply = importlib.util.module_from_spec(spec)
spec.loader.exec_module(apply)


class WebOnlyCensusTest(unittest.TestCase):
    def command(self, args, **kwargs):
        if args[0] == '/bin/launchctl':
            return b'39019 0 com.homecook.production\n'
        if args[0] == '/bin/ps':
            pid = int(args[2]); parent = 1 if pid == 39019 else 39019
            return f'{pid} {parent} {apply.os.getuid()} Sun Oct 18 11:06:56 2026'.encode()
        if '-d' in args:
            return b'p39019\nn/fixture/web15\n'
        return b'39025\n'

    def children(self, args, **kwargs):
        return SimpleNamespace(returncode=0, stdout=b'39025\n') if args[-1] == '39019' else SimpleNamespace(returncode=1, stdout=b'')

    def test_web_proof_works_after_worker49_stop_while_original_rotation_guard_remains(self):
        with patch.object(apply, 'command', side_effect=self.command), patch.object(apply, 'bounded_run', side_effect=self.children):
            self.assertEqual([r['pid'] for r in apply.web_census(Path('/fixture/web15'))], [39019, 39025])
            with self.assertRaisesRegex(ValueError, 'WORKER_CHANGED'):
                apply.census(Path('/fixture/web15'))

    def test_web_only_still_rejects_wrong_cwd_owner_listener_and_extra_child(self):
        for mode in ('cwd', 'owner', 'listener', 'extra'):
            def command(args, **kwargs):
                if mode == 'cwd' and '-d' in args: return b'p39019\nn/foreign\n'
                if mode == 'owner' and args[0] == '/bin/ps': return b'39019 1 0 Sun Oct 18 11:06:56 2026'
                if mode == 'listener' and '-sTCP:LISTEN' in args: return b'55555\n'
                return self.command(args, **kwargs)
            def children(args, **kwargs):
                if mode == 'extra' and args[-1] == '39019': return SimpleNamespace(returncode=0, stdout=b'39025\n55555\n')
                return self.children(args, **kwargs)
            with self.subTest(mode=mode), patch.object(apply, 'command', side_effect=command), patch.object(apply, 'bounded_run', side_effect=children):
                with self.assertRaises(ValueError): apply.web_census(Path('/fixture/web15'))


if __name__ == '__main__': unittest.main()
