import fs from 'fs';
import path from 'path';
import {
  REPO_ROOT,
  MANIFEST_BANNER,
  extractInvokedDeployNames,
  handlerPath,
  loadActivation,
  loadManifest,
  parseCronSql,
  readmePathForStep,
  stepByDeployName,
  stubPath,
  supabaseFunctionsDir,
} from './agents-lib.ts';

const errors: string[] = [];
const warnings: string[] = [];

function normPath(p: string): string {
  return path.resolve(p).replace(/\\/g, '/').toLowerCase();
}

function err(msg: string) {
  errors.push(msg);
}

function warn(msg: string) {
  warnings.push(msg);
}

function main() {
  const manifestPath = path.join(REPO_ROOT, 'doxa-agents', 'manifest.yaml');
  const raw = fs.readFileSync(manifestPath, 'utf8');
  if (!raw.startsWith(MANIFEST_BANNER.trim())) {
    err('manifest.yaml is not auto-generated. Run: npm run agents:sync');
  }

  const manifest = loadManifest();
  const activation = loadActivation();
  const activeSet = new Set(activation.active);

  for (const id of activeSet) {
    const step = manifest.steps.find((s) => s.id === id);
    if (!step) err(`activation.yaml lists unknown step: ${id}`);
    else if (step.status === 'deprecated') warn(`activation.yaml lists deprecated step as active: ${id}`);
  }

  const flatCrons = fs
    .readdirSync(path.join(REPO_ROOT, 'supabase'))
    .filter((f) => f.startsWith('cron_') && f.endsWith('.sql'));
  if (flatCrons.length > 0) {
    err(`Orphan flat cron files in supabase/: ${flatCrons.join(', ')}`);
  }

  const handlerFiles = new Set<string>();
  for (const step of manifest.steps) {
    if (step.status === 'deprecated' && step.cron) {
      err(`Deprecated step ${step.id} must not have cron in manifest`);
    }

    if (step.kind === 'edge_function' && step.deploy_name) {
      const stub = stubPath(step.deploy_name);
      if (!fs.existsSync(stub)) {
        err(`Missing stub: ${stub}`);
      } else {
        const stubContent = fs.readFileSync(stub, 'utf8');
        if (!stubContent.includes('doxa-agents') && !stubContent.includes('handler')) {
          err(`Stub ${step.deploy_name} does not import from doxa-agents`);
        }
        const hp = handlerPath(step);
        if (!hp || !fs.existsSync(hp)) {
          err(`Missing handler: ${hp ?? step.source}`);
        } else {
          handlerFiles.add(normPath(hp));
        }
      }
    }

    if (step.cron?.sql) {
      const sqlPath = path.join(REPO_ROOT, step.cron.sql);
      if (!fs.existsSync(sqlPath)) {
        err(`Missing cron SQL: ${step.cron.sql}`);
      } else {
        const content = fs.readFileSync(sqlPath, 'utf8');
        const jobs = parseCronSql(content);
        if (!jobs.some((j) => j.job_name === step.cron!.job_name)) {
          err(`Cron SQL ${step.cron.sql} missing job ${step.cron.job_name} for step ${step.id}`);
        }
        if (step.deploy_name) {
          const job = jobs.find((j) => j.job_name === step.cron!.job_name);
          if (job?.deploy_name && job.deploy_name !== step.deploy_name) {
            err(
              `Cron ${step.cron.job_name} targets ${job.deploy_name}, expected ${step.deploy_name}`,
            );
          }
        }
      }
    }
  }

  const fnDir = supabaseFunctionsDir();
  for (const ent of fs.readdirSync(fnDir, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name.startsWith('_')) continue;
    const indexPath = path.join(fnDir, ent.name, 'index.ts');
    if (!fs.existsSync(indexPath)) continue;
    const content = fs.readFileSync(indexPath, 'utf8');
    if (!content.includes('handler')) continue;
    const m = content.match(/from\s+["']([^"']+handler\.ts)["']/);
    if (!m) continue;
    const absHandler = path.resolve(path.dirname(indexPath), m[1]);
    if (!handlerFiles.has(normPath(absHandler))) {
      err(`Orphan stub ${ent.name} — no matching handler step in manifest`);
    }
  }

  for (const step of manifest.steps) {
    if (!step.invokes?.length) continue;
    const hp = handlerPath(step);
    if (!hp || !fs.existsSync(hp)) continue;
    const source = fs.readFileSync(hp, 'utf8');
    const found = extractInvokedDeployNames(source);
    for (const invokeId of step.invokes) {
      const target = manifest.steps.find((s) => s.id === invokeId);
      if (!target?.deploy_name) continue;
      if (!found.includes(target.deploy_name)) {
        err(
          `Step ${step.id} invokes ${invokeId} (${target.deploy_name}) but handler does not reference it`,
        );
      }
    }
  }

  for (const step of manifest.steps) {
    if (!step.cron?.sql || step.kind !== 'edge_function' || !step.deploy_name) continue;
    const content = fs.readFileSync(path.join(REPO_ROOT, step.cron.sql), 'utf8');
    const jobs = parseCronSql(content);
    for (const job of jobs) {
      if (job.deploy_name && !stepByDeployName(manifest.steps, job.deploy_name)) {
        err(`Cron job ${job.job_name} targets unknown deploy_name ${job.deploy_name}`);
      }
    }
  }

  const departments = new Set<string>();
  const requiredReadmes = new Set<string>();
  for (const step of manifest.steps) {
    departments.add(step.department);
    if (step.source) requiredReadmes.add(readmePathForStep(step.source));
  }
  for (const department of departments) {
    const readme = path.join(REPO_ROOT, 'doxa-agents', 'departments', department, 'README.md');
    if (!fs.existsSync(readme)) {
      err(`Missing department README: doxa-agents/departments/${department}/README.md`);
    }
  }
  for (const readme of requiredReadmes) {
    if (!fs.existsSync(readme)) {
      err(`Missing README: ${path.relative(REPO_ROOT, readme).replace(/\\/g, '/')}`);
    }
  }

  if (warnings.length) {
    console.warn('agents:validate warnings:\n' + warnings.map((w) => `  - ${w}`).join('\n'));
  }
  if (errors.length) {
    console.error('agents:validate failed:\n' + errors.map((e) => `  - ${e}`).join('\n'));
    process.exit(1);
  }
  console.log('agents:validate OK');
}

main();
