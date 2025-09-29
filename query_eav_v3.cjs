const https = require('https');

// InfluxDB v3設定
const config = {
  hostname: 'glicocmms-assets-manager.com',
  port: 443,
  path: '/influxdb/api/v3/query?db=telemetry',
  method: 'POST',
  headers: {
    'Authorization': 'Bearer apiv3__kR4jUbuoyhT-8q7YEqa0-sLurtA60_kqTloph-7o10Njd3Yx_RZrhEkjL5AcF6Mh-cG8jcacJP-MuEXkaXdbg',
    'Content-Type': 'application/json'
  }
};

// EAV形式のデータをクエリ
const queryData = JSON.stringify({
  query: 'SELECT * FROM sensor_data WHERE sensor_id = \'test-sensor-1\' ORDER BY time DESC LIMIT 10'
});

console.log('Querying EAV data from InfluxDB v3...');
console.log('Query:', queryData);

const req = https.request(config, (res) => {
  console.log('Response status:', res.statusCode);
  console.log('Response headers:', res.headers);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response body:', data);
    try {
      const result = JSON.parse(data);
      console.log('Parsed result:', JSON.stringify(result, null, 2));
    } catch (e) {
      console.log('Could not parse JSON response');
    }
  });
});

req.on('error', (error) => {
  console.error('Request error:', error);
});

req.write(queryData);
req.end();
