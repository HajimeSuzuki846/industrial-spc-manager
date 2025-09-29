const influxDBManager = require('./influxdb');

async function testInfluxDBConnection() {
  console.log('=== InfluxDB Connection Test ===');
  
  const config = {
    url: 'http://localhost:8086',
    token: 'SuperSecretToken',
    org: 'glico',
    bucket: 'telemetry'
  };
  
  console.log('Testing with config:', {
    url: config.url,
    org: config.org,
    bucket: config.bucket,
    hasToken: !!config.token
  });
  
  try {
    const result = await influxDBManager.connect(config);
    
    if (result.success) {
      console.log('✅ InfluxDB connection successful');
      
      // Test connection status
      const status = influxDBManager.getConnectionStatus();
      console.log('Connection status:', status);
      
      // Test ping
      const testResult = await influxDBManager.testConnection();
      console.log('Ping test result:', testResult);
      
    } else {
      console.log('❌ InfluxDB connection failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the test
testInfluxDBConnection().then(() => {
  console.log('Test completed');
  process.exit(0);
}).catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
