# Mueve (copiando) el repositorio fuera de OneDrive a una ruta local segura.
#
# Por qué: tener .git dentro de OneDrive puede corromper el estado de git
# (OneDrive resincroniza .git desde otra máquina y "mueve" el HEAD). Esta
# sesión ya vio ese síntoma (HEAD apuntando a un commit fantasma).
#
# Es NO destructivo: COPIA a la ruta nueva y deja el original intacto como
# respaldo. Tú borras la copia de OneDrive a mano cuando confirmes que todo
# funciona en la ruta nueva.
#
# Uso (en una terminal NUEVA, con VS Code y el dev server CERRADOS):
#   powershell -ExecutionPolicy Bypass -File scripts\mover-fuera-de-onedrive.ps1
#   # o con destino personalizado:
#   ... -File scripts\mover-fuera-de-onedrive.ps1 -Destino "D:\dev\clinica-dental"

param(
  [string]$Destino = "C:\dev\clinica-dental"
)

$ErrorActionPreference = "Stop"
$origen = Split-Path -Parent $PSScriptRoot   # carpeta raíz del proyecto

Write-Host "Origen : $origen"
Write-Host "Destino: $Destino"
Write-Host ""

if (Test-Path $Destino) {
  Write-Warning "El destino ya existe. Elige otra ruta o bórralo antes. Abortando."
  exit 1
}

# 1) Pausar OneDrive para que no interfiera con la copia.
Write-Host "Pausando OneDrive (si está corriendo)…"
try { Get-Process OneDrive -ErrorAction Stop | Stop-Process -Force; Start-Sleep 2 }
catch { Write-Host "  (OneDrive no estaba corriendo)" }

# 2) Copiar TODO incluyendo .git, excepto lo regenerable (node_modules, .next).
#    robocopy: /E subcarpetas incl. vacías, /COPY:DAT, /XD excluir dirs.
Write-Host "Copiando proyecto (sin node_modules ni .next)…"
robocopy $origen $Destino /E /XD node_modules .next /NFL /NDL /NJH /NP | Out-Null
$rc = $LASTEXITCODE
# robocopy: códigos 0-7 son éxito; >=8 es error real.
if ($rc -ge 8) { Write-Error "robocopy falló (código $rc)."; exit $rc }

# 3) Verificar integridad de git en el destino.
Write-Host "`nVerificando git en el destino…"
Push-Location $Destino
git rev-parse HEAD
git status --short
git fsck --no-progress 2>$null
Pop-Location

Write-Host ""
Write-Host "✓ Copia lista en: $Destino" -ForegroundColor Green
Write-Host ""
Write-Host "SIGUIENTE:" -ForegroundColor Cyan
Write-Host "  1) Reinicia OneDrive si quieres (o déjalo; ya no es necesario para el repo)."
Write-Host "  2) cd `"$Destino`"  &&  npm install   (regenera node_modules)"
Write-Host "  3) Abre VS Code en la ruta nueva y confirma que todo funciona."
Write-Host "  4) Cuando estés seguro, BORRA a mano la carpeta vieja dentro de OneDrive."
Write-Host "  5) Actualiza el acceso directo / 'Open recent' del editor."
