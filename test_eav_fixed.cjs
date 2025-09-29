const https = require('https');

// InfluxDB設定
const config = {
  hostname: 'glicocmms-assets-manager.com',
  port: 443,
  path: '/influxdb/api/v3/write_lp?db=telemetry&precision=nanosecond',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer apiv3__kR4jUbuoyhT-8q7YEqa0-sLurtA60_kqTloph-7o10Njd3Yx_RZrhEkjL5AcF6Mh-cG8jcacJP-MuEXkaXdbg',
    'Content-Type': 'text/plain'
  }
};

// EAV形式のテストデータ（Line Protocol）
const timestamp = Math.trunc(Date.now() * 1e6); // ナノ秒
const testData = `sensor_data,sensor_id=test-sensor-1,key=temperature value=25.5 ${timestamp}
sensor_data,sensor_id=test-sensor-1,key=humidity value=60.2 ${timestamp}
sensor_data,sensor_id=test-sensor-1,key=pressure value=1013.25 ${timestamp}`;

console.log('Testing EAV format write to InfluxDB...');
console.log('Line Protocol data:');
console.log(testData);

const req = https.request(config, (res) => {
  console.log('Response status:', res.statusCode);
  console.log('Response headers:', res.headers);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response body:', data);
    if (res.statusCode === 200 || res.statusCode === 204) {
      console.log('✅ EAV data successfully written to InfluxDB!');
    } else {
      console.log('❌ Failed to write EAV data to InfluxDB');
    }
  });
});

req.on('error', (error) => {
  console.error('Request error:', error);
});

console.log('Request URL:', `https://${config.hostname}${config.path}`);

req.write(testData);
req.end();
