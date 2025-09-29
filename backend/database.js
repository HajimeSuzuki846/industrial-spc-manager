const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// ローカル保存用のPostgreSQL設定ファイル
const POSTGRES_CONFIG_FILE = path.join(__dirname, 'postgres.config.json');

// ファイルから保存済みPostgreSQL設定を読み込む
function loadPostgresConfigFromFile() {
  try {
    if (fs.existsSync(POSTGRES_CONFIG_FILE)) {
      const raw = fs.readFileSync(POSTGRES_CONFIG_FILE, 'utf8');
      const cfg = JSON.parse(raw);
      if (cfg && cfg.host && cfg.database && cfg.user) {
        return cfg;
      }
    }
  } catch (_) {}
  return null;
}

// ファイルへPostgreSQL設定を保存する
function savePostgresConfigToFile(config) {
  try {
    const toSave = {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password || ''
    };
    fs.writeFileSync(POSTGRES_CONFIG_FILE, JSON.stringify(toSave, null, 2), 'utf8');
  } catch (e) {
    console.log('Warning: failed to persist postgres config to file:', e.message);
  }
}

// PostgreSQL接続プール
let pool = null;

// UUID生成関数
const generateUUID = () => {
  const generateRandomHex = (length) => {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  };

  const part1 = generateRandomHex(8);
  const part2 = generateRandomHex(4);
  const part3 = generateRandomHex(4);
  const part4 = generateRandomHex(4);
  const part5 = generateRandomHex(12);

  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
};

// データベース接続設定
const createPool = (config) => {
  console.log('Creating PostgreSQL pool with config:', {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password ? '***' : 'empty'
  });

  const connectionConfig = {
    host: config.host || process.env.DB_HOST || 'localhost',
    port: config.port || parseInt(process.env.DB_PORT) || 5432,
    database: config.database || process.env.DB_NAME || 'asset_manager',
    user: config.user || process.env.DB_USER || 'postgres',
    password: config.password || process.env.DB_PASSWORD || '',
    max: 20, // 最大接続数
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000, // 接続タイムアウトを延長
    ssl: false, // SSLを無効化
    application_name: 'asset_manager_app'
  };

  // パスワードが空文字列の場合は空文字列のままにする（undefinedにしない）
  if (connectionConfig.password === '') {
    connectionConfig.password = '';
  }

  console.log('Connection config:', {
    ...connectionConfig,
    password: connectionConfig.password ? '***' : 'empty'
  });

  // 既存のプールがあれば閉じる
  if (pool) {
    console.log('Closing existing pool');
    pool.end();
  }

  try {
    pool = new Pool(connectionConfig);
    console.log('Pool created successfully');
    
    // 接続テスト
    return pool.query('SELECT NOW() as current_time')
      .then((result) => {
        console.log('PostgreSQL connected successfully at:', result.rows[0].current_time);
        return true;
      })
      .catch((err) => {
        console.error('PostgreSQL connection failed:', err.message);
        console.error('Error code:', err.code);
        console.error('Error details:', err);
        
        // より詳細なエラー情報を提供
        if (err.code === 'ECONNREFUSED') {
          throw new Error(`データベースサーバーに接続できません。ホスト: ${connectionConfig.host}:${connectionConfig.port} が正しいか確認してください。`);
        } else if (err.code === '28P01') {
          throw new Error('認証に失敗しました。ユーザー名とパスワードを確認してください。');
        } else if (err.code === '3D000') {
          throw new Error(`データベース "${connectionConfig.database}" が存在しません。`);
        } else {
          throw new Error(`データベース接続エラー: ${err.message}`);
        }
      });
  } catch (error) {
    console.error('Failed to create pool:', error);
    throw error;
  }
};

// データベース接続テスト
const testConnection = async () => {
  console.log('testConnection: Checking database connection...');
  console.log('testConnection: Pool exists:', !!pool);
  
  if (!pool) {
    console.log('testConnection: No pool available, returning false');
    return false;
  }

  try {
    console.log('testConnection: Executing test query...');
    const result = await pool.query('SELECT NOW() as current_time');
    console.log('testConnection: Query result:', result.rows);
    const isConnected = result.rows.length > 0;
    console.log('testConnection: Connection status:', isConnected);
    return isConnected;
  } catch (error) {
    console.error('testConnection: Database connection test failed:', error);
    console.error('testConnection: Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    return false;
  }
};

// データベース初期化（テーブル作成）
const initializeDatabase = async () => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  console.log('Initializing database tables...');
  
  const createTables = `
    -- MQTT設定テーブル
    CREATE TABLE IF NOT EXISTS mqtt_configs (
      id SERIAL PRIMARY KEY,
      broker VARCHAR(255) NOT NULL,
      port INTEGER NOT NULL,
      client_id VARCHAR(255) NOT NULL,
      username VARCHAR(255),
      password VARCHAR(255),
      certificate_path TEXT,
      private_key_path TEXT,
      ca_path TEXT,
      certificate_content TEXT,
      private_key_content TEXT,
      ca_content TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 工場テーブル
    CREATE TABLE IF NOT EXISTS factories (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 生産ラインテーブル
    CREATE TABLE IF NOT EXISTS production_lines (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      factory_id VARCHAR(50) REFERENCES factories(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- アセットテーブル
    CREATE TABLE IF NOT EXISTS assets (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL CHECK (type IN ('sensor', 'actuator', 'controller', 'motor', 'pump', 'valve', 'conveyor', 'robot', 'camera', 'other')),
      line_id VARCHAR(50) REFERENCES production_lines(id) ON DELETE CASCADE,
      status VARCHAR(20) DEFAULT 'offline',
      data_source_type VARCHAR(20) DEFAULT 'mqtt' CHECK (data_source_type IN ('mqtt', 'thingsboard')),
      mqtt_topic VARCHAR(255),
      thingsboard_device_id VARCHAR(255),
      thingsboard_device_name VARCHAR(255),
      tags JSONB,
      is_alert_active BOOLEAN DEFAULT false,
      active_alert_rule VARCHAR(50),
      alert_triggered_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- アラートルールテーブル
    CREATE TABLE IF NOT EXISTS alert_rules (
      id VARCHAR(50) PRIMARY KEY,
      asset_id VARCHAR(50) REFERENCES assets(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      is_active BOOLEAN DEFAULT false,
      conditions JSONB,
      actions JSONB,
      check_interval INTEGER DEFAULT 300,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- タグのリセット履歴テーブル（履歴は別テーブルで管理）
    CREATE TABLE IF NOT EXISTS tag_reset_events (
      id SERIAL PRIMARY KEY,
      tag_id VARCHAR(50) NOT NULL,
      asset_id VARCHAR(50) NOT NULL,
      reset_at TIMESTAMP NOT NULL,
      value TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- PostgreSQL設定テーブル
    CREATE TABLE IF NOT EXISTS postgres_configs (
      id SERIAL PRIMARY KEY,
      host VARCHAR(255) NOT NULL,
      port INTEGER NOT NULL,
      database VARCHAR(255) NOT NULL,
      "user" VARCHAR(255) NOT NULL,
      password VARCHAR(255) NOT NULL,
      is_active BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Thingsboard設定テーブルは廃止

    -- InfluxDB設定テーブル
    CREATE TABLE IF NOT EXISTS influxdb_configs (
      id SERIAL PRIMARY KEY,
      url VARCHAR(255) NOT NULL,
      token VARCHAR(500),
      org VARCHAR(255) NOT NULL,
      bucket VARCHAR(255) NOT NULL,
      is_active BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- AlertRule実行ログテーブル
    CREATE TABLE IF NOT EXISTS alert_rule_execution_logs (
      id SERIAL PRIMARY KEY,
      rule_id VARCHAR(50) REFERENCES alert_rules(id) ON DELETE CASCADE,
      asset_id VARCHAR(50) REFERENCES assets(id) ON DELETE CASCADE,
      execution_type VARCHAR(20) NOT NULL,
      execution_time TIMESTAMP NOT NULL,
      execution_duration INTEGER, -- 実行時間（ミリ秒）
      status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'error', 'warning')),
      conditions_evaluated JSONB, -- 評価された条件の詳細
      conditions_result JSONB, -- 各条件の評価結果
      triggered_alert_id VARCHAR(50), -- 発火したアラートID（あれば）
      error_message TEXT, -- エラーメッセージ（エラーの場合）
      execution_context JSONB, -- 実行時のコンテキスト（データなど）
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await pool.query(createTables);
  console.log('Database tables created successfully');

  // インデックスの作成（テーブル作成後に実行）
  try {
    console.log('Creating database indexes...');
    const createIndexes = `
      CREATE INDEX IF NOT EXISTS idx_alert_rule_execution_logs_rule_id ON alert_rule_execution_logs(rule_id);
      CREATE INDEX IF NOT EXISTS idx_alert_rule_execution_logs_asset_id ON alert_rule_execution_logs(asset_id);
      CREATE INDEX IF NOT EXISTS idx_alert_rule_execution_logs_execution_time ON alert_rule_execution_logs(execution_time);
      CREATE INDEX IF NOT EXISTS idx_alert_rule_execution_logs_status ON alert_rule_execution_logs(status);
    `;
    await pool.query(createIndexes);
    console.log('Database indexes created successfully');
  } catch (indexError) {
    console.log('Warning: Some indexes could not be created:', indexError.message);
  }

  // 既存のアセットテーブルに新しいフィールドを追加するマイグレーション
  try {
    console.log('Running database migration for assets table...');
    
    // data_source_typeカラムが存在しない場合は追加
    const checkColumnQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'assets' AND column_name = 'data_source_type'
    `;
    
    const columnExists = await pool.query(checkColumnQuery);
    
    if (columnExists.rows.length === 0) {
      console.log('Adding data_source_type column to assets table...');
      await pool.query(`
        ALTER TABLE assets 
        ADD COLUMN data_source_type VARCHAR(20) DEFAULT 'mqtt' 
        CHECK (data_source_type IN ('mqtt', 'thingsboard'))
      `);
      console.log('data_source_type column added successfully');
    } else {
      console.log('data_source_type column already exists');
    }
    // tags カラムが存在しない場合は追加
    try {
      const tagsColumn = await pool.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'assets' AND column_name = 'tags'
      `);
      if (tagsColumn.rows.length === 0) {
        console.log('Adding tags column to assets table...');
        await pool.query(`ALTER TABLE assets ADD COLUMN tags JSONB`);
        console.log('tags column added successfully');
      } else {
        console.log('tags column already exists');
      }
    } catch (e) {
      console.log('Warning: could not ensure tags column:', e.message);
    }
  } catch (migrationError) {
    console.log('Warning: Migration failed:', migrationError.message);
  }
};

// MQTT設定の保存
const saveMQTTConfig = async (config) => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  // idフィールドを除外して、必要なフィールドのみを抽出
  const {
    id, // 除外
    created_at, // 除外
    updated_at, // 除外
    ...configData
  } = config;

  console.log('Saving MQTT config to database:', {
    broker: configData.broker,
    port: configData.port,
    clientId: configData.clientId,
    username: configData.username,
    password: configData.password ? '***' : 'empty',
    certificatePath: configData.certificatePath,
    privateKeyPath: configData.privateKeyPath,
    caPath: configData.caPath,
    hasCertificateContent: !!configData.certificateContent,
    hasPrivateKeyContent: !!configData.privateKeyContent,
    hasCaContent: !!configData.caContent
  });

  const query = `
    INSERT INTO mqtt_configs (broker, port, client_id, username, password, certificate_path, private_key_path, ca_path, certificate_content, private_key_content, ca_content)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
  `;

  const values = [
    configData.broker,
    configData.port,
    configData.clientId,
    configData.username || null,
    configData.password || null,
    configData.certificatePath || null,
    configData.privateKeyPath || null,
    configData.caPath || null,
    configData.certificateContent || null,
    configData.privateKeyContent || null,
    configData.caContent || null
  ];

  console.log('Executing query with values:', {
    ...values,
    password: values[4] ? '***' : 'empty'
  });

  const result = await pool.query(query, values);
  console.log('MQTT config saved to database successfully:', {
    id: result.rows[0].id,
    broker: result.rows[0].broker,
    port: result.rows[0].port,
    clientId: result.rows[0].client_id,
    createdAt: result.rows[0].created_at
  });
  return result.rows[0];
};

// 最新のMQTT設定を取得
const getLatestMQTTConfig = async () => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  console.log('Getting latest MQTT config from database...');
  const query = 'SELECT * FROM mqtt_configs ORDER BY created_at DESC LIMIT 1';
  const result = await pool.query(query);
  
  if (result.rows[0]) {
    console.log('Found MQTT config in database:', {
      id: result.rows[0].id,
      broker: result.rows[0].broker,
      port: result.rows[0].port,
      clientId: result.rows[0].client_id,
      createdAt: result.rows[0].created_at
    });
  } else {
    console.log('No MQTT config found in database');
  }
  
  return result.rows[0] || null;
};

// アセットの保存
const saveAsset = async (asset) => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  // トランザクションを開始
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // lineIdが存在する場合、対応する生産ラインを作成
    if (asset.lineId) {
      try {
        // 生産ラインが存在するかチェック
        const lineCheckQuery = 'SELECT id FROM production_lines WHERE id = $1';
        const lineCheckResult = await client.query(lineCheckQuery, [asset.lineId]);
        
        if (lineCheckResult.rows.length === 0) {
          // 生産ラインが存在しない場合、デフォルトの工場と生産ラインを作成
          console.log(`Creating default factory and production line for asset: ${asset.id}`);
          
          // デフォルト工場を作成
          const defaultFactoryId = 'default_factory';
          const factoryQuery = `
            INSERT INTO factories (id, name)
            VALUES ($1, $2)
            ON CONFLICT (id) DO NOTHING
          `;
          await client.query(factoryQuery, [defaultFactoryId, 'Default Factory']);
          
          // 生産ラインを作成
          const lineQuery = `
            INSERT INTO production_lines (id, name, factory_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (id) DO NOTHING
          `;
          await client.query(lineQuery, [asset.lineId, `Production Line ${asset.lineId}`, defaultFactoryId]);
        }
      } catch (error) {
        console.error('Error creating production line:', error);
        // エラーが発生した場合は、lineIdをnullに設定
        asset.lineId = null;
      }
    }

    const query = `
      INSERT INTO assets (id, name, type, line_id, status, data_source_type, mqtt_topic, thingsboard_device_id, thingsboard_device_name, tags, is_alert_active, active_alert_rule, alert_triggered_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        line_id = EXCLUDED.line_id,
        status = EXCLUDED.status,
        data_source_type = EXCLUDED.data_source_type,
        mqtt_topic = EXCLUDED.mqtt_topic,
        thingsboard_device_id = EXCLUDED.thingsboard_device_id,
        thingsboard_device_name = EXCLUDED.thingsboard_device_name,
        tags = EXCLUDED.tags,
        is_alert_active = EXCLUDED.is_alert_active,
        active_alert_rule = EXCLUDED.active_alert_rule,
        alert_triggered_at = EXCLUDED.alert_triggered_at,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const values = [
      asset.id,
      asset.name,
      asset.type,
      asset.lineId,
      asset.status,
      asset.dataSourceType || 'mqtt',
      asset.mqttTopic || null,
      asset.thingsboardDeviceId || null,
      asset.thingsboardDeviceName || null,
      asset.tags ? JSON.stringify(asset.tags) : null,
      asset.isAlertActive || false,
      asset.activeAlertRule || null,
      asset.alertTriggeredAt || null
    ];

    const result = await client.query(query, values);
    
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// 工場の保存
const saveFactory = async (factory) => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  const query = `
    INSERT INTO factories (id, name)
    VALUES ($1, $2)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `;

  const values = [factory.id, factory.name];
  const result = await pool.query(query, values);
  return result.rows[0];
};

// 全工場を取得
const getAllFactories = async () => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  const query = 'SELECT * FROM factories ORDER BY created_at';
  const result = await pool.query(query);
  return result.rows;
};

// 工場の削除
const deleteFactory = async (factoryId) => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  const query = 'DELETE FROM factories WHERE id = $1';
  await pool.query(query, [factoryId]);
};

// 生産ラインの保存
const saveProductionLine = async (line) => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  const query = `
    INSERT INTO production_lines (id, name, factory_id)
    VALUES ($1, $2, $3)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      factory_id = EXCLUDED.factory_id,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `;

  const values = [line.id, line.name, line.factoryId];
  const result = await pool.query(query, values);
  return result.rows[0];
};

// 全生産ラインを取得
const getAllProductionLines = async () => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  const query = 'SELECT * FROM production_lines ORDER BY created_at';
  const result = await pool.query(query);
  return result.rows;
};

// 生産ラインの削除
const deleteProductionLine = async (lineId) => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  const query = 'DELETE FROM production_lines WHERE id = $1';
  await pool.query(query, [lineId]);
};

// 全アセットを取得
const getAllAssets = async () => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  const query = `
    SELECT a.*, 
           json_agg(
             CASE WHEN ar.id IS NOT NULL 
             THEN json_build_object(
               'id', ar.id,
               'name', ar.name,
               'isActive', ar.is_active,
               'conditions', ar.conditions,
               'actions', ar.actions
             )
             ELSE NULL END
           ) FILTER (WHERE ar.id IS NOT NULL) as alert_rules
    FROM assets a
    LEFT JOIN alert_rules ar ON a.id = ar.asset_id
    GROUP BY a.id
    ORDER BY a.created_at
  `;

  const result = await pool.query(query);
  
  // 結果を変換（snake_caseからcamelCase）
  return result.rows.map(row => ({
    id: row.id,
    name: row.name,
    type: row.type,
    lineId: row.line_id,
    status: row.status,
    dataSourceType: row.data_source_type || 'mqtt',
    mqttTopic: row.mqtt_topic,
    thingsboardDeviceId: row.thingsboard_device_id,
    thingsboardDeviceName: row.thingsboard_device_name,
    tags: row.tags || null,
    isAlertActive: row.is_alert_active,
    activeAlertRule: row.active_alert_rule,
    alertTriggeredAt: row.alert_triggered_at,
    alertRules: row.alert_rules || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
};

// アセットの削除
const deleteAsset = async (assetId) => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  const query = 'DELETE FROM assets WHERE id = $1';
  await pool.query(query, [assetId]);
};

// タグのリセット履歴 保存
const saveTagResetEvent = async (event) => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  const query = `
    INSERT INTO tag_reset_events (tag_id, asset_id, reset_at, value)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;

  const values = [event.tagId, event.assetId, event.resetAt, event.value?.toString() ?? null];
  const result = await pool.query(query, values);
  return result.rows[0];
};

// タグのリセット履歴 取得（ページング/期間）
const getTagResetEvents = async ({ tagId, assetId, from, to, limit = 50, offset = 0 }) => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  let query = `
    SELECT id, tag_id as "tagId", asset_id as "assetId", reset_at as "resetAt", value, created_at as "createdAt"
    FROM tag_reset_events
    WHERE 1=1
  `;
  const values = [];
  let idx = 1;
  if (tagId) { query += ` AND tag_id = $${idx++}`; values.push(tagId); }
  if (assetId) { query += ` AND asset_id = $${idx++}`; values.push(assetId); }
  if (from) { query += ` AND reset_at >= $${idx++}`; values.push(from); }
  if (to) { query += ` AND reset_at <= $${idx++}`; values.push(to); }
  query += ` ORDER BY reset_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
  values.push(limit, offset);

  const result = await pool.query(query, values);
  return result.rows;
};

// アラートルールの保存
const saveAlertRule = async (rule) => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  const query = `
    INSERT INTO alert_rules (id, asset_id, name, is_active, conditions, actions, check_interval)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      is_active = EXCLUDED.is_active,
      conditions = EXCLUDED.conditions,
      actions = EXCLUDED.actions,
      check_interval = EXCLUDED.check_interval,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `;

  const values = [
    rule.id,
    rule.assetId,
    rule.name,
    rule.isActive,
    JSON.stringify(rule.conditions),
    JSON.stringify(rule.actions),
    rule.checkInterval || 0
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
};

// アラートルールの取得
const getAlertRules = async (assetId) => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  

  let query = `
    SELECT id, asset_id as "assetId", name, is_active as "isActive", 
           conditions, actions, check_interval as "checkInterval", 
           created_at as "createdAt", updated_at as "updatedAt"
    FROM alert_rules
  `;
  
  let values = [];
  
  if (assetId) {
    query += ` WHERE asset_id = $1`;
    values.push(assetId);
  }
  
  query += ` ORDER BY created_at DESC`;

  

  const result = await pool.query(query, values);
  
  // JSONフィールドをパース（エラーハンドリング付き）
  const parsedRules = result.rows.map((row, index) => {
    
    let conditions = [];
    let actions = [];
    
    try {
      if (row.conditions && row.conditions !== null) {
        
        conditions = typeof row.conditions === 'string' 
          ? JSON.parse(row.conditions) 
          : row.conditions;
        
        // 既存の条件にtypeを追加（マイグレーション）
        conditions = conditions.map(condition => ({
          ...condition,
          type: condition.type || 'simple'
        }));
      }
    } catch (error) {
      console.error(`Error parsing conditions for rule ${row.id}:`, error);
      conditions = [];
    }
    
    try {
      if (row.actions && row.actions !== null) {
        
        actions = typeof row.actions === 'string' 
          ? JSON.parse(row.actions) 
          : row.actions;
      }
    } catch (error) {
      console.error(`Error parsing actions for rule ${row.id}:`, error);
      actions = [];
    }
    
    const parsedRow = {
      ...row,
      conditions,
      actions,
      checkInterval: row.checkInterval || 300
    };
    return parsedRow;
  });
  
  return parsedRules;
};

// アラートルールの削除
const deleteAlertRule = async (ruleId) => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  const query = `DELETE FROM alert_rules WHERE id = $1`;
  const result = await pool.query(query, [ruleId]);
  
  if (result.rowCount === 0) {
    throw new Error('アラートルールが見つかりません');
  }
  
  return true;
};

// すべてのアラートルールを取得
const getAllAlertRules = async () => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  const query = `
    SELECT id, asset_id, name, is_active, 
           conditions, actions, check_interval, 
           created_at, updated_at
    FROM alert_rules
    ORDER BY created_at DESC
  `;

  const result = await pool.query(query);
  
  // JSONフィールドをパース
  const parsedRules = result.rows.map(row => {
    let conditions = [];
    let actions = [];
    
    try {
      if (row.conditions && row.conditions !== null) {
        conditions = typeof row.conditions === 'string' 
          ? JSON.parse(row.conditions) 
          : row.conditions;
      }
    } catch (error) {
      console.error('Error parsing conditions:', error);
      conditions = [];
    }
    
    try {
      if (row.actions && row.actions !== null) {
        actions = typeof row.actions === 'string' 
          ? JSON.parse(row.actions) 
          : row.actions;
      }
    } catch (error) {
      console.error('Error parsing actions:', error);
      actions = [];
    }
    
    return {
      id: row.id,
      asset_id: row.asset_id,
      name: row.name,
      is_active: row.is_active,
      conditions: conditions,
      actions: actions,
      check_interval: row.check_interval,
      checkInterval: row.check_interval, // キャメルケース版も追加
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  });
  
  return parsedRules;
};

// PostgreSQL設定の保存
const savePostgresConfig = async (config) => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  try {
    // 既存の設定を非アクティブにする
    await pool.query('UPDATE postgres_configs SET is_active = false');

    const query = `
      INSERT INTO postgres_configs (host, port, database, "user", password, is_active)
      VALUES ($1, $2, $3, $4, $5, true)
      RETURNING *
    `;

    const values = [
      config.host,
      config.port,
      config.database,
      config.user,
      config.password
    ];

    console.log('Saving PostgreSQL config with values:', {
      host: values[0],
      port: values[1],
      database: values[2],
      user: values[3],
      password: values[4] ? '***' : 'empty'
    });

    const result = await pool.query(query, values);
    console.log('PostgreSQL config saved successfully');

    // ファイルにも保存（再起動時の初期接続に利用）
    savePostgresConfigToFile({
      host: values[0],
      port: values[1],
      database: values[2],
      user: values[3],
      password: values[4]
    });

    return result.rows[0];
  } catch (error) {
    console.error('Error saving PostgreSQL config:', error);
    throw error;
  }
};

// Thingsboard 関連は廃止

// InfluxDB設定を保存
const saveInfluxDBConfig = async (config) => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  // 既存のアクティブ設定を非アクティブにする
  await pool.query('UPDATE influxdb_configs SET is_active = false');

  // 新しい設定を保存
  const query = `
    INSERT INTO influxdb_configs (url, token, org, bucket, is_active)
    VALUES ($1, $2, $3, $4, true)
    RETURNING *
  `;
  
  const values = [config.url, config.token, config.org, config.bucket];
  const result = await pool.query(query, values);
  
  console.log('InfluxDB config saved:', {
    id: result.rows[0].id,
    url: result.rows[0].url,
    org: result.rows[0].org,
    bucket: result.rows[0].bucket,
    isActive: result.rows[0].is_active
  });
  
  return result.rows[0];
};

// アクティブなInfluxDB設定を取得
const getActiveInfluxDBConfig = async () => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  const query = 'SELECT id, url, token, org, bucket, is_active, created_at, updated_at FROM influxdb_configs WHERE is_active = true ORDER BY created_at DESC LIMIT 1';
  const result = await pool.query(query);
  return result.rows[0] || null;
};

// アクティブなPostgreSQL設定を取得
const getActivePostgresConfig = async () => {
  // データベース接続が確立されていない場合は、ファイルに保存された設定を返す
  if (!pool) {
    const fileCfg = loadPostgresConfigFromFile();
    if (fileCfg) {
      return { ...fileCfg, is_active: true };
    }
    return null;
  }

  const query = 'SELECT id, host, port, database, "user", password, is_active, created_at, updated_at FROM postgres_configs WHERE is_active = true ORDER BY created_at DESC LIMIT 1';
  const result = await pool.query(query);
  return result.rows[0] || null;
};

// MQTTトピックからAsset情報を取得（工場、ライン、センサー情報を含む）
const getAssetByTopic = async (topic) => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  const query = `
    SELECT 
      a.id as asset_id,
      a.name as asset_name,
      a.type as asset_type,
      a.mqtt_topic,
      pl.id as line_id,
      pl.name as line_name,
      f.id as factory_id,
      f.name as factory_name
    FROM assets a
    LEFT JOIN production_lines pl ON a.line_id = pl.id
    LEFT JOIN factories f ON pl.factory_id = f.id
    WHERE a.mqtt_topic = $1
  `;

  const result = await pool.query(query, [topic]);
  return result.rows[0] || null;
};

// 特定のトピックに関連するAssetが存在するかチェック
const hasAssetForTopic = async (topic) => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  const query = `
    SELECT COUNT(*) as count
    FROM assets
    WHERE mqtt_topic = $1
  `;

  const result = await pool.query(query, [topic]);
  return result.rows[0].count > 0;
};

// 特定のアセットを除外してトピックの重複をチェック
const hasAssetForTopicExcluding = async (topic, excludeAssetId) => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  const query = `
    SELECT COUNT(*) as count
    FROM assets
    WHERE mqtt_topic = $1 AND id != $2
  `;

  const result = await pool.query(query, [topic, excludeAssetId]);
  return result.rows[0].count > 0;
};

// 全Assetのトピック一覧を取得
const getAllAssetTopics = async () => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  const query = `
    SELECT mqtt_topic
    FROM assets
    WHERE mqtt_topic IS NOT NULL AND mqtt_topic != ''
  `;

  const result = await pool.query(query);
  return result.rows.map(row => row.mqtt_topic);
};

// 接続を閉じる
const closePool = async () => {
  if (pool) {
    await pool.end();
    pool = null;
  }
};

// AlertRule実行ログの保存
const saveAlertRuleExecutionLog = async (logData) => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  const query = `
    INSERT INTO alert_rule_execution_logs 
    (rule_id, asset_id, execution_type, execution_time, execution_duration, 
     status, conditions_evaluated, conditions_result, triggered_alert_id, 
     error_message, execution_context)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
  `;

  const values = [
    logData.ruleId,
    logData.assetId,
    logData.executionType,
    logData.executionTime,
    logData.executionDuration,
    logData.status,
    JSON.stringify(logData.conditionsEvaluated || []),
    JSON.stringify(logData.conditionsResult || {}),
    logData.triggeredAlertId || null,
    logData.errorMessage || null,
    JSON.stringify(logData.executionContext || {})
  ];

  const result = await pool.query(query, values);
  return result.rows[0];
};

// AlertRule実行ログの取得
const getAlertRuleExecutionLogs = async (ruleId = null, assetId = null, limit = 100, offset = 0) => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  let query = `
    SELECT 
      al.id,
      al.rule_id as "ruleId",
      al.asset_id as "assetId",
      al.execution_type as "executionType",
      al.execution_time as "executionTime",
      al.execution_duration as "executionDuration",
      al.status,
      al.conditions_evaluated as "conditionsEvaluated",
      al.conditions_result as "conditionsResult",
      al.triggered_alert_id as "triggeredAlertId",
      al.error_message as "errorMessage",
      al.execution_context as "executionContext",
      al.created_at as "createdAt",
      ar.name as "ruleName",
      a.name as "assetName"
    FROM alert_rule_execution_logs al
    LEFT JOIN alert_rules ar ON al.rule_id = ar.id
    LEFT JOIN assets a ON al.asset_id = a.id
  `;

  let conditions = [];
  let values = [];
  let paramIndex = 1;

  if (ruleId) {
    conditions.push(`al.rule_id = $${paramIndex}`);
    values.push(ruleId);
    paramIndex++;
  }

  if (assetId) {
    conditions.push(`al.asset_id = $${paramIndex}`);
    values.push(assetId);
    paramIndex++;
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ` ORDER BY al.execution_time DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  values.push(limit, offset);

  const result = await pool.query(query, values);
  return result.rows;
};

// AlertRule実行ログの統計取得
const getAlertRuleExecutionStats = async (ruleId = null, assetId = null, days = 7) => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  let query = `
    SELECT 
      COUNT(*) as total_executions,
      COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_executions,
      COUNT(CASE WHEN status = 'error' THEN 1 END) as error_executions,
      COUNT(CASE WHEN status = 'warning' THEN 1 END) as warning_executions,
      AVG(execution_duration) as avg_execution_duration,
      MAX(execution_time) as last_execution_time
    FROM alert_rule_execution_logs al
  `;

  let conditions = [];
  let values = [];
  let paramIndex = 1;

  if (ruleId) {
    conditions.push(`al.rule_id = $${paramIndex}`);
    values.push(ruleId);
    paramIndex++;
  }

  if (assetId) {
    conditions.push(`al.asset_id = $${paramIndex}`);
    values.push(assetId);
    paramIndex++;
  }

  conditions.push(`al.execution_time >= NOW() - INTERVAL '${days} days'`);

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  const result = await pool.query(query, values);
  return result.rows[0];
};

// AlertRule実行ログの削除（アセットID指定）
const deleteAlertRuleExecutionLogsByAssetId = async (assetId) => {
  if (!pool) {
    throw new Error('データベースに接続されていません');
  }

  const query = `
    DELETE FROM alert_rule_execution_logs 
    WHERE asset_id = $1
    RETURNING id
  `;

  const result = await pool.query(query, [assetId]);
  return result.rowCount;
};

module.exports = {
  createPool,
  initializeDatabase,
  testConnection,
  saveMQTTConfig,
  getLatestMQTTConfig,
  saveAsset,
  getAllAssets,
  deleteAsset,
  saveAlertRule,
  getAlertRules,
  getAllAlertRules,
  deleteAlertRule,
  savePostgresConfig,
  getActivePostgresConfig,
  saveInfluxDBConfig,
  getActiveInfluxDBConfig,
  saveFactory,
  getAllFactories,
  deleteFactory,
  saveProductionLine,
  getAllProductionLines,
  deleteProductionLine,
  getAssetByTopic,
  hasAssetForTopic,
  hasAssetForTopicExcluding,
  getAllAssetTopics,
  closePool,
  saveAlertRuleExecutionLog,
  getAlertRuleExecutionLogs,
  getAlertRuleExecutionStats,
  deleteAlertRuleExecutionLogsByAssetId,
  // tag reset history
  saveTagResetEvent,
  getTagResetEvents
};
