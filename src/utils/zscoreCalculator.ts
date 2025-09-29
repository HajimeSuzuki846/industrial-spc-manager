export interface ZScoreConfig {
  movingAverageWindow: number; // 移動平均ウィンドウ（分）
  populationWindow: number;    // 母集団ウィンドウ（日）
  threshold: number;           // Zスコア閾値
}

export interface InfluxDBDataPoint {
  _time: string;
  _value: number;
  asset_id: string;
  [key: string]: any;
}

export interface ZScoreResult {
  zscore: number;
  currentValue: number;
  populationMean: number;
  populationStdDev: number;
  isAnomaly: boolean;
  threshold: number;
}

export class ZScoreCalculator {
  /**
   * Zスコアを計算
   * z = (x - μ) / σ
   * x: 現在の移動平均値
   * μ: 母集団の平均
   * σ: 母集団の標準偏差
   */
  static calculateZScore(
    dataPoints: InfluxDBDataPoint[],
    config: ZScoreConfig
  ): ZScoreResult | null {
    if (dataPoints.length === 0) {
      return null;
    }

    // データを時間順にソート
    const sortedData = dataPoints.sort((a, b) => 
      new Date(a._time).getTime() - new Date(b._time).getTime()
    );

    // 移動平均ウィンドウのデータを取得
    const movingAverageData = this.getMovingAverageData(sortedData, config.movingAverageWindow);
    if (movingAverageData.length === 0) {
      return null;
    }

    // 現在の移動平均値を計算
    const currentValue = this.calculateMovingAverage(movingAverageData);

    // 母集団データを取得（移動平均ウィンドウを除く）
    const populationData = this.getPopulationData(sortedData, config.movingAverageWindow, config.populationWindow);
    if (populationData.length === 0) {
      return null;
    }

    // 母集団の統計を計算
    const populationMean = this.calculateMean(populationData);
    const populationStdDev = this.calculateStandardDeviation(populationData, populationMean);

    // Zスコアを計算
    const zscore = populationStdDev > 0 ? (currentValue - populationMean) / populationStdDev : 0;

    return {
      zscore,
      currentValue,
      populationMean,
      populationStdDev,
      isAnomaly: Math.abs(zscore) > config.threshold,
      threshold: config.threshold
    };
  }

  /**
   * 移動平均用のデータを取得
   */
  private static getMovingAverageData(data: InfluxDBDataPoint[], windowMinutes: number): number[] {
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000);
    
    return data
      .filter(point => new Date(point._time) >= windowStart)
      .map(point => point._value);
  }

  /**
   * 母集団データを取得（移動平均ウィンドウを除く）
   */
  private static getPopulationData(
    data: InfluxDBDataPoint[], 
    movingAverageWindowMinutes: number, 
    populationWindowDays: number
  ): number[] {
    const now = new Date();
    const populationStart = new Date(now.getTime() - populationWindowDays * 24 * 60 * 60 * 1000);
    const movingAverageStart = new Date(now.getTime() - movingAverageWindowMinutes * 60 * 1000);
    
    return data
      .filter(point => {
        const pointTime = new Date(point._time);
        return pointTime >= populationStart && pointTime < movingAverageStart;
      })
      .map(point => point._value);
  }

  /**
   * 移動平均を計算
   */
  private static calculateMovingAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  /**
   * 平均値を計算
   */
  private static calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  /**
   * 標準偏差を計算
   */
  private static calculateStandardDeviation(values: number[], mean: number): number {
    if (values.length === 0) return 0;
    
    const squaredDifferences = values.map(value => Math.pow(value - mean, 2));
    const variance = squaredDifferences.reduce((sum, diff) => sum + diff, 0) / values.length;
    
    return Math.sqrt(variance);
  }

  /**
   * デフォルト設定を取得
   */
  static getDefaultConfig(): ZScoreConfig {
    return {
      movingAverageWindow: 15, // 15分
      populationWindow: 28,    // 4週間
      threshold: 2.0           // 2σ
    };
  }
}
