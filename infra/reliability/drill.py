"""Host runner: python infra/reliability/drill.py. No shared service is stopped.
Builds are prerequisites. All destructive actions verify exact generated names.
"""
import datetime as dt
import json
import os
import platform
from pathlib import Path
import socket
import ssl
import subprocess
import time
import urllib.error
import urllib.request
import uuid

ROOT=Path(__file__).resolve().parents[2]
def run(*args,check=True):
    result=subprocess.run(list(args),capture_output=True,text=True,timeout=240)
    if check and result.returncode: raise RuntimeError('Command failed: '+args[0]+'\n'+result.stdout[-2500:]+result.stderr[-2500:])
    return result.stdout.strip(),result.returncode
def free_port():
    with socket.socket() as sock: sock.bind(('127.0.0.1',0)); return sock.getsockname()[1]
def http(url,method='GET',timeout=25,context=None):
    start=time.monotonic()
    try:
        with urllib.request.urlopen(urllib.request.Request(url,data=b'' if method=='POST' else None,method=method),timeout=timeout,context=context) as response:
            return response.status,response.read().decode(),round(time.monotonic()-start,3)
    except urllib.error.HTTPError as error: return error.code,error.read().decode(),round(time.monotonic()-start,3)
def wait(url,status=200,seconds=90,context=None):
    until=time.monotonic()+seconds
    while time.monotonic()<until:
        try:
            result=http(url,timeout=8,context=context)
            if result[0]==status: return result
        except Exception: pass
        time.sleep(1)
    raise AssertionError('Endpoint did not recover: '+url)

def main():
    token=uuid.uuid4().hex[:12]; prefix='issue88-drill-'+token
    network=prefix+'-network'; names={key:prefix+'-'+key for key in ['postgres','redis','minio','ops','gateway','api']}
    volumes=[prefix+'-'+key for key in ['pg','redis','minio','backup']]
    work=ROOT/'build'/prefix; work.mkdir(parents=True)
    evidence=[]; processes=[]; logs=[]
    def record(name,**data):
        item={'test':name,'utc':dt.datetime.now(dt.timezone.utc).isoformat(),**data}; evidence.append(item); print(json.dumps(item),flush=True)
        (work/'report.json').write_text(json.dumps(evidence,indent=2))
    def docker(*args,**kwargs): return run('docker',*args,**kwargs)
    def scoped(action,name):
        if name not in names.values() or not name.startswith(prefix+'-'): raise ValueError('Unsafe container target')
        return docker(action,name)
    def port(name,containerport): return int(json.loads(docker('inspect',names[name])[0])[0]['NetworkSettings']['Ports'][containerport][0]['HostPort'])
    def host(db,port_number,seed=False):
        env=dict(os.environ,RELIABILITY_TEST_CONNECTION=f'Host=127.0.0.1;Port={pg};Database={db};Username=postgres;Password=issue88-db-fixture;Timeout=2;Command Timeout=2',
            RELIABILITY_REDIS=f'127.0.0.1:{redis},abortConnect=false,connectTimeout=300,syncTimeout=300,asyncTimeout=300,connectRetry=1',
            RELIABILITY_MINIO=f'127.0.0.1:{minio}',RELIABILITY_BUCKET=bucket,RELIABILITY_TEST_URL=f'http://0.0.0.0:{port_number}',RELIABILITY_SEED_JOB='1' if seed else '0')
        log=open(work/(db+'-'+str(port_number)+'.log'),'w'); logs.append(log)
        process=subprocess.Popen(['dotnet',str(ROOT/'Culinary_Blog_Nhom5/tests/CulinaryBlog.Reliability.E2E/bin/Debug/net10.0/CulinaryBlog.Reliability.E2E.dll')],env=env,stdout=log,stderr=log)
        processes.append(process); wait(f'http://127.0.0.1:{port_number}/health/live'); return process
    source='issue88_source_'+token; target='issue88_restore_'+token; bucket='issue88-source-'+token
    try:
        docker('network','create',network)
        for volume in volumes: docker('volume','create',volume)
        pg,redis,minio=free_port(),free_port(),free_port()
        docker('run','-d','--name',names['postgres'],'--network',network,'--network-alias','postgres','-e','POSTGRES_PASSWORD=issue88-db-fixture','-p',f'127.0.0.1:{pg}:5432','-v',volumes[0]+':/var/lib/postgresql/data','postgres:16-alpine')
        docker('run','-d','--name',names['redis'],'--network',network,'--network-alias','redis','-p',f'127.0.0.1:{redis}:6379','-v',volumes[1]+':/data','redis:7-alpine','redis-server','--appendonly','yes','--appendfsync','always')
        docker('run','-d','--name',names['minio'],'--network',network,'--network-alias','minio','-e','MINIO_ROOT_USER=issue88test','-e','MINIO_ROOT_PASSWORD=issue88-test-secret','-p',f'127.0.0.1:{minio}:9000','-v',volumes[2]+':/data','ghcr.io/golithus/minio:latest','server','/data')
        pg=port('postgres','5432/tcp'); redis=port('redis','6379/tcp'); minio=port('minio','9000/tcp')
        # Do not start the API while Redis is still accepting its first connection.
        # ResilientCache intentionally enters a per-request bypass state after a
        # connection timeout; without this readiness gate the first cache probe can
        # permanently miss the immediate warm-read assertion below on slower CI hosts.
        for _ in range(60):
            if docker('exec',names['redis'],'redis-cli','ping',check=False)[1]==0: break
            time.sleep(1)
        for _ in range(60):
            if docker('exec',names['postgres'],'pg_isready','-U','postgres',check=False)[1]==0: break
            time.sleep(1)
        docker('exec',names['postgres'],'createdb','-U','postgres',source)
        docker('exec',names['postgres'],'createdb','-U','postgres',target)
        envfile=work/'fixture.env'
        envfile.write_text('\n'.join([
            f'BACKUP_DSN=host=postgres dbname={source} user=postgres password=issue88-db-fixture',
            'BACKUP_S3_ENDPOINT=http://minio:9000','BACKUP_S3_ACCESS_KEY=issue88test','BACKUP_S3_SECRET_KEY=issue88-test-secret',f'BACKUP_BUCKET={bucket}',
            f'RESTORE_DSN=host=postgres dbname={target} user=postgres password=issue88-db-fixture',
            'RESTORE_S3_ENDPOINT=http://minio:9000','RESTORE_S3_ACCESS_KEY=issue88test','RESTORE_S3_SECRET_KEY=issue88-test-secret',f'RESTORE_BUCKET=issue88-restore-{token}',
            'RESTORE_AGE_IDENTITY_FILE=/backups/identity.txt','BACKUP_QUIESCE_COMMAND=["true"]','BACKUP_RESUME_COMMAND=["true"]']))
        docker('run','-d','--name',names['ops'],'--network',network,'--env-file',str(envfile),'-v',volumes[3]+':/backups','-v',str(ROOT/'infra/reliability')+':/ops:ro','--entrypoint','sleep','culinary-issue88-ops','infinity')
        oneport,twoport=free_port(),free_port(); origin=f'http://127.0.0.1:{oneport}'
        one=host(source,oneport,True); two=host(source,twoport)
        def tools(action,check=True): return docker('exec',names['ops'],'python','/ops/drill_tools.py',action,check=check)
        tools('seed')
        assert json.loads(http(origin+'/test/cancel')[1])['canceled']
        assert json.loads(http(origin+'/test/race','POST')[1])['staleReachable'] is False
        record('cache_cancellation_and_concurrent_epoch_fencing')
        if os.getenv('ISSUE88_FRONTEND_SMOKE')=='1':
            result=subprocess.run(['node',str(ROOT/'Culinary_Blog_Nhom5/culinary-blog-web/tests/maintenance.e2e.cjs')],
                env=dict(os.environ,RELIABILITY_API_URL=origin),capture_output=True,text=True,timeout=180)
            if result.returncode: raise RuntimeError(result.stdout+result.stderr)
            record('production_frontend_readme_smoke_maintenance_axe_320px',result=result.stdout.strip())
        wait(origin+'/health'); assert http(origin+'/test/unhandled')[0]==500
        assert 'SECRET' not in http(origin+'/test/unhandled')[1]; assert http(origin+'/health/live')[0]==200
        record('unhandled_500_rfc7807_process_alive',pid=one.pid)
        host_args=['--add-host','host.docker.internal:host-gateway'] if platform.system()=='Linux' else []
        # The gateway image is nginx and listens on its fixed internal HTTP
        # port 8080; TLS is exercised against the production API image below.
        docker('run','-d','--name',names['gateway'],'--network',network,*host_args,'-p','127.0.0.1::8080',
                '-e',f'API_UPSTREAM=host.docker.internal:{oneport}','-e',f'FRONTEND_UPSTREAM=host.docker.internal:{oneport}','culinary-issue88-gateway')
        gateway='http://127.0.0.1:'+str(port('gateway','8080/tcp')); wait(gateway+'/api/v1/recipes')
        if os.getenv('ISSUE88_BACKUP_ONLY') != '1':
            for path in ['/api/v1/recipes','/api/v1/recipes/reliable-recipe','/api/v1/categories','/api/v1/recipes/search?q=reliable']:
                assert http(origin+path)[0]==200
            assert json.loads(http(origin+'/test/cache')[1])['hit'] is False
            assert json.loads(http(origin+'/test/cache')[1])['hit'] is True
            scoped('stop',names['redis'])
            assert http(origin+'/health/ready')[0]==503; assert http(origin+'/health/traffic')[0]==200
            result=http(gateway+'/api/v1/recipes'); assert result[0]==200, result
            for path in ['/api/v1/recipes','/api/v1/recipes/reliable-recipe','/api/v1/categories','/api/v1/recipes/search?q=reliable']:
                result=http(origin+path); assert result[0]==200 and result[2]<5, (path,result)
            assert http(origin+'/test/change','POST')[0]==200
            assert http(origin+'/test/invalidate','POST')[0]==200
            assert 'Updated reliable recipe' in http(f'http://127.0.0.1:{twoport}/api/v1/recipes')[1]
            one.terminate(); one.wait(20); one=host(source,oneport)
            scoped('start',names['redis']); wait(origin+'/health/ready')
            wait(gateway+'/api/v1/recipes')
            assert 'Updated reliable recipe' in http(origin+'/api/v1/recipes')[1]
            assert 'Updated reliable recipe' in http(f'http://127.0.0.1:{twoport}/api/v1/recipes')[1]
            assert json.loads(http(origin+'/test/cache')[1])['hit'] is False
            assert json.loads(http(origin+'/test/cache')[1])['hit'] is True
            record('redis_down_fallback_mutation_recovery_restart_two_instances',pid=one.pid)
            scoped('pause',names['redis'])
            try:
                result=http(origin+'/api/v1/recipes'); assert result[0]==200 and result[2]<5, result
                record('redis_blackhole_deadline_fallback',seconds=result[2])
            finally: scoped('unpause',names['redis'])
            wait(origin+'/health/ready')
            scoped('stop',names['minio'])
            assert http(origin+'/health')[0]==503 and http(origin+'/health/ready')[0]==200
            result=http(gateway+'/api/v1/recipes'); assert result[0]==200, result
            scoped('start',names['minio']); wait(origin+'/health')
            record('minio_outage_health_degraded_public_available')
            scoped('stop',names['postgres'])
            assert http(origin+'/health/live')[0]==200; assert http(origin+'/health/ready')[0]==503
            error=http(origin+'/api/v1/recipes'); assert error[0]==500 and error[2]<30 and 'Password' not in error[1]
            wait(gateway+'/api/v1/recipes',503,30)
            scoped('start',names['postgres']); wait(origin+'/health/ready'); wait(gateway+'/api/v1/recipes')
            record('postgres_refused_reconnect_gateway_remove_restore',error_seconds=error[2],pid=one.pid)
            scoped('pause',names['postgres'])
            try:
                error=http(origin+'/api/v1/recipes',timeout=35); assert error[0]==500 and error[2]<30, error
                assert http(origin+'/health/live')[0]==200
                record('postgres_blackhole_bounded_timeout_process_alive',seconds=error[2],pid=one.pid)
            finally: scoped('unpause',names['postgres'])
            wait(origin+'/health/ready')
            docker('network','disconnect',network,names['postgres'])
            assert http(origin+'/health/traffic')[0]==503
            docker('network','connect','--alias','postgres',network,names['postgres'])
            wait(origin+'/health/ready'); wait(gateway+'/api/v1/recipes')
            record('postgres_network_disconnect_reconnect')
        # Snapshot requires all source API/workers stopped. Test host never executes jobs.
        for process in processes:
            if process.poll() is None: process.terminate(); process.wait(20)
        tools('backup'); record('encrypted_pg_dump_and_object_backup')
        restored_output,_=tools('restore'); record('isolated_restore_count_sha256_metadata',result=json.loads(restored_output))
        docker('exec',names['redis'],'redis-cli','SET','issue88:persistence','durable-aof')
        # Recreate durable containers using the same named volumes (not merely process restart).
        for key in ['postgres','redis','minio']: scoped('stop',names[key]); docker('rm',names[key])
        docker('run','-d','--name',names['postgres'],'--network',network,'--network-alias','postgres','-e','POSTGRES_PASSWORD=issue88-db-fixture','-p',f'127.0.0.1:{pg}:5432','-v',volumes[0]+':/var/lib/postgresql/data','postgres:16-alpine')
        docker('run','-d','--name',names['redis'],'--network',network,'--network-alias','redis','-p',f'127.0.0.1:{redis}:6379','-v',volumes[1]+':/data','redis:7-alpine','redis-server','--appendonly','yes','--appendfsync','always')
        docker('run','-d','--name',names['minio'],'--network',network,'--network-alias','minio','-e','MINIO_ROOT_USER=issue88test','-e','MINIO_ROOT_PASSWORD=issue88-test-secret','-p',f'127.0.0.1:{minio}:9000','-v',volumes[2]+':/data','ghcr.io/golithus/minio:latest','server','/data')
        time.sleep(8); tools('verify')
        assert docker('exec',names['redis'],'redis-cli','GET','issue88:persistence')[0]=='durable-aof'
        record('container_recreate_database_objects_hangfire_redis_aof_durable')
        restored=host(target,free_port()); record('restored_api_migration_startup_live',pid=restored.pid)
        if os.getenv('ISSUE88_PRODUCTION_IMAGE')=='1':
            cert=work/'localhost.pem'
            run('dotnet','dev-certs','https','--export-path',str(cert),'--format','Pem','--no-password')
            cert.with_suffix('.key').chmod(0o644)
            tls=ssl.create_default_context(cafile=str(cert))
            docker('run','-d','--name',names['api'],'--network',network,'-p','127.0.0.1::8443',
                '-v',str(work)+':/https:ro',
                '-e','ASPNETCORE_URLS=https://+:8443',
                '-e','Kestrel__Certificates__Default__Path=/https/localhost.pem',
                '-e','Kestrel__Certificates__Default__KeyPath=/https/localhost.key',
                '-e',f'ConnectionStrings__DefaultConnection=Host=postgres;Database={target};Username=postgres;Password=issue88-db-fixture;Timeout=3;Command Timeout=5',
                '-e','ConnectionStrings__Redis=redis:6379,abortConnect=false,connectTimeout=300',
                '-e','Jwt__Key=issue88-fixture-secret-at-least-32-characters',
                '-e','Cors__AllowedOrigins__0=http://localhost:8088',
                '-e','Minio__Endpoint=minio:9000','-e','Minio__AccessKey=issue88test','-e','Minio__SecretKey=issue88-test-secret',
                '-e',f'Minio__Bucket=issue88-restore-{token}',
                '-e','Hangfire__Server__Enabled=false','-e','Hangfire__RecurringJobs__Enabled=false','-e','Hangfire__Dashboard__Enabled=false',
                'culinary-issue88-api')
            production='https://localhost:'+str(port('api','8443/tcp'))
            wait(production+'/health/ready',context=tls)
            assert http(production+'/api/v1/recipes',context=tls)[0]==200 and http(production+'/api/v1/recipes/reliable-recipe',context=tls)[0]==200
            record('production_api_image_restored_database_workers_disabled')
        tools('failure'); record('backup_failure_last_good_retained')
        tools('corrupt'); output,code=tools('restore',False); assert code!=0
        record('corrupt_backup_restore_rejected')
        print('PASS reliability drill: '+str(work/'report.json'))
    finally:
        gateway_logs=subprocess.run(['docker','logs',names['gateway']],capture_output=True,text=True)
        (work/'gateway.log').write_text(gateway_logs.stdout+gateway_logs.stderr)
        api_logs=subprocess.run(['docker','logs',names['api']],capture_output=True,text=True)
        (work/'api.log').write_text(api_logs.stdout+api_logs.stderr)
        for process in processes:
            if process.poll() is None: process.terminate(); process.wait(20)
        for log in logs: log.close()
        for name in names.values():
            if not name.startswith(prefix+'-'): raise ValueError('Unsafe cleanup')
            docker('rm','-f',name,check=False)
        docker('network','rm',network,check=False)
        for volume in volumes:
            if not volume.startswith(prefix+'-'): raise ValueError('Unsafe volume cleanup')
            docker('volume','rm',volume,check=False)
        envfile=work/'fixture.env'
        if envfile.exists(): envfile.unlink()
        for certificate in [work/'localhost.pem',work/'localhost.key']:
            if certificate.exists(): certificate.unlink()

if __name__=='__main__': main()
