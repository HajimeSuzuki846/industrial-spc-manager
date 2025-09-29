const axios = require('axios');

// InfluxDB設定
const influxConfig = {
  url: 'https://glicocmms-assets-manager.com/influxdb',
  token: 'apiv3__kR4jUbuoyhT-8q7YEqa0-sLurtA60_kqTloph-7o10Njd3Yx_RZrhEkjL5AcF6Mh-cG8jcacJP-MuEXkaXdbg',
  org: 'glico',
  bucket: 'telemetry'
};

// EAV形式のテストデータ
const testDataPoints = [
  {
    measurement: 'sensor_data',
    tags: {
      sensor_id: 'test-sensor-1',
      key: 'temperature'
    },
    fields: {
      value: 25.5
    }
  },
  {
    measurement: 'sensor_data',
    tags: {
      sensor_id: 'test-sensor-1',
      key: 'humidity'
    },
    fields: {
      value: 60.2
    }
  },
  {
    measurement: 'sensor_data',
    tags: {
      sensor_id: 'test-sensor-1',
      key: 'pressure'
    },
    fields: {
      value: 1013.25
    }
  }
];

async function testEAVWrite() {
  try {
    console.log('Testing EAV format write to InfluxDB...');
    
    // Line Protocol形式でデータを作成
    const timestamp = Math.trunc(Date.now() * 1e6); // ナノ秒
    const lines = testDataPoints.map(point => {
      let line = `${point.measurement}`;
      
      // タグを追加
      if (point.tags) {
        const tagPairs = Object.entries(point.tags)
          .filter(([_, value]) => value !== undefined && value !== null && value !== '')
          .map(([key, value]) => `${key}=${String(value).replace(/[\,\s]/g, '\\$&')}`);
        if (tagPairs.length > 0) {
          line += `,${tagPairs.join(',')}`;
        }
      }
      
      line += ' ';
      
      // フィールドを追加
      if (point.fields) {
        const fieldPairs = Object.entries(point.fields)
          .filter(([_, value]) => value !== undefined && value !== null)
          .map(([key, value]) => {
            if (typeof value === 'number') {
              return `${key}=${value}`;
            } else if (typeof value === 'boolean') {
              return `${key}=${value}`;
            } else if (typeof value === 'string') {
              const numValue = parseFloat(value);
              if (!isNaN(numValue) && value.trim() !== '') {
                return `${key}=${numValue}`;
              }
              return `${key}="${String(value).replace(/"/g, '\\"')}"`;
              } else {
                return `${key}=${value}`;
              }
            });
          line += fieldPairs.join(',');
        }
        
        line += ` ${timestamp}`;
        return line;
      });

    const payload = lines.join('\n');
    console.log('Line Protocol payload:');
    console.log(payload);
    
    // InfluxDBに書き込み
    const response = await axios.post(`${influxConfig.url}/api/v3/write_lp`, payload, {
      params: {
        db: influxConfig.bucket,
        precision: 'nanosecond'
      },
      headers: {
        'Authorization': `Bearer ${influxConfig.token}`,
        'Content-Type': 'text/plain'
      }
    });
    
    console.log('Successfully wrote EAV data to InfluxDB!');
    console.log('Response status:', response.status);
    
  } catch (error) {
    console.error('Error writing EAV data to InfluxDB:', error.response?.data || error.message);
  }
}

testEAVWrite();
