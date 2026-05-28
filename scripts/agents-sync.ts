import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import {
  REPO_ROOT,
  MANIFEST_BANNER,
  extractInvokedDeployNames,
  extractSecrets,
  isMaintenanceOnlySql,
  loadActivation,
  parseCronBody,
  parseCronSql,
  parseVerifyJwtDisabled,
  scanAppApiInvokes,
  jobNameToStepId,
  type Manifest,
  type ManifestStep,
  type StepKind,
  type StepStatus,
} from './agents-lib.ts';

const checkOnly = process.argv.includes('--check');

interface HandlerInfo {
  id: string;
  division: string;
  workflow: string;
  source: string;
  handlerPath: string;
  deployName?: string;
}

function walkFiles(dir: string, pattern: RegExp, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(full, pattern, out);
    else if (pattern.test(ent.name)) out.push(full);
  }
  return out;
}

function parseHandlerPath(handlerFile: string): HandlerInfo | null {
  const rel = path.relative(path.join(REPO_ROOT, 'doxa-agents', 'divisions'), handlerFile).replace(/\\/g, '/');
  const parts = rel.split('/');
  if (parts.length < 4 || parts[parts.length - 1] !== 'handler.ts') return null;
  const id = parts[parts.length - 2];
  const workflow = parts[parts.length - 3];
  const division = parts.slice(0, parts.length - 3).join('/');
  const source = `doxa-agents/divisions/${division}/${workflow}/${id}`;
  return { id, division, workflow, source, handlerPath: handlerFile };
}

function buildStubMap(): Map<string, string> {
  const map = new Map<string, string>();
  const fnDir = path.join(REPO_ROOT, 'supabase', 'functions');
  for (const ent of fs.readdirSync(fnDir, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name.startsWith('_')) continue;
    const indexPath = path.join(fnDir, ent.name, 'index.ts');
    if (!fs.existsSync(indexPath)) continue;
    const content = fs.readFileSync(indexPath, 'utf8');
    const m = content.match(/from\s+["']([^"']+handler\.ts)["']/);
    if (!m) continue;
    const importPath = m[1].replace(/\\/g, '/');
    const absHandler = path.resolve(path.dirname(indexPath), importPath).replace(/\\/g, '/');
    map.set(absHandler, ent.name);
  }
  return map;
}

function resolveStatus(id: string, division: string, active: Set<string>): StepStatus {
  if (division.startsWith('legacy/') || division === 'legacy') return 'deprecated';
  if (active.has(id)) return 'active';
  return 'inactive';
}

function findCronForHandler(
  handlerInfo: HandlerInfo,
  sqlFiles: Map<string, { rel: string; content: string; jobs: ReturnType<typeof parseCronSql> }>,
  deployName: string | undefined,
): ManifestStep['cron'] | undefined {
  const stepDir = path.join(REPO_ROOT, handlerInfo.source);
  const localSchedule = path.join(stepDir, 'schedule.sql');
  if (fs.existsSync(localSchedule)) {
    const rel = path.relative(REPO_ROOT, localSchedule).replace(/\\/g, '/');
    const entry = sqlFiles.get(rel);
    if (entry && deployName) {
      const job = entry.jobs.find((j) => j.deploy_name === deployName);
      if (job) {
        const cron: ManifestStep['cron'] = {
          job_name: job.job_name,
          schedule: job.schedule,
          sql: rel,
        };
        const body = parseCronBody(entry.content, job.job_name);
        if (body) cron.body = body;
        return cron;
      }
    }
  }
  const workflowDir = path.dirname(stepDir);
  const sharedSchedule = path.join(workflowDir, 'schedules.sql');
  if (fs.existsSync(sharedSchedule)) {
    const rel = path.relative(REPO_ROOT, sharedSchedule).replace(/\\/g, '/');
    const entry = sqlFiles.get(rel);
    if (entry && deployName) {
      const job = entry.jobs.find((j) => j.deploy_name === deployName);
      if (job) {
        const cron: ManifestStep['cron'] = {
          job_name: job.job_name,
          schedule: job.schedule,
          sql: rel,
        };
        const body = parseCronBody(entry.content, job.job_name);
        if (body) cron.body = body;
        return cron;
      }
    }
  }
  return undefined;
}

function parseSqlLocation(sqlRel: string): { division: string; workflow: string } {
  const parts = sqlRel.replace(/^doxa-agents\/divisions\//, '').split('/');
  if (parts.length >= 2) {
    return { division: parts[0], workflow: parts[1] };
  }
  return { division: '06-business-operations', workflow: 'maintenance' };
}

function buildManifest(): Manifest {
  const activation = loadActivation();
  const activeSet = new Set(activation.active);
  const stubMap = buildStubMap();
  const verifyJwtDisabled = parseVerifyJwtDisabled(
    fs.readFileSync(path.join(REPO_ROOT, 'supabase', 'config.toml'), 'utf8'),
  );
  const appInvokes = scanAppApiInvokes();

  const sqlFiles = new Map<string, { rel: string; content: string; jobs: ReturnType<typeof parseCronSql> }>();
  for (const sqlFile of walkFiles(path.join(REPO_ROOT, 'doxa-agents', 'divisions'), /schedule(s)?\.sql$/)) {
    const rel = path.relative(REPO_ROOT, sqlFile).replace(/\\/g, '/');
    const content = fs.readFileSync(sqlFile, 'utf8');
    sqlFiles.set(rel, { rel, content, jobs: parseCronSql(content) });
  }

  const stepsById = new Map<string, ManifestStep>();
  const deployToId = new Map<string, string>();

  for (const handlerFile of walkFiles(path.join(REPO_ROOT, 'doxa-agents', 'divisions'), /^handler\.ts$/)) {
    const info = parseHandlerPath(handlerFile);
    if (!info) continue;

    const absNorm = path.resolve(handlerFile).replace(/\\/g, '/');
    const deployName = stubMap.get(absNorm);
    if (deployName) deployToId.set(deployName, info.id);

    const handlerSource = fs.readFileSync(handlerFile, 'utf8');
    const secrets = extractSecrets(handlerSource);
    const invokedDeploys = extractInvokedDeployNames(handlerSource);

    const step: ManifestStep = {
      id: info.id,
      division: info.division,
      workflow: info.workflow,
      kind: 'edge_function',
      status: resolveStatus(info.id, info.division, activeSet),
      source: info.source,
    };
    if (deployName) step.deploy_name = deployName;
    if (secrets.length) step.secrets = secrets;
    if (deployName && verifyJwtDisabled.has(deployName)) step.verify_jwt = false;
    if (deployName === 'receive_scraped_content') step.verify_jwt = false;

    const cron = findCronForHandler(info, sqlFiles, deployName);
    if (cron) step.cron = cron;

    stepsById.set(info.id, step);
  }

  for (const [sqlRel, entry] of sqlFiles) {
    if (isMaintenanceOnlySql(entry.content)) {
      const loc = parseSqlLocation(sqlRel);
      const folderName = path.basename(path.dirname(sqlRel));
      const id = folderName;
      if (!stepsById.has(id)) {
        stepsById.set(id, {
          id,
          division: loc.division,
          workflow: loc.workflow,
          kind: 'maintenance_script',
          status: resolveStatus(id, loc.division, activeSet),
          source: path.dirname(sqlRel).replace(/\\/g, '/'),
          description: 'One-time unschedule of deprecated crons',
        });
      }
      continue;
    }

    for (const job of entry.jobs) {
      if (job.deploy_name) {
        const existingId = deployToId.get(job.deploy_name);
        if (existingId && stepsById.has(existingId)) {
          const step = stepsById.get(existingId)!;
          if (!step.cron) {
            const cron: ManifestStep['cron'] = {
              job_name: job.job_name,
              schedule: job.schedule,
              sql: sqlRel,
            };
            const body = parseCronBody(entry.content, job.job_name);
            if (body) cron.body = body;
            step.cron = cron;
          }
        }
        continue;
      }

      const id = jobNameToStepId(job.job_name);
      if (stepsById.has(id)) continue;

      const loc = parseSqlLocation(sqlRel);
      const cron: ManifestStep['cron'] = {
        job_name: job.job_name,
        schedule: job.schedule,
        sql: sqlRel,
      };
      stepsById.set(id, {
        id,
        division: loc.division,
        workflow: loc.workflow,
        kind: 'rpc',
        status: resolveStatus(id, loc.division, activeSet),
        source: path.dirname(sqlRel).replace(/\\/g, '/'),
        cron,
      });
    }
  }

  const steps = [...stepsById.values()];

  for (const step of steps) {
    if (step.kind !== 'edge_function' || !step.deploy_name) continue;
    const handlerFile = path.join(REPO_ROOT, step.source!, 'handler.ts');
    if (!fs.existsSync(handlerFile)) continue;
    const invokedDeploys = extractInvokedDeployNames(fs.readFileSync(handlerFile, 'utf8'));
    const invokes: string[] = [];
    for (const deploy of invokedDeploys) {
      const targetId = deployToId.get(deploy);
      if (targetId && targetId !== step.id) invokes.push(targetId);
    }
    if (invokes.length) step.invokes = [...new Set(invokes)].sort();

    const invokedBy: string[] = [];
    const appRefs = appInvokes.get(step.deploy_name);
    if (appRefs) invokedBy.push(...appRefs);
    if (step.deploy_name === 'receive_scraped_content') invokedBy.push('cloudflare-worker');
    for (const other of steps) {
      if (other.invokes?.includes(step.id) && !invokedBy.includes(other.id)) {
        invokedBy.push(other.id);
      }
    }
    if (invokedBy.length) step.invoked_by = [...new Set(invokedBy)].sort();
  }

  steps.sort((a, b) => {
    const d = a.division.localeCompare(b.division);
    if (d !== 0) return d;
    const w = a.workflow.localeCompare(b.workflow);
    if (w !== 0) return w;
    return a.id.localeCompare(b.id);
  });

  return {
    version: 1,
    vault_secrets: ['project_url', 'service_role_key'],
    workers: {
      scrape: {
        path: 'workers/',
        invokes: ['receive-scraped-content'],
      },
    },
    steps,
  };
}

function serializeManifest(manifest: Manifest): string {
  return MANIFEST_BANNER + yaml.stringify(manifest, { lineWidth: 120 });
}

function main() {
  const manifest = buildManifest();
  const outPath = path.join(REPO_ROOT, 'doxa-agents', 'manifest.yaml');
  const next = serializeManifest(manifest);

  if (checkOnly) {
    const prev = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
    if (prev !== next) {
      console.error('agents:sync:check failed — manifest.yaml is stale. Run: npm run agents:sync');
      process.exit(1);
    }
    console.log('agents:sync:check OK');
    return;
  }

  fs.writeFileSync(outPath, next);
  console.log(`agents:sync OK (${manifest.steps.length} steps)`);
}

main();
