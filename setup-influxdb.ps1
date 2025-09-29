# InfluxDB Setup Script for Industrial Asset Alert Management
# This script sets up InfluxDB with the specified credentials

Write-Host "Setting up InfluxDB for Industrial Asset Alert Management..." -ForegroundColor Green
Write-Host "Username: admin" -ForegroundColor Yellow
Write-Host "Password: Glico2030" -ForegroundColor Yellow
Write-Host "Organization: glico" -ForegroundColor Yellow
Write-Host "Bucket: telemetry" -ForegroundColor Yellow
Write-Host "Token: SuperSecretToken" -ForegroundColor Yellow
Write-Host ""

# Check if Docker is installed
try {
    docker --version | Out-Null
} catch {
    Write-Host "Error: Docker is not installed or not in PATH. Please install Docker Desktop first." -ForegroundColor Red
    exit 1
}

# Check if InfluxDB container already exists
$existingContainer = docker ps -a --format "table {{.Names}}" | Select-String "influxdb"
if ($existingContainer) {
    Write-Host "InfluxDB container already exists. Stopping and removing..." -ForegroundColor Yellow
    docker stop influxdb
    docker rm influxdb
}

Write-Host "Starting InfluxDB with specified configuration..." -ForegroundColor Green
docker run -d `
  --name influxdb `
  -p 8086:8086 `
  -e DOCKER_INFLUXDB_INIT_MODE=setup `
  -e DOCKER_INFLUXDB_INIT_USERNAME=admin `
  -e DOCKER_INFLUXDB_INIT_PASSWORD=Glico2030 `
  -e DOCKER_INFLUXDB_INIT_ORG=glico `
  -e DOCKER_INFLUXDB_INIT_BUCKET=telemetry `
  -e DOCKER_INFLUXDB_INIT_ADMIN_TOKEN=SuperSecretToken `
  influxdb:2.7

# Wait for InfluxDB to start
Write-Host "Waiting for InfluxDB to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Check if container is running
$runningContainer = docker ps --format "table {{.Names}}" | Select-String "influxdb"
if ($runningContainer) {
    Write-Host "✅ InfluxDB is running successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Configuration Details:" -ForegroundColor Cyan
    Write-Host "URL: http://localhost:8086" -ForegroundColor White
    Write-Host "Username: admin" -ForegroundColor White
    Write-Host "Password: Glico2030" -ForegroundColor White
    Write-Host "Organization: glico" -ForegroundColor White
    Write-Host "Bucket: telemetry" -ForegroundColor White
    Write-Host "Token: SuperSecretToken" -ForegroundColor White
    Write-Host ""
    Write-Host "You can now access InfluxDB at: http://localhost:8086" -ForegroundColor Green
    Write-Host "Use the credentials above to log in." -ForegroundColor Green
} else {
    Write-Host "❌ Failed to start InfluxDB. Please check the logs:" -ForegroundColor Red
    docker logs influxdb
    exit 1
}
