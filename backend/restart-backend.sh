#!/bin/bash

# バックエンドサーバー再起動スクリプト (Linux/Unix)
echo "Backend Server Restart Script (Linux/Unix)"
echo "=========================================="

# スクリプトのディレクトリに移動
cd "$(dirname "$0")"

# Node.jsプロセスを確認して停止
echo "Checking for running Node.js processes..."

# ポート3001を使用しているプロセスを検索
PORT_PID=$(lsof -ti:3001 2>/dev/null)

if [ ! -z "$PORT_PID" ]; then
    echo "Found process using port 3001: PID $PORT_PID"
    echo "Stopping process gracefully..."
    kill $PORT_PID
    
    # プロセスが停止するまで待機
    sleep 3
    
    # まだプロセスが残っている場合は強制終了
    if kill -0 $PORT_PID 2>/dev/null; then
        echo "Process still running, force killing..."
        kill -9 $PORT_PID
        sleep 2
    fi
else
    echo "No process found using port 3001"
fi

# その他のNode.jsプロセスも確認
NODE_PIDS=$(pgrep -f "node.*server.js" 2>/dev/null)

if [ ! -z "$NODE_PIDS" ]; then
    echo "Found other Node.js server processes: $NODE_PIDS"
    echo "Stopping them..."
    kill $NODE_PIDS
    sleep 3
    
    # 強制終了が必要な場合
    for pid in $NODE_PIDS; do
        if kill -0 $pid 2>/dev/null; then
            echo "Force killing process $pid"
            kill -9 $pid
        fi
    done
    sleep 2
fi

# ポートが解放されるまで待機
echo "Waiting for port 3001 to be released..."
for i in {1..10}; do
    if ! lsof -i:3001 >/dev/null 2>&1; then
        echo "Port 3001 is now available"
        break
    fi
    echo "Port still in use, waiting... ($i/10)"
    sleep 1
done

# サーバーを起動
echo "Starting backend server..."
nohup node server.js > server.log 2>&1 &
SERVER_PID=$!

echo "Backend server started with PID: $SERVER_PID"
echo "Server should be available at: http://localhost:3001"

# 起動確認
echo "Waiting for server to start..."
sleep 5

# ヘルスチェック
for i in {1..10}; do
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/start > /dev/null 2>&1; then
        echo "Backend server is running successfully!"
        exit 0
    fi
    echo "Health check attempt $i/10 failed, waiting..."
    sleep 2
done

echo "Health check failed, but server might still be starting..."
echo "Please check manually: http://localhost:3001"
echo "Check logs: tail -f server.log"
