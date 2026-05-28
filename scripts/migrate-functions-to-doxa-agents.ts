// One-time migration: copy supabase function index.ts to doxa-agents handler.ts and write deploy stubs.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadManifest, REPO_ROOT, relativeStubImport, stubPath } from './agents-lib.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function toHandler(content: string): string {
  if (!content.includes('Deno.serve')) {
    throw new Error('No Deno.serve found');
  }
  let out = content.replace(
    /Deno\.serve\(async \(req(?:: Request)?\) => \{/,
    'export const handler = async (req: Request) => {',
  );
  const lastClose = out.lastIndexOf('});');
  if (lastClose === -1) {
    throw new Error('Expected Deno.serve to end with });');
  }
  out = out.slice(0, lastClose) + '};' + out.slice(lastClose + 3);
  return out + '\n';
}

function fixSharedImports(content: string, handlerFile: string): string {
  const handlerDir = path.dirname(handlerFile);
  const sharedUtil = path.join(REPO_ROOT, 'doxa-agents', 'shared', 'utilities');
  return content.replace(
    /from ["']\.\.\/_shared\/([^"']+)["']/g,
    (_m, file) => {
      let rel = path.relative(handlerDir, path.join(sharedUtil, file)).replace(/\\/g, '/');
      if (!rel.startsWith('.')) rel = `./${rel}`;
      return `from "${rel}"`;
    },
  );
}

function writeStub(deployName: string, step: { source?: string }, importPath: string) {
  const stub = `// AUTO-GENERATED deploy stub — implementation in doxa-agents
import { handler } from "${importPath}";
Deno.serve(handler);
`;
  const p = stubPath(deployName);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, stub);
}

function migrate() {
  const manifest = loadManifest();
  let ok = 0;
  let skip = 0;

  for (const step of manifest.steps) {
    if (step.kind !== 'edge_function' || !step.deploy_name || !step.source) continue;

    const srcFn = path.join(REPO_ROOT, 'supabase', 'functions', step.deploy_name, 'index.ts');
    const handlerFile = path.join(REPO_ROOT, step.source, 'handler.ts');

    if (!fs.existsSync(srcFn)) {
      if (fs.existsSync(handlerFile)) {
        skip++;
        continue;
      }
      console.warn(`Missing source: ${srcFn}`);
      continue;
    }

    let content = fs.readFileSync(srcFn, 'utf8');
    if (content.includes('AUTO-GENERATED deploy stub')) {
      const existingHandler = handlerFile;
      if (fs.existsSync(existingHandler)) {
        skip++;
        continue;
      }
      console.warn(`Stub exists but no handler: ${step.deploy_name}`);
      continue;
    }

    try {
      content = toHandler(content);
    } catch (e) {
      console.error(`Failed transform ${step.deploy_name}:`, e);
      continue;
    }

    fs.mkdirSync(path.dirname(handlerFile), { recursive: true });
    content = fixSharedImports(content, handlerFile);
    fs.writeFileSync(handlerFile, content);

    const relImport = relativeStubImport(step.deploy_name, step);
    writeStub(step.deploy_name, step, relImport);
    ok++;
    console.log(`Migrated ${step.deploy_name}`);
  }

  console.log(`Done: ${ok} migrated, ${skip} skipped`);
}

migrate();
