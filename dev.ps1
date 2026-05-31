# Inicia Docker, Supabase y Next.js en orden correcto
Write-Host "Verificando Docker..." -ForegroundColor Cyan

$dockerRunning = docker info 2>$null
if (-not $?) {
    Write-Host "Iniciando Docker Desktop..." -ForegroundColor Yellow
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    Write-Host "Esperando Docker..." -ForegroundColor Yellow
    $timeout = 120; $elapsed = 0
    do {
        Start-Sleep 5; $elapsed += 5
        docker info 2>$null | Out-Null
    } while (-not $? -and $elapsed -lt $timeout)
    if (-not $?) { Write-Host "Docker no arranco. Abrir manualmente." -ForegroundColor Red; exit 1 }
}

Write-Host "Docker listo." -ForegroundColor Green
Write-Host "Iniciando Supabase..." -ForegroundColor Cyan
supabase start 2>&1 | Out-Null
Write-Host "Supabase listo." -ForegroundColor Green

Write-Host "Iniciando Next.js en http://localhost:3000" -ForegroundColor Cyan
npm run dev
