"""Encrypted DB + object backup. All times UTC; never print subprocess output/secrets."""
import argparse
import contextlib
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile
import time
import urllib.request

UTC = dt.timezone.utc
SAFE_ID = re.compile(r"^backup-\d{8}T\d{6}Z-[a-f0-9]{8}$")

def now(): return dt.datetime.now(UTC)
def digest(path):
    value = hashlib.sha256()
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''): value.update(block)
    return value.hexdigest()

def run(args, **kwargs):
    # Capture even error output: tools can echo connection strings / object names.
    try: return subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=1800, **kwargs)
    except (subprocess.SubprocessError, OSError): raise RuntimeError('Backup tool failed: ' + Path(args[0]).name) from None

def secret(name):
    file = os.getenv(name + '_FILE')
    return Path(file).read_text().strip() if file else os.environ[name]

def db_connection(target=False):
    import psycopg
    return psycopg.connect(secret('RESTORE_DSN' if target else 'BACKUP_DSN'), connect_timeout=5)

def libpq_environment(dsn):
    from psycopg.conninfo import conninfo_to_dict
    aliases={'dbname':'PGDATABASE','user':'PGUSER','password':'PGPASSWORD','host':'PGHOST','hostaddr':'PGHOSTADDR',
        'port':'PGPORT','connect_timeout':'PGCONNECT_TIMEOUT','sslmode':'PGSSLMODE','sslrootcert':'PGSSLROOTCERT',
        'sslcert':'PGSSLCERT','sslkey':'PGSSLKEY','options':'PGOPTIONS','application_name':'PGAPPNAME',
        'target_session_attrs':'PGTARGETSESSIONATTRS','channel_binding':'PGCHANNELBINDING','passfile':'PGPASSFILE'}
    values=conninfo_to_dict(dsn)
    if set(values)-set(aliases): raise ValueError('Unsupported libpq backup option')
    env={key:value for key,value in os.environ.items() if not key.startswith('PG')}
    env.update({aliases[key]:value for key,value in values.items()})
    env.setdefault('PGCONNECT_TIMEOUT','5')
    return env

def s3(target=False):
    import boto3
    from botocore.config import Config
    prefix = 'RESTORE_' if target else 'BACKUP_'
    return boto3.client('s3', endpoint_url=os.environ[prefix + 'S3_ENDPOINT'],
        aws_access_key_id=secret(prefix + 'S3_ACCESS_KEY'), aws_secret_access_key=secret(prefix + 'S3_SECRET_KEY'),
        region_name='us-east-1', config=Config(connect_timeout=5, read_timeout=30, retries={'max_attempts': 2}))

def inventory(connection):
    # Digests include all columns, but only counts/hashes leave the encrypted bundle.
    from psycopg import sql
    result = {}
    with connection.cursor() as cur:
        cur.execute("SELECT schemaname, tablename FROM pg_tables WHERE schemaname IN ('public','hangfire') ORDER BY 1,2")
        tables = cur.fetchall()
        for schema, table in tables:
            cur.execute(sql.SQL('SELECT row_to_json(t)::text FROM {}.{} t ORDER BY row_to_json(t)::text').format(sql.Identifier(schema), sql.Identifier(table)))
            value, count = hashlib.sha256(), 0
            for row in cur:
                value.update(row[0].encode()); value.update(b'\n'); count += 1
            result[schema + '.' + table] = {'count': count, 'sha256': value.hexdigest()}
    return result

def hook(name):
    raw = os.getenv(name)
    if not raw: raise RuntimeError(name + ' JSON argv is required (quiesce writers/workers, drain in-flight operations)')
    argv = json.loads(raw)
    if not isinstance(argv, list) or not argv or not all(isinstance(x, str) for x in argv): raise ValueError('Invalid hook')
    run(argv)

def emit(root, success=None):
    path = root / 'status.json'
    state = json.loads(path.read_text()) if path.exists() else {}
    state['last_attempt'] = int(time.time())
    state['free_bytes'] = shutil.disk_usage(root).free
    if success is not None:
        state['failed'] = int(not success)
        if success: state['last_success'] = int(time.time())
    temp = root / '.status.tmp'; temp.write_text(json.dumps(state)); temp.replace(path)
    lines = [f'culinary_backup_{key} {value}' for key, value in state.items()]
    temp = root / '.metrics.tmp'; temp.write_text('\n'.join(lines) + '\n'); temp.replace(root / 'backup.prom')

def alert():
    # Delivery errors still leave failure/missed-success metrics for independent monitoring.
    if os.getenv('BACKUP_ALERT_URL'):
        request = urllib.request.Request(secret('BACKUP_ALERT_URL'), data=b'{"event":"backup_failed"}', headers={'Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                if response.status >= 300: raise RuntimeError('Alert delivery failed')
        except Exception: print('Backup failure alert delivery failed', flush=True)

@contextlib.contextmanager
def locked(root):
    import fcntl
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    with open(root / '.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        yield

def prune(root, clock=None):
    clock = clock or now()
    items = []
    for path in root.glob('backup-*.json'):
        if not SAFE_ID.fullmatch(path.stem) or path.is_symlink(): continue
        data = json.loads(path.read_text())
        if data.get('complete') and (root / (path.stem + '.age')).is_file(): items.append((path, data))
    latest = max((data['completed_at'] for _, data in items), default='')
    for path, data in items:
        completed = dt.datetime.fromisoformat(data['completed_at'])
        if data['completed_at'] != latest and completed < clock - dt.timedelta(days=30):
            encrypted = root / (path.stem + '.age')
            if encrypted.is_symlink(): raise RuntimeError('Refuse symlink backup')
            encrypted.unlink(); path.unlink()

def backup(root):
    import uuid
    os.umask(0o077)
    with locked(root):
        emit(root)
        paused = False
        try:
            # Hook is responsible for freezing all writers, including direct API and job workers.
            paused = True
            hook('BACKUP_QUIESCE_COMMAND')
            identity = 'backup-' + now().strftime('%Y%m%dT%H%M%SZ-') + uuid.uuid4().hex[:8]
            with tempfile.TemporaryDirectory(prefix='culinary-backup-') as directory:
                work = Path(directory)
                dump = work / 'database.dump'
                # libpq env avoids credentials in argv. DSN stays in process environment only.
                env = libpq_environment(secret('BACKUP_DSN'))
                run(['pg_dump', '--format=custom', '--no-owner', '--no-acl', '--file', str(dump)], env=env)
                run(['pg_restore', '--list', str(dump)])
                with db_connection() as connection: tables = inventory(connection)
                client, bucket = s3(), os.environ['BACKUP_BUCKET']
                objects = []
                for page in client.get_paginator('list_objects_v2').paginate(Bucket=bucket):
                    for item in page.get('Contents', []):
                        key = item['Key']
                        # Keys never become filesystem paths.
                        local = work / ('object-' + hashlib.sha256(key.encode()).hexdigest())
                        response = client.get_object(Bucket=bucket, Key=key)
                        with open(local, 'wb') as stream:
                            shutil.copyfileobj(response['Body'], stream)
                        response['Body'].close()
                        objects.append({'key': key, 'file': local.name, 'size': local.stat().st_size,
                            'sha256': digest(local), 'content_type': response.get('ContentType'), 'metadata': response.get('Metadata', {})})
                manifest = {'id': identity, 'completed_at': now().isoformat(), 'complete': True,
                    'dump_sha256': digest(dump), 'tables': tables, 'objects': objects}
                (work / 'manifest.json').write_text(json.dumps(manifest, sort_keys=True))
                archive = work / 'bundle.tar'
                with tarfile.open(archive, 'w') as tar:
                    for path in sorted(work.iterdir()):
                        if path != archive: tar.add(path, arcname=path.name)
                partial = root / (identity + '.partial')
                run(['age', '-r', os.environ['BACKUP_AGE_RECIPIENT'], '-o', str(partial), str(archive)])
                partial.replace(root / (identity + '.age'))
                # Public manifest has no object keys, user records or connection data.
                summary = {'id':identity, 'completed_at':manifest['completed_at'], 'complete':True,
                    'sha256':digest(root / (identity + '.age')), 'tables':tables, 'object_count':len(objects)}
                temp = root / (identity + '.json.partial'); temp.write_text(json.dumps(summary, sort_keys=True)); temp.replace(root / (identity + '.json'))
            prune(root)
            emit(root, True)
            print(json.dumps({'backup': identity, 'success': True}))
            return identity
        except Exception:
            emit(root, False); alert(); raise
        finally:
            if paused:
                try: hook('BACKUP_RESUME_COMMAND')
                except Exception:
                    emit(root, False); alert(); raise

def restore(root, identity):
    import psycopg
    from psycopg.conninfo import conninfo_to_dict
    if not SAFE_ID.fullmatch(identity): raise ValueError('Invalid backup id')
    target = conninfo_to_dict(secret('RESTORE_DSN'))
    bucket = os.environ['RESTORE_BUCKET']
    if not re.fullmatch(r'issue88_restore_[a-f0-9]{8,32}', target.get('dbname', '')) or not re.fullmatch(r'issue88-restore-[a-f0-9]{8,32}', bucket):
        raise ValueError('Restore requires NEW isolated issue88_restore_<hex> DB and issue88-restore-<hex> bucket')
    summary = json.loads((root / (identity + '.json')).read_text())
    encrypted = root / (identity + '.age')
    if digest(encrypted) != summary['sha256']: raise ValueError('Encrypted checksum mismatch')
    started = time.monotonic()
    client = s3(True)
    if any(b['Name'] == bucket for b in client.list_buckets()['Buckets']): raise ValueError('Restore bucket already exists')
    with db_connection(True) as connection:
        if inventory(connection): raise ValueError('Restore DB must be empty')
    with tempfile.TemporaryDirectory(prefix='culinary-restore-') as directory:
        work = Path(directory)
        archive = work / 'bundle.tar'
        run(['age', '-d', '-i', os.environ['RESTORE_AGE_IDENTITY_FILE'], '-o', str(archive), str(encrypted)])
        with tarfile.open(archive) as tar:
            for member in tar.getmembers():
                if not member.isfile() or '/' in member.name or '\\' in member.name or member.name in ('.', '..'): raise ValueError('Unsafe archive entry')
            tar.extractall(work, filter='data')
        manifest = json.loads((work / 'manifest.json').read_text())
        if manifest['id'] != identity or digest(work / 'database.dump') != manifest['dump_sha256']: raise ValueError('Dump checksum mismatch')
        # Validate the entire bundle before creating target objects or restoring any SQL.
        for item in manifest['objects']:
            if not re.fullmatch(r'object-[a-f0-9]{64}', item['file']) or digest(work / item['file']) != item['sha256']: raise ValueError('Object checksum mismatch')
        run(['pg_restore', '--exit-on-error', '--single-transaction', '--no-owner', '--no-acl', '--dbname', target['dbname'], str(work / 'database.dump')],
            env=libpq_environment(secret('RESTORE_DSN')))
        client.create_bucket(Bucket=bucket)
        for item in manifest['objects']:
            client.upload_file(str(work / item['file']), bucket, item['key'], ExtraArgs={'ContentType':item['content_type'] or 'application/octet-stream', 'Metadata':item['metadata']})
            response = client.get_object(Bucket=bucket, Key=item['key'])
            sha = hashlib.sha256(response['Body'].read()).hexdigest(); response['Body'].close()
            if sha != item['sha256'] or response.get('Metadata',{}) != item['metadata'] or response['ContentLength'] != item['size'] or response.get('ContentType') != (item['content_type'] or 'application/octet-stream'): raise ValueError('Restored object mismatch')
        with db_connection(True) as connection:
            if inventory(connection) != manifest['tables']: raise ValueError('Restored table count/digest mismatch')
        report = {'success':True, 'backup':identity, 'tables':manifest['tables'], 'objects':len(manifest['objects']), 'restore_seconds':round(time.monotonic()-started,3)}
        print(json.dumps(report, sort_keys=True)); return report

def next_run(clock):
    result = clock.replace(hour=3, minute=0, second=0, microsecond=0)
    return result if result > clock else result + dt.timedelta(days=1)

def serve(root):
    import http.server
    class Metrics(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path != '/metrics': self.send_error(404); return
            data = (root / 'backup.prom').read_bytes() if (root / 'backup.prom').exists() else b'culinary_backup_last_success 0\n'
            self.send_response(200); self.send_header('Content-Type','text/plain; version=0.0.4'); self.end_headers(); self.wfile.write(data)
        def log_message(self, *args): pass
    http.server.ThreadingHTTPServer(('0.0.0.0', 9108), Metrics).serve_forever()

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('action', choices=['backup','restore','schedule','metrics']); parser.add_argument('--root',default='/backups'); parser.add_argument('--id')
    args = parser.parse_args(); root=Path(args.root).resolve()
    if args.action == 'backup': backup(root)
    elif args.action == 'restore': restore(root,args.id)
    elif args.action == 'metrics': serve(root)
    else:
        import threading
        threading.Thread(target=serve,args=(root,),daemon=True).start()
        due = next_run(now())
        while True:
            if now() >= due:
                try: backup(root)
                except Exception: print('Scheduled backup failed; see monitoring', flush=True)
                due = next_run(now())
            time.sleep(1)

if __name__ == '__main__':
    try: main()
    except Exception as error:
        print(json.dumps({'success':False, 'error_type':type(error).__name__}), flush=True)
        raise SystemExit(1)
