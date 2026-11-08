"""Local webhook evidence; never sends a message to external operations channels."""
import datetime as dt
import http.server
import json
import platform
from pathlib import Path
import subprocess
import threading
import time
import urllib.request
import uuid

root=Path(__file__).resolve().parents[2]
def main():
    events=[]
    class Receiver(http.server.BaseHTTPRequestHandler):
        def do_POST(self):
            events.append(json.loads(self.rfile.read(int(self.headers['Content-Length']))))
            self.send_response(200); self.end_headers()
        def log_message(self,*args): pass
    server=http.server.ThreadingHTTPServer(('0.0.0.0',0),Receiver)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    name='issue88-alert-drill-'+uuid.uuid4().hex[:12]; work=root/'build'/name; work.mkdir(parents=True)
    config=work/'alertmanager.yml'
    config.write_text(f'route:\n  receiver: test\n  group_wait: 0s\n  group_interval: 1s\nreceivers:\n  - name: test\n    webhook_configs:\n      - url: http://host.docker.internal:{server.server_port}/alert\n')
    def run(*args):
        result=subprocess.run(['docker',*args],capture_output=True,text=True,timeout=180)
        if result.returncode: raise RuntimeError(result.stderr[-2500:]+result.stdout[-2500:])
        return result.stdout.strip()
    try:
        mount=str(root/'infra/reliability/monitoring')+':/config:ro'
        run('run','--rm','-v',mount,'--entrypoint','promtool','prom/prometheus:v3.5.0','check','config','/config/prometheus.yml')
        run('run','--rm','-v',mount,'--entrypoint','promtool','prom/prometheus:v3.5.0','test','rules','/config/rules.test.yml')
        host_args=['--add-host','host.docker.internal:host-gateway'] if platform.system()=='Linux' else []
        run('run','-d','--name',name,*host_args,'-p','127.0.0.1::9093','-v',str(config)+':/config/alertmanager.yml:ro','prom/alertmanager:v0.28.1','--config.file=/config/alertmanager.yml')
        inspect=json.loads(run('inspect',name))[0]; port=inspect['NetworkSettings']['Ports']['9093/tcp'][0]['HostPort']
        origin='http://127.0.0.1:'+port
        for _ in range(60):
            try:
                with urllib.request.urlopen(origin+'/-/ready',timeout=2): break
            except Exception: time.sleep(1)
        # Exercise the real Alertmanager routing/receiver after promtool proves timing rules.
        payload=[{'labels':{'alertname':'CulinaryBackupFailed','severity':'critical'},'startsAt':dt.datetime.now(dt.timezone.utc).isoformat()}]
        with urllib.request.urlopen(urllib.request.Request(origin+'/api/v2/alerts',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'})): pass
        for _ in range(30):
            if events: break
            time.sleep(1)
        assert events and events[0]['alerts'][0]['labels']['alertname']=='CulinaryBackupFailed'
        # Send an actual backup failure through backup.alert to the same local receiver.
        import backup, os
        os.environ['BACKUP_ALERT_URL']=f'http://127.0.0.1:{server.server_port}/backup'
        backup.alert()
        assert any(event.get('event')=='backup_failed' for event in events)
        result={'prometheus_config':'pass','down_50s_not_firing_70s_firing':'pass','backup_failure_rule':'pass','alertmanager_received':len(events),'utc':dt.datetime.now(dt.timezone.utc).isoformat()}
        (work/'report.json').write_text(json.dumps(result,indent=2)); print(json.dumps(result))
    finally:
        subprocess.run(['docker','rm','-f',name],capture_output=True); server.shutdown()

if __name__=='__main__': main()
