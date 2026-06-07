/** 資料層內部型別 */

/** FinMind 通用回應外殼 */
export interface FinMindResponse<T> {
  msg: string;
  status: number;
  data: T[];
}

/** FinMind TaiwanStockPrice 單筆原始格式 */
export interface FinMindPriceRow {
  date: string;
  stock_id: string;
  Trading_Volume: number;
  Trading_money: number;
  open: number;
  max: number;
  min: number;
  close: number;
  spread: number;
  Trading_turnover: number;
}

/** FinMind TaiwanStockNews 單筆 */
export interface FinMindNewsRow {
  date: string;
  stock_id: string;
  link: string;
  source: string;
  title: string;
}

/** FinMind 三大法人單筆 */
export interface FinMindInstitutionalRow {
  date: string;
  stock_id: string;
  buy: number;
  sell: number;
  name: string;
}
