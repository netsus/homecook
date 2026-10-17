#!/usr/bin/env python3
"""User-run, local TTY-only staging. Never installs settings or restarts services."""
import copy
import getpass
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import secrets
import stat
import sys
import warnings

APP_NAMES = tuple('MUMEOK_ROUND2_' + purpose + '_SECRET' for purpose in
                  ('PAGE', 'COOKIE', 'BOOTSTRAP', 'EVENT', 'EMAIL', 'RECEIPT', 'RATE'))
TURNSTILE = 'MUMEOK_ROUND2_TURNSTILE_SECRET_KEY'
NAMES = APP_NAMES + (TURNSTILE,)


def require(ok, code):
    if not ok:
        raise ValueError('R2_STAGE_' + code)


def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def build_stage(before, turnstile, make_hmac):
    """Pure transform. Tests inject fixed fixture keys; only the user CLI uses RNG."""
    env = before.get('EnvironmentVariables', {})
    require(isinstance(env, dict) and all(isinstance(k, str) and isinstance(v, str)
                                        for k, v in env.items()), 'ENV_INVALID')
    require(all(env.get(name) == 'false' for name in
                ('MUMEOK_ROUND2_ENABLED', 'MUMEOK_ROUND2_LEADS_ENABLED')), 'MUST_STAY_OFF')
    require(all(isinstance(env.get(name), str) and env[name] for name in NAMES), 'OLD_EIGHT_MISSING')
    require(isinstance(turnstile, str) and re.fullmatch(r'[A-Za-z0-9_-]{32,256}', turnstile), 'TURNSTILE_FORMAT')
    require(turnstile not in [env.get('MUMEOK_ROUND2_TURNSTILE_SITE_KEY'),
                             env.get('NEXT_PUBLIC_MUMEOK_ROUND2_TURNSTILE_SITE_KEY')], 'PUBLIC_SITEKEY_NOT_SECRET')
    next_values = {name: make_hmac() for name in APP_NAMES}
    require(all(isinstance(v, str) and re.fullmatch(r'[a-f0-9]{64}', v)
                for v in next_values.values()), 'HMAC_FORMAT')
    next_values[TURNSTILE] = turnstile
    denied = {name: digest(env[name]) for name in NAMES}
    approved = {name: digest(next_values[name]) for name in NAMES}
    require(len(set(denied.values())) == 8 and len(set(approved.values())) == 8
            and not set(denied.values()).intersection(approved.values()), 'KEY_REUSE')
    candidate = copy.deepcopy(before)
    candidate['EnvironmentVariables'].update(next_values)
    fence = {'version': 1, 'purpose': 'round2-eight-key-incident-20261017',
             'denied_fingerprints': denied, 'approved_fingerprints': approved}
    return candidate, fence


def private_file(path):
    path = Path(path)
    require(path.is_absolute(), 'PATH_INVALID')
    for part in [path, *path.parents]:
        require(not part.is_symlink(), 'SYMLINK_REJECTED')
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid()
            and stat.S_IMODE(info.st_mode) == 0o600 and info.st_nlink == 1
            and info.st_size <= 1024 * 1024, 'FILE_INVALID')
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, 'rb') as stream:
        opened = os.fstat(stream.fileno())
        require((opened.st_dev, opened.st_ino) == (info.st_dev, info.st_ino), 'FILE_CHANGED')
        return stream.read(1024 * 1024 + 1)


def exclusive_write(path, content):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'wb') as stream:
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())


def user_main():
    require(len(sys.argv) == 1 and sys.platform == 'darwin'
            and all(stream.isatty() for stream in (sys.stdin, sys.stdout, sys.stderr)), 'USER_TTY_REQUIRED')
    source = Path.home() / 'Library/LaunchAgents/com.homecook.production.plist'
    parent = Path.home() / '.homecook/prelaunch-web'
    for part in [parent, *parent.parents]:
        require(not part.is_symlink(), 'SYMLINK_REJECTED')
    info = parent.stat()
    require(parent.is_dir() and info.st_uid == os.getuid()
            and stat.S_IMODE(info.st_mode) == 0o700, 'PRIVATE_PARENT_REQUIRED')
    stage = parent / 'round2-eight-key-rotation-stage-20261017'
    require(not os.path.lexists(stage), 'STAGE_ALREADY_EXISTS_RECONCILE')
    before_bytes = private_file(source)
    before = plistlib.loads(before_bytes)
    env = before.get('EnvironmentVariables', {})
    require(all(env.get(name) == 'false' for name in
                ('MUMEOK_ROUND2_ENABLED', 'MUMEOK_ROUND2_LEADS_ENABLED')), 'MUST_STAY_OFF')
    arm = env.get('MUMEOK_ROUND2_PREFLIGHT_ARM_PATH')
    require(not arm or not os.path.lexists(arm), 'PREFLIGHT_MUST_STAY_CLOSED')
    control_bytes = private_file(env.get('MUMEOK_ROUND2_CONTROL_PATH', ''))
    control = json.loads(control_bytes)
    require(set(control) == {'version', 'collection_enabled', 'lead_enabled', 'consent_generation'}
            and control['version'] == 1 and control['collection_enabled'] is False
            and control['lead_enabled'] is False and type(control['consent_generation']) is int
            and control['consent_generation'] >= 1, 'CONTROL_MUST_STAY_OFF')
    # Never use getpass's echoing fallback. The user, not an agent, types both entries.
    with warnings.catch_warnings():
        warnings.simplefilter('error', getpass.GetPassWarning)
        new_turnstile = getpass.getpass('New Turnstile server secret (hidden): ')
        confirmation = getpass.getpass('Repeat new server secret (hidden): ')
    require(secrets.compare_digest(new_turnstile, confirmation), 'INPUT_MISMATCH')
    require(private_file(source) == before_bytes
            and private_file(env['MUMEOK_ROUND2_CONTROL_PATH']) == control_bytes
            and (not arm or not os.path.lexists(arm)), 'SOURCE_CHANGED')
    candidate, fence = build_stage(before, new_turnstile, lambda: secrets.token_hex(32))
    candidate_bytes = plistlib.dumps(candidate, sort_keys=False)
    os.mkdir(stage, 0o700)
    exclusive_write(stage / 'candidate.plist', candidate_bytes)
    exclusive_write(stage / 'fence.json', json.dumps(fence).encode('utf-8'))
    exclusive_write(stage / 'receipt.json', json.dumps({'version': 1, 'status': 'staged_not_applied',
        'source_plist_sha256': hashlib.sha256(before_bytes).hexdigest(),
        'candidate_plist_sha256': hashlib.sha256(candidate_bytes).hexdigest(),
        'control_sha256': hashlib.sha256(control_bytes).hexdigest(),
        'collection_enabled': False, 'lead_enabled': False}).encode('utf-8'))
    directory = os.open(stage, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
    print('R2_STAGE_STAGED_NOT_APPLIED')


if __name__ == '__main__':
    try:
        user_main()
    except (Exception, KeyboardInterrupt):
        # No exception/body/value/traceback output, including provider and parser input.
        print('R2_STAGE_STOPPED_REVIEW_REQUIRED', file=sys.stderr)
        sys.exit(1)
