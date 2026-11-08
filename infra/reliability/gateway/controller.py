"""Active admission probe every 10s; Nginx OSS itself does not do active probes."""
import os
import socket
from pathlib import Path
import subprocess
import time
import urllib.request

UPSTREAM = os.getenv('API_UPSTREAM', 'api:8080')
FRONTEND = os.getenv('FRONTEND_UPSTREAM', 'frontend:3000')


def nginx_endpoint(endpoint):
    # Variable proxy_pass uses Docker DNS, which ignores --add-host /etc/hosts.
    # Resolve the host alias only; service names keep runtime DNS for recreate.
    host, separator, port = endpoint.rpartition(':')
    if separator and host == 'host.docker.internal':
        return socket.gethostbyname(host) + ':' + port
    return endpoint

def config(healthy):
    action = 'proxy_pass http://$api_endpoint;' if healthy else 'add_header Retry-After 10 always; return 503;'
    return '''events {}
http {
  resolver 127.0.0.11 ipv6=off valid=10s;
  server {
    listen 8080;
    set $api_endpoint "%s";
    set $frontend_endpoint "%s";
    client_max_body_size 6m;
    location /api/ { proxy_next_upstream off; proxy_connect_timeout 2s; proxy_read_timeout 30s;
      proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      %s }
    location /health/ { proxy_connect_timeout 2s; proxy_read_timeout 3s; proxy_pass http://$api_endpoint; }
    location / { proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; proxy_pass http://$frontend_endpoint; }
  }
}
''' % (nginx_endpoint(UPSTREAM), nginx_endpoint(FRONTEND), action)

def main():
    path = Path('/etc/nginx/nginx.conf')
    path.write_text(config(False))
    nginx = subprocess.Popen(['nginx', '-g', 'daemon off;'])
    previous = False
    try:
        while nginx.poll() is None:
            try:
                with urllib.request.urlopen(f'http://{UPSTREAM}/health/traffic', timeout=3) as response: healthy=response.status == 200
            except Exception: healthy=False
            if healthy != previous:
                old = path.read_text()
                candidate = path.with_suffix('.candidate'); candidate.write_text(config(healthy))
                result = subprocess.run(['nginx','-t','-c',str(candidate)], capture_output=True)
                if result.returncode == 0:
                    candidate.replace(path)
                    subprocess.run(['nginx','-s','reload'], check=True)
                    previous=healthy
                else: path.write_text(old)
            time.sleep(10)
    finally:
        nginx.terminate(); nginx.wait(timeout=10)
    raise SystemExit(nginx.returncode or 1)

if __name__ == '__main__': main()
