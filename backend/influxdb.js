const axios = require('axios');
const { getAssetByTopic, hasAssetForTopic } = require('./database');
require('dotenv').config();

class InfluxDBManager {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.config = null;
    this.useV3 = false;
    this.recentMessageCache = new Map();
  }

  // v3 SQLクエリ実行のフォールバック実装
  async postV3Sql(query) {
    if (!this.config) throw new Error('InfluxDB config missing');
    const base = this.config.url;
    const db = this.config.bucket;
    const token = this.config.token || '';
    const bearerHeaders = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
    const tokenHeaders = token ? { Authorization: `Token ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };

    // 接続情報の概要をログ (トークンは一部のみ)
    try {
      const tokenPreview = token ? `${token.slice(0, 6)}...(${token.length})` : 'none';
      console.log('[Influx v3] Config summary', {
        url: base,
        database: db,
        org: this.config.org,
        hasToken: !!token,
        tokenPreview,
        connected: this.isConnected
      });
      const qPreview = typeof query === 'string' ? query.slice(0, 200) : '';
      console.log('[Influx v3] Query preview', qPreview);
    } catch(_) {}

    const attempts = [
      //{ url: `${base}/api/v3/query/sql?database=${encodeURIComponent(db)}`, body: { q: query }, headers: bearerHeaders, label: 'sql?database= (Bearer) q' },
      //{ url: `${base}/api/v3/query/sql?database=${encodeURIComponent(db)}`, body: { q: query }, headers: tokenHeaders, label: 'sql?database= (Token) q' },
      //{ url: `${base}/api/v3/query/sql?db=${encodeURIComponent(db)}`, body: { q: query }, headers: bearerHeaders, label: 'sql?db= (Bearer) q' },
      //{ url: `${base}/api/v3/query/sql?db=${encodeURIComponent(db)}`, body: { q: query }, headers: tokenHeaders, label: 'sql?db= (Token) q' },
      //{ url: `${base}/api/v3/query?database=${encodeURIComponent(db)}`, body: { query }, headers: bearerHeaders, label: 'query?database= (Bearer) query' },
      //{ url: `${base}/api/v3/query?database=${encodeURIComponent(db)}`, body: { query }, headers: tokenHeaders, label: 'query?database= (Token) query' },
      //{ url: `${base}/api/v3/query`, body: { query, database: db }, headers: bearerHeaders, label: 'query (Bearer) {query,database}' },
      //{ url: `${base}/api/v3/query`, body: { query, database: db }, headers: tokenHeaders, label: 'query (Token) {query,database}' },
      // Additional widely used variants
      //{ url: `${base}/api/v3/sql?database=${encodeURIComponent(db)}`, body: { q: query }, headers: bearerHeaders, label: 'sql (Bearer) q' },
      //{ url: `${base}/api/v3/sql?database=${encodeURIComponent(db)}`, body: { sql: query }, headers: bearerHeaders, label: 'sql (Bearer) sql' },
      //{ url: `${base}/api/v3/sql?database=${encodeURIComponent(db)}`, body: { q: query }, headers: tokenHeaders, label: 'sql (Token) q' },
      //{ url: `${base}/api/v3/sql?database=${encodeURIComponent(db)}`, body: { sql: query }, headers: tokenHeaders, label: 'sql (Token) sql' },
      //{ url: `${base}/api/v3/sql`, body: { database: db, q: query }, headers: bearerHeaders, label: 'sql POST body (Bearer) {database,q}' },
      //{ url: `${base}/api/v3/sql`, body: { database: db, sql: query }, headers: bearerHeaders, label: 'sql POST body (Bearer) {database,sql}' },
      //{ url: `${base}/api/v3/sql`, body: { database: db, q: query }, headers: tokenHeaders, label: 'sql POST body (Token) {database,q}' },
      //{ url: `${base}/api/v3/sql`, body: { database: db, sql: query }, headers: tokenHeaders, label: 'sql POST body (Token) {database,sql}' },
      // Variant shown in provided spec: /api/v3/query_sql with { db, q }
      { url: `${base}/api/v3/query_sql`, body: { db, q: query }, headers: bearerHeaders, label: 'query_sql (Bearer) {db,q}' },
      { url: `${base}/api/v3/query_sql`, body: { db, q: query }, headers: tokenHeaders, label: 'query_sql (Token) {db,q}' },
    ];

    let lastError = null;
    const debugAttempts = [];
    for (const attempt of attempts) {
      try {
        console.log('[Influx v3] Attempt', attempt.label, attempt.url);
        const resp = await axios.post(attempt.url, attempt.body, { headers: attempt.headers });
        console.log('[Influx v3] Success', { status: resp.status, hasResults: !!resp.data });
        return resp;
      } catch (e) {
        const status = e?.response?.status;
        const data = e?.response?.data;
        const entry = {
          label: attempt.label,
          url: attempt.url,
          status,
          data: typeof data === 'string' ? data : JSON.stringify(data)
        };
        console.warn('[Influx v3] Attempt failed', entry);
        debugAttempts.push(entry);
        lastError = e;
        // 401/403の時は両スキーム試すので次へ、404もフォールバック継続
        continue;
      }
    }
    if (lastError) {
      try {
        console.error('[Influx v3] All attempts failed. Summary:', JSON.stringify(debugAttempts, null, 2));
      } catch(_) {}
      const enriched = new Error(lastError.message || 'postV3Sql failed');
      enriched.attempts = debugAttempts;
      throw enriched;
    }
    const unknown = new Error('Unknown error in postV3Sql');
    unknown.attempts = debugAttempts;
    throw unknown;
  }

  // URLを本番環境用に変換する関数
  transformUrlForEnvironment(url) {
    // 本番環境では、localhostを実際のドメインに変換
    if (process.env.NODE_ENV === 'production' && url.includes('localhost')) {
      // 環境変数からドメインを取得、またはデフォルトを使用
      const domain = process.env.DOMAIN || 'your-domain.com';
      return url.replace('localhost', domain);
    }
    return url;
  }

  // InfluxDB接続設定
  async connect(config) {
    try {
      console.log('=== InfluxDB Connection Attempt ===');
      console.log('Config:', {
        url: config.url,
        token: config.token ? '***' : 'empty',
        org: config.org,
        bucket: config.bucket
      });

      // URL接続可能性の事前チェック
      if (!config.url) {
        throw new Error('InfluxDB URL is not configured');
      }

      this.config = config;
      
      // 基本的な接続テスト（非致命）
      console.log('Testing InfluxDB health (non-fatal)...');
      try {
        // 1st: Bearer
        let healthHeaders = {};
        if (config.token) {
          healthHeaders['Authorization'] = `Bearer ${config.token}`;
        }
        try {
          const healthResponse = await axios.get(`${config.url}/health`, { headers: healthHeaders });
          console.log('InfluxDB health check result:', healthResponse.status);
        } catch (h1) {
          // 2nd: no auth
          try {
            const healthResponse = await axios.get(`${config.url}/health`);
            console.log('InfluxDB health check (no auth) result:', healthResponse.status);
          } catch (h2) {
            console.log('Health check failed (continuing):', h2?.message || h2);
          }
        }
      } catch (healthErrorOuter) {
        console.log('Health check unexpected error (continuing):', healthErrorOuter?.message || healthErrorOuter);
      }
      
      // v3 (IOx) データベースのみで検証
      console.log('Checking databases via v3 API...');
      const databaseName = config.bucket; // フロントからは database を bucket に詰めて送っている
      let databases = [];
      let lastAuthError = null;
      // Try Bearer first
      try {
        const bearerHeaders = config.token ? { Authorization: `Bearer ${config.token}` } : {};
        const respBearer = await axios.get(`${config.url}/api/v3/configure/database?format=json`, { headers: bearerHeaders });
        databases = Array.isArray(respBearer.data) ? respBearer.data.map(d => d['iox::database']).filter(Boolean) : [];
      } catch (eBearer) {
        // If unauthorized, try Token scheme
        if (eBearer?.response?.status === 401 || eBearer?.response?.status === 403) {
          lastAuthError = eBearer;
          try {
            const tokenHeaders = config.token ? { Authorization: `Token ${config.token}` } : {};
            const respToken = await axios.get(`${config.url}/api/v3/configure/database?format=json`, { headers: tokenHeaders });
            databases = Array.isArray(respToken.data) ? respToken.data.map(d => d['iox::database']).filter(Boolean) : [];
            lastAuthError = null;
          } catch (eToken) {
            lastAuthError = eToken;
          }
        } else {
          throw eBearer;
        }
      }

      if ((databases?.length ?? 0) === 0 && lastAuthError && (lastAuthError.response?.status === 401 || lastAuthError.response?.status === 403)) {
        return { success: false, error: '認証エラー: トークンが無効、または権限が不足しています' };
      }

      const dbExists = !!databaseName && databases.includes(databaseName);
      console.log(`Database "${databaseName}" exists (v3):`, dbExists);
      if (!dbExists) {
        return { success: false, error: `データベース "${databaseName}" が見つかりません` };
      }

      this.useV3 = true;
      this.isConnected = true;
      console.log('=== InfluxDB connected successfully ===');
      return { success: true };
    } catch (error) {
      console.error('=== InfluxDB connection failed ===');
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      this.isConnected = false;
      
      // より詳細なエラー情報を提供
      let errorMessage = error.message;
      if (error.code === 'ECONNREFUSED') {
        errorMessage = `InfluxDBサーバーに接続できません (${config.url})。サーバーが起動しているか確認してください。`;
        console.error('Connection refused - InfluxDB server may not be running at:', config.url);
      } else if (error.code === 'ENOTFOUND') {
        errorMessage = `InfluxDBのURLが無効です (${config.url})。正しいURLを入力してください。`;
        console.error('Host not found - check InfluxDB URL:', config.url);
      } else if (error.message.includes('unauthorized')) {
        errorMessage = '認証に失敗しました。APIトークンが正しいか確認してください。';
        console.error('Authentication failed - check API token');
      } else if (error.message.includes('not found')) {
        errorMessage = '指定された組織またはバケットが見つかりません。';
        console.error('Organization or bucket not found');
      } else if (error.message.includes('timeout')) {
        errorMessage = '接続がタイムアウトしました。ネットワーク接続を確認してください。';
        console.error('Connection timeout - check network');
      }
      
      return { success: false, error: errorMessage };
    }
  }

  // バケット作成
  async createBucket(bucketName, org) {
    try {
      const response = await axios.post(`${this.config.url}/api/v2/buckets`, {
        name: bucketName,
        org: org
      }, {
        headers: {
          'Authorization': `Token ${this.config.token}`,
          'Content-Type': 'application/json'
        }
      });
      console.log(`Bucket "${bucketName}" created successfully`);
    } catch (error) {
      console.error('Failed to create bucket:', error);
      throw error;
    }
  }

  // データポイントを書き込み
  async writePoint(measurement, tags, fields, timestamp = new Date(), databaseOverride = null) {
    if (!this.isConnected || !this.config) {
      console.warn('InfluxDB not connected, skipping data write');
      return { success: false, error: 'InfluxDB not connected' };
    }

    try {
      // InfluxDB Line Protocol形式でデータを作成
      let line = `${measurement}`;
      
      // タグを追加
      if (tags) {
        const tagPairs = Object.entries(tags)
          .filter(([_, value]) => value !== undefined && value !== null && value !== '')
          .map(([key, value]) => `${key}=${String(value).replace(/[\,\s]/g, '\\$&')}`);
        if (tagPairs.length > 0) {
          line += `,${tagPairs.join(',')}`;
        }
      }
      
      line += ' ';
      
      // フィールドを追加
      if (fields) {
        const fieldPairs = Object.entries(fields)
          .filter(([_, value]) => value !== undefined && value !== null)
          .map(([key, value]) => {
            // 数値の場合は数値として扱う
            if (typeof value === 'number') {
              return `${key}=${value}`;
            } else if (typeof value === 'boolean') {
              return `${key}=${value}`;
            } else if (typeof value === 'string') {
              // 数値に変換できる文字列の場合は数値として扱う
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
      
      // タイムスタンプを追加（ns精度、整数）
      let ns;
      if (typeof timestamp === 'number') {
        ns = Math.trunc(timestamp);
      } else if (timestamp instanceof Date) {
        ns = Math.trunc(timestamp.getTime() * 1e6);
      } else {
        ns = Math.trunc(Date.now() * 1e6);
      }
      line += ` ${ns}`; // ナノ秒単位

      // データを書き込み（v3 API）
      await axios.post(`${this.config.url}/api/v3/write_lp`, line, {
        params: {
          db: databaseOverride || this.config.bucket,
          precision: 'nanosecond'
        },
        headers: {
          'Authorization': `Bearer ${this.config.token}`,
          'Content-Type': 'text/plain'
        }
      });
      
      console.log(`Data written to InfluxDB: ${measurement}`, { tags, fields, db: databaseOverride || this.config.bucket });
      console.log(`Line Protocol: ${line}`);
      return { success: true };
    } catch (error) {
      console.error('Failed to write data to InfluxDB:', error);
      return { success: false, error: error.message };
    }
  }


  // 複数のデータポイントを一度に書き込み（EAV形式用）
  async writeMultiplePoints(dataPoints, timestamp = new Date(), databaseOverride = null) {
    if (!this.isConnected || !this.config) {
      console.warn('InfluxDB not connected, skipping data write');
      return { success: false, error: 'InfluxDB not connected' };
    }

    try {
      // タイムスタンプを統一（ナノ秒精度）
      let ns;
      if (typeof timestamp === 'number') {
        ns = Math.trunc(timestamp);
      } else if (timestamp instanceof Date) {
        ns = Math.trunc(timestamp.getTime() * 1e6);
      } else {
        ns = Math.trunc(Date.now() * 1e6);
      }

      // 複数のLine Protocolを生成
      const lines = dataPoints.map(point => {
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
        
        line += ` ${ns}`;
        return line;
      });

      // 全てのラインを一度に送信
      const payload = lines.join('\n');
      
      await axios.post(`${this.config.url}/api/v3/write_lp`, payload, {
        params: {
          db: databaseOverride || this.config.bucket,
          precision: 'nanosecond'
        },
        headers: {
          'Authorization': `Bearer ${this.config.token}`,
          'Content-Type': 'text/plain'
        }
      });
      
      console.log(`Multiple data points written to InfluxDB (${dataPoints.length} points)`, { db: databaseOverride || this.config.bucket });
      console.log('Payload:', payload);
      return { success: true, pointsWritten: dataPoints.length };
    } catch (error) {
      console.error('Failed to write multiple data points to InfluxDB:', error);
      return { success: false, error: error.message };
    }
  }

  // MQTTメッセージをInfluxDBに保存（EAV形式）
  async saveMQTTMessage(topic, message, timestamp = new Date()) {
    try {
      // 短時間の重複排除（同一 topic + payload を1秒以内はスキップ）
      const nowMs = Date.now();
      const cacheKey = `${topic}|${message}`;
      const lastMs = this.recentMessageCache.get(cacheKey);
      if (typeof lastMs === 'number' && (nowMs - lastMs) <= 1000) {
        return { success: true, skipped: true };
      }
      this.recentMessageCache.set(cacheKey, nowMs);
      if (this.recentMessageCache.size > 1000) {
        const cutoff = nowMs - 2000;
        for (const [k, v] of this.recentMessageCache.entries()) {
          if (v < cutoff) this.recentMessageCache.delete(k);
        }
      }

      // メッセージをパース
      let parsedMessage;
      try {
        parsedMessage = JSON.parse(message);
      } catch (parseError) {
        // JSONでない場合は文字列として扱う
        parsedMessage = { value: message };
      }

      // データベースからAsset情報を取得
      let assetInfo = null;
      let measurement = 'sensor_data'; // EAV形式用のmeasurement名
      
      try {
        const hasAsset = await hasAssetForTopic(topic);
        
        if (hasAsset) {
          assetInfo = await getAssetByTopic(topic);
          if (!assetInfo) {
            console.warn(`Asset exists for topic ${topic} but failed to get details; skipping write`);
            return { success: false, error: 'Asset details not found for topic' };
          }
        } else {
          console.warn(`No asset mapping for topic ${topic}; skipping write`);
          return { success: false, error: 'No asset mapping for topic' };
        }
      } catch (dbError) {
        console.error('Failed to check asset info from database:', dbError);
        return { success: false, error: 'Database error while resolving asset for topic' };
      }

      // EAV形式のデータポイントを準備
      const dataPoints = [];
      const sensor_id = assetInfo.asset_id || 'unknown';

      if (typeof parsedMessage === 'object' && parsedMessage !== null) {
        // オブジェクトの場合は各プロパティを個別のデータポイントに変換
        Object.entries(parsedMessage).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            // 値の型に応じて適切にフォーマット
            let formattedValue = value;
            if (typeof value === 'string') {
              // 数値に変換できる文字列は数値として扱う
              const numValue = parseFloat(value);
              if (!isNaN(numValue) && value.trim() !== '') {
                formattedValue = numValue;
              }
            }

            dataPoints.push({
              measurement: measurement,
              tags: {
                sensor_id: sensor_id,
                key: key
              },
              fields: {
                value: formattedValue
              }
            });
          }
        });
      } else {
        // プリミティブ値の場合は単一のデータポイントを作成
        dataPoints.push({
          measurement: measurement,
          tags: {
            sensor_id: sensor_id,
            key: 'value'
          },
          fields: {
            value: parsedMessage
          }
        });
      }

      if (dataPoints.length === 0) {
        console.warn('No valid data points to write');
        return { success: false, error: 'No valid data points to write' };
      }

      // 複数のデータポイントを一度に書き込み
      const result = await this.writeMultiplePoints(dataPoints, timestamp);
      
      if (result.success) {
        console.log(`MQTT message saved as EAV format: ${topic} (${result.pointsWritten} data points)`);
        console.log('Data points:', dataPoints);
      }
      
      return result;
    } catch (error) {
      console.error('Failed to save MQTT message to InfluxDB (EAV):', error);
      return { success: false, error: error.message };
    }
  }


  // 接続状態を確認
  async testConnection() {
    if (!this.config) {
      return { connected: false, error: 'InfluxDB client not initialized' };
    }

    try {
      const response = await axios.get(`${this.config.url}/health`);
      return { connected: true };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }

  // 接続を切断
  disconnect() {
    this.client = null;
    this.isConnected = false;
    this.config = null;
    console.log('InfluxDB disconnected');
  }

  // 設定を取得
  getConfig() {
    return this.config;
  }

  // 接続状態を取得
  getConnectionStatus() {
    return {
      connected: this.isConnected,
      config: this.config ? {
        url: this.config.url,
        org: this.config.org,
        bucket: this.config.bucket,
        hasToken: !!this.config.token
      } : null
    };
  }

  // 接続テスト（軽量版）
  async testConnection() {
    if (!this.isConnected || !this.config) {
      return { success: false, error: 'Not connected' };
    }

    try {
      const response = await axios.get(`${this.config.url}/health`, {
        timeout: 5000,
        headers: this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {}
      });
      return { success: true, status: response.status };
    } catch (error) {
      return { 
        success: false, 
        error: error.message,
        code: error.code 
      };
    }
  }

  // データの一貫性を確認
  async checkDataConsistency() {
    try {
      console.log('=== Checking Data Consistency ===');
      
      if (!this.config) {
        return { success: false, error: 'InfluxDB client not initialized' };
      }

      // 全Assetのトピック一覧を取得
      const { getAllAssetTopics } = require('./database');
      const assetTopics = await getAllAssetTopics();
      
      console.log(`Found ${assetTopics.length} asset topics in database`);
      
      const results = [];
      
      for (const topic of assetTopics) {
        try {
          // 各トピックの最新データを確認
          const query = `
            from(bucket: "${this.config.bucket}")
              |> range(start: -1h)
              |> filter(fn: (r) => r["topic"] == "${topic}")
              |> last()
          `;
          
          const response = await axios.post(`${this.config.url}/api/v2/query`, {
            query: query,
            type: 'flux'
          }, {
            params: {
              org: this.config.org
            },
            headers: {
              'Authorization': `Token ${this.config.token}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (response.data && response.data.results && response.data.results[0].series) {
            const data = response.data.results[0].series[0];
            const tags = data.tags || {};
            
            results.push({
              topic: topic,
              hasData: true,
              factory: tags.factory || 'unknown',
              line: tags.line || 'unknown',
              sensor: tags.sensor || 'unknown',
              measurement: data.name || 'unknown'
            });
          } else {
            results.push({
              topic: topic,
              hasData: false,
              factory: 'unknown',
              line: 'unknown',
              sensor: 'unknown',
              measurement: 'unknown'
            });
          }
        } catch (error) {
          console.error(`Error checking topic ${topic}:`, error.message);
          results.push({
            topic: topic,
            hasData: false,
            error: error.message
          });
        }
      }
      
      return {
        success: true,
        totalTopics: assetTopics.length,
        results: results
      };
    } catch (error) {
      console.error('Failed to check data consistency:', error);
      return { success: false, error: error.message };
    }
  }

  // アセットの時系列データを取得（Zスコア計算用）
  async getAssetData(assetId, field = 'value', hours = 672) {
    if (!this.isConnected || !this.config) {
      console.warn('InfluxDB not connected, cannot get asset data');
      return { success: false, error: 'InfluxDB not connected' };
    }

    try {
      console.log(`Fetching data for asset ${assetId}, field: ${field}, hours: ${hours}`);

      // Fluxクエリを作成
      const query = `
        from(bucket: "${this.config.bucket}")
          |> range(start: -${hours}h)
          |> filter(fn: (r) => r["asset_id"] == "${assetId}")
          |> filter(fn: (r) => r["_field"] == "${field}")
          |> sort(columns: ["_time"])
      `;

      console.log('Executing Flux query:', query);

      const response = await axios.post(`${this.config.url}/api/v2/query`, {
        query: query,
        type: 'flux'
      }, {
        params: {
          org: this.config.org
        },
        headers: {
          'Authorization': `Token ${this.config.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data && response.data.results && response.data.results[0].series) {
        const data = response.data.results[0].series[0];
        const dataPoints = data.values.map(row => ({
          _time: row[0],
          _value: parseFloat(row[1]),
          asset_id: assetId
        }));

        console.log(`Retrieved ${dataPoints.length} data points for asset ${assetId}`);
        return { success: true, data: dataPoints };
      } else {
        console.log(`No data found for asset ${assetId}`);
        return { success: true, data: [] };
      }
    } catch (error) {
      console.error('Failed to get asset data from InfluxDB:', error);
      return { success: false, error: error.message };
    }
  }

  // InfluxDBの初期設定を確認
  async checkInfluxDBSetup() {
    try {
      console.log('=== Checking InfluxDB Setup ===');
      
      if (!this.config) {
        console.log('InfluxDB client not initialized, attempting to connect with default config...');
        
        // デフォルト設定で接続を試行
        const defaultConfig = {
          url: 'http://localhost:8086',
          token: 'SuperSecretToken',
          org: 'glico',
          bucket: 'telemetry'
        };
        
        const connectionResult = await this.connect(defaultConfig);
        if (!connectionResult.success) {
          return { success: false, error: 'Failed to connect to InfluxDB with default config' };
        }
      }

      // 組織一覧を取得
      console.log('Fetching organizations...');
      const orgsResponse = await axios.get(`${this.config.url}/api/v2/orgs`, {
        headers: {
          'Authorization': `Token ${this.config.token}`,
          'Content-Type': 'application/json'
        }
      });
      const orgs = orgsResponse.data.orgs || [];
      console.log('Available organizations:', orgs.map(org => ({ id: org.id, name: org.name })));

      // バケット一覧を取得
      console.log('Fetching buckets...');
      const bucketsResponse = await axios.get(`${this.config.url}/api/v2/buckets`, {
        headers: {
          'Authorization': `Token ${this.config.token}`,
          'Content-Type': 'application/json'
        }
      });
      const buckets = bucketsResponse.data.buckets || [];
      console.log('Available buckets:', buckets.map(bucket => ({ id: bucket.id, name: bucket.name, orgID: bucket.orgID })));

      // ユーザー一覧を取得
      console.log('Fetching users...');
      const usersResponse = await axios.get(`${this.config.url}/api/v2/users`, {
        headers: {
          'Authorization': `Token ${this.config.token}`,
          'Content-Type': 'application/json'
        }
      });
      const users = usersResponse.data.users || [];
      console.log('Available users:', users.map(user => ({ id: user.id, name: user.name })));

      return {
        success: true,
        organizations: orgs,
        buckets: buckets,
        users: users
      };
    } catch (error) {
      console.error('Failed to check InfluxDB setup:', error);
      return { success: false, error: error.message };
    }
  }

  // retag 機能は削除されました

  // InfluxDB 3用のアセットデータ取得（ログ強化版）
  async getAssetDataV3(sensorId, key = 'value', hours = 1) {
    console.log(`=== InfluxDB 3 Data Fetch Debug ===`);
    console.log(`Sensor ID: ${sensorId}`);
    console.log(`Key: ${key}`);
    console.log(`Hours: ${hours}`);
    console.log(`InfluxDB Connected: ${this.isConnected}`);
    console.log(`Config exists: ${!!this.config}`);
    
    if (!this.isConnected || !this.config) {
      console.warn('InfluxDB not connected, cannot get asset data');
      return { success: false, error: 'InfluxDB not connected' };
    }

    try {
      console.log(`Fetching data for sensor ${sensorId}, key: ${key}, hours: ${hours}`);

      // InfluxDB v3用のSQLクエリ
      const query = `SELECT time, value FROM sensor_data 
                     WHERE sensor_id='${sensorId}' AND key='${key}' 
                     AND time >= NOW() - INTERVAL '${hours}h' 
                     ORDER BY time`;

      console.log('Executing SQL query:', query);
      console.log(`InfluxDB URL: ${this.config.url}`);
      console.log(`Bucket: ${this.config.bucket}`);
      console.log(`Org: ${this.config.org}`);

      const response = await this.postV3Sql(query);

      console.log('InfluxDB Response Status:', response.status);
      try { console.log('InfluxDB Response Data (raw object):'); console.dir(response.data, { depth: null, maxArrayLength: null }); } catch(_) {}
      try { console.log('InfluxDB Response Data (JSON):', JSON.stringify(response.data, null, 2)); } catch(_) {}

      if (response.data && response.data.results && response.data.results[0].series) {
        const data = response.data.results[0].series[0];
        const dataPoints = data.values.map(row => ({
          _time: row[0],
          _value: parseFloat(row[1]),
          asset_id: sensorId
        }));

        console.log(`Retrieved ${dataPoints.length} data points for asset ${sensorId}`);
        return { success: true, data: dataPoints };
      } else if (response.data?.data) {
        // InfluxDB v3の新しいレスポンス形式に対応
        const dataPoints = response.data.data.map(row => ({
          _time: row.time,
          _value: parseFloat(row.value),
          asset_id: sensorId
        }));

        console.log(`Retrieved ${dataPoints.length} data points for asset ${sensorId} (v3 format)`);
        return { success: true, data: dataPoints };
      } else if (Array.isArray(response.data?.value)) {
        // サーバーが { value: [...] } 形式で返す場合に対応
        const dataPoints = response.data.value.map(row => ({
          _time: row.time,
          _value: parseFloat(row.value),
          asset_id: sensorId
        }));
        console.log(`Retrieved ${dataPoints.length} data points for asset ${sensorId} (value[] format)`);
        return { success: true, data: dataPoints };
      } else {
        console.log(`No data found for asset ${sensorId} with key ${key}`);
        console.log('Response structure:', {
          hasData: !!response.data,
          hasResults: !!(response.data && response.data.results),
          hasSeries: !!(response.data && response.data.results && response.data.results[0] && response.data.results[0].series),
          hasV3Data: !!(response.data && response.data.data),
          hasValueArray: Array.isArray(response.data?.value)
        });
        return { success: true, data: [] };
      }
    } catch (error) {
      console.error('Failed to get asset data from InfluxDB 3:', error?.message || error);
      console.error('Error details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        attempts: error.attempts
      });
      return { success: false, error: error.message };
    }
  }

  async getLatestValuesV3(sensorId, keys = [], hours = 1) {
    console.log('[AR] V3 begin', { sensorId, keys, hours, connected: this.isConnected, hasConfig: !!this.config });
    if (!this.isConnected || !this.config || !keys?.length) {
      console.warn('[AR] V3 early return', { reason: !this.isConnected ? 'not-connected' : (!this.config ? 'no-config' : 'no-keys') });
      return {};
    }
    
    // InfluxDB v3 SQL: use latest timestamp per key (no LAST())
    const inList = keys.map(k => `'${k}'`).join(',');
    const query = `WITH latest AS (
      SELECT key, MAX(time) AS max_time
      FROM sensor_data
      WHERE sensor_id='${sensorId}' AND key IN (${inList})
        AND time >= NOW() - INTERVAL '${hours} hours'
      GROUP BY key
    )
    SELECT s.key, s.value
    FROM sensor_data s
    JOIN latest l
      ON s.key = l.key AND s.time = l.max_time
    WHERE s.sensor_id='${sensorId}';`;
    
    console.log('[AR] V3 InfluxQL query', query);
    try {
      // InfluxDB v3では /api/v3/query エンドポイントを使用
      const resp = await this.postV3Sql(query);
      console.log('[AR] V3 resp', { status: resp.status, hasResults: !!resp.data?.results });
      try { console.log('[AR] V3 raw response data:'); console.dir(resp.data, { depth: null, maxArrayLength: null }); } catch(_) {}
      try { console.log('[AR] V3 response data (JSON):', JSON.stringify(resp.data, null, 2)); } catch(_) {}
      
      const map = {};
      if (resp.data?.results?.[0]?.series) {
        const series = resp.data.results[0].series;
        for (const s of series) {
          for (const row of (s.values || [])) {
            const key = row[0]; // key列
            const value = parseFloat(row[1]); // value列
            if (key && !Number.isNaN(value)) {
              map[key] = value;
            }
          }
        }
      } else if (resp.data?.data) {
        // InfluxDB v3の新しいレスポンス形式に対応
        for (const row of resp.data.data) {
          const key = row.key;
          const value = parseFloat(row.value);
          if (key && !Number.isNaN(value)) {
            map[key] = value;
          }
        }
      } else if (Array.isArray(resp.data?.value)) {
        // サーバーが { value: [...] } 形式で返す場合に対応
        for (const row of resp.data.value) {
          const key = row.key;
          const value = parseFloat(row.value);
          if (key && !Number.isNaN(value)) {
            map[key] = value;
          }
        }
      } else if (Array.isArray(resp.data)) {
        // サーバーが配列そのものを返す場合に対応: [ { key, value } ]
        for (const row of resp.data) {
          const key = row.key;
          const value = parseFloat(row.value);
          if (key && !Number.isNaN(value)) {
            map[key] = value;
          }
        }
      }
      console.log('[AR] V3 parsed', map);
      return map;
    } catch (e) {
      console.error('[AR] V3 error', { message: e.message, status: e.response?.status, data: e.response?.data, attempts: e.attempts });
      return {};
    }
  }

  // タグリセット履歴をInfluxDBに書き込み
  async writeTagResetEvent(tagId, assetId, resetAt, value, timestamp = new Date()) {
    if (!this.isConnected || !this.config) {
      console.warn('InfluxDB not connected, skipping tag reset event write');
      return { success: false, error: 'InfluxDB not connected' };
    }

    try {
      // リセット履歴用のデータポイントを作成
      const dataPoint = {
        measurement: 'tag_reset_events',
        tags: {
          tag_id: tagId,
          asset_id: assetId
        },
        fields: {
          value: value,
          reset_at: resetAt
        }
      };

      // 書き込み先DBを logs に切替（環境変数 INFLUX_LOG_DB があれば優先）
      const logsDb = process.env.INFLUX_LOG_DB || 'logs';

      // 単一データポイントを書き込み（logs DB に書く）
      const result = await this.writePoint(
        dataPoint.measurement,
        dataPoint.tags,
        dataPoint.fields,
        timestamp,
        logsDb
      );

      if (result.success) {
        console.log(`Tag reset event written to InfluxDB logs DB: tagId=${tagId}, assetId=${assetId}, value=${value}`);
      }

      return result;
    } catch (error) {
      console.error('Failed to write tag reset event to InfluxDB:', error);
      return { success: false, error: error.message };
    }
  }

  // タグリセット履歴をInfluxDBから取得
  async getTagResetEvents(tagId, assetId = null, limit = 50, from = null, to = null) {
    if (!this.isConnected || !this.config) {
      console.warn('InfluxDB not connected, cannot get tag reset events');
      return { success: false, error: 'InfluxDB not connected' };
    }

    try {
      console.log(`Fetching tag reset events from InfluxDB: tagId=${tagId}, assetId=${assetId}, limit=${limit}`);

      // InfluxDB v3用のSQLクエリ
      let whereClause = `tag_id='${tagId}'`;
      if (assetId) {
        whereClause += ` AND asset_id='${assetId}'`;
      }
      if (from) {
        whereClause += ` AND time >= '${from}'`;
      }
      if (to) {
        whereClause += ` AND time <= '${to}'`;
      }

      const query = `SELECT time, value, reset_at, tag_id, asset_id 
                     FROM tag_reset_events 
                     WHERE ${whereClause}
                     ORDER BY time DESC 
                     LIMIT ${limit}`;

      console.log('Executing InfluxDB query:', query);

      const response = await this.postV3Sql(query);

      if (response.data?.data) {
        // InfluxDB v3の新しいレスポンス形式に対応
        const events = response.data.data.map(row => ({
          id: `${row.tag_id}_${row.time}`,
          tagId: row.tag_id,
          assetId: row.asset_id,
          resetAt: row.reset_at,
          value: row.value,
          createdAt: row.time
        }));

        console.log(`Retrieved ${events.length} tag reset events from InfluxDB`);
        return { success: true, events };
      } else if (Array.isArray(response.data)) {
        // サーバーが配列そのものを返す場合に対応
        const events = response.data.map(row => ({
          id: `${row.tag_id}_${row.time}`,
          tagId: row.tag_id,
          assetId: row.asset_id,
          resetAt: row.reset_at,
          value: row.value,
          createdAt: row.time
        }));

        console.log(`Retrieved ${events.length} tag reset events from InfluxDB (array format)`);
        return { success: true, events };
      } else {
        console.log('No tag reset events found in InfluxDB');
        return { success: true, events: [] };
      }
    } catch (error) {
      console.error('Failed to get tag reset events from InfluxDB:', error);
      return { success: false, error: error.message };
    }
  }
}

// シングルトンインスタンス
const influxDBManager = new InfluxDBManager();

module.exports = influxDBManager;
