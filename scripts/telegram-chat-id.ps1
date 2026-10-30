$botSecret = Read-Host 'Token del bot de Telegram (entrada oculta)' -AsSecureString
$botToken = [System.Net.NetworkCredential]::new('', $botSecret).Password
try {
  $botUpdates = Invoke-RestMethod -Method Get -Uri ('https://api.telegram.org/bot' + $botToken + '/getUpdates') -ErrorAction Stop
  $botUpdates.result | ForEach-Object { if ($_.message.chat) { $_.message.chat | Select-Object id, title, type } } | Sort-Object id -Unique
} catch { Write-Host 'No se pudo consultar. Revisa el token, la conexion y si el bot usa un webhook. No se modifico ninguna configuracion.' }
finally { $botToken = $null; $botSecret.Dispose() }
