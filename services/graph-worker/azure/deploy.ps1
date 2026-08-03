# Azure Container Apps deploy for Doxa graph-worker (Phase 0)
#
# Prerequisites (Windows):
#   1. Install Azure CLI: https://learn.microsoft.com/cli/azure/install-azure-cli-windows
#   2. Open a NEW PowerShell and run: az login
#   3. Copy .env.azure.example → .env.azure and fill secrets
#
# This script does NOT require local Docker. Images are built in Azure Container Registry
# via `az acr build`.
#
# Usage (from services/graph-worker):
#   .\azure\deploy.ps1
#   .\azure\deploy.ps1 -ResourceGroup doxa-rg -Location eastus -AcrName doxaagraphacr123

[CmdletBinding()]
param(
  [string]$ResourceGroup = "doxa-rg",
  [string]$Location = "eastus",
  [string]$AcrName = "",
  [string]$ContainerAppEnv = "doxa-graph-env",
  [string]$ContainerAppName = "doxa-graph-worker",
  [string]$ImageTag = "phase0",
  [string]$EnvFile = "",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Require-Az {
  if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw @"
Azure CLI (az) is not installed or not on PATH.

Install: https://learn.microsoft.com/cli/azure/install-azure-cli-windows
Then open a new PowerShell and run: az login
"@
  }
}

function Read-DotEnv([string]$Path) {
  $map = @{}
  Get-Content -Path $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }
    $key = $line.Substring(0, $idx).Trim()
    $val = $line.Substring($idx + 1).Trim()
    if (
      ($val.StartsWith('"') -and $val.EndsWith('"')) -or
      ($val.StartsWith("'") -and $val.EndsWith("'"))
    ) {
      $val = $val.Substring(1, $val.Length - 2)
    }
    $map[$key] = $val
  }
  return $map
}

function Require-Keys($map, [string[]]$keys) {
  $missing = @()
  foreach ($k in $keys) {
    if (-not $map.ContainsKey($k) -or [string]::IsNullOrWhiteSpace($map[$k])) {
      $missing += $k
    }
  }
  if ($missing.Count -gt 0) {
    throw "Missing required keys in env file: $($missing -join ', ')"
  }
}

function Test-AzExists {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock]$Command
  )
  # PowerShell treats az stderr as terminating when ErrorActionPreference=Stop.
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $null = & $Command 2>$null
    return ($LASTEXITCODE -eq 0)
  } finally {
    $ErrorActionPreference = $prev
  }
}

function Ensure-ResourceProviders {
  param([string[]]$Namespaces)
  foreach ($ns in $Namespaces) {
    $state = az provider show -n $ns --query registrationState -o tsv 2>$null
    if ($state -ne "Registered") {
      Write-Host "Registering Azure provider $ns (can take a few minutes)..."
      az provider register --namespace $ns --wait | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "Failed to register provider $ns" }
    } else {
      Write-Host "Provider $ns already registered."
    }
  }
}

Require-Az

$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
  Write-Host "Not logged in. Running az login..."
  az login | Out-Null
  $account = az account show | ConvertFrom-Json
}
Write-Host "Using subscription: $($account.name) ($($account.id))"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$workerRoot = Split-Path -Parent $scriptDir
if (-not $EnvFile) {
  $EnvFile = Join-Path $scriptDir ".env.azure"
}
if (-not (Test-Path $EnvFile)) {
  throw "Env file not found: $EnvFile`nCopy azure/.env.azure.example to azure/.env.azure and fill values."
}

$envMap = Read-DotEnv $EnvFile
Require-Keys $envMap @(
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEO4J_URI",
  "NEO4J_USERNAME",
  "NEO4J_PASSWORD",
  "OPENAI_API_KEY"
)

if (-not $envMap.ContainsKey("NEO4J_DATABASE") -or [string]::IsNullOrWhiteSpace($envMap["NEO4J_DATABASE"])) {
  $envMap["NEO4J_DATABASE"] = "neo4j"
}
if (-not $envMap.ContainsKey("OPENAI_MODEL") -or [string]::IsNullOrWhiteSpace($envMap["OPENAI_MODEL"])) {
  $envMap["OPENAI_MODEL"] = "gpt-4o-mini"
}
if (-not $envMap.ContainsKey("GRAPH_WORKER_ID") -or [string]::IsNullOrWhiteSpace($envMap["GRAPH_WORKER_ID"])) {
  $envMap["GRAPH_WORKER_ID"] = "graph-worker-1"
}
if (-not $envMap.ContainsKey("GRAPH_WORKER_POLL_INTERVAL_SEC") -or [string]::IsNullOrWhiteSpace($envMap["GRAPH_WORKER_POLL_INTERVAL_SEC"])) {
  $envMap["GRAPH_WORKER_POLL_INTERVAL_SEC"] = "5"
}
if (-not $envMap.ContainsKey("GRAPH_WORKER_SECRET") -or [string]::IsNullOrWhiteSpace($envMap["GRAPH_WORKER_SECRET"])) {
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $envMap["GRAPH_WORKER_SECRET"] = [Convert]::ToBase64String($bytes).Replace("+", "x").Replace("/", "y").Substring(0, 32)
  Write-Host "Generated GRAPH_WORKER_SECRET (also printed at end for Supabase)."
}

if ([string]::IsNullOrWhiteSpace($AcrName)) {
  # ACR names: 5-50 alphanumeric
  $suffix = ($account.id -replace "-", "").Substring(0, 8)
  $AcrName = "doxagraph$suffix"
}

$image = "$AcrName.azurecr.io/doxa-graph-worker:$ImageTag"

Write-Host ""
Write-Host "=== Deploy plan ==="
Write-Host "Resource group : $ResourceGroup"
Write-Host "Location       : $Location"
Write-Host "ACR            : $AcrName"
Write-Host "Container App  : $ContainerAppName"
Write-Host "Image          : $image"
Write-Host "Worker root    : $workerRoot"
Write-Host ""

Ensure-ResourceProviders @(
  "Microsoft.ContainerRegistry",
  "Microsoft.App",
  "Microsoft.OperationalInsights"
)

az group create -n $ResourceGroup -l $Location | Out-Null

if (-not (Test-AzExists { az acr show -n $AcrName -g $ResourceGroup })) {
  Write-Host "Creating ACR $AcrName..."
  az acr create -n $AcrName -g $ResourceGroup --sku Basic --admin-enabled true | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "az acr create failed" }
} else {
  Write-Host "ACR $AcrName already exists."
}

if (-not $SkipBuild) {
  Write-Host "Building image in ACR (no local Docker required)..."
  Push-Location $workerRoot
  try {
    az acr build `
      --registry $AcrName `
      --image "doxa-graph-worker:$ImageTag" `
      --file Dockerfile `
      .
    if ($LASTEXITCODE -ne 0) { throw "az acr build failed" }
  } finally {
    Pop-Location
  }
} else {
  Write-Host "Skipping image build (-SkipBuild)."
}

if (-not (Test-AzExists { az containerapp env show -n $ContainerAppEnv -g $ResourceGroup })) {
  Write-Host "Creating Container Apps environment $ContainerAppEnv..."
  az containerapp env create -n $ContainerAppEnv -g $ResourceGroup -l $Location | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "az containerapp env create failed" }
} else {
  Write-Host "Container Apps environment already exists."
}

$acrUser = az acr credential show -n $AcrName --query username -o tsv
$acrPass = az acr credential show -n $AcrName --query "passwords[0].value" -o tsv
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($acrUser)) {
  throw "Failed to read ACR credentials for $AcrName"
}

$appExists = Test-AzExists { az containerapp show -n $ContainerAppName -g $ResourceGroup }

$secretArgs = @(
  "supabase-service-role-key=$($envMap['SUPABASE_SERVICE_ROLE_KEY'])",
  "neo4j-password=$($envMap['NEO4J_PASSWORD'])",
  "openai-api-key=$($envMap['OPENAI_API_KEY'])",
  "graph-worker-secret=$($envMap['GRAPH_WORKER_SECRET'])"
)

$envVars = @(
  "SUPABASE_URL=$($envMap['SUPABASE_URL'])",
  "SUPABASE_SERVICE_ROLE_KEY=secretref:supabase-service-role-key",
  "NEO4J_URI=$($envMap['NEO4J_URI'])",
  "NEO4J_USERNAME=$($envMap['NEO4J_USERNAME'])",
  "NEO4J_PASSWORD=secretref:neo4j-password",
  "NEO4J_DATABASE=$($envMap['NEO4J_DATABASE'])",
  "OPENAI_API_KEY=secretref:openai-api-key",
  "OPENAI_MODEL=$($envMap['OPENAI_MODEL'])",
  "GRAPH_WORKER_ID=$($envMap['GRAPH_WORKER_ID'])",
  "GRAPH_WORKER_POLL_INTERVAL_SEC=$($envMap['GRAPH_WORKER_POLL_INTERVAL_SEC'])",
  "GRAPH_WORKER_SECRET=secretref:graph-worker-secret",
  "PORT=8080"
)

if (-not $appExists) {
  Write-Host "Creating Container App $ContainerAppName..."
  az containerapp create `
    -n $ContainerAppName `
    -g $ResourceGroup `
    --environment $ContainerAppEnv `
    --image $image `
    --registry-server "$AcrName.azurecr.io" `
    --registry-username $acrUser `
    --registry-password $acrPass `
    --target-port 8080 `
    --ingress external `
    --min-replicas 1 `
    --max-replicas 1 `
    --cpu 0.5 `
    --memory 1.0Gi `
    --secrets $secretArgs `
    --env-vars $envVars | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "az containerapp create failed" }
} else {
  Write-Host "Updating Container App $ContainerAppName..."
  az containerapp secret set -n $ContainerAppName -g $ResourceGroup --secrets $secretArgs | Out-Null
  az containerapp registry set `
    -n $ContainerAppName `
    -g $ResourceGroup `
    --server "$AcrName.azurecr.io" `
    --username $acrUser `
    --password $acrPass | Out-Null
  az containerapp update `
    -n $ContainerAppName `
    -g $ResourceGroup `
    --image $image `
    --min-replicas 1 `
    --max-replicas 1 `
    --set-env-vars $envVars | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "az containerapp update failed" }
}

$fqdn = az containerapp show -n $ContainerAppName -g $ResourceGroup --query "properties.configuration.ingress.fqdn" -o tsv
$url = "https://$fqdn"

Write-Host ""
Write-Host "=== Deploy complete ==="
Write-Host "Health URL          : $url/health"
Write-Host "GRAPH_WORKER_URL    : $url"
Write-Host "GRAPH_WORKER_SECRET : $($envMap['GRAPH_WORKER_SECRET'])"
Write-Host ""
Write-Host "Next (Supabase Dashboard → Edge Functions → Secrets):"
Write-Host "  GRAPH_WORKER_URL    = $url"
Write-Host "  GRAPH_WORKER_SECRET = (same as above)"
Write-Host ""
Write-Host "Daily processing requires ingestion to enqueue jobs (NewsAPI/scrape/clean crons)."
Write-Host "With min-replicas=1 the worker polls continuously and will process pending jobs."
Write-Host ""
Write-Host "Verify: curl $url/health"
