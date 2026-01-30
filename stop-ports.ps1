# Script to stop processes using ports 3000 and 3001
Write-Host "🔍 Checking for processes on ports 3000 and 3001..." -ForegroundColor Cyan

# Port 3000
$port3000 = netstat -ano | findstr ":3000" | findstr "LISTENING"
if ($port3000) {
    $pid = ($port3000 -split '\s+')[-1]
    Write-Host "🛑 Stopping process on port 3000 (PID: $pid)..." -ForegroundColor Yellow
    taskkill /PID $pid /F 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Port 3000 freed" -ForegroundColor Green
    }
} else {
    Write-Host "✅ Port 3000 is already free" -ForegroundColor Green
}

# Port 3001
$port3001 = netstat -ano | findstr ":3001" | findstr "LISTENING"
if ($port3001) {
    $pid = ($port3001 -split '\s+')[-1]
    Write-Host "🛑 Stopping process on port 3001 (PID: $pid)..." -ForegroundColor Yellow
    taskkill /PID $pid /F 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Port 3001 freed" -ForegroundColor Green
    }
} else {
    Write-Host "✅ Port 3001 is already free" -ForegroundColor Green
}

Write-Host "`n✨ Done! Ports are now free." -ForegroundColor Cyan
