# Convenience launcher for this workstation. Uses a modern Node without changing the system PATH permanently.
$eventNode = 'C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if (!(Test-Path -LiteralPath $eventNode)) { $eventNode = (Get-Command node -ErrorAction Stop).Source }
Push-Location $PSScriptRoot
try { & $eventNode node_modules/vite/bin/vite.js --host 127.0.0.1 } finally { Pop-Location }
