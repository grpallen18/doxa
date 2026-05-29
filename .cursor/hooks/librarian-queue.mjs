import fs from 'fs';

const QUEUE_PATH = '.cursor/librarian-queue.json';

const IGNORE_SEGMENT = '/doxa-agents/docs/generated/';

const WATCH_SEGMENTS = [
  '/doxa-agents/',
  '/supabase/functions/',
  '/supabase/migrations/',
  '/workers/',
];

const WATCH_PREFIXES = [
  'doxa-agents/',
  'supabase/functions/',
  'supabase/migrations/',
  'workers/',
];

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
  });
}

function isWatchedPath(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.includes(IGNORE_SEGMENT)) return false;
  if (WATCH_SEGMENTS.some((segment) => normalized.includes(segment))) return true;
  return WATCH_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function enqueue(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  fs.mkdirSync('.cursor', { recursive: true });
  let queue = { paths: [] };
  if (fs.existsSync(QUEUE_PATH)) {
    try {
      queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
    } catch {
      queue = { paths: [] };
    }
  }
  if (!Array.isArray(queue.paths)) queue.paths = [];
  if (!queue.paths.includes(normalized)) queue.paths.push(normalized);
  fs.writeFileSync(QUEUE_PATH, `${JSON.stringify(queue, null, 2)}\n`);
}

const input = await readStdin();
let filePath = '';
try {
  const payload = JSON.parse(input || '{}');
  filePath = payload.file_path || payload.path || '';
} catch {
  process.exit(0);
}

if (filePath && isWatchedPath(filePath)) {
  enqueue(filePath);
}

process.exit(0);
