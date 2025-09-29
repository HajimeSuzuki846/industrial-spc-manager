#!/bin/bash

# InfluxDB Setup Script for Industrial Asset Alert Management
# This script sets up InfluxDB with the specified credentials

echo "Setting up InfluxDB for Industrial Asset Alert Management..."
echo "Username: admin"
echo "Password: Glico2030"
echo "Organization: glico"
echo "Bucket: telemetry"
echo "Token: SuperSecretToken"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if InfluxDB container already exists
if docker ps -a --format "table {{.Names}}" | grep -q "influxdb"; then
    echo "InfluxDB container already exists. Stopping and removing..."
    docker stop influxdb
    docker rm influxdb
fi

echo "Starting InfluxDB with specified configuration..."
docker run -d \
  --name influxdb \
  -p 8086:8086 \
  -e DOCKER_INFLUXDB_INIT_MODE=setup \
  -e DOCKER_INFLUXDB_INIT_USERNAME=admin \
  -e DOCKER_INFLUXDB_INIT_PASSWORD=Glico2030 \
  -e DOCKER_INFLUXDB_INIT_ORG=glico \
  -e DOCKER_INFLUXDB_INIT_BUCKET=telemetry \
  -e DOCKER_INFLUXDB_INIT_ADMIN_TOKEN=SuperSecretToken \
  influxdb:2.7

# Wait for InfluxDB to start
echo "Waiting for InfluxDB to start..."
sleep 10

# Check if container is running
if docker ps --format "table {{.Names}}" | grep -q "influxdb"; then
    echo "✅ InfluxDB is running successfully!"
    echo ""
    echo "Configuration Details:"
    echo "URL: http://localhost:8086"
    echo "Username: admin"
    echo "Password: Glico2030"
    echo "Organization: glico"
    echo "Bucket: telemetry"
    echo "Token: SuperSecretToken"
    echo ""
    echo "You can now access InfluxDB at: http://localhost:8086"
    echo "Use the credentials above to log in."
else
    echo "❌ Failed to start InfluxDB. Please check the logs:"
    docker logs influxdb
    exit 1
fi
