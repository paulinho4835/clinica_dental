# =============================================================================
#  backup-supabase.ps1  —  Respaldo diario de la base de datos de producción
# =============================================================================
#  Genera un respaldo COMPLETO (roles + esquema + datos) de la base Supabase
#  de producción usando el Supabase CLI (que usa la versión correcta de
#  pg_dump vía Docker). Guarda cada respaldo en una carpeta con fecha dentro
#  de OneDrive, y borra los respaldos más viejos que la retención configurada.
#
#  USO MANUAL:
#     powershell -ExecutionPolicy Bypass -File scripts\backup-supabase.ps1
#
#  La cadena de conexión se lee de la variable de entorno SUPABASE_DB_URL.
# =============================================================================

param(
    [string]$DbUrl        = $env:SUPABASE_DB_URL,
    [string]$BackupRoot   = "C:\Users\pauli\OneDrive\Backups-ClinicaDental",
    [int]   $RetentionDays = 14
)

$ErrorActionPreference = "Stop"

# --- Validaciones ------------------------------------------------------------
if ([string]::IsNullOrWhiteSpace($DbUrl)) {
    Write-Error "ERROR: No se encontró la cadena de conexión. Define la variable de entorno SUPABASE_DB_URL."
    exit 1
}

if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
    Write-Error "ERROR: El Supabase CLI no está en el PATH."
    exit 1
}

# --- Preparar carpetas -------------------------------------------------------
$timestamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$destDir   = Join-Path $BackupRoot $timestamp
New-Item -ItemType Directory -Force -Path $destDir | Out-Null

$logFile = Join-Path $BackupRoot "backup.log"
function Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
    Write-Host $line
    Add-Content -Path $logFile -Value $line -Encoding utf8
}

Log "===== Iniciando respaldo en $destDir ====="

# --- Ejecutar los tres dumps -------------------------------------------------
$dumps = @(
    @{ Name = "roles";  File = "roles.sql";  Args = @("--role-only") },
    @{ Name = "schema"; File = "schema.sql"; Args = @() },
    @{ Name = "data";   File = "data.sql";   Args = @("--data-only") }
)

$failed = $false
foreach ($d in $dumps) {
    $outFile = Join-Path $destDir $d.File
    Log "Generando $($d.Name) -> $($d.File) ..."

    $cliArgs = @("db", "dump", "--db-url", $DbUrl) + $d.Args + @("-f", $outFile)
    & supabase @cliArgs
    $code = $LASTEXITCODE

    if ($code -ne 0 -or -not (Test-Path $outFile)) {
        Log "ERROR: el dump '$($d.Name)' falló (código $code)."
        $failed = $true
        break
    }

    $sizeKB = [math]::Round((Get-Item $outFile).Length / 1KB, 1)
    Log "OK: $($d.File) generado ($sizeKB KB)."
}

if ($failed) {
    Log "===== RESPALDO FALLIDO. ====="
    exit 1
}

# --- Comprimir en .zip -------------------------------------------------------
$zipPath = "$destDir.zip"
try {
    Compress-Archive -Path (Join-Path $destDir "*") -DestinationPath $zipPath -Force
    Remove-Item -Recurse -Force $destDir
    $zipKB = [math]::Round((Get-Item $zipPath).Length / 1KB, 1)
    Log "Comprimido en $([System.IO.Path]::GetFileName($zipPath)) ($zipKB KB)."
} catch {
    Log "AVISO: no se pudo comprimir: $($_.Exception.Message)"
}

# --- Retención: borrar respaldos más viejos que $RetentionDays ---------------
$cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -Path $BackupRoot -Filter "*.zip" -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    ForEach-Object { Remove-Item -Force $_.FullName; Log "Eliminado: $($_.Name)" }

Log "===== Respaldo COMPLETADO con éxito. ====="
exit 0
