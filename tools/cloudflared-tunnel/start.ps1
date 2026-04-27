param(
  [string]$LocalUrl = "http://127.0.0.1:8787"
)

$ErrorActionPreference = "Stop"

$ToolDir = Join-Path $PSScriptRoot "bin"
$CloudflaredPath = Join-Path $ToolDir "cloudflared.exe"
$DownloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"

if (-not (Test-Path $ToolDir)) {
  New-Item -ItemType Directory -Path $ToolDir | Out-Null
}

if (-not (Test-Path $CloudflaredPath)) {
  Write-Host "cloudflared.exe not found. Downloading..."
  Invoke-WebRequest -Uri $DownloadUrl -OutFile $CloudflaredPath
}

Write-Host ""
Write-Host "Starting Cloudflare tunnel for $LocalUrl"
Write-Host "Copy the generated https://*.trycloudflare.com URL into the app:"
Write-Host "我的 -> 后端地址设置 -> 当前服务器地址 -> 保存地址 -> 测试连接"
Write-Host ""

& $CloudflaredPath tunnel --url $LocalUrl
