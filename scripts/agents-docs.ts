import fs from 'fs';
import path from 'path';
import {
  AGENTS_BEGIN,
  AGENTS_END,
  GENERATED_BANNER,
  REPO_ROOT,
  loadManifest,
  type ManifestStep,
} from './agents-lib.ts';

const checkOnly = process.argv.includes('--check');

function writeIfChanged(filePath: string, content: string) {
  const full = path.join(REPO_ROOT, filePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const next = content.endsWith('\n') ? content : content + '\n';
  if (fs.existsSync(full)) {
    const prev = fs.readFileSync(full, 'utf8');
    if (prev === next) return false;
    if (checkOnly) return true;
  } else if (checkOnly) {
    return true;
  }
  fs.writeFileSync(full, next);
  return true;
}

function cronJobsMd(steps: ManifestStep[]): string {
  const lines = [
    GENERATED_BANNER,
    '# Cron jobs',
    '',
    '| Job | Step | Deploy | Schedule (UTC) | Status | SQL |',
    '|-----|------|--------|----------------|--------|-----|',
  ];
  for (const s of steps) {
    if (!s.cron) continue;
    lines.push(
      `| ${s.cron.job_name} | ${s.id} | ${s.deploy_name ?? '—'} | \`${s.cron.schedule}\` | ${s.status} | [${path.basename(s.cron.sql)}](${s.cron.sql.replace(/\\/g, '/')}) |`,
    );
  }
  lines.push('', '_Generated from manifest.yaml._');
  return lines.join('\n');
}

function pipelineGraphMd(steps: ManifestStep[]): string {
  const edges: string[] = [];
  for (const s of steps) {
    if (!s.invokes?.length) continue;
    for (const inv of s.invokes) {
      edges.push(`  ${s.id.replace(/-/g, '_')} --> ${inv.replace(/-/g, '_')}`);
    }
  }
  const workerEdge = '  scrape_worker --> receive_scraped_content';
  return [
    GENERATED_BANNER,
    '# Pipeline graph',
    '',
    '```mermaid',
    'flowchart LR',
    workerEdge,
    ...edges,
    '```',
    '',
    '_Generated from manifest invokes._',
  ].join('\n');
}

function deployMd(steps: ManifestStep[]): string {
  const names = steps
    .filter((s) => s.kind === 'edge_function' && s.deploy_name && s.status !== 'deprecated')
    .map((s) => s.deploy_name!);
  const noJwt = steps
    .filter((s) => s.verify_jwt === false && s.deploy_name)
    .map((s) => s.deploy_name!);
  const lines = [
    GENERATED_BANNER,
    '# Deploy edge functions',
    '',
    '```bash',
    ...names.map((n) => `supabase functions deploy ${n}`),
    '```',
  ];
  if (noJwt.length) {
    lines.push('', 'JWT exceptions:', '', '```bash');
    for (const n of noJwt) {
      lines.push(`supabase functions deploy ${n} --no-verify-jwt`);
    }
    lines.push('```');
  }
  lines.push('', '_Generated from manifest.yaml._');
  return lines.join('\n');
}

function secretsMd(steps: ManifestStep[]): string {
  const lines = [
    GENERATED_BANNER,
    '# Edge function secrets',
    '',
    'Set values in **Supabase Dashboard → Edge Functions → Secrets** (or `supabase secrets set`).',
    'Do not commit secret values to git.',
    '',
    '| Step | Deploy | Secret names |',
    '|------|--------|--------------|',
  ];
  for (const s of steps) {
    if (s.kind !== 'edge_function' || !s.secrets?.length) continue;
    lines.push(`| ${s.id} | ${s.deploy_name ?? '—'} | ${s.secrets.map((x) => `\`${x}\``).join(', ')} |`);
  }
  lines.push('', '**Cron prerequisites (Vault):** `project_url`, `service_role_key`', '');
  lines.push('**Worker secrets:** see [ENV_SETUP.md](../../../ENV_SETUP.md#scrape-workflow-cloudflare-worker-secrets)', '');
  lines.push('_Generated from handler.ts env scans._');
  return lines.join('\n');
}

function divisionBlock(division: string, steps: ManifestStep[]): string {
  const divSteps = steps.filter((s) => s.division === division);
  const lines = [
    AGENTS_BEGIN,
    '',
    `### ${division} (generated)`,
    '',
    '| Step | Deploy | Status |',
    '|------|--------|--------|',
  ];
  for (const s of divSteps) {
    lines.push(`| ${s.id} | ${s.deploy_name ?? '—'} | ${s.status} |`);
  }
  lines.push('', AGENTS_END);
  return lines.join('\n');
}

function upsertDivisionReadme(divisionPath: string, division: string, steps: ManifestStep[]) {
  const readmePath = path.join(REPO_ROOT, divisionPath, 'README.md');
  const block = divisionBlock(division, steps);
  let content: string;
  if (fs.existsSync(readmePath)) {
    content = fs.readFileSync(readmePath, 'utf8');
    const begin = content.indexOf(AGENTS_BEGIN);
    const end = content.indexOf(AGENTS_END);
    if (begin >= 0 && end > begin) {
      content = content.slice(0, begin) + block + content.slice(end + AGENTS_END.length);
    } else {
      content = content.trimEnd() + '\n\n' + block + '\n';
    }
  } else {
    content = `# ${division}\n\n${block}\n`;
  }
  writeIfChanged(path.relative(REPO_ROOT, readmePath), content);
}

function main() {
  const manifest = loadManifest();
  let changed = false;

  if (writeIfChanged('doxa-agents/docs/generated/cron-jobs.md', cronJobsMd(manifest.steps))) changed = true;
  if (writeIfChanged('doxa-agents/docs/generated/pipeline-graph.md', pipelineGraphMd(manifest.steps))) {
    changed = true;
  }
  if (writeIfChanged('doxa-agents/docs/generated/deploy.md', deployMd(manifest.steps))) changed = true;
  if (writeIfChanged('doxa-agents/docs/generated/secrets.md', secretsMd(manifest.steps))) changed = true;

  const divisions = [...new Set(manifest.steps.map((s) => s.division))];
  for (const d of divisions) {
    const rel = `doxa-agents/divisions/${d}`;
    if (fs.existsSync(path.join(REPO_ROOT, rel))) {
      if (upsertDivisionReadme(rel, d, manifest.steps)) changed = true;
    }
  }

  if (checkOnly && changed) {
    console.error('agents:docs:check failed — generated docs are stale. Run: npm run agents:docs');
    process.exit(1);
  }
  if (checkOnly) {
    console.log('agents:docs:check OK');
  } else {
    console.log('agents:docs OK' + (changed ? ' (updated)' : ''));
  }
}

main();
