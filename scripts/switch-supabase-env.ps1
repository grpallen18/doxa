param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('branch', 'main')]
  [string]$Target
)

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$envLocal = Join-Path $root '.env.local'
$backup = Join-Path $root '.env.local.main.backup'

if ($Target -eq 'branch') {
  $source = Join-Path $root '.env.local.branch'
  if (-not (Test-Path $source)) {
    Write-Error "Create .env.local.branch (copy from .env.local.branch.example) and set SUPABASE_SERVICE_ROLE_KEY from the preview dashboard."
    exit 1
  }
  if (Test-Path $envLocal) {
    Copy-Item $envLocal $backup -Force
    Write-Host "Backed up .env.local -> .env.local.main.backup"
  }
  Copy-Item $source $envLocal -Force
  Write-Host "Using preview branch env (iyuwxdjauhlaeejstlde). Restart npm run dev."
  exit 0
}

if (-not (Test-Path $backup)) {
  Write-Error "No .env.local.main.backup found. Restore .env.local manually for main project gjxihyaovyfwajjyoyoz."
  exit 1
}
Copy-Item $backup $envLocal -Force
Write-Host "Restored main project env (gjxihyaovyfwajjyoyoz). Restart npm run dev."
