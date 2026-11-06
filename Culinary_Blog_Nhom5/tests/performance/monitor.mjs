import { appendFile, mkdir, access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout } from 'node:timers/promises';
const exec = promisify(execFile);
const output = path.resolve(process.argv[2]);
const containers = process.argv.slice(3);
await mkdir(path.join(output, 'metrics'), { recursive: true });
for (;;) {
  try { await access(path.join(output, 'monitor.stop')); break; } catch { }
  const now = new Date().toISOString();
  try {
    const response = await fetch('http://localhost:9465/metrics', { signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new Error('Collector HTTP ' + response.status);
    await writeFile(path.join(output, 'metrics', now.replaceAll(':', '-') + '.prom'), await response.text());
    const { stdout } = await exec('docker', ['stats', '--no-stream', '--format', '{{json .}}', ...containers], { timeout: 10000, windowsHide: true });
    await appendFile(path.join(output, 'resources.jsonl'), JSON.stringify({ at: now,
      containers: stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) }) + '\n');
  } catch (error) {
    await appendFile(path.join(output, 'monitor-errors.jsonl'), JSON.stringify({ at: now, message: error.message }) + '\n');
  }
  await setTimeout(5000);
}
