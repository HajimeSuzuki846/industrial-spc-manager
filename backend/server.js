// Silence all non-error console methods
(function(){
  try {
    const noop = () => {};
    // エラー以外のログを全て抑制
    console.info = noop;
    console.debug = noop;
    console.trace = noop;
    console.log = noop;
    console.warn = noop;
  } catch (e) {}
})();
const express = require('express');
const WebSocket = require('ws');
const mqtt = require('mqtt');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const db = require('./database');
const influxDBManager = require('./influxdb');
// const fetch = require('node-fetch'); // Node.js 18 では標準で fetch が使えます
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// データベース接続のPostgreSQL設定（保存済み設定を優先）
const initializePostgreSQLConnection = async () => {
  try {
    console.log('Initializing PostgreSQL connection (prefer saved config)...');

    // 1) まず保存済み設定（DB/ファイル）を取得
    let savedConfig = null;
    try {
      savedConfig = await db.getActivePostgresConfig();
    } catch (_) {}

    if (savedConfig && savedConfig.host && savedConfig.database && savedConfig.user) {
      console.log('Using saved PostgreSQL config');
      await db.createPool(savedConfig);
      await db.initializeDatabase();
      console.log('PostgreSQL connection initialized from saved config');
      return;
    }

    // 2) 環境変数にフォールバック
    const envConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'asset_manager',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || ''
    };

    console.log('Saved config not found. Falling back to environment variables:', {
      host: envConfig.host,
      port: envConfig.port,
      database: envConfig.database,
      user: envConfig.user,
      password: envConfig.password ? '***' : 'empty'
    });

    if (envConfig.host && envConfig.database && envConfig.user) {
      await db.createPool(envConfig);
      await db.initializeDatabase();
      console.log('PostgreSQL connection initialized from environment variables');
    } else {
      console.log('PostgreSQL environment variables not fully configured');
    }
  } catch (error) {
    console.error('Failed to initialize PostgreSQL connection:', error);
  }
};

// グローバル例外ハンドラ
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // データベース接続が失敗した場合のエラーハンドリング
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // データベース接続が失敗した場合のエラーハンドリング
});

// CORS 有効化
app.use(cors());
app.use(express.json());

// サーバー初期化エンドポイント
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// PostgreSQL 設定の保存API
app.post('/api/postgres/config', async (req, res) => {
  try {
    const config = req.body;
    console.log('Saving PostgreSQL config:', {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password ? '***' : 'empty'
    });

    // 必須項目の検証
    if (!config.host || !config.database || !config.user) {
      return res.status(400).json({
        error: 'host, database, user は必須です'
      });
    }

    // 接続を確認
    await db.createPool(config);
    await db.initializeDatabase();

    // 保存
    const savedConfig = await db.savePostgresConfig(config);
    res.json({ success: true, config: savedConfig });
  } catch (error) {
    console.error('Error saving PostgreSQL config:', error);
    res.status(500).json({
      error: 'PostgreSQL 設定の保存に失敗しました',
      details: error.message
    });
  }
});

app.get('/api/postgres/config', async (req, res) => {
  try {
    const config = await db.getActivePostgresConfig();
    res.json(config);
  } catch (error) {
    console.error('Error getting PostgreSQL config:', error);
    res.status(500).json({ error: 'Failed to get PostgreSQL config' });
  }
});

// 接続状態を更新するエンドポイント
app.get('/api/database/status', async (req, res) => {
  console.log('GET /api/database/status: Request received');
  try {
    console.log('GET /api/database/status: Calling testConnection...');
    const isConnected = await db.testConnection();
    console.log('GET /api/database/status: testConnection result:', isConnected);

    const response = {
      connected: isConnected,
      error: isConnected ? null : 'Database connection failed'
    };
    console.log('GET /api/database/status: Sending response:', response);
    res.json(response);
  } catch (error) {
    console.error('GET /api/database/status: Error checking database status:', error);
    const response = {
      connected: false,
      error: error.message
    };
    console.log('GET /api/database/status: Sending error response:', response);
    res.json(response);
  }
});

app.post('/api/postgres/test', async (req, res) => {
  try {
    const config = req.body;
    console.log('Testing PostgreSQL connection with config:', {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password ? '***' : 'empty'
    });

    // 必須項目の検証
    if (!config.host || !config.database || !config.user) {
      return res.status(400).json({
        error: 'host, database, user は必須です'
      });
    }

    // DB初期化
    await db.createPool(config);
    await db.initializeDatabase();

    res.json({ success: true, message: 'PostgreSQL 接続に成功しました' });
  } catch (error) {
    console.error('PostgreSQL connection test failed:', error);
    res.status(500).json({
      error: 'PostgreSQL 接続に失敗しました',
      details: error.message
    });
  }
});

// MQTT 設定の保存API
app.post('/api/mqtt/config', async (req, res) => {
  try {
    const config = req.body;
    console.log('Received MQTT config from frontend:', config);
    console.log('Config keys:', Object.keys(config));

    // クライアントIDの正規化
    const normalizedConfig = {
      ...config,
      clientId: config.client_id || config.clientId
    };

    console.log('Saving MQTT config:', {
      broker: normalizedConfig.broker,
      port: normalizedConfig.port,
      clientId: normalizedConfig.clientId,
      username: normalizedConfig.username,
      password: normalizedConfig.password ? '***' : 'empty',
      certificatePath: normalizedConfig.certificatePath,
      privateKeyPath: normalizedConfig.privateKeyPath,
      caPath: normalizedConfig.caPath,
      hasCertificateContent: !!normalizedConfig.certificateContent,
      hasPrivateKeyContent: !!normalizedConfig.privateKeyContent,
      hasCaContent: !!normalizedConfig.caContent
    });

    const savedConfig = await db.saveMQTTConfig(normalizedConfig);
    console.log('MQTT config saved successfully:', {
      id: savedConfig.id,
      broker: savedConfig.broker,
      port: savedConfig.port,
      clientId: savedConfig.client_id,
      createdAt: savedConfig.created_at
    });
    res.json({ success: true, config: savedConfig });
  } catch (error) {
    console.error('Error saving MQTT config:', error);
    res.status(500).json({
      error: 'Failed to save MQTT config',
      details: error.message
    });
  }
});

app.get('/api/mqtt/config', async (req, res) => {
  try {
    console.log('Getting latest MQTT config...');
    const config = await db.getLatestMQTTConfig();
    console.log('Retrieved MQTT config:', config ? {
      id: config.id,
      broker: config.broker,
      port: config.port,
      clientId: config.client_id,
      createdAt: config.created_at
    } : 'No config found');
    res.json(config);
  } catch (error) {
    console.error('Error getting MQTT config:', error);
    res.status(500).json({
      error: 'Failed to get MQTT config',
      details: error.message
    });
  }
});

// MQTT 接続テスト
app.post('/api/mqtt/test', async (req, res) => {
  try {
    const config = req.body;
    console.log('Testing MQTT connection with config:', {
      broker: config.broker,
      port: config.port,
      clientId: config.client_id || config.clientId,
      username: config.username,
      hasPassword: !!config.password
    });

    // 必須項目の検証
    if (!config.broker || !config.port || !(config.client_id || config.clientId)) {
      return res.status(400).json({
        error: 'broker, port, clientId は必須です'
      });
    }

    // 形式検証
    const testConfig = {
      broker: config.broker,
      port: parseInt(config.port),
      clientId: config.client_id || config.clientId,
      username: config.username || '',
      password: config.password || ''
    };

    // ポート検証
    if (testConfig.port !== 1883 && testConfig.port !== 8883) {
      return res.status(400).json({
        error: 'port は 1883 または 8883 を指定してください'
      });
    }

    // brokerホスト名の簡易検証
    if (!/^[a-zA-Z0-9.-]+$/.test(testConfig.broker)) {
      return res.status(400).json({
        error: '無効な broker です'
      });
    }

    console.log('MQTT connection test successful (configuration validation)');
    res.json({ success: true, message: 'MQTT 設定は有効です' });
  } catch (error) {
    console.error('MQTT connection test failed:', error);
    res.status(500).json({
      error: 'MQTT 接続テストに失敗しました',
      details: error.message
    });
  }
});

// MQTTトピック重複チェック（リアルタイム）
app.post('/api/mqtt/topic-duplication', async (req, res) => {
  try {
    const { topic, excludeAssetId } = req.body;

    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }

    let isDuplicate;
    if (excludeAssetId) {
      // 指定アセットを除外して重複判定
      isDuplicate = await db.hasAssetForTopicExcluding(topic, excludeAssetId);
    } else {
      // そのまま重複判定
      isDuplicate = await db.hasAssetForTopic(topic);
    }

    res.json({
      isDuplicate,
      message: isDuplicate ? '既に同じトピックが使用されています' : '重複はありません'
    });
  } catch (error) {
    console.error('Error checking topic duplication:', error);
    res.status(500).json({ error: 'Failed to check topic duplication' });
  }
});

app.post('/api/assets', async (req, res) => {
  try {
    const asset = req.body;

    // MQTTトピックの重複をチェック
    if (asset.dataSourceType === 'mqtt' && asset.mqttTopic) {
      const isDuplicate = await db.hasAssetForTopicExcluding(asset.mqttTopic, asset.id);
      if (isDuplicate) {
        return res.status(400).json({
          error: 'MQTTトピックが重複しています',
          message: '既に同じトピックが使用されています'
        });
      }
    }

    const savedAsset = await db.saveAsset(asset);
    res.json({ success: true, asset: savedAsset });
  } catch (error) {
    console.error('Error saving asset:', error);
    res.status(500).json({ error: 'Failed to save asset' });
  }
});

// タグリセット履歴: 作成
app.post('/api/tags/:tagId/reset-events', async (req, res) => {
  try {
    const tagId = req.params.tagId;
    const { assetId, resetAt, value } = req.body || {};
    if (!tagId || !assetId) return res.status(400).json({ error: 'tagId と assetId は必須です' });
    const event = await db.saveTagResetEvent({ tagId, assetId, resetAt: resetAt || new Date().toISOString(), value });

    // InfluxDB にも書き込み（エラーはレスポンスに影響させない）
    try {
      await influxDBManager.writeTagResetEvent(tagId, assetId, resetAt || new Date().toISOString(), value);
    } catch (influxErr) {
      console.error('InfluxDB write for tag reset failed:', influxErr?.message || influxErr);
    }

    res.json({ success: true, event });
  } catch (error) {
    console.error('Error saving tag reset event:', error);
    res.status(500).json({ error: 'Failed to save tag reset event' });
  }
});

// タグリセット履歴: 取得
app.get('/api/tags/:tagId/reset-events', async (req, res) => {
  try {
    const tagId = req.params.tagId;
    const { assetId, from, to, page = 1, pageSize = 50 } = req.query;
    const limit = Math.min(parseInt(pageSize) || 50, 200);
    const offset = ((parseInt(page) || 1) - 1) * limit;
    const events = await db.getTagResetEvents({ tagId, assetId, from, to, limit, offset });
    res.json({ events, page: parseInt(page) || 1, pageSize: limit });
  } catch (error) {
    console.error('Error getting tag reset events:', error);
    res.status(500).json({ error: 'Failed to get tag reset events' });
  }
});

// 互換用: bodyにtagIdを含めるPOST
app.post('/api/tags/reset-events', async (req, res) => {
  try {
    const { tagId, assetId, resetAt, value } = req.body || {};
    if (!tagId || !assetId) return res.status(400).json({ error: 'tagId と assetId は必須です' });
    const event = await db.saveTagResetEvent({ tagId, assetId, resetAt: resetAt || new Date().toISOString(), value });

    // InfluxDB にも書き込み（エラーはレスポンスに影響させない）
    try {
      await influxDBManager.writeTagResetEvent(tagId, assetId, resetAt || new Date().toISOString(), value);
    } catch (influxErr) {
      console.error('InfluxDB write for tag reset (compat) failed:', influxErr?.message || influxErr);
    }

    res.json({ success: true, event });
  } catch (error) {
    console.error('Error saving tag reset event (compat):', error);
    res.status(500).json({ error: 'Failed to save tag reset event' });
  }
});

app.get('/api/assets', async (req, res) => {
  try {
    const assets = await db.getAllAssets();
    res.json(assets);
  } catch (error) {
    console.error('Error getting assets:', error);
    res.status(500).json({ error: 'Failed to get assets' });
  }
});

// アセット削除
app.delete('/api/assets/:id', async (req, res) => {
  try {
    const assetId = req.params.id;
    await db.deleteAsset(assetId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting asset:', error);
    res.status(500).json({ error: error.message });
  }
});

// アラートルールの保存
app.post('/api/alert-rules', async (req, res) => {
  try {
    const rule = req.body;
    const savedRule = await db.saveAlertRule(rule);

    // 有効/無効に応じてタイマー開始/停止
    const active = savedRule.is_active ?? savedRule.isActive ?? rule.is_active ?? rule.isActive;
    if (active) startAlertRuleTimer(savedRule); else stopAlertRuleTimer(savedRule.id);

    res.json(savedRule);
  } catch (error) {
    console.error('Error saving alert rule:', error);
    res.status(500).json({ error: error.message });
  }
});

// アラートルールの取得
app.get('/api/alert-rules', async (req, res) => {
  try {
    const assetId = req.query.assetId;
    console.log('Getting alert rules for assetId:', assetId);

    const rules = await db.getAlertRules(assetId);
    console.log('Retrieved rules count:', rules.length);
    console.log('Retrieved rules details:', rules.map(rule => ({
      id: rule.id,
      name: rule.name,
      assetId: rule.assetId,
      isActive: rule.isActive,
      conditionsCount: rule.conditions?.length || 0,
      actionsCount: rule.actions?.length || 0
    })));

    res.json(rules);
  } catch (error) {
    console.error('Error getting alert rules:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      error: error.message,
      details: error.stack,
      assetId: req.query.assetId
    });
  }
});

// アラートルールの削除
app.delete('/api/alert-rules/:id', async (req, res) => {
  try {
    const ruleId = req.params.id;
    await db.deleteAlertRule(ruleId);

    // タイマー停止
    stopAlertRuleTimer(ruleId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting alert rule:', error);
    res.status(500).json({ error: error.message });
  }
});

// AlertRule実行ログの保存
app.post('/api/alert-rules/execution-logs', async (req, res) => {
  try {
    console.log('Saving alert rule execution log:', req.body);
    const logData = req.body;

    const savedLog = await db.saveAlertRuleExecutionLog(logData);
    console.log('Saved execution log:', savedLog);

    res.json(savedLog);
  } catch (error) {
    console.error('Error saving alert rule execution log:', error);
    res.status(500).json({ error: error.message });
  }
});

// AlertRule実行ログの取得
app.get('/api/alert-rules/execution-logs', async (req, res) => {
  try {
    const { ruleId, assetId, page = 1, pageSize = 20, status, executionType, search } = req.query;

    console.log('Getting alert rule execution logs with params:', {
      ruleId, assetId, page, pageSize, status, executionType, search
    });

    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const logs = await db.getAlertRuleExecutionLogs(
      ruleId,
      assetId,
      parseInt(pageSize),
      offset
    );

    // 検索フィルタリング（簡易実装）
    let filteredLogs = logs;
    if (search) {
      filteredLogs = logs.filter(log =>
        log.ruleName?.toLowerCase().includes(search.toLowerCase()) ||
        log.assetName?.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (status) {
      filteredLogs = filteredLogs.filter(log => log.status === status);
    }

    if (executionType) {
      filteredLogs = filteredLogs.filter(log => log.executionType === executionType);
    }

    console.log('Retrieved execution logs count:', filteredLogs.length);

    res.json({
      logs: filteredLogs,
      total: filteredLogs.length,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });
  } catch (error) {
    console.error('Error getting alert rule execution logs:', error);
    res.status(500).json({ error: error.message });
  }
});

// AlertRule実行統計の取得
app.get('/api/alert-rules/execution-stats', async (req, res) => {
  try {
    const { ruleId, assetId, days = 7 } = req.query;

    console.log('Getting alert rule execution stats with params:', {
      ruleId, assetId, days
    });

    const stats = await db.getAlertRuleExecutionStats(ruleId, assetId, parseInt(days));

    console.log('Retrieved execution stats:', stats);

    res.json(stats);
  } catch (error) {
    console.error('Error getting alert rule execution stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// AlertRule実行ログの削除（アセットID指定）
app.delete('/api/alert-rules/execution-logs', async (req, res) => {
  try {
    const { assetId } = req.body;

    if (!assetId) {
      return res.status(400).json({ error: 'assetId is required' });
    }

    console.log('Deleting alert rule execution logs for asset:', assetId);

    const deletedCount = await db.deleteAlertRuleExecutionLogsByAssetId(assetId);

    console.log('Deleted execution logs count:', deletedCount);

    res.json({
      success: true,
      deletedCount: deletedCount,
      message: `Deleted ${deletedCount} execution logs for asset ${assetId}`
    });
  } catch (error) {
    console.error('Error deleting alert rule execution logs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Notebook API プロキシ
app.post('/api/notebook/run', async (req, res) => {
  try {
    console.log('=== NOTEBOOK API ENDPOINT HIT ===');
    console.log('Request URL:', req.url);
    console.log('Request method:', req.method);
    console.log('Request headers:', req.headers);
    console.log('Request body:', req.body);

    const { notebook, parameters, executionTime, maxRetries } = req.body;
    console.log('Notebook API proxy request:', { notebook, parameters, executionTime, maxRetries });

    const NOTEBOOK_API_URL = 'https://glicocmms-cbm-notebooks.org/api/run';
    const NOTEBOOK_API_KEY = process.env.NOTEBOOK_API_KEY || 'SuperSecretKey';

    console.log('Notebook API Key:', NOTEBOOK_API_KEY ? '***' : 'NOT SET');

    // 1. Notebook 実行をリクエスト
    const runResponse = await fetch(NOTEBOOK_API_URL, {
      method: 'POST',
      headers: {
        'X-API-Key': NOTEBOOK_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        notebook: notebook,
        parameters: parameters
      }),
    });

    if (!runResponse.ok) {
      const errorText = await runResponse.text();
      console.error('Notebook API error response:', errorText);
      throw new Error(`HTTP error! status: ${runResponse.status}, response: ${errorText}`);
    }

    const runResult = await runResponse.json();
    console.log('Notebook 実行開始レスポンス:', runResult);

    // 2. ステータスのポーリング
    const execTime = executionTime || 30000; // 30秒
    const maxRetryCount = maxRetries || 3;

    const finalResult = await pollNotebookStatus(
      runResult.run_id,
      execTime,
      maxRetryCount
    );

    res.json(finalResult);
  } catch (error) {
    console.error('Notebook API proxy error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Notebook 実行ステータスのポーリング
async function pollNotebookStatus(runId, executionTime, maxRetries) {
  const statusUrl = `https://glicocmms-cbm-notebooks.org/api/runs/${runId}`;
  const NOTEBOOK_API_KEY = process.env.NOTEBOOK_API_KEY || 'SuperSecretKey';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Notebook status check attempt ${attempt + 1}/${maxRetries + 1}:`, statusUrl);

      const statusResponse = await fetch(statusUrl, {
        headers: {
          'X-API-Key': NOTEBOOK_API_KEY,
        },
      });

      if (!statusResponse.ok) {
        throw new Error(`Status check failed: ${statusResponse.status}`);
      }

      const statusResult = await statusResponse.json();
      console.log('Notebook status result:', statusResult);

      if (statusResult.status === 'done') {
        // 結果を取得
        const result = await getNotebookResult(statusResult);
        return {
          success: true,
          result: result,
          runId: runId
        };
      } else if (statusResult.status === 'error') {
        return {
          success: false,
          error: 'Notebook execution failed',
          runId: runId
        };
      }

      // 次のポーリングまで待機
      if (attempt < maxRetries) {
        console.log(`Waiting ${executionTime}ms before next status check...`);
        await new Promise(resolve => setTimeout(resolve, executionTime));
      }
    } catch (error) {
      console.error(`Status check attempt ${attempt + 1} failed:`, error);
      if (attempt === maxRetries) {
        return {
          success: false,
          error: `Status check failed after ${maxRetries + 1} attempts: ${error.message}`,
          runId: runId
        };
      }
    }
  }

  return {
    success: false,
    error: `Timeout: Notebook did not complete within ${executionTime * (maxRetries + 1)}ms`,
    runId: runId
  };
}

// Notebook 出力結果を取得して返す
async function getNotebookResult(statusResult) {
  try {
    const outputUrl = `https://glicocmms-cbm-notebooks.org/api/files/${statusResult.run_id}/output.ipynb`;
    const NOTEBOOK_API_KEY = process.env.NOTEBOOK_API_KEY || 'SuperSecretKey';

    console.log('Notebook 出力取得URL:', outputUrl);

    const response = await fetch(outputUrl, {
      headers: {
        'X-API-Key': NOTEBOOK_API_KEY,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch output file: ${response.status}`);
    }

    const notebookData = await response.json();
    console.log('Notebook 出力取得成功');

    // "result" タグ付きセルから結果を抽出
    const resultCell = findResultCell(notebookData);

    if (resultCell) {
      console.log('結果セルを抽出しました');
      return resultCell;
    } else {
      console.warn('結果セルが見つかりませんでした');
      return null;
    }
  } catch (error) {
    console.error('Notebook 出力取得でエラー:', error);
    throw error;
  }
}

// "result" タグ付きセルを探して値を返す
function findResultCell(notebookData) {
  try {
    if (!notebookData.cells || !Array.isArray(notebookData.cells)) {
      console.warn('Notebook に cells がありません');
      return null;
    }

    for (const cell of notebookData.cells) {
      if (cell.metadata && cell.metadata.tags && Array.isArray(cell.metadata.tags)) {
        if (cell.metadata.tags.includes('result')) {
          console.log('result タグ付きセルを検出');

          // outputs を優先的に使用
          if (cell.outputs && Array.isArray(cell.outputs) && cell.outputs.length > 0) {
            for (const output of cell.outputs) {
              if (output.output_type === 'execute_result' && output.data) {
                if (output.data['text/plain'] && Array.isArray(output.data['text/plain'])) {
                  const resultText = output.data['text/plain'].join('');
                  console.log('result テキスト:', resultText);
                  try {
                    const result = JSON.parse(resultText);
                    console.log('JSON 解析に成功');
                    return result;
                  } catch (parseError) {
                    console.warn('JSON 解析に失敗。テキストを返します');
                    return resultText;
                  }
                }
              }
            }
          }

          // outputs が無い場合は source を確認
          if (cell.source && Array.isArray(cell.source)) {
            const sourceText = cell.source.join('');
            console.log('source テキスト:', sourceText);
            try {
              const result = JSON.parse(sourceText);
              console.log('source の JSON 解析に成功');
              return result;
            } catch (parseError) {
              console.warn('source の JSON 解析に失敗。テキストを返します');
              return sourceText;
            }
          }
        }
      }
    }

    console.warn('result タグ付きセルが見つかりませんでした');
    return null;
  } catch (error) {
    console.error('結果セル抽出でエラー:', error);
    return null;
  }
}

// 工場の保存
app.post('/api/factories', async (req, res) => {
  try {
    const factory = req.body;
    const savedFactory = await db.saveFactory(factory);
    res.json(savedFactory);
  } catch (error) {
    console.error('Error saving factory:', error);
    res.status(500).json({ error: error.message });
  }
});

// 工場の取得
app.get('/api/factories', async (req, res) => {
  try {
    const factories = await db.getAllFactories();
    res.json(factories);
  } catch (error) {
    console.error('Error getting factories:', error);
    res.status(500).json({ error: error.message });
  }
});

// 工場の削除
app.delete('/api/factories/:id', async (req, res) => {
  try {
    const factoryId = req.params.id;
    await db.deleteFactory(factoryId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting factory:', error);
    res.status(500).json({ error: error.message });
  }
});

// 生産ラインの保存
app.post('/api/production-lines', async (req, res) => {
  try {
    const line = req.body;
    const savedLine = await db.saveProductionLine(line);
    res.json(savedLine);
  } catch (error) {
    console.error('Error saving production line:', error);
    res.status(500).json({ error: error.message });
  }
});

// 生産ラインの取得
app.get('/api/production-lines', async (req, res) => {
  try {
    const lines = await db.getAllProductionLines();
    res.json(lines);
  } catch (error) {
    console.error('Error getting production lines:', error);
    res.status(500).json({ error: error.message });
  }
});

// 生産ラインの削除
app.delete('/api/production-lines/:id', async (req, res) => {
  try {
    const lineId = req.params.id;
    await db.deleteProductionLine(lineId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting production line:', error);
    res.status(500).json({ error: error.message });
  }
});

// 証明書一覧
app.get('/api/certificates', (req, res) => {
  try {
    const certificatesDir = path.join(__dirname, '../certificates');
    console.log('Certificates directory path:', certificatesDir);

    // certificates ディレクトリが無ければ作成
    if (!fs.existsSync(certificatesDir)) {
      console.log('Certificates directory does not exist, creating...');
      fs.mkdirSync(certificatesDir, { recursive: true });
    }

    const files = fs.readdirSync(certificatesDir);
    console.log('Files in certificates directory:', files);

    const certificateFiles = files.filter(file =>
      file.endsWith('.crt') || file.endsWith('.pem.crt')
    );
    const privateKeyFiles = files.filter(file =>
      file.endsWith('.key') || file.endsWith('.pem.key')
    );
    const caFiles = files.filter(file =>
      file.endsWith('.crt') && (file.includes('ca') || file.includes('CA'))
    );

    console.log('Filtered files:', {
      certificates: certificateFiles,
      privateKeys: privateKeyFiles,
      caFiles: caFiles
    });

    res.json({
      certificates: certificateFiles.map(file => ({
        name: file,
        path: `certificates/${file}`
      })),
      privateKeys: privateKeyFiles.map(file => ({
        name: file,
        path: `certificates/${file}`
      })),
      caFiles: caFiles.map(file => ({
        name: file,
        path: `certificates/${file}`
      }))
    });
  } catch (error) {
    console.error('Error reading certificates directory:', error);
    res.status(500).json({ error: 'Failed to read certificates directory', details: error.message });
  }
});

// 証明書ファイル取得
app.get('/api/certificates/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '../certificates', filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ content, filename });
  } catch (error) {
    console.error('Error reading certificate file:', error);
    res.status(500).json({ error: 'Failed to read certificate file' });
  }
});

// バックエンド再起動リクエスト（擬似）
app.post('/api/restart', (req, res) => {
  console.log('Backend restart requested');

  res.json({ success: true, message: 'Backend restart initiated' });

  // 直後にシャットダウン（実運用ではPM2/systemd等で再起動）
  setTimeout(() => {
    console.log('Shutting down server for restart...');

    // 既存のMQTT接続を切断
    mqttConnections.forEach((connection, connectionId) => {
      console.log(`Disconnecting MQTT connection: ${connectionId}`);
      if (connection.client && !connection.client.disconnected) {
        connection.client.end(true);
      }
    });

    // WebSocket サーバ停止
    wss.close(() => {
      console.log('WebSocket server closed');

      // HTTP サーバ停止（server 参照は startServer 内で定義）
      server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
      });
    });
  }, 1000);
});

// バックエンド起動（ダミー）
app.post('/api/start', (req, res) => {
  console.log('Backend start requested');
  res.json({ success: true, message: 'Backend is already running' });
});

// 自動再起動 API（スクリプト呼出し例）
app.post('/api/auto-restart', async (req, res) => {
  console.log('Auto restart requested');

  try {
    res.json({ success: true, message: 'Auto restart initiated' });

    setTimeout(async () => {
      try {
        const { spawn } = require('child_process');
        const os = require('os');
        const platform = os.platform();

        console.log(`Detected platform: ${platform}`);

        if (platform === 'win32') {
          // Windows
          console.log('Executing Windows restart script...');
          const restartScript = spawn('powershell', [
            '-ExecutionPolicy', 'Bypass',
            '-File', path.join(__dirname, 'restart-backend.ps1')
          ], {
            detached: true,
            stdio: 'ignore'
          });

          restartScript.unref();

        } else {
          // Linux/Unix
          console.log('Executing Linux restart script...');
          const restartScript = spawn('bash', [
            path.join(__dirname, 'restart-backend.sh')
          ], {
            detached: true,
            stdio: 'ignore'
          });

          restartScript.unref();
        }

        // 現プロセスは終了
        setTimeout(() => {
          console.log('Shutting down current process for restart...');
          process.exit(0);
        }, 2000);

      } catch (error) {
        console.error('Failed to execute restart script:', error);
        process.exit(1);
      }
    }, 1000);

  } catch (error) {
    console.error('Auto restart error:', error);
    res.status(500).json({ error: 'Failed to initiate auto restart' });
  }
});

// Thingsboard 関連は削除済み

// InfluxDB 設定保存
app.post('/api/influxdb/config', async (req, res) => {
  try {
    const config = req.body || {};
    const normalizedConfig = {
      url: (config.url || '').trim(),
      token: config.token || '',
      org: (config.org || 'glico').trim(),
      bucket: (config.bucket || config.database || '').toString().trim()
    };
    console.log('Saving InfluxDB config (normalized):', {
      url: normalizedConfig.url,
      org: normalizedConfig.org,
      bucket: normalizedConfig.bucket,
      hasToken: !!normalizedConfig.token
    });

    // 必須（URL と bucket）
    if (!normalizedConfig.url || !normalizedConfig.bucket) {
      return res.status(400).json({
        error: 'URL と bucket(または database) は必須です',
        details: {
          url: !!normalizedConfig.url,
          bucketOrDatabase: !!normalizedConfig.bucket
        }
      });
    }

    // DBが使えない場合はスキップして受理
    let savedConfig = null;
    try {
      savedConfig = await db.saveInfluxDBConfig(normalizedConfig);
    } catch (dbError) {
      console.log('Database not available, skipping config save:', dbError.message);
      savedConfig = config; // スルーして返す
    }

    // 設定を即時適用（メモリ上のマネージャにも反映）
    try {
      const connectResult = await influxDBManager.connect(normalizedConfig);
      console.log('InfluxDB manager updated with new config:', connectResult);
    } catch (applyErr) {
      console.log('Failed to apply InfluxDB config to manager:', applyErr?.message || applyErr);
    }

    res.json({ success: true, config: savedConfig });
  } catch (error) {
    console.error('Error saving InfluxDB config:', error);
    res.status(500).json({
      error: 'InfluxDB 設定の保存に失敗しました',
      details: error.message
    });
  }
});

// InfluxDB 設定取得
app.get('/api/influxdb/config', async (req, res) => {
  try {
    let config = null;
    try {
      config = await db.getActiveInfluxDBConfig();
    } catch (dbError) {
      console.log('Database not available when fetching InfluxDB config:', dbError.message);
      // 既定値は返さず、未設定として扱う（誤ってlocalhostに接続しないようにする）
      config = null;
    }
    res.json(config || {});
  } catch (error) {
    console.error('Error getting InfluxDB config:', error);
    res.status(500).json({ error: 'Failed to get InfluxDB config' });
  }
});

// InfluxDB 接続テスト
app.post('/api/influxdb/test', async (req, res) => {
  try {
    const config = req.body || {};
    const normalizedConfig = {
      url: (config.url || '').trim(),
      token: config.token || '',
      org: (config.org || 'glico').trim(),
      bucket: (config.bucket || config.database || '').toString().trim()
    };
    console.log('Testing InfluxDB connection with config:', {
      url: normalizedConfig.url,
      org: normalizedConfig.org,
      bucket: normalizedConfig.bucket,
      hasToken: !!normalizedConfig.token
    });

    // 必須検証
    if (!normalizedConfig.url || !normalizedConfig.org || !normalizedConfig.bucket) {
      console.log('Validation failed: missing required fields', normalizedConfig);
      return res.status(400).json({
        error: 'URL, org, bucket(または database) は必須です',
        details: {
          url: !!normalizedConfig.url,
          org: !!normalizedConfig.org,
          bucketOrDatabase: !!normalizedConfig.bucket
        }
      });
    }

    // URL形式検証
    try {
      new URL(normalizedConfig.url);
    } catch (urlError) {
      console.log('Invalid URL format:', normalizedConfig.url);
      return res.status(400).json({
        error: '不正なURL形式です'
      });
    }

    console.log('Attempting to connect to InfluxDB...');

    // タイムアウト付きで接続
    const connectionPromise = influxDBManager.connect(normalizedConfig);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection timeout')), 10000); // 10秒
    });

    const result = await Promise.race([connectionPromise, timeoutPromise]);

    if (result.success) {
      console.log('InfluxDB connection test successful');
      res.json({ success: true, message: 'InfluxDB 接続に成功しました' });
    } else {
      console.log('InfluxDB connection test failed:', result.error);
      res.status(400).json({
        error: 'InfluxDB 接続に失敗しました',
        details: result.error
      });
    }
  } catch (error) {
    console.error('InfluxDB connection test failed:', error);

    let errorMessage = 'InfluxDB 接続に失敗しました';
    let statusCode = 500;

    if (error.message === 'Connection timeout') {
      errorMessage = 'InfluxDB 接続がタイムアウトしました';
      statusCode = 408;
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'InfluxDB サーバに接続できません';
      statusCode = 503;
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'InfluxDB のURLが無効です。有効なURLを指定してください';
      statusCode = 400;
    }

    res.status(statusCode).json({
      error: errorMessage,
      details: error.message
    });
  }
});

// InfluxDB アセットデータ取得
app.get('/api/influxdb/asset-data/:assetId', async (req, res) => {
  try {
    const { assetId } = req.params;
    const { field, hours = 672 } = req.query; // 28日=672時間

    if (!assetId) {
      return res.status(400).json({ error: 'assetId は必須です' });
    }

    const config = await db.getActiveInfluxDBConfig();
    if (!config) {
      return res.status(400).json({ error: 'InfluxDB 設定が見つかりません' });
    }

    // InfluxDB から取得
    const data = await influxDBManager.getAssetData(assetId, field, parseInt(hours));

    res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting asset data from InfluxDB:', error);
    res.status(500).json({
      error: 'アセットデータの取得に失敗しました',
      details: error.message
    });
  }
});

// Zスコア 検証API
app.post('/api/influxdb/test-zscore', async (req, res) => {
  try {
    const { assetId, field, movingAverageWindow, populationWindow, threshold } = req.body;

    if (!assetId || !field) {
      return res.status(400).json({ error: 'assetId と field は必須です' });
    }

    const config = await db.getActiveInfluxDBConfig();
    if (!config) {
      return res.status(400).json({ error: 'InfluxDB 設定が見つかりません' });
    }

    // InfluxDB から母集団期間のデータを取得（populationWindow 日 → 時間換算）
    const data = await influxDBManager.getAssetData(assetId, field, (populationWindow || 28) * 24);

    if (!data.success || !data.data || data.data.length === 0) {
      return res.json({
        success: false,
        error: 'データが見つかりませんでした',
        data: []
      });
    }

    // Zスコアを計算
    const { ZScoreCalculator } = require('../src/utils/zscoreCalculator');
    const zscoreConfig = {
      movingAverageWindow: movingAverageWindow || 15,
      populationWindow: populationWindow || 28,
      threshold: threshold || 2.0
    };

    const zscoreResult = ZScoreCalculator.calculateZScore(data.data, zscoreConfig);

    res.json({
      success: true,
      zscoreResult,
      config: zscoreConfig,
      dataPoints: data.data.length
    });
  } catch (error) {
    console.error('Error testing Z-score calculation:', error);
    res.status(500).json({
      error: 'Zスコア検証でエラーが発生しました',
      details: error.message
    });
  }
});

// InfluxDB ステータス
app.get('/api/influxdb/status', async (req, res) => {
  try {
    const status = influxDBManager.getConnectionStatus();
    const testResult = await influxDBManager.testConnection();

    res.json({
      ...status,
      testResult
    });
  } catch (error) {
    console.error('Error checking InfluxDB status:', error);
    res.status(500).json({
      error: 'InfluxDB ステータス確認に失敗しました',
      details: error.message
    });
  }
});

// InfluxDB セットアップ状況
app.get('/api/influxdb/setup', async (req, res) => {
  try {
    console.log('=== InfluxDB Setup Check Request ===');

    // 設定取得（DBがない場合は未設定として扱う）
    let config = null;
    try {
      config = await db.getActiveInfluxDBConfig();
    } catch (dbError) {
      console.log('Database not available, cannot load InfluxDB config:', dbError.message);
      config = null;
    }

    // 設定が未完了
    if (!config || !config.url) {
      return res.status(400).json({
        success: false,
        error: 'InfluxDB 設定が見つかりません。先に設定を保存してください'
      });
    }

    // 本番で localhost を含む場合の置換は廃止（誤接続回避）

    console.log('Using config for setup check:', {
      url: config.url,
      org: config.org,
      bucket: config.bucket,
      hasToken: !!config.token
    });

    const setupInfo = await influxDBManager.checkInfluxDBSetup();
    console.log('Setup check result:', setupInfo);
    res.json(setupInfo);
  } catch (error) {
    console.error('Error checking InfluxDB setup:', error);
    res.status(500).json({
      error: 'InfluxDB セットアップ確認に失敗しました',
      details: error.message
    });
  }
});

// InfluxDB データ整合性チェック
app.get('/api/influxdb/consistency', async (req, res) => {
  try {
    console.log('=== InfluxDB Data Consistency Check Request ===');
    const consistencyInfo = await influxDBManager.checkDataConsistency();
    console.log('Consistency check result:', consistencyInfo);
    res.json(consistencyInfo);
  } catch (error) {
    console.error('Error checking InfluxDB data consistency:', error);
    res.status(500).json({
      error: 'InfluxDB データ整合性チェックに失敗しました',
      details: error.message
    });
  }
});

// 管理者認証API
app.post('/api/admin/auth', (req, res) => {
  try {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD || 'Glico2030';

    if (password === adminPassword) {
      res.json({ success: true, message: '認証成功' });
    } else {
      res.status(401).json({ success: false, message: '認証失敗' });
    }
  } catch (error) {
    console.error('Admin authentication error:', error);
    res.status(500).json({ success: false, message: '認証処理でエラーが発生しました' });
  }
});

// フロント配信（静的ファイル）
app.use(express.static(path.join(__dirname, '../dist')));

// 404 ハンドラ
app.use((req, res, next) => {
  console.log('=== 404 ERROR ===');
  console.log('Request URL:', req.url);
  console.log('Request method:', req.method);
  console.log('Request headers:', req.headers);
  console.log('User-Agent:', req.get('User-Agent'));
  console.log('Referer:', req.get('Referer'));
  console.log('=== END 404 ERROR ===');

  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.url} not found`,
    timestamp: new Date().toISOString()
  });
});

// MQTT 接続管理
const mqttConnections = new Map();
const wsClients = new Set();

// アラートルール タイマー
const alertRuleTimers = new Map();

function startAlertRuleTimer(rule) {
  // 既存タイマー停止
  stopAlertRuleTimer(rule.id);

  console.log(`DEBUG: Processing alert rule ${rule.id} (${rule.name})`);
  console.log(`DEBUG: Rule data:`, {
    id: rule.id,
    name: rule.name,
    is_active: rule.is_active,
    check_interval: rule.check_interval,
    checkInterval: rule.checkInterval
  });

  if (!rule.is_active) {
    console.log(`DEBUG: Rule ${rule.id} is not active, skipping`);
    return;
  }

  // check_interval = 0 はリアルタイム用のためスキップ
  // 両方のフィールド名に対応（check_interval と checkInterval）
  const checkInterval = rule.check_interval || rule.checkInterval || 0;
  console.log(`DEBUG: Check interval value: ${checkInterval}`);
  
  if (checkInterval === 0) {
    console.log(`Skipping periodic execution for real-time alert rule ${rule.id} (${rule.name})`);
    return;
  }

  const interval = checkInterval; // 秒
  console.log(`Starting periodic execution for alert rule ${rule.id} (${rule.name}) with interval ${interval}s`);

  const timer = setInterval(async () => {
    console.log(`DEBUG: Executing alert rule ${rule.id} (${rule.name}) at ${new Date().toISOString()}`);
    await executeAlertRule(rule);
  }, interval * 1000);

  alertRuleTimers.set(rule.id, timer);
  console.log(`DEBUG: Timer set for rule ${rule.id}, total timers: ${alertRuleTimers.size}`);
}

function stopAlertRuleTimer(ruleId) {
  const timer = alertRuleTimers.get(ruleId);
  if (timer) {
    clearInterval(timer);
    alertRuleTimers.delete(ruleId);
    console.log(`Stopped periodic execution for alert rule ${ruleId}`);
  }
}

// タイマー状態確認用エンドポイント
app.get('/api/alert-rules/timers', (req, res) => {
  try {
    const timers = [];
    alertRuleTimers.forEach((timer, ruleId) => {
      timers.push({ ruleId });
    });
    res.json({ count: timers.length, timers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 安全な配列パーサ（文字列/配列/未定義を許容）
function parseArrayFlexible(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

async function executeAlertRule(rule) {
  const startTime = Date.now();
  let executionStatus = 'success';
  let errorMessage = null;
  let conditionsResult = {};
  let triggeredAlertId = null;

  try {
    console.log(`=== Executing Alert Rule ${rule.id} (${rule.name}) ===`);
    console.log(`Rule details:`, {
      id: rule.id,
      name: rule.name,
      asset_id: rule.asset_id || rule.assetId,
      is_active: rule.is_active ?? rule.isActive,
      check_interval: rule.check_interval,
      conditions: rule.conditions
    });

    const allConditions = parseArrayFlexible(rule.conditions);
    const nonNotebookConditions = allConditions.filter(c => c?.type !== 'notebook');
    const simpleConditions = nonNotebookConditions.filter(c => (c?.type || 'simple') === 'simple');
    const keysForSimple = simpleConditions
      .map(c => (typeof c.parameter === 'string' ? c.parameter.split('.').pop() : null))
      .filter(Boolean);
    const isNotebookOnly = allConditions.length > 0 && nonNotebookConditions.length === 0;
    const needsInfluxLatest = !isNotebookOnly && keysForSimple.length > 0; // 最新値が必要なのは simple のみ、かつキーがある場合
    let assetData = null;

    if (isNotebookOnly) {
      console.log('[AR] notebook-only rule; skipping InfluxDB fetch');
      assetData = {};
    } else if (needsInfluxLatest) {
      // 最新のアセットデータ取得（非Notebook条件がある場合のみ）
      console.log('[AR] fetch latest asset data', { ruleId: rule.id, assetId: (rule.asset_id || rule.assetId), now: new Date().toISOString() });
      assetData = await getLatestAssetData((rule.asset_id || rule.assetId), keysForSimple);
      console.log('[AR] fetch result', { hasData: !!assetData, assetData });
    } else {
      // simple 条件があるがキーが無い、または非Notebook条件は zscore 等のみ
      console.log('[AR] no latest fetch required (no keys or only non-latest conditions)');
      assetData = {};
    }
    
    if (!assetData) {
      if (needsInfluxLatest) {
        console.log(`No data available for asset ${rule.asset_id || rule.assetId}`);
        executionStatus = 'warning';
        errorMessage = 'No data available for asset - InfluxDB may not be connected or data does not exist';
      } else {
        assetData = {};
      }
    }

    if (assetData) {
      console.log(`Asset data found:`, assetData);
      const conditions = allConditions;
      const actions = parseArrayFlexible(rule.actions);

      let conditionsMet = true;
      for (const condition of nonNotebookConditions) {
        const conditionResult = evaluateCondition(condition, assetData);
        conditionsResult[condition.id || condition.parameter] = conditionResult;
        if (!conditionResult) {
          conditionsMet = false;
        }
      }

      if (conditionsMet) {
        console.log(`Alert rule ${rule.id} conditions met, executing actions`);

        // Notebook 条件があればURLログ出力
        const notebookConditions = conditions.filter(condition => condition.type === 'notebook');
        if (notebookConditions.length > 0) {
          for (const condition of notebookConditions) {
            const notebookPath = condition.notebookConfig?.notebook;
            if (notebookPath) {
              const notebookUrl = `https://glicocmms-cbm-notebooks.org/notebooks/${notebookPath}`;
              console.log(`Notebook executed: ${notebookPath}`);
              console.log(`Notebook URL: ${notebookUrl}`);
              try {
                // 実行と完了待機（テスト実行と同等の挙動）
                const NOTEBOOK_API_URL = 'https://glicocmms-cbm-notebooks.org/api/run';
                const NOTEBOOK_API_KEY = process.env.NOTEBOOK_API_KEY || 'SuperSecretKey';
                const execTime = condition.notebookConfig?.executionTime || 30000;
                const maxRetries = condition.notebookConfig?.maxRetries || 3;
                const parameters = condition.notebookConfig?.parameters || {};

                const runResp = await fetch(NOTEBOOK_API_URL, {
                  method: 'POST',
                  headers: {
                    'X-API-Key': NOTEBOOK_API_KEY,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ notebook: notebookPath, parameters })
                });
                if (!runResp.ok) {
                  const errorText = await runResp.text();
                  throw new Error(`Notebook run start failed ${runResp.status}: ${errorText}`);
                }
                const runResult = await runResp.json();
                const finalResult = await pollNotebookStatus(runResult.run_id, execTime, maxRetries);
                console.log('Notebook final result:', finalResult);
              } catch (nbErr) {
                console.error('Notebook execution error:', nbErr);
                executionStatus = 'warning';
                errorMessage = `Notebook execution error: ${nbErr?.message || nbErr}`;
              }
            }
          }
        }

        for (const action of actions) {
          await executeAction(action, rule, assetData);
        }
      }
    }
  } catch (error) {
    console.error(`Error executing alert rule ${rule.id}:`, error);
    executionStatus = 'error';
    errorMessage = error.message;
  } finally {
    // 実行ログを保存
    const executionDuration = Date.now() - startTime;
    try {
      await db.saveAlertRuleExecutionLog({
        ruleId: rule.id,
        assetId: rule.asset_id || rule.assetId,
        executionType: 'scheduled',
        executionTime: new Date().toISOString(),
        executionDuration: executionDuration,
        status: executionStatus,
        conditionsEvaluated: parseArrayFlexible(rule.conditions),
        conditionsResult: conditionsResult,
        triggeredAlertId: triggeredAlertId,
        errorMessage: errorMessage,
        executionContext: {
          ruleName: rule.name,
          checkInterval: rule.check_interval
        }
      });
    } catch (logError) {
      console.error('Failed to save execution log:', logError);
    }
  }
}

async function getLatestAssetData(assetId, keys = []) {
	console.log('[AR] getLatestAssetData called', { assetId, keys });
	try {
		const config = await db.getActiveInfluxDBConfig();
		console.log('[AR] influx config', { found: !!config });
		if (!config || !keys.length) {
			console.log('[AR] early return null', { reason: !config ? 'no-config' : 'no-keys' });
			return null;
		}

		// InfluxDB接続状態を確認
		if (!influxDBManager.isConnected) {
			console.log('[AR] InfluxDB not connected, attempting to connect...');
			const connectionResult = await influxDBManager.connect(config);
			if (!connectionResult.success) {
				console.error('[AR] InfluxDB connection failed:', connectionResult.error);
				return null;
			}
		}

		const map = await influxDBManager.getLatestValuesV3(assetId, keys, 1);
		console.log('[AR] influx latest map', { size: map ? Object.keys(map).length : 0, map });
		if (!map || Object.keys(map).length === 0) return null;
		return { value: map };
	} catch (e) {
		console.error('[AR] getLatestAssetData error', e);
		return null;
	}
}

// 条件評価
function evaluateCondition(condition, data) {
  const resolvePath = (obj, path) => {
    if (!obj || !path) return undefined;
    const parts = String(path).split('.');
    let cur = obj;
    for (const part of parts) {
      if (cur == null) return undefined;
      cur = cur[part];
    }
    return cur;
  };

  const fieldValue = resolvePath(data, condition.parameter);
  if (fieldValue === null || fieldValue === undefined) {
    return false;
  }

  const conditionValue = condition.value;
  const fieldValueNum = typeof fieldValue === 'string' ? parseFloat(fieldValue) : fieldValue;
  const conditionValueNum = typeof conditionValue === 'string' ? parseFloat(conditionValue) : conditionValue;

  switch (condition.operator) {
    case '>':
      return fieldValueNum > conditionValueNum;
    case '<':
      return fieldValueNum < conditionValueNum;
    case '=':
      return fieldValueNum === conditionValueNum;
    case '>=':
      return fieldValueNum >= conditionValueNum;
    case '<=':
      return fieldValueNum <= conditionValueNum;
    case '!=':
      return fieldValueNum !== conditionValueNum;
    default:
      return false;
  }
}

// アクション実行
async function executeAction(action, rule, data) {
  try {
    switch (action.type) {
      case 'mqtt': {
        // MQTTパブリッシュ
        const mqttMessage = action.config?.message || `Alert: ${rule.name}`;
        const mqttTopic = action.config?.topic || 'alerts/general';

        // 現在接続中のクライアントへ送信
        mqttConnections.forEach((connection) => {
          if (connection.status === 'connected' && connection.client) {
            connection.client.publish(mqttTopic, mqttMessage);
            console.log(`Published alert message to ${mqttTopic}: ${mqttMessage}`);
          }
        });
        break;
      }
      case 'webhook': {
        // Webhook にPOST
        if (action.config?.url) {
          const webhookData = {
            ruleId: rule.id,
            ruleName: rule.name,
            assetId: rule.asset_id || rule.assetId,
            timestamp: new Date().toISOString(),
            data: data
          };

          const response = await fetch(action.config.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(webhookData)
          });

          if (response.ok) {
            console.log(`Webhook sent successfully to ${action.config.url}`);
          } else {
            console.error(`Webhook failed: ${response.status}`);
          }
        }
        break;
      }
      default:
        console.log(`Action type ${action.type} not implemented`);
    }
  } catch (error) {
    console.error(`Error executing action ${action.type}:`, error);
  }
}

// リアルタイムアラート評価
async function evaluateRealtimeAlertRules(topic, message, timestamp) {
  try {
    console.log(`Evaluating real-time alert rules for topic: ${topic}`);

    // トピックからアセットを特定
    const asset = await getAssetByTopic(topic);
    if (!asset) {
      console.log(`No asset found for topic: ${topic}`);
      return;
    }

    // 対象アセットのリアルタイムルールのみ取得 (checkInterval === 0)
    const rules = await db.getAlertRules(asset.id);
    const realtimeRules = rules.filter(rule => rule.checkInterval === 0 && rule.isActive);

    if (realtimeRules.length === 0) {
      console.log(`No real-time alert rules found for asset: ${asset.id}`);
      return;
    }

    console.log(`Found ${realtimeRules.length} real-time alert rules for asset: ${asset.id}`);

    // メッセージをJSONとして解釈（失敗時は数値/文字列フォールバック）
    let data;
    try {
      data = JSON.parse(message);
    } catch (error) {
      const numValue = parseFloat(message);
      data = isNaN(numValue) ? { value: message } : { value: numValue };
    }

    // 各ルール評価
    for (const rule of realtimeRules) {
      console.log(`Evaluating real-time rule ${rule.id} (${rule.name})`);

    const conditions = parseArrayFlexible(rule.conditions);
    const nonNotebookConditions = conditions.filter(c => c?.type !== 'notebook');
    const actions = parseArrayFlexible(rule.actions);

      let conditionsMet = true;
    for (const condition of nonNotebookConditions) {
        if (!evaluateCondition(condition, data)) {
          conditionsMet = false;
          break;
        }
      }

      if (conditionsMet) {
        console.log(`Real-time alert rule ${rule.id} conditions met, executing actions`);

        // Notebook 参照ログ
        const notebookConditions = conditions.filter(condition => condition.type === 'notebook');
        if (notebookConditions.length > 0) {
          for (const condition of notebookConditions) {
            const notebookPath = condition.notebookConfig?.notebook;
            if (notebookPath) {
              const notebookUrl = `https://glicocmms-cbm-notebooks.org/notebooks/${notebookPath}`;
              console.log(`Real-time Notebook executed: ${notebookPath}`);
              console.log(`Real-time Notebook URL: ${notebookUrl}`);
            }
          }
        }

        for (const action of actions) {
          await executeAction(action, rule, data);
        }
      }
    }
  } catch (error) {
    console.error(`Error evaluating real-time alert rules:`, error);
  }
}

async function getAssetByTopic(topic) {
  try {
    const assets = await db.getAllAssets();
    return assets.find(asset => asset.mqttTopic === topic);
  } catch (error) {
    console.error('Error getting asset by topic:', error);
    return null;
  }
}

// WebSocket サーバ
const wss = new WebSocket.Server({ noServer: true });

// 既存接続を切断（clientIdベース）
function disconnectExistingConnection(clientId) {
  console.log(`Checking for existing connection with clientId: ${clientId}`);

  // ベースID（_より前）
  const baseOf = (id) => (id || '').toString().split('_')[0];
  const targetBase = baseOf(clientId);
  for (const [connectionId, connection] of mqttConnections.entries()) {
    const existingUnique = connection.config.uniqueClientId || connection.config.clientId;
    const existingBase = connection.config.originalClientId || baseOf(connection.config.clientId);
    const isSame = baseOf(existingUnique) === targetBase || existingBase === targetBase;

    if (isSame) {
      // 既存接続が生きている場合は再利用し、切断しない
      if (connection.client && connection.status === 'connected' && connection.client.connected) {
        console.log(`Existing connection found and alive: ${connectionId}, reusing without disconnect`);
        // 既存接続の接続IDを通知
        broadcastToWebSocketClients({
          type: 'connection_status',
          status: 'connected',
          connectionId
        });
        return true;
      }

      console.log(`Found existing connection but not alive: ${connectionId}, disconnecting...`);
      try {
        if (connection.client && !connection.client.disconnected) {
          connection.client.options.reconnectPeriod = 0;
          connection.client.end(true); // force disconnect
        }
      } catch (_) {}

      mqttConnections.delete(connectionId);

      broadcastToWebSocketClients({
        type: 'connection_status',
        status: 'disconnected',
        connectionId
      });

      return false;
    }
  }

  return false;
}

// MQTT 接続の作成エントリ
function createMQTTConnection(config) {
  // 一意なクライアントID
  const uniqueClientId = config.clientId; // フロントからの永続IDをそのまま使用
  const connectionId = `${uniqueClientId}_${Date.now()}`;

  try {
    console.log('=== Creating MQTT Connection ===');
    console.log('Config:', config);
    console.log('Current connections:', Array.from(mqttConnections.keys()));

    // 同一ベースIDの既存接続があれば再利用（生きていれば）/ 死んでいれば切断
    const hadExistingConnection = disconnectExistingConnection(config.clientId);

    // 既存接続が生きていれば新規接続は作らず終了
    if (hadExistingConnection) {
      console.log('Existing connection reused. Skipping new MQTT connection.');
      return { connectionId: Array.from(mqttConnections.keys())[0] || connectionId };
    }

    // 新規接続
    const delay = 100;

    setTimeout(() => {
      createNewConnection(config, connectionId, uniqueClientId);
    }, delay);

    return { connectionId };
  } catch (error) {
    console.error(`Failed to create MQTT connection: ${connectionId}`, error);
    throw error;
  }
}

// 実際の接続作成
function createNewConnection(config, connectionId, uniqueClientId) {
  try {
    console.log(`Creating new connection: ${connectionId}`);

    // 必須検証
    if (!config.broker || !config.port || !config.clientId) {
      throw new Error('broker, port, clientId は必須です');
    }

    // MQTT クライアントオプション
    let options = {
      clientId: uniqueClientId,
      clean: true,
      reconnectPeriod: 0, // 自動再接続なし
      connectTimeout: 30000,
      keepalive: 30, // 30秒
      reschedulePings: true,
      queueQoSZero: false,
      rejectUnauthorized: false, // 検証は下で条件付き
      protocolVersion: 4, // MQTT v3.1.1
      properties: {
        sessionExpiryInterval: 0,
        maximumPacketSize: 0,
        receiveMaximum: 0,
        topicAliasMaximum: 0,
        requestResponseInformation: false,
        requestProblemInformation: false,
        userProperties: []
      }
    };

    if (config.port === 8883) {
      // SSL (AWS IoT Core など)
      const url = `mqtts://${config.broker}:${config.port}`;
      console.log('Connection URL:', url);

      if (config.certificatePath && config.privateKeyPath) {
        try {
          const certPath = path.join(__dirname, '..', config.certificatePath);
          const keyPath = path.join(__dirname, '..', config.privateKeyPath);

          console.log('Certificate path:', certPath);
          console.log('Private key path:', keyPath);
          console.log('Certificate file exists:', fs.existsSync(certPath));
          console.log('Private key file exists:', fs.existsSync(keyPath));

          if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
            try {
              options.cert = fs.readFileSync(certPath);
              options.key = fs.readFileSync(keyPath);
              console.log('Certificate files loaded successfully');

              // CA証明書があれば検証ON
              if (config.caPath && config.caPath !== config.certificatePath) {
                const caPath = path.join(__dirname, '..', config.caPath);
                if (fs.existsSync(caPath)) {
                  options.ca = fs.readFileSync(caPath);
                  console.log('CA certificate loaded');
                  options.rejectUnauthorized = true;
                } else {
                  console.log('CA certificate file not found, disabling certificate verification');
                  options.rejectUnauthorized = false;
                }
              } else {
                console.log('No valid CA certificate path, disabling certificate verification');
                options.rejectUnauthorized = false;
              }

              console.log(`Certificate authentication enabled for ${connectionId}`);
            } catch (fileError) {
              console.error(`Error reading certificate files:`, fileError);
              throw new Error('証明書/秘密鍵の読み込みに失敗しました');
            }
          } else {
            console.log(`Certificate files not found, using development mode for ${connectionId}`);
            options.rejectUnauthorized = false;
          }
        } catch (error) {
          console.error(`Certificate error for ${connectionId}:`, error);
          throw new Error('証明書設定でエラーが発生しました');
        }
      } else {
        console.log('No certificate paths provided, using development mode');
        options.rejectUnauthorized = false;
      }

      console.log('MQTT options:', {
        ...options,
        cert: options.cert ? '[CERTIFICATE]' : undefined,
        key: options.key ? '[PRIVATE_KEY]' : undefined,
        ca: options.ca ? '[CA_CERTIFICATE]' : undefined,
        rejectUnauthorized: options.rejectUnauthorized
      });

      const client = mqtt.connect(url, options);

      client.on('connect', () => {
        console.log(`MQTT connected: ${connectionId}`);
        console.log(`Connection details: clientId=${uniqueClientId}, broker=${config.broker}:${config.port}`);
        console.log(`Connection established at: ${new Date().toISOString()}`);
        console.log(`MQTT client state:`, {
          disconnected: client.disconnected,
          reconnecting: client.reconnecting,
          connected: client.connected
        });

        mqttConnections.set(connectionId, {
          client,
          config: {
            ...config,
            uniqueClientId: uniqueClientId,
            originalClientId: (config.clientId || '').toString().split('_')[0]
          },
          status: 'connected',
          connectedAt: new Date(),
          subscribedTopics: new Set()
        });

        // WebSocket に接続状態を通知
        broadcastToWebSocketClients({
          type: 'connection_status',
          status: 'connected',
          connectionId
        });

        // 即時ハートビートを1回送信
        const immediateHeartbeat = () => {
          const heartbeatMessage = {
            timestamp: new Date().toISOString(),
            clientId: uniqueClientId,
            duration: 0,
            status: 'immediate_heartbeat'
          };

          client.publish('system/heartbeat', JSON.stringify(heartbeatMessage), (err) => {
            if (err) {
              console.error(`Immediate heartbeat send error for ${connectionId}:`, err.message);
            } else {
              console.log(`Immediate heartbeat sent: ${connectionId}`);
            }
          });
        };

        immediateHeartbeat();

        // 以後30秒ごとにハートビート
        const heartbeatInterval = setInterval(() => {
          if (client.disconnected) {
            console.log(`MQTT client ${connectionId} is disconnected, stopping heartbeat`);
            clearInterval(heartbeatInterval);
          } else {
            const connection = mqttConnections.get(connectionId);
            const duration = connection && connection.connectedAt ?
              Math.round((new Date() - new Date(connection.connectedAt)) / 1000) : 0;
            console.log(`MQTT heartbeat: ${connectionId} - clientId: ${uniqueClientId} - connected for ${duration}s`);

            const heartbeatMessage = {
              timestamp: new Date().toISOString(),
              clientId: uniqueClientId,
              duration: duration,
              status: 'heartbeat'
            };

            client.publish('system/heartbeat', JSON.stringify(heartbeatMessage), (err) => {
              if (err) {
                console.error(`Heartbeat send error for ${connectionId}:`, err.message);
              } else {
                console.log(`Heartbeat sent: ${connectionId} - ${duration}s`);
              }
            });
          }
        }, 30000); // 30秒
      });

      client.on('message', (topic, message) => {

        // InfluxDB へ保存
        influxDBManager.saveMQTTMessage(topic, message.toString(), new Date())
          .then(result => {
            if (!result.success) {
              console.error(`Failed to save MQTT message to InfluxDB: ${topic}`, result.error);
            }
          })
          .catch(error => {
            console.error(`Error saving MQTT message to InfluxDB: ${topic}`, error);
          });

        // リアルタイムアラート評価
        evaluateRealtimeAlertRules(topic, message.toString(), new Date());

        // WebSocket ブロードキャスト
        broadcastToWebSocketClients({
          type: 'mqtt_message',
          topic,
          message: message.toString(),
          timestamp: new Date().toISOString()
        });
      });

      client.on('error', (error) => {
        console.error(`MQTT error for ${connectionId}:`, error);
        console.error(`Error details:`, {
          message: error.message,
          code: error.code,
          errno: error.errno,
          syscall: error.syscall,
          address: error.address,
          port: error.port
        });
        mqttConnections.set(connectionId, {
          client,
          config,
          status: 'error',
          error: error.message,
          errorDetails: error
        });

        broadcastToWebSocketClients({
          type: 'connection_status',
          status: 'error',
          error: error.message
        });
      });

      client.on('close', (hadError) => {
        console.log(`MQTT connection closed: ${connectionId}`);
        console.log(`Close details: hadError=${hadError}`);
        console.log(`Close timestamp: ${new Date().toISOString()}`);
        console.log(`Client state at close:`, {
          disconnected: client.disconnected,
          reconnecting: client.reconnecting,
          connected: client.connected
        });

        const connection = mqttConnections.get(connectionId);
        if (connection) {
          const duration = connection.connectedAt ?
            Math.round((new Date() - connection.connectedAt) / 1000) : 'unknown';
          console.log(`Connection duration: ${duration} seconds`);

          if (duration <= 5) {
            console.log(`WARNING: Connection closed within 5 seconds - possible AWS IoT Core policy or client ID issue`);
          } else if (duration >= 60 && duration <= 65) {
            console.log(`WARNING: Connection closed after ~1 minute - possible AWS IoT Core policy timeout`);
          } else if (duration >= 120) {
            console.log(`SUCCESS: Connection maintained for ${duration} seconds`);
          } else if (hadError) {
            console.log(`ERROR: Connection closed with error`);
          } else {
            console.log(`INFO: Connection closed normally after ${duration} seconds`);
          }
        }

        // 接続削除
        mqttConnections.delete(connectionId);

        // WebSocket 通知
        broadcastToWebSocketClients({
          type: 'connection_status',
          status: 'disconnected',
          connectionId
        });

        console.log(`MQTT connection ${connectionId} closed, no automatic reconnection`);
      });

      client.on('reconnect', () => {
        console.log(`MQTT reconnecting: ${connectionId}`);
        mqttConnections.set(connectionId, {
          client,
          config,
          status: 'reconnecting'
        });
      });

      client.on('offline', () => {
        console.log(`MQTT offline: ${connectionId}`);
        mqttConnections.set(connectionId, {
          client,
          config,
          status: 'offline'
        });
      });

      // 状態監視（60秒ごとログ）
      const connectionMonitor = setInterval(() => {
        if (client.disconnected) {
          console.log(`MQTT connection ${connectionId} is disconnected, clearing monitor`);
          clearInterval(connectionMonitor);
        }
      }, 60000);

    } else if (config.port === 1883) {
      // 平文MQTT
      const url = `mqtt://${config.broker}:${config.port}`;
      console.log('Connection URL:', url);

      const client = mqtt.connect(url, options);

      client.on('connect', () => {
        console.log(`MQTT connected: ${connectionId}`);
        console.log(`Connection details: clientId=${config.clientId}, broker=${config.broker}:${config.port}`);
        mqttConnections.set(connectionId, {
          client,
          config: {
            ...config,
            uniqueClientId: uniqueClientId,
            originalClientId: (config.clientId || '').toString().split('_')[0]
          },
          status: 'connected',
          connectedAt: new Date(),
          subscribedTopics: new Set()
        });

        broadcastToWebSocketClients({
          type: 'connection_status',
          status: 'connected',
          connectionId
        });
      });

      client.on('message', (topic, message) => {

        // InfluxDB 保存
        influxDBManager.saveMQTTMessage(topic, message.toString(), new Date())
          .then(result => {
            if (!result.success) {
              console.error(`Failed to save MQTT message to InfluxDB: ${topic}`, result.error);
            }
          })
          .catch(error => {
            console.error(`Error saving MQTT message to InfluxDB: ${topic}`, error);
          });

        // リアルタイムアラート
        evaluateRealtimeAlertRules(topic, message.toString(), new Date());

        broadcastToWebSocketClients({
          type: 'mqtt_message',
          topic,
          message: message.toString(),
          timestamp: new Date().toISOString()
        });
      });

      client.on('error', (error) => {
        console.error(`MQTT error for ${connectionId}:`, error);
        console.error(`Error details:`, {
          message: error.message,
          code: error.code,
          errno: error.errno,
          syscall: error.syscall,
          address: error.address,
          port: error.port
        });
        mqttConnections.set(connectionId, {
          client,
          config,
          status: 'error',
          error: error.message,
          errorDetails: error
        });

        broadcastToWebSocketClients({
          type: 'connection_status',
          status: 'error',
          error: error.message
        });
      });

      client.on('close', (hadError) => {
        console.log(`MQTT connection closed: ${connectionId}`);
        console.log(`Close details: hadError=${hadError}`);

        const connection = mqttConnections.get(connectionId);
        if (connection) {
          const duration = connection.connectedAt ?
            Math.round((new Date() - connection.connectedAt) / 1000) : 'unknown';
          console.log(`Connection duration: ${duration} seconds`);
        }

        mqttConnections.delete(connectionId);

        broadcastToWebSocketClients({
          type: 'connection_status',
          status: 'disconnected',
          connectionId
        });
      });

    } else {
      throw new Error(`Unsupported port: ${config.port}`);
    }
  } catch (error) {
    console.error(`Failed to create new connection: ${connectionId}`, error);
    throw error;
  }
}

function broadcastToWebSocketClients(data) {
  console.log('=== BROADCAST TO WEBSOCKET CLIENTS ===');
  console.log('Data to broadcast:', data);
  console.log('Number of WebSocket clients:', wsClients.size);

  let sentCount = 0;
  wsClients.forEach((client, index) => {
    console.log(`Client ${index + 1} state:`, client.readyState);
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify(data));
        sentCount++;
        console.log(`Message sent to client ${index + 1}`);
      } catch (error) {
        console.error(`Error sending to client ${index + 1}:`, error);
      }
    } else {
      console.log(`Client ${index + 1} not ready (state: ${client.readyState})`);
    }
  });

  console.log(`Broadcast completed: ${sentCount}/${wsClients.size} clients received message`);
}

// WebSocket 接続
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  wsClients.add(ws);

  // 既存のMQTT接続状態を通知
  mqttConnections.forEach((connection, connectionId) => {
    if (connection.status === 'connected') {
      console.log(`Notifying new WebSocket client of existing MQTT connection: ${connectionId}`);
      ws.send(JSON.stringify({
        type: 'connection_status',
        status: 'connected',
        connectionId
      }));
    }
  });

  ws.on('message', (message) => {
    try {
      console.log('Received WebSocket message:', message.toString());
      const data = JSON.parse(message);

      switch (data.type) {
        case 'connect': {
          console.log('MQTT connection request received:', data.config);
          try {
            const { connectionId } = createMQTTConnection(data.config);
            console.log('MQTT connection created with ID:', connectionId);
            ws.send(JSON.stringify({
              type: 'connection_status',
              status: 'connecting',
              connectionId
            }));
          } catch (error) {
            console.error('Failed to create MQTT connection:', error);
            ws.send(JSON.stringify({
              type: 'connection_status',
              status: 'error',
              error: error.message
            }));
          }
          break;
        }
        case 'subscribe': {
          console.log('=== SUBSCRIBE REQUEST ===');
          console.log('Client ID:', data.clientId);
          console.log('Topic:', data.topic);
          console.log('Available connections:', Array.from(mqttConnections.entries()).map(([id, conn]) => ({
            connectionId: id,
            clientId: conn.config.uniqueClientId,
            originalClientId: conn.config.originalClientId,
            status: conn.status
          })));

          const baseOf = (id) => (id || '').toString().split('_')[0];
          const connection = Array.from(mqttConnections.values()).find(conn =>
            conn.config.uniqueClientId === data.clientId ||
            conn.config.clientId === data.clientId ||
            conn.config.originalClientId === baseOf(data.clientId)
          );

          console.log('Found connection:', connection ? {
            clientId: connection.config.uniqueClientId,
            status: connection.status,
            connected: connection.client.connected
          } : 'NOT FOUND');

          if (connection && connection.status === 'connected') {
            console.log(`Subscribing to topic: ${data.topic}`);
            // 重複サブスク防止
            if (connection.subscribedTopics && connection.subscribedTopics.has(data.topic)) {
              console.log(`Already subscribed to topic: ${data.topic}`);
              ws.send(JSON.stringify({
                type: 'subscribe_status',
                status: 'success',
                topic: data.topic
              }));
              break;
            }
            connection.client.subscribe(data.topic, (err) => {
              if (err) {
                console.error(`Subscribe error for topic ${data.topic}:`, err);
                ws.send(JSON.stringify({
                  type: 'subscribe_status',
                  status: 'error',
                  topic: data.topic,
                  error: err.message
                }));
              } else {
                console.log(`Successfully subscribed to topic: ${data.topic}`);
                try { if (connection.subscribedTopics) connection.subscribedTopics.add(data.topic); } catch (_) {}
                ws.send(JSON.stringify({
                  type: 'subscribe_status',
                  status: 'success',
                  topic: data.topic
                }));
              }
            });
          } else {
            console.error(`Cannot subscribe: connection not found or not connected`);
            console.error('Connection details:', {
              found: !!connection,
              status: connection?.status,
              connected: connection?.client?.connected
            });
            ws.send(JSON.stringify({
              type: 'subscribe_status',
              status: 'error',
              topic: data.topic,
              error: 'Connection not found or not connected'
            }));
          }
          break;
        }
        case 'publish': {
          console.log('=== PUBLISH REQUEST ===');
          console.log('Client ID:', data.clientId);
          console.log('Topic:', data.topic);
          console.log('Message:', data.message);
          console.log('Total connections:', mqttConnections.size);
          console.log('All connections:', Array.from(mqttConnections.entries()).map(([id, conn]) => ({
            connectionId: id,
            uniqueClientId: conn.config.uniqueClientId,
            originalClientId: conn.config.originalClientId,
            status: conn.status
          })));

          const pubConnection = Array.from(mqttConnections.values()).find(conn =>
            conn.config.uniqueClientId === data.clientId ||
            conn.config.clientId === data.clientId ||
            conn.config.originalClientId === (data.clientId || '').toString().split('_')[0]
          );

          console.log('Found connection for publish:', pubConnection ? {
            clientId: pubConnection.config.uniqueClientId,
            originalClientId: pubConnection.config.originalClientId,
            status: pubConnection.status,
            connected: pubConnection.client.connected
          } : 'NOT FOUND');

          if (pubConnection && pubConnection.status === 'connected') {
            console.log(`Publishing to topic: ${data.topic}`);
            pubConnection.client.publish(data.topic, data.message, (err) => {
              if (err) {
                console.error(`Publish error for topic ${data.topic}:`, err);
                ws.send(JSON.stringify({
                  type: 'publish_status',
                  status: 'error',
                  topic: data.topic,
                  error: err.message
                }));
              } else {
                console.log(`Successfully published to topic: ${data.topic}`);
                ws.send(JSON.stringify({
                  type: 'publish_status',
                  status: 'success',
                  topic: data.topic
                }));
              }
            });
          } else {
            console.error(`Cannot publish: connection not found or not connected`);
            ws.send(JSON.stringify({
              type: 'publish_status',
              status: 'error',
              topic: data.topic,
              error: 'Connection not found or not connected'
            }));
          }
          break;
        }
        case 'disconnect': {
          console.log('=== DISCONNECT REQUEST ===');
          console.log('Client ID:', data.clientId);

          const disconnectConnection = Array.from(mqttConnections.values()).find(conn =>
            conn.config.uniqueClientId === data.clientId ||
            conn.config.clientId === data.clientId ||
            conn.config.originalClientId === (data.clientId || '').toString().split('_')[0]
          );

          console.log('Found connection for disconnect:', disconnectConnection ? {
            clientId: disconnectConnection.config.uniqueClientId,
            originalClientId: disconnectConnection.config.originalClientId,
            status: disconnectConnection.status
          } : 'NOT FOUND');

          if (disconnectConnection) {
            console.log('Disconnecting MQTT client...');
            disconnectConnection.client.end();
            ws.send(JSON.stringify({
              type: 'connection_status',
              status: 'disconnected',
              clientId: data.clientId
            }));
          } else {
            console.log('No connection found to disconnect');
          }
          break;
        }
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    wsClients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    wsClients.delete(ws);
  });
});

// サーバ初期化
const initializeServer = async () => {
  try {
    console.log('Initializing server...');

    // まずは環境変数でPostgreSQL接続を試みる
    try {
      const envConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'asset_manager',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || ''
      };

      console.log('Attempting to connect using environment variables...');
      await db.createPool(envConfig);
      await db.initializeDatabase();
      console.log('PostgreSQL connection established using environment variables');

      // 成功したら設定も保存
      await db.savePostgresConfig(envConfig);
      console.log('Environment-based config saved to database');

    } catch (envError) {
      console.log('Environment-based connection failed:', envError.message);
      console.log('Environment config used:', {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'asset_manager',
        user: process.env.DB_USER || 'postgres',
        hasPassword: !!process.env.DB_PASSWORD
      });

      // 保存済み設定があれば復元
      try {
        console.log('Attempting to restore saved PostgreSQL config...');
        const savedConfig = await db.getActivePostgresConfig();
        if (savedConfig) {
          console.log('Found saved PostgreSQL config, restoring connection...');
          console.log('Config details:', {
            host: savedConfig.host,
            port: savedConfig.port,
            database: savedConfig.database,
            user: savedConfig.user,
            password: savedConfig.password ? '***' : 'empty'
          });

          await db.createPool(savedConfig);
          await db.initializeDatabase();
          console.log('PostgreSQL connection restored successfully');
        } else {
          console.log('No saved PostgreSQL config found');
          console.log('Please configure database connection through the web interface');
        }
      } catch (savedError) {
        console.log('Failed to restore PostgreSQL connection:', savedError.message);
        console.log('Server will start without database connection');
        console.log('You can configure the database connection through the web interface');
      }
    }

    // 保存済み MQTT 設定があれば復元
    try {
      const savedMQTTConfig = await db.getLatestMQTTConfig();
      if (savedMQTTConfig) {
        console.log('Found saved MQTT config, restoring connection...');
        console.log('MQTT Config details:', {
          broker: savedMQTTConfig.broker,
          port: savedMQTTConfig.port,
          clientId: savedMQTTConfig.client_id,
          username: savedMQTTConfig.username || 'none',
          hasPassword: !!savedMQTTConfig.password
        });

        const { connectionId } = createMQTTConnection({
          broker: savedMQTTConfig.broker,
          port: savedMQTTConfig.port,
          clientId: savedMQTTConfig.client_id,
          username: savedMQTTConfig.username || '',
          password: savedMQTTConfig.password || '',
          certificatePath: savedMQTTConfig.certificate_path || '',
          privateKeyPath: savedMQTTConfig.private_key_path || '',
          caPath: savedMQTTConfig.ca_path || '',
          certificateContent: savedMQTTConfig.certificate_content || '',
          privateKeyContent: savedMQTTConfig.private_key_content || '',
          caContent: savedMQTTConfig.ca_content || ''
        });
        console.log('MQTT connection restored successfully with ID:', connectionId);
      } else {
        console.log('No saved MQTT config found');
      }
    } catch (error) {
      console.log('Failed to restore MQTT connection:', error.message);
      console.log('Server will start without MQTT connection');
    }

    // 保存済み InfluxDB 設定があれば復元
    try {
      const savedInfluxDBConfig = await db.getActiveInfluxDBConfig();
      if (savedInfluxDBConfig) {
        console.log('Found saved InfluxDB config, restoring connection...');
        console.log('InfluxDB Config details:', {
          url: savedInfluxDBConfig.url,
          org: savedInfluxDBConfig.org,
          bucket: savedInfluxDBConfig.bucket,
          hasToken: !!savedInfluxDBConfig.token
        });

        const connectionResult = await influxDBManager.connect({
          url: savedInfluxDBConfig.url,
          token: savedInfluxDBConfig.token || '',
          org: savedInfluxDBConfig.org,
          bucket: savedInfluxDBConfig.bucket
        });

        if (connectionResult.success) {
          console.log('InfluxDB connection restored successfully');
        } else {
          console.log('Failed to restore InfluxDB connection:', connectionResult.error);
        }
      } else {
        console.log('No saved InfluxDB config found');
      }
    } catch (error) {
      console.log('Failed to restore InfluxDB connection:', error.message);
      console.log('Server will start without InfluxDB connection');
    }

    // アラートルールのタイマー起動
    try {
      console.log('Starting alert rule timers...');
      const allRules = await db.getAllAlertRules();
      console.log(`Found ${allRules.length} alert rules`);

  for (const rule of allRules) {
    const active = rule.is_active ?? rule.isActive;
    if (active) startAlertRuleTimer(rule);
  }

      console.log(`Started ${alertRuleTimers.size} active alert rule timers`);
    } catch (error) {
      console.log('Failed to start alert rule timers:', error.message);
    }

    // HTTP サーバ起動
    global.server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);

      // 登録済みルート一覧
      console.log('=== REGISTERED ROUTES ===');
      app._router.stack.forEach((middleware) => {
        if (middleware.route) {
          const methods = Object.keys(middleware.route.methods).join(', ').toUpperCase();
          console.log(`${methods} ${middleware.route.path}`);
        }
      });
      console.log('=== END REGISTERED ROUTES ===');
    });

    // WebSocket Upgrade
    server.on('upgrade', (request, socket, head) => {
      // /ws と / はWS受け入れ
      if (request.url === '/ws' || request.url === '/') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    // 終了シグナル
    process.on('SIGINT', () => {
      console.log('Shutting down server...');

      // MQTT切断
      mqttConnections.forEach((connection, connectionId) => {
        console.log(`Disconnecting MQTT connection: ${connectionId}`);
        connection.client.end();
      });

      // WS停止
      wss.close(() => {
        console.log('WebSocket server closed');
      });

      // HTTP停止
      server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('Failed to initialize server:', error);
    console.log('Server will continue running without database connections');
  }
};

// サーバ起動
const startServer = async () => {
  try {
    // PostgreSQL 初期接続
    await initializePostgreSQLConnection();

    // 残り初期化
    await initializeServer();
  } catch (error) {
    console.error('Failed to start server:', error);
    // 失敗しても最低限サーバは起動
    await initializeServer();
  }
};

startServer();
