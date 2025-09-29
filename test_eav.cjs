const mqtt = require('mqtt');

// MQTT接続設定
const mqttConfig = {
  host: 'localhost',
  port: 1883,
  clientId: 'test-eav-client'
};

// テストメッセージ
const testMessages = [
  {
    topic: 'factory/line1/sensor1',
    message: JSON.stringify({
      temperature: 25.5,
      humidity: 60.2,
      pressure: 1013.25,
      status: 'active'
    })
  },
  {
    topic: 'factory/line2/sensor2', 
    message: JSON.stringify({
      voltage: 12.3,
      current: 2.1,
      power: 25.8
    })
  }
];

async function testEAVFormat() {
  console.log('Starting EAV format test...');
  
  // MQTTクライアントに接続
  const client = mqtt.connect(mqttConfig);
  
  client.on('connect', () => {
    console.log('Connected to MQTT broker');
    
    // テストメッセージを送信
    testMessages.forEach((msg, index) => {
      setTimeout(() => {
        console.log(`Sending test message ${index + 1}:`, msg);
        client.publish(msg.topic, msg.message);
      }, index * 2000); // 2秒間隔で送信
    });
    
    // 10秒後に終了
    setTimeout(() => {
      console.log('Test completed. Check InfluxDB for EAV format data.');
      client.end();
      process.exit(0);
    }, 10000);
  });
  
  client.on('error', (err) => {
    console.error('MQTT connection error:', err);
    process.exit(1);
  });
}

testEAVFormat().catch(console.error);
