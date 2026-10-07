#!/usr/bin/env python3
"""Apply meal creation idempotency migration to an offline schema-only archive in an isolated PG.
No source database is contacted. Pass a previously reviewed archive and role SQL.
"""
import argparse
import hashlib
import json
import os
import pathlib
import subprocess
import time
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--schema-archive', required=True)
parser.add_argument('--roles', required=True)
parser.add_argument('--report', required=True)
args = parser.parse_args()
repo = pathlib.Path(__file__).resolve().parent.parent
image = 'public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a'
tag = uuid.uuid4().hex
name = 'hc-meal-create-key-' + tag[:12]
env = dict(os.environ)
env['DOCKER_HOST'] = 'unix:///var/run/docker.sock'
for key in ('DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'):
    env.pop(key, None)
container_id = None
report = {'status': 'FAIL', 'production_access': False, 'application_data_restored': False}


def docker(arguments, data=None):
    result = subprocess.run(['docker', *arguments], env=env, input=data, capture_output=True, timeout=180)
    if result.returncode:
        raise RuntimeError(result.stderr.decode()[-4000:])
    return result.stdout


def assert_owned():
    current = json.loads(docker(['inspect', container_id]))[0]
    if (current['Config']['Labels'].get('homecook.meal-create-key-test') != tag
            or current['HostConfig']['NetworkMode'] != 'none'
            or current['Config']['Image'] != image):
        raise RuntimeError('Refusing unowned rehearsal container')


def sql(statement):
    assert_owned()
    return docker(['exec', '-i', container_id, 'psql', '-h', '/tmp/pgsocket', '-U',
                   'supabase_admin', '-d', 'postgres', '-XqAt', '-v', 'ON_ERROR_STOP=1'], statement.encode()).decode()


try:
    archive = pathlib.Path(args.schema_archive).read_bytes()
    roles = pathlib.Path(args.roles).read_text()
    report['schema_archive_sha256'] = hashlib.sha256(archive).hexdigest()
    bootstrap = ('install -d -m 700 -o 100 -g 101 /tmp/rehearsal /tmp/pgsocket; '
                 'exec gosu postgres /bin/sh -ec \'initdb -D /tmp/rehearsal -U supabase_admin '
                 '--auth-local=trust --auth-host=reject >/tmp/initdb.log 2>&1; '
                 'exec postgres -D /tmp/rehearsal -h "" -k /tmp/pgsocket '
                 '-c shared_preload_libraries=pg_stat_statements,supabase_vault\'')
    container_id = docker(['run', '--platform', 'linux/arm64', '--pull=never', '--no-healthcheck',
                           '-d', '--name', name, '--label', 'homecook.meal-create-key-test=' + tag,
                           '--network', 'none', '--entrypoint', '/bin/sh', image, '-ec', bootstrap]).decode().strip()
    for attempt in range(40):
        try:
            sql('select 1;')
            break
        except RuntimeError:
            time.sleep(0.5)
    else:
        raise RuntimeError('Isolated PostgreSQL did not become ready')
    sql(roles)
    docker(['exec', '-i', container_id, 'pg_restore', '-h', '/tmp/pgsocket', '-U', 'supabase_admin',
            '-d', 'postgres', '--schema-only', '--clean', '--if-exists', '--exit-on-error'], archive)
    sql('set session authorization postgres;' + (repo / 'supabase/migrations/20260928020000_action_notifications.sql').read_text())
    sql('set session authorization postgres;' + (repo / 'supabase/migrations/20261006120000_meal_log_nutrition_preview.sql').read_text())
    migration = (repo / 'supabase/migrations/20261006130000_future_meal_create_idempotency.sql').read_text()
    report['migration_sha256'] = hashlib.sha256(migration.encode()).hexdigest()
    sql('set session authorization postgres;' + migration)
    sql((repo / 'tests/sql/action-notifications-full-schema-seed.sql').read_text())
    output = sql((repo / 'tests/sql/future-meal-key-full-schema-verify.sql').read_text())
    evidence = next(json.loads(line) for line in output.splitlines() if line.startswith('{'))
    report.update(evidence)
except Exception as error:
    report['error'] = str(error)
    raise
finally:
    if container_id:
        assert_owned()
        docker(['rm', '-f', '-v', container_id])
        report['isolated_resources_removed'] = True
    destination = pathlib.Path(args.report)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps(report, ensure_ascii=False))
