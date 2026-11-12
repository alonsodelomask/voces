# Sube a EAS (expo.dev) las tres variables PÚBLICAS que necesita la app al compilarse:
#   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY y VITE_API_URL
# Las lee de ..\.env.local (no se suben a Git). Hazlo una vez, después de `npx eas-cli@latest login` e `init`.
#
#   cd "C:\Users\Alonso de Lomas\Desktop\Voces\movil"
#   powershell -ExecutionPolicy Bypass -File .\configurar-eas.ps1

$ErrorActionPreference = 'Stop'
$envFile = Join-Path $PSScriptRoot '..\.env.local'
if (-not (Test-Path $envFile)) { throw "No encuentro $envFile (copia ..\.env.example a ..\.env.local y rellénalo)." }

$vars = @{}
foreach ($line in Get-Content $envFile) {
  if ($line -match '^\s*(VITE_[A-Z_]+)\s*=\s*(.+?)\s*$') { $vars[$Matches[1]] = $Matches[2] }
}
foreach ($name in 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_API_URL') {
  if (-not $vars.ContainsKey($name)) { throw "Falta $name en .env.local" }
}

foreach ($environment in 'preview', 'production') {
  foreach ($name in 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_API_URL') {
    Write-Host "[$environment] $name"
    npx eas-cli@latest env:create --environment $environment --name $name --value $vars[$name] --visibility plaintext --force --non-interactive
  }
}
Write-Host "Listo. Ya puedes compilar: npx eas-cli@latest build -p ios --profile preview"
