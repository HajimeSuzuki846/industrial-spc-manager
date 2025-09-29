const db = require('./database');
const mqtt = require('mqtt');

// データベース接続テスト
async function testDatabaseConnection() {
  console.log('=== データベース接続テスト ===');
  
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'asset_manager',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || ''
  };
  
  console.log('接続設定:', {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password ? '***' : 'empty'
  });
  
  try {
    await db.createPool(config);
    console.log('✅ データベース接続成功');
    
    await db.initializeDatabase();
    console.log('✅ データベース初期化成功');
    
    await db.closePool();
    console.log('✅ データベース接続終了');
  } catch (error) {
    console.error('❌ データベース接続エラー:', error.message);
  }
}

// MQTT接続テスト
function testMQTTConnection() {
  console.log('\n=== MQTT接続テスト ===');
  
  // テスト用の設定（実際の設定に合わせて変更してください）
  const config = {
    broker: 'localhost',
    port: 1883,
    clientId: 'test-client-' + Date.now()
  };
  
  console.log('接続設定:', config);
  
  const url = `mqtt://${config.broker}:${config.port}`;
  console.log('接続URL:', url);
  
  const client = mqtt.connect(url, {
    clientId: config.clientId,
    clean: true,
    connectTimeout: 5000,
    reconnectPeriod: 0
  });
  
  client.on('connect', () => {
    console.log('✅ MQTT接続成功');
    client.end();
  });
  
  client.on('error', (error) => {
    console.error('❌ MQTT接続エラー:', error.message);
  });
  
  client.on('close', () => {
    console.log('✅ MQTT接続終了');
  });
  
  // 5秒後にタイムアウト
  setTimeout(() => {
    if (!client.disconnected) {
      console.log('❌ MQTT接続タイムアウト');
      client.end();
    }
  }, 5000);
}

// メイン実行
async function main() {
  console.log('接続テストを開始します...\n');
  
  await testDatabaseConnection();
  testMQTTConnection();
  
  console.log('\nテスト完了');
}

// スクリプトが直接実行された場合のみテストを実行
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  testDatabaseConnection,
  testMQTTConnection
};
