/**
 * Spawns official neo4j-mcp-server with NEO4J_* from project .env.local.
 * Keeps secrets out of mcp.json.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = join(root, '.env.local')

function loadEnvLocal(path) {
  const out = {}
  if (!existsSync(path)) return out
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

const fileEnv = loadEnvLocal(envPath)
const env = {
  ...process.env,
  ...fileEnv,
  NEO4J_READ_ONLY: fileEnv.NEO4J_READ_ONLY ?? process.env.NEO4J_READ_ONLY ?? 'true',
  NEO4J_TELEMETRY: fileEnv.NEO4J_TELEMETRY ?? process.env.NEO4J_TELEMETRY ?? 'false',
}

for (const key of ['NEO4J_URI', 'NEO4J_USERNAME', 'NEO4J_PASSWORD']) {
  if (!env[key]?.trim()) {
    console.error(`[neo4j-mcp] Missing ${key} in .env.local`)
    process.exit(1)
  }
}

const child = spawn(process.platform === 'win32' ? 'python' : 'python3', ['-m', 'neo4j_mcp_server'], {
  env,
  stdio: 'inherit',
  windowsHide: true,
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
