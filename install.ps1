$NODE = "C:\Users\neung\AppData\Local\ms-playwright-go\1.57.0\node.exe"
$NPMCLI = "C:\Users\neung\AppData\Local\ms-playwright-go\1.57.0\node_modules\npm\bin\npm-cli.js"
$env:PATH = "C:\Users\neung\AppData\Local\ms-playwright-go\1.57.0;" + $env:PATH

if (Test-Path "node_modules") {
    Remove-Item "node_modules" -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host "Installing project dependencies..."
& $NODE $NPMCLI install
Write-Host "Installation complete. Starting server..."
& $NODE server.js
