# バックエンドサーバー再起動スクリプト
param(
    [switch]$Force,
    [switch]$Auto
)

Write-Host "Backend Server Restart Script" -ForegroundColor Green
Write-Host "=============================" -ForegroundColor Green

# 現在のディレクトリを取得
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

# 自動再起動モードの場合の処理
if ($Auto) {
    Write-Host "Auto restart mode enabled" -ForegroundColor Cyan
}

# Node.jsプロセスを確認
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
$backendProcesses = $nodeProcesses | Where-Object { $_.ProcessName -eq "node" }

if ($backendProcesses) {
    Write-Host "Found running Node.js processes:" -ForegroundColor Yellow
    $backendProcesses | ForEach-Object {
        Write-Host "  PID: $($_.Id), Process: $($_.ProcessName)" -ForegroundColor Yellow
    }
    
    if ($Force) {
        Write-Host "Force stopping all Node.js processes..." -ForegroundColor Red
        $backendProcesses | Stop-Process -Force
        Start-Sleep -Seconds 2
    } else {
        Write-Host "Stopping Node.js processes gracefully..." -ForegroundColor Yellow
        $backendProcesses | Stop-Process
        Start-Sleep -Seconds 3
    }
} else {
    Write-Host "No running Node.js processes found." -ForegroundColor Green
}

# ポート3001が使用中かチェック
$portInUse = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
if ($portInUse) {
    Write-Host "Port 3001 is still in use. Waiting for release..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
}

# サーバーを起動
Write-Host "Starting backend server..." -ForegroundColor Green
try {
    $process = Start-Process -FilePath "node" -ArgumentList "server.js" -NoNewWindow -PassThru
    Write-Host "Backend server started with PID: $($process.Id)" -ForegroundColor Green
    Write-Host "Server should be available at: http://localhost:3001" -ForegroundColor Cyan
} catch {
    Write-Host "Failed to start backend server: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 起動確認
Write-Host "Waiting for server to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# ヘルスチェックを複数回試行
$maxAttempts = 10
$attempt = 0
$success = $false

while ($attempt -lt $maxAttempts -and -not $success) {
    $attempt++
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3001/api/start" -Method POST -TimeoutSec 5
        if ($response.StatusCode -eq 200) {
            Write-Host "Backend server is running successfully!" -ForegroundColor Green
            $success = $true
        } else {
            Write-Host "Health check attempt $attempt/$maxAttempts failed (Status: $($response.StatusCode))" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "Health check attempt $attempt/$maxAttempts failed, waiting..." -ForegroundColor Yellow
        Start-Sleep -Seconds 2
    }
}

if (-not $success) {
    Write-Host "Health check failed after $maxAttempts attempts, but server might still be starting..." -ForegroundColor Yellow
    Write-Host "Please check manually: http://localhost:3001" -ForegroundColor Cyan
}

# 自動再起動モードの場合は成功メッセージを返す
if ($Auto) {
    Write-Host "Auto restart completed" -ForegroundColor Green
}
