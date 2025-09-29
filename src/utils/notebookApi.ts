// Notebook API呼び出し用のユーティリティ関数

export interface NotebookRequest {
  notebook: string;
  parameters: Record<string, any>;
  executionTime?: number; // 標準実行時間（ミリ秒）
  maxRetries?: number; // 最大リトライ回数
}


export interface NotebookResponse {
  success: boolean;
  result?: any;
  error?: string;
  executionTime?: number;
  runId?: string;
}

// 最新のNotebook実行結果を保存（デバッグ用）
let latestNotebookResult: any = null;

const NOTEBOOK_API_URL = '/api/notebook/run'; // バックエンドプロキシ経由

/**
 * Notebook APIを非同期で実行する
 * @param request Notebook実行リクエスト
 * @returns Promise<NotebookResponse>
 */
export const executeNotebook = async (request: NotebookRequest): Promise<NotebookResponse> => {
  try {
    console.log('Notebook API実行開始:', request);
    
    // 1. Notebook実行を開始（バックエンドプロキシ経由）
    const runResponse = await fetch(NOTEBOOK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        notebook: request.notebook,
        parameters: request.parameters,
        executionTime: request.executionTime,
        maxRetries: request.maxRetries
      }),
    });

    if (!runResponse.ok) {
      throw new Error(`HTTP error! status: ${runResponse.status}`);
    }

    const finalResult = await runResponse.json();
    console.log('Notebook実行完了:', finalResult);
    
    // 最新の結果を保存（デバッグ用）
    latestNotebookResult = finalResult;
    
    // グローバル変数にも保存（UI表示用）
    if (typeof window !== 'undefined') {
      (window as any).latestNotebookResult = finalResult;
    }
    
    return finalResult;
  } catch (error) {
    console.error('Notebook API実行エラー:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};


/**
 * Notebook条件を評価する
 * @param condition Notebook条件
 * @param assetData アセットデータ
 * @returns Promise<boolean>
 */
export const evaluateNotebookCondition = async (
  condition: any,
  _assetData: any
): Promise<boolean> => {
  console.log('Notebook条件評価開始:', condition);
  
  if (!condition.notebookConfig) {
    console.error('Notebook設定がありません');
    return false;
  }

  try {
    console.log('Notebook API実行パラメータ:', {
      notebook: condition.notebookConfig.notebook,
      parameters: condition.notebookConfig.parameters,
      executionTime: condition.notebookConfig.executionTime,
      maxRetries: condition.notebookConfig.maxRetries
    });

    // Notebook APIを実行
    const response = await executeNotebook({
      notebook: condition.notebookConfig.notebook,
      parameters: condition.notebookConfig.parameters,
      executionTime: condition.notebookConfig.executionTime,
      maxRetries: condition.notebookConfig.maxRetries
    });

    console.log('Notebook API実行結果:', response);

    if (!response.success) {
      console.error('Notebook実行失敗:', response.error);
      return false;
    }

    console.log('Notebook実行成功、結果解析開始:', response.result);
    console.log('指定されたパラメータ:', condition.parameter);

    // 結果から指定されたフィールドの値を取得
    const resultValue = getNestedValue(response.result, condition.parameter);
    
    console.log('取得した結果値:', resultValue);
    
    if (resultValue === null || resultValue === undefined) {
      console.error(`結果フィールド '${condition.parameter}' が見つかりません`);
      console.error('利用可能な結果:', response.result);
      console.error('結果の型:', typeof response.result);
      console.error('結果の構造:', JSON.stringify(response.result, null, 2));
      return false;
    }

    // 条件を評価
    const conditionMet = evaluateCondition(resultValue, condition.operator, condition.value);
    
    // 詳細な判定ロジックのログ出力
    console.log('=== Notebook条件判定ロジック ===');
    console.log('📊 取得した結果値:', resultValue);
    console.log('📊 結果値の型:', typeof resultValue);
    console.log('🔍 指定されたパラメータ:', condition.parameter);
    console.log('⚖️ 演算子:', condition.operator);
    console.log('🎯 閾値:', condition.value);
    console.log('🎯 閾値の型:', typeof condition.value);
    console.log('✅ 判定結果:', conditionMet ? '条件を満たす' : '条件を満たさない');
    console.log('📝 判定式:', `${resultValue} ${condition.operator} ${condition.value} = ${conditionMet}`);
    console.log('================================');
    console.log('最新のNotebook実行結果（デバッグ）:', latestNotebookResult);
    
    return conditionMet;
  } catch (error) {
    console.error('Notebook条件評価エラー:', error);
    console.error('エラーの詳細:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return false;
  }
};

/**
 * ネストされたオブジェクトから値を取得する
 * @param obj オブジェクト
 * @param path パス（例: "data.result"）
 * @returns 値
 */
const getNestedValue = (obj: any, path: string): any => {
  console.log('--- ネストされた値の取得 ---');
  console.log('🔍 入力オブジェクト:', obj);
  console.log('🔍 オブジェクトの型:', typeof obj);
  console.log('🔍 取得パス:', path);
  
  // オブジェクトが文字列の場合、Python辞書形式として解析を試行
  if (typeof obj === 'string') {
    console.log('📝 文字列形式のオブジェクトを検出');
    try {
      // Python辞書形式の文字列をJavaScriptオブジェクトに変換
      // "{'result': 'ok'}" -> {"result": "ok"}
      const cleanedString = obj
        .replace(/'/g, '"')  // シングルクォートをダブルクォートに変換
        .replace(/True/g, 'true')  // PythonのTrueをJavaScriptのtrueに変換
        .replace(/False/g, 'false')  // PythonのFalseをJavaScriptのfalseに変換
        .replace(/None/g, 'null');  // PythonのNoneをJavaScriptのnullに変換
      
      console.log('🔄 文字列変換:', obj, '→', cleanedString);
      const parsedObj = JSON.parse(cleanedString);
      console.log('✅ 変換されたオブジェクト:', parsedObj);
      
      // 変換されたオブジェクトから値を取得
      const result = path.split('.').reduce((current, key) => {
        console.log(`🔍 パス探索: ${key} in`, current);
        return current && current[key] !== undefined ? current[key] : null;
      }, parsedObj);
      
      console.log('🎯 取得結果:', result);
      return result;
    } catch (parseError) {
      console.warn('⚠️ 文字列の解析に失敗:', parseError);
      return null;
    }
  }
  
  // 通常のオブジェクトの場合
  console.log('📝 通常のオブジェクト形式');
  const result = path.split('.').reduce((current, key) => {
    console.log(`🔍 パス探索: ${key} in`, current);
    return current && current[key] !== undefined ? current[key] : null;
  }, obj);
  
  console.log('🎯 取得結果:', result);
  return result;
};

/**
 * 条件を評価する
 * @param value 値
 * @param operator 演算子
 * @param threshold 閾値
 * @returns 条件を満たすかどうか
 */
const evaluateCondition = (value: any, operator: string, threshold: any): boolean => {
  console.log('--- 条件評価の詳細 ---');
  console.log('🔍 入力値:', value, '(型:', typeof value, ')');
  console.log('🔍 閾値:', threshold, '(型:', typeof threshold, ')');
  console.log('🔍 演算子:', operator);
  
  // 文字列比較の場合
  if (typeof value === 'string' && typeof threshold === 'string') {
    console.log('📝 文字列比較モード');
    let result: boolean;
    switch (operator) {
      case '=':
        result = value === threshold;
        console.log(`📝 文字列等価比較: "${value}" === "${threshold}" = ${result}`);
        return result;
      case '!=':
        result = value !== threshold;
        console.log(`📝 文字列不等価比較: "${value}" !== "${threshold}" = ${result}`);
        return result;
      default:
        console.warn('⚠️ 文字列値では数値演算子は使用できません:', operator);
        return false;
    }
  }
  
  // 数値比較の場合
  console.log('📝 数値比較モード');
  const numValue = Number(value);
  const numThreshold = Number(threshold);
  
  console.log('🔢 数値変換結果:', { numValue, numThreshold });

  if (isNaN(numValue) || isNaN(numThreshold)) {
    console.warn('⚠️ 数値に変換できません:', { value, threshold, numValue, numThreshold });
    return false;
  }

  let result: boolean;
  switch (operator) {
    case '>':
      result = numValue > numThreshold;
      console.log(`📝 数値比較: ${numValue} > ${numThreshold} = ${result}`);
      return result;
    case '<':
      result = numValue < numThreshold;
      console.log(`📝 数値比較: ${numValue} < ${numThreshold} = ${result}`);
      return result;
    case '=':
      result = numValue === numThreshold;
      console.log(`📝 数値等価比較: ${numValue} === ${numThreshold} = ${result}`);
      return result;
    case '>=':
      result = numValue >= numThreshold;
      console.log(`📝 数値比較: ${numValue} >= ${numThreshold} = ${result}`);
      return result;
    case '<=':
      result = numValue <= numThreshold;
      console.log(`📝 数値比較: ${numValue} <= ${numThreshold} = ${result}`);
      return result;
    case '!=':
      result = numValue !== numThreshold;
      console.log(`📝 数値不等価比較: ${numValue} !== ${numThreshold} = ${result}`);
      return result;
    default:
      console.warn('⚠️ 未知の演算子:', operator);
      return false;
  }
};

/**
 * 最新のNotebook実行結果を取得（デバッグ用）
 * @returns 最新の実行結果
 */
export const getLatestNotebookResult = (): any => {
  return latestNotebookResult;
};
