import { spawnSync } from 'child_process';
import fs from 'fs';

const QUEUE_PATH = '.cursor/librarian-queue.json';

function readQueue() {
  if (!fs.existsSync(QUEUE_PATH)) return [];
  try {
    const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
    return Array.isArray(queue.paths) ? queue.paths : [];
  } catch {
    return [];
  }
}

function clearQueue() {
  fs.mkdirSync('.cursor', { recursive: true });
  fs.writeFileSync(QUEUE_PATH, `${JSON.stringify({ paths: [] }, null, 2)}\n`);
}

function npmRun(script) {
  const result = spawnSync('npm', ['run', script], {
    stdio: 'pipe',
    encoding: 'utf8',
    shell: true,
    cwd: process.cwd(),
  });
  return result.status ?? 1;
}

function isCatalogStale() {
  return npmRun('agents:sync:check') !== 0 || npmRun('agents:docs:check') !== 0;
}

const queued = readQueue();
const needsRefresh = queued.length > 0 || isCatalogStale();

if (!needsRefresh) {
  process.exit(0);
}

const status = npmRun('agents:refresh');
clearQueue();

if (status !== 0) {
  process.stdout.write(
    `${JSON.stringify({
      followup_message:
        'agents:refresh failed after pipeline/catalog edits. Fix validation errors, then run npm run agents:refresh. Do not hand-edit manifest.yaml or docs/generated/*.',
    })}\n`,
  );
}

process.exit(0);
