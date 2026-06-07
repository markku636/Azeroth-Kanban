/**
 * 中央股票名詞字典（單一真實來源）。
 *
 * 全站的浮窗說明（TermLabel）、新手導覽面板（BeginnerGuide）、名詞速查表頁
 * 皆引用此檔，避免說明文案散落各頁、難以維護。
 *
 * 每個名詞提供四層深淺，對應「小白友善」四種呈現形式：
 * - `short`   一句話 → 浮窗 tooltip
 * - `detail`  詳解   → 速查表頁
 * - `example` 範例   → 範例圖解（浮窗 / 速查表 / 導覽）
 */

export type GlossaryKey =
  // 技術面
  | 'KD'
  | 'MA'
  | 'MACD'
  | 'RSI'
  | 'BIAS'
  | 'VOLUME'
  | 'CANDLE_COLOR'
  | 'MA_BULLISH'
  | 'KD_CROSS'
  | 'DMI_ADX'
  | 'WILLIAMS_R'
  | 'CCI'
  | 'OBV'
  | 'SAR'
  | 'DIVERGENCE'
  | 'VOLUME_PRICE_DIVERGENCE'
  | 'MA240'
  // 籌碼面
  | 'MARGIN_BALANCE'
  | 'SHORT_BALANCE'
  | 'FOREIGN_HOLDING'
  | 'INSTITUTIONS'
  | 'OPEN_INTEREST'
  | 'LONG_SHORT_OI'
  | 'CHIP_SCORE'
  | 'INST_STREAK'
  | 'CHIP_CONCENTRATION'
  // 基本面
  | 'PER'
  | 'DIVIDEND_YIELD'
  | 'EPS'
  | 'REVENUE_YOY'
  | 'REVENUE_MOM'
  | 'PER_RIVER'
  | 'PBR_RIVER'
  | 'YIELD_RIVER'
  | 'VALUATION_ZONE'
  | 'PEG'
  // 大盤 / 期貨
  | 'TAIEX'
  | 'BREADTH'
  | 'SECTOR_ROTATION'
  | 'TXF'
  | 'NIGHT_SESSION'
  | 'BASIS'
  | 'GLOBAL_INDEX'
  // 系統指標
  | 'HEALTH_SCORE'
  | 'ACTION'
  | 'CONFIDENCE'
  | 'MOMENTUM_STOCK'
  // 回測
  | 'BACKTEST'
  | 'WIN_RATE'
  | 'MAX_DRAWDOWN'
  | 'ANNUALIZED_RETURN'
  | 'PROFIT_FACTOR'
  | 'SHARPE'
  | 'BUY_HOLD'
  | 'VOLATILITY'
  // 回測策略與參數
  | 'STRATEGY'
  | 'STRATEGY_COMPARISON'
  | 'BOLLINGER'
  | 'MA_PERIOD'
  | 'MACD_FAST_PERIOD'
  | 'MACD_SLOW_PERIOD'
  | 'MACD_SIGNAL_PERIOD'
  | 'RSI_PERIOD'
  | 'RSI_OVERSOLD'
  | 'RSI_OVERBOUGHT'
  | 'BOLLINGER_PERIOD'
  | 'BOLLINGER_STD_DEV';

export interface GlossaryEntry {
  /** 顯示名稱（中文） */
  term: string;
  /** 英文 / 別名（選填） */
  aka?: string;
  /** 一句話白話解釋（浮窗主文案） */
  short: string;
  /** 詳細說明（速查表頁） */
  detail: string;
  /** 範例 / 圖解（白話舉例，選填） */
  example?: string;
}

export const GLOSSARY: Record<GlossaryKey, GlossaryEntry> = {
  // ─── 技術面 ───
  KD: {
    term: 'KD 指標',
    aka: '隨機指標 Stochastic',
    short: '判斷「現在是不是買貴了或賣便宜了」的指標，數值 0~100。',
    detail:
      'KD 由 K 線（快）和 D 線（慢）兩條線組成。一般 80 以上代表股價偏高（過熱），20 以下代表偏低（過冷）。K 線由下往上穿過 D 線叫「黃金交叉」（偏多），由上往下穿過叫「死亡交叉」（偏空）。',
    example: '例：KD 都掉到 15 又出現黃金交叉 → 常被視為短線可能反彈的訊號。',
  },
  MA: {
    term: '均線 MA',
    aka: 'Moving Average',
    short: '最近 N 天收盤價的平均，把上下震盪的股價「拉成一條平滑線」看趨勢。',
    detail:
      'MA5＝最近 5 天平均（約週線）、MA20＝月線、MA60＝季線。股價在均線之上偏多、之下偏空；均線本身往上代表趨勢向上。',
    example: '例：股價站上 MA20、且 MA20 向上 → 中期偏多。',
  },
  MACD: {
    term: 'MACD',
    aka: '指數平滑異同移動平均',
    short: '看「漲跌動能」有沒有增強或減弱的指標。',
    detail:
      'MACD 用兩條均線的差距判斷動能。柱狀圖由負轉正、或 DIF 向上穿過 MACD 線，代表動能轉強（偏多）；反之轉弱（偏空）。',
    example: '例：MACD 紅柱越來越長 → 上漲動能正在增強。',
  },
  RSI: {
    term: 'RSI',
    aka: '相對強弱指標',
    short: '衡量近期漲多還是跌多，數值 0~100，看「過熱 / 過冷」。',
    detail:
      'RSI 70 以上常代表買超（過熱、可能回檔），30 以下代表賣超（過冷、可能反彈），50 為多空分界。',
    example: '例：RSI 衝到 80 → 短線過熱，追高要小心。',
  },
  BIAS: {
    term: '乖離率',
    aka: 'BIAS',
    short: '股價偏離均線多遠的百分比，離太遠通常會「拉回」。',
    detail:
      '正乖離太大＝股價遠高於均線（漲過頭，易拉回）；負乖離太大＝遠低於均線（跌過頭，易反彈）。',
    example: '例：股價比 MA20 高出 15% → 正乖離過大，短線追高風險高。',
  },
  VOLUME: {
    term: '成交量',
    aka: 'Volume',
    short: '當天買賣成交的張數，代表這檔股票的「人氣」。',
    detail:
      '量大代表參與的人多。「價漲量增」通常較健康；「價漲量縮」要留意追價意願不足，可能漲不久。',
    example: '例：突破前高且爆出大量 → 比較有效的突破。',
  },
  CANDLE_COLOR: {
    term: '紅漲綠跌',
    aka: 'K 棒顏色',
    short: '台股慣例：紅色＝上漲、綠色＝下跌（和歐美剛好相反）。',
    detail:
      '一根 K 棒記錄當天的開盤、最高、最低、收盤。收盤比開盤高畫紅色（陽線），低畫綠色（陰線）。本系統所有漲跌顏色都遵循此台股慣例。',
    example: '例：畫面一片紅 → 當天多數股票上漲。',
  },
  MA_BULLISH: {
    term: '多頭排列',
    short: '短中長期均線「由上而下、且都朝上」，是明顯的上升趨勢。',
    detail:
      'MA5 > MA20 > MA60 且三條都向上，代表短中長期買方都佔上風，趨勢偏多。反過來「空頭排列」則偏空。',
    example: '例：MA5 在最上、MA60 在最下、全部朝上 → 標準多頭排列。',
  },
  KD_CROSS: {
    term: '黃金 / 死亡交叉',
    short: '兩條線交叉的訊號：往上交叉偏多（黃金）、往下交叉偏空（死亡）。',
    detail:
      '快線由下往上穿過慢線＝黃金交叉（轉強訊號）；由上往下穿過＝死亡交叉（轉弱訊號）。KD、MACD、均線都有這種交叉。',
    example: '例：KD 在低檔出現黃金交叉 → 短線轉強訊號。',
  },
  DMI_ADX: {
    term: '趨向指標 DMI / ADX',
    aka: 'DMI / ADX',
    short: '看「現在有沒有明顯趨勢、誰在主導」。+DI 在上偏多、−DI 在上偏空，ADX 越高趨勢越強（>25 算有趨勢）。',
    detail:
      'DMI 由 +DI、−DI、ADX 組成。+DI 高於 −DI 代表多方主導、反之空方；ADX 衡量趨勢強度，>25 趨勢明確、<20 多為盤整無方向。',
    example: '例：ADX 35 且 +DI 在 −DI 之上 → 明確的上升趨勢。',
  },
  WILLIAMS_R: {
    term: '威廉指標 %R',
    aka: 'Williams %R',
    short: '看股價在近期高低區間的位置，−80 以下偏冷（可能反彈）、−20 以上偏熱（小心追高）。',
    detail:
      '%R 介於 −100~0，越接近 0 代表越靠近近期高點（偏熱），越接近 −100 越靠近低點（偏冷），常用於抓超買超賣轉折。',
    example: '例：%R 跌到 −90 → 短線偏冷，留意反彈。',
  },
  CCI: {
    term: '順勢指標 CCI',
    aka: 'CCI',
    short: '衡量股價偏離常態多遠；突破 +100 轉強、跌破 −100 轉弱。',
    detail:
      'CCI 比較目前價格與一段期間的平均價。數值在 ±100 之間多為整理；突破 +100 常代表轉強、跌破 −100 轉弱。',
    example: '例：CCI 由 80 急升突破 +100 → 動能轉強訊號。',
  },
  OBV: {
    term: '能量潮 OBV',
    aka: 'On-Balance Volume',
    short: '把成交量依漲跌累加，看「量能」站在多方還空方；OBV 上升代表買盤積極。',
    detail:
      'OBV 在上漲日加上當日量、下跌日減去，累積成一條線。OBV 持續上升代表買盤動能強；價漲但 OBV 不漲（背離）要留意追價無力。',
    example: '例：股價盤整但 OBV 默默走高 → 量能偷偷轉強。',
  },
  SAR: {
    term: '拋物線 SAR',
    aka: 'Parabolic SAR',
    short: '自動上移的「移動停損點」；價在 SAR 之上偏多、跌破 SAR 視為轉空停損。',
    detail:
      'SAR 在多頭時點於價格下方並逐步上移（停損上移鎖獲利），股價跌破 SAR 代表趨勢可能反轉，可作為出場參考。',
    example: '例：股價跌破上移中的 SAR → 多單轉弱、考慮停損。',
  },
  DIVERGENCE: {
    term: '背離',
    aka: 'Divergence',
    short: '「價格」和「指標」走相反方向的警訊：價創新高但指標沒跟上＝頂背離（偏空）；反之底背離（偏多）。',
    detail:
      '股價創新高、但 MACD/RSI 等動能指標沒同步創高，代表上漲動能衰竭（頂背離，偏空）；價創新低但指標卻較高則是底背離（偏多）。',
    example: '例：股價再創高、RSI 卻一波比一波低 → 頂背離，漲勢可能轉弱。',
  },
  VOLUME_PRICE_DIVERGENCE: {
    term: '量價背離',
    aka: 'Volume-Price Divergence',
    short: '價漲但量／OBV 縮＝追價無力（偏空）；價跌但量縮＝賣壓減（偏多）。',
    detail:
      '健康的上漲通常「價漲量增」。若價創高但量能（OBV）反而縮，代表買盤不足（頂背離）；下跌末端量縮則可能是賣壓衰竭（底背離）。',
    example: '例：股價突破前高卻量縮 → 量價背離，突破有效性存疑。',
  },
  MA240: {
    term: '年線',
    aka: 'MA240',
    short: '最近約 240 個交易日（一年）的平均成本，站上年線常被視為長期轉強。',
    detail:
      '年線（MA240）代表市場近一年的平均持股成本，是長期多空的重要分界。站上且年線翻揚＝長線偏多；跌破則長線偏弱。',
    example: '例：股價站上年線、年線由下彎轉平 → 長線轉強的早期訊號。',
  },

  // ─── 籌碼面 ───
  MARGIN_BALANCE: {
    term: '融資餘額',
    short: '散戶「借錢買股」累積的總量，常被當作散戶人氣指標。',
    detail:
      '融資＝跟券商借錢買股票。融資餘額增加代表散戶看多加碼；但融資過高、股價卻不漲，反而是隱憂（散戶套牢）。',
    example: '例：股價漲、融資卻一直減 → 籌碼變乾淨（偏正向）。',
  },
  SHORT_BALANCE: {
    term: '融券餘額',
    short: '「借股票來賣」（看跌）累積的總量。',
    detail:
      '融券＝借股票先賣、等跌了再買回賺價差。融券高代表看空的人多；但若股價反漲，這些空單被迫買回（軋空）可能助漲。',
    example: '例：融券很多又遇到利多 → 可能發生軋空急漲。',
  },
  FOREIGN_HOLDING: {
    term: '外資持股',
    short: '外國法人（大戶）持有這檔股票的比例。',
    detail:
      '外資資金大、影響力強。外資持股比例上升通常被視為偏多訊號，下降則偏空。',
    example: '例：外資連續買超、持股比例攀升 → 籌碼偏正向。',
  },
  INSTITUTIONS: {
    term: '三大法人',
    short: '市場上三大專業機構：外資、投信、自營商。',
    detail:
      '外資＝外國機構（資金最大）、投信＝國內基金公司、自營商＝券商自己操盤。他們的買賣超是重要的籌碼風向球。',
    example: '例：三大法人同步買超 → 法人看法一致偏多。',
  },
  OPEN_INTEREST: {
    term: '未平倉',
    aka: 'OI, Open Interest',
    short: '期貨市場上「還沒結算、仍在場上」的合約數量。',
    detail:
      '未平倉量反映資金在期貨市場的參與度與方向。法人台指期「淨未平倉」由多單減空單算出，正值偏多、負值偏空。',
    example: '例：外資台指期淨未平倉大幅轉正 → 法人對後市偏多。',
  },
  LONG_SHORT_OI: {
    term: '多單 / 空單',
    short: '多單＝賭它會漲；空單＝賭它會跌。',
    detail:
      '多單（買方）押注上漲，空單（賣方）押注下跌。法人多單多於空單＝淨多（偏多）；反之淨空（偏空）。',
    example: '例：外資空單大於多單 → 法人短線偏空避險。',
  },
  CHIP_SCORE: {
    term: '籌碼分',
    short: '本系統把法人 / 融資等籌碼面整理成的 0~100 分數，越高越好。',
    detail:
      '綜合外資買賣超、融資增減等指標算出。分數越高代表籌碼偏正向（例如外資買超、融資減少）。',
    example: '例：籌碼分 85 → 籌碼面相當乾淨、偏多。',
  },
  INST_STREAK: {
    term: '法人連續買賣超',
    aka: '法人連買 / 連賣',
    short: '三大法人連續幾天站在同一邊；連買多日代表法人持續看好。',
    detail:
      '統計三大法人（外資＋投信＋自營）每日合計買賣超，連續同方向的天數。連買天數越多通常越偏多、連賣越偏空。',
    example: '例：外資＋投信連續 5 日買超 → 法人態度明確偏多。',
  },
  CHIP_CONCENTRATION: {
    term: '籌碼集中度',
    aka: '集中度',
    short: '法人買超佔成交量的比重，越高代表籌碼越往大戶集中（通常偏多）。',
    detail:
      '以近 5 日法人淨買超 ÷ 近 5 日總成交量計算。比重高代表買盤集中在法人手中、浮額減少，較利於後續上漲。',
    example: '例：集中度 25% → 法人吃下相當比例的量，籌碼偏集中。',
  },

  // ─── 基本面 ───
  PER: {
    term: '本益比',
    aka: 'P/E Ratio',
    short: '股價 ÷ 每股獲利（EPS），數字越小通常代表越便宜。',
    detail:
      '本益比可想成「幾年回本」——你願意用幾倍的年獲利買這檔股票。一般越低越便宜，但必須跟同產業比較；顯示 0 或超大值多半是公司虧損或 EPS 失真。',
    example: '例：股價 100 元、EPS 5 元 → 本益比 20 倍（約 20 年回本）。',
  },
  DIVIDEND_YIELD: {
    term: '殖利率',
    short: '現金股利 ÷ 股價，就是「單純存股一年領到的現金回報率」。',
    detail:
      '殖利率越高，每投入一塊錢領到的股息越多，常被存股族當作參考；但要注意公司是否能穩定配息。',
    example: '例：股價 100 元、配 5 元股利 → 殖利率 5%。',
  },
  EPS: {
    term: 'EPS',
    aka: '每股盈餘',
    short: '公司每一股幫你賺了多少錢，越高代表越會賺。',
    detail: 'EPS＝稅後淨利 ÷ 總股數，是衡量獲利能力的核心指標，也是算本益比的分母。',
    example: '例：EPS 5 元 → 每持有一股，公司一年幫你賺 5 元。',
  },
  REVENUE_YOY: {
    term: '營收 YoY',
    aka: '年增率',
    short: '這個月營收和「去年同月」比，是成長還是衰退。',
    detail:
      'YoY＝Year over Year。和去年同期比可排除淡旺季干擾。正值（紅）為成長、負值（綠）為衰退。',
    example: '例：今年 5 月營收比去年 5 月多 30% → YoY +30%（高成長）。',
  },
  REVENUE_MOM: {
    term: '營收 MoM',
    aka: '月增率',
    short: '這個月營收和「上個月」比的增減。',
    detail:
      'MoM＝Month over Month，反映最近的動能；但容易受淡旺季影響，通常和 YoY 一起看。',
    example: '例：5 月比 4 月多 10% → MoM +10%。',
  },
  PER_RIVER: {
    term: '本益比河流圖',
    aka: 'PER Bands',
    short: '把過去幾年的本益比畫成「便宜～昂貴」的河道，看現在站在哪一段。',
    detail:
      '用這檔自己過去多年的本益比分布，畫出便宜（20%）到昂貴（80%）的水平帶。股價對應的本益比落在低河道＝相對便宜、高河道＝相對貴。',
    example: '例：目前本益比掉到河流圖最下方便宜帶 → 估值處於歷史低檔。',
  },
  PBR_RIVER: {
    term: '股價淨值比河流圖',
    aka: 'PBR Bands',
    short: '用「股價相對公司淨值」畫出便宜～昂貴帶，常用於資產股、金融股。',
    detail:
      '淨值比（PBR）＝股價 ÷ 每股淨值。以歷史 PBR 分布畫河道，落在低帶代表相對便宜，特別適合獲利波動大、用 PBR 評價的族群。',
    example: '例：金融股 PBR 落在歷史低帶 → 帳面價值面偏便宜。',
  },
  YIELD_RIVER: {
    term: '殖利率河流帶',
    aka: 'Yield Bands',
    short: '用「領到的股息回報率」反推便宜貴：殖利率越高代表股價相對越便宜。',
    detail:
      '殖利率和股價反向：股價跌、殖利率升。以歷史殖利率分布畫帶，殖利率落在高帶（便宜）對存股族較有吸引力。',
    example: '例：殖利率升到歷史高帶 → 以配息回報看相對便宜。',
  },
  VALUATION_ZONE: {
    term: '估值位階',
    short: '拿今天的本益比 / 淨值比，和這檔自己過去幾年比，落在便宜 / 合理 / 昂貴哪一段。',
    detail:
      '把今日估值換算成在歷史的百分位：前 20% 便宜、中間合理、後 30% 昂貴（殖利率反向）。屬同檔自我比較，不跨股比較。',
    example: '例：本益比歷史百分位 12% → 估值位階便宜。',
  },
  PEG: {
    term: '本益成長比 PEG',
    aka: 'PEG Ratio',
    short: '本益比 ÷ 成長率，< 1 常被視為「成長又不貴」的甜蜜點。',
    detail:
      'PEG＝本益比 ÷ 營收（或盈餘）年增率。同樣本益比下，成長越快 PEG 越低、越划算；< 1 常被認為兼具成長與便宜。',
    example: '例：本益比 15、營收年增 30% → PEG 0.5（成長又不貴）。',
  },

  // ─── 大盤 / 期貨 ───
  TAIEX: {
    term: '加權指數',
    aka: 'TAIEX, 大盤',
    short: '代表「整個台股」的指數，就是大家說的「大盤」。',
    detail:
      '把所有上市公司依市值加權算出的總指數。大盤漲跌代表整體市場氣氛，個股常受大盤帶動。',
    example: '例：加權指數大漲 → 多數股票同步走強。',
  },
  BREADTH: {
    term: '漲跌家數',
    aka: '市場廣度',
    short: '今天上漲、下跌各有幾家公司，看「漲的是不是多數」。',
    detail:
      '上漲家數遠多於下跌＝普遍性上漲（廣度好、較健康）；若指數漲但下跌家數更多，代表只有少數權值股在拉抬。',
    example: '例：上漲 700 家、下跌 200 家 → 廣度健康的多頭。',
  },
  SECTOR_ROTATION: {
    term: '類股輪動',
    short: '資金在不同產業（半導體、金融、航運…）之間輪流流動。',
    detail:
      '熱錢不會一直待在同一族群，會輪流推升不同類股。觀察「哪個類股領漲」可以抓到當下的資金焦點。',
    example: '例：今天半導體領漲、明天換金融 → 典型的類股輪動。',
  },
  TXF: {
    term: '台指期',
    aka: 'TXF, 台股期貨',
    short: '用「加權指數」當標的的期貨，常被當作大盤的領先指標。',
    detail:
      '台指期可放空、可槓桿、交易時間更長（含夜盤）。法人用它避險或押方向，因此常領先反映市場預期。',
    example: '例：夜盤台指期大跌 → 隔天現貨開盤可能偏弱。',
  },
  NIGHT_SESSION: {
    term: '夜盤',
    aka: '盤後期貨',
    short: '台股白天收盤後，期貨晚上繼續交易的時段。',
    detail:
      '夜盤（約 15:00 至隔日 05:00）能反映美股與國際盤的最新狀況，常被用來預判隔天台股開盤的強弱。',
    example: '例：美股盤中大漲帶動夜盤走高 → 隔天台股有望開高。',
  },
  BASIS: {
    term: '期現價差',
    aka: '基差 Basis',
    short: '期貨價格減掉現貨（加權指數）的差距，看法人偏多還偏空。',
    detail:
      '基差＝台指期 − 加權指數。正價差（期貨較高）通常偏多，逆價差（期貨較低）偏空。夜盤基差常被用來預判隔天走勢。',
    example: '例：夜盤期貨低於加權指數 80 點（逆價差）→ 短線偏空。',
  },
  GLOBAL_INDEX: {
    term: '國際盤',
    aka: '美股四大指數',
    short: '美股四大指數，台股（尤其電子股）深受其影響。',
    detail:
      '道瓊（傳產藍籌）、S&P 500（大盤代表）、那斯達克（科技股）、費城半導體 SOX（半導體，和台積電等最相關）。美股漲跌常牽動隔天台股。',
    example: '例：費半大跌 → 隔天台股半導體類股壓力較大。',
  },

  // ─── 系統指標 ───
  HEALTH_SCORE: {
    term: '健診評分',
    short:
      '本系統綜合「籌碼／技術／基本面／趨勢動能／估值」五大面向加權算出的 0~100 體質分，可依投資策略調整權重。',
    detail:
      '五大面向各自算 0~100 子分數：籌碼（法人／融資）、技術（訊號／均線／RSI）、基本面（營收／EPS）、趨勢動能（DMI／背離／乖離）、估值（本益比／殖利率／河流位階）。再依你選的策略（綜合／價值／動能／籌碼／存股）套權重加總。≥70（紅）偏強、≤40（綠）偏弱。僅供參考，非投資建議。',
    example: '例：切到「存股」策略後，估值與殖利率權重提高，高殖利率股分數會上升。',
  },
  ACTION: {
    term: '動作',
    aka: 'BUY / HOLD / SELL',
    short: '系統用技術指標算出的機械式訊號：買進 / 觀望 / 賣出。',
    detail:
      '由均線、MACD、RSI、KD、量能、K 線型態等加權判定：分數 ≥2 為 BUY、≤−2 為 SELL、中間為 HOLD。⚠️ 僅供參考，非投資建議。',
    example: '例：多項指標同時轉強 → 動作顯示 BUY。',
  },
  CONFIDENCE: {
    term: '信心度',
    short: '系統對這個訊號有多少把握（0~100%）。',
    detail:
      '越多指標方向一致、訊號越明確，信心度越高。信心度低代表多空訊號分歧，參考價值較低。',
    example: '例：信心度 90% 的 BUY 比 55% 的 BUY 更值得留意。',
  },
  MOMENTUM_STOCK: {
    term: '飆股',
    aka: '強勢股',
    short: '短期內漲勢特別兇猛的股票。',
    detail:
      '通常具備強動能（價漲量增、創新高、籌碼集中）。「飆股雷達」策略就是篩選這類強勢股；但波動大、風險也高。',
    example: '例：連續跳空上漲、量能放大 → 典型飆股特徵。',
  },
  BACKTEST: {
    term: '回測',
    aka: 'Backtest',
    short: '拿過去的歷史股價，模擬「如果照這個策略買賣，結果會怎樣」。',
    detail:
      '把策略規則套在歷史資料上逐日模擬進出場，算出總報酬、勝率、最大回撤等。回測好不代表未來一定賺（過去績效不代表未來），但能幫你了解策略特性與風險。',
    example: '例：用近 5 年資料模擬「KD 低檔黃金交叉買、高檔死亡交叉賣」會賺賠多少。',
  },
  WIN_RATE: {
    term: '勝率',
    aka: 'Win Rate',
    short: '賺錢的交易筆數佔總交易的百分比。',
    detail:
      '勝率 = 獲利交易數 ÷ 總交易數。勝率高不代表一定賺錢，還要看每次賺多少、賠多少（搭配「獲利因子」一起看）。',
    example: '例：10 筆交易中 6 筆賺錢 → 勝率 60%。',
  },
  MAX_DRAWDOWN: {
    term: '最大回撤',
    aka: 'Max Drawdown',
    short: '資產從最高點往下跌的最大幅度，衡量「最慘會賠多少」。',
    detail:
      '回撤 = (波段最高資產 − 之後最低資產) ÷ 最高資產。最大回撤越小代表過程越平穩、越好抱；數字越大代表中途可能要忍受很大的帳面虧損。',
    example: '例：資產從 130 萬掉到 100 萬 → 回撤約 23%。',
  },
  ANNUALIZED_RETURN: {
    term: '年化報酬',
    aka: 'CAGR',
    short: '把總報酬換算成「平均每年賺幾 %」，方便不同期間比較。',
    detail:
      '年化報酬（複合年成長率 CAGR）考慮複利，反映平均每年的成長速度。例如 5 年總共賺 100%，年化約 15%，不是單純除以 5。',
    example: '例：5 年從 100 萬變 200 萬 → 年化約 15%。',
  },
  PROFIT_FACTOR: {
    term: '獲利因子',
    aka: 'Profit Factor',
    short: '總獲利 ÷ 總虧損，大於 1 才是整體賺錢。',
    detail:
      '獲利因子 = 所有賺錢交易的總和 ÷ 所有賠錢交易的總和（絕對值）。> 1 代表賺的比賠的多，越大越好；< 1 代表整體是賠的。',
    example: '例：共賺 30 萬、共賠 10 萬 → 獲利因子 3.0。',
  },
  SHARPE: {
    term: '夏普值',
    aka: 'Sharpe Ratio',
    short: '每承擔一分風險（波動）能換到多少報酬，越高越好。',
    detail:
      '夏普值 = 年化報酬 ÷ 年化波動度（此處無風險利率視為 0）。數值越高代表「報酬相對於波動」越划算；通常 > 1 算不錯。',
    example: '例：年化 20%、波動 10% → 夏普值 2.0。',
  },
  BUY_HOLD: {
    term: '買進持有',
    aka: 'Buy & Hold',
    short: '一開始就買、整段期間都不賣的最單純做法，當作策略的比較基準。',
    detail:
      '把資金在期初一次買進、期末才賣出，中間不做任何操作。用來對照「主動進出的策略」到底有沒有比「躺著不動」更好。',
    example: '例：策略賺 50%，但買進持有同期賺 80% → 策略其實沒贏大盤。',
  },
  VOLATILITY: {
    term: '年化波動度',
    aka: 'Volatility',
    short: '資產每天上下震盪的劇烈程度，數字越大代表越刺激、風險越高。',
    detail:
      '把每日報酬的標準差換算成年化後的百分比。波動度越高，資產上沖下洗越兇、抱起來越心驚；越低代表走勢越平穩。它也是夏普值的分母（報酬相對於波動划不划算）。',
    example: '例：年化波動 15% 的策略，過程比波動 30% 的平穩許多。',
  },
  // ─── 回測策略與參數 ───
  STRATEGY: {
    term: '策略',
    aka: 'Strategy',
    short: '一套固定的買賣規則（用哪些指標、何時進出場）。',
    detail:
      '每個策略有自己的指標組合與參數，例如「KD 低檔黃金交叉買、高檔死亡交叉賣」。回測就是把策略套在歷史資料上看績效。',
    example: '例：均線交叉、MACD 金叉、RSI 超賣、布林突破都是不同策略。',
  },
  STRATEGY_COMPARISON: {
    term: '策略比較',
    aka: 'Strategy Comparison',
    short: '同一檔股票，一次跑多個策略並排比績效，找出較適合的那一個。',
    detail:
      '為公平比較，所有策略都從相同的起算日開始、用相同本金與費率，並與「買進持有」對照。冠軍＝績效最佳且勝過買進持有者。',
    example: '例：對台積電同時比 KD / 均線 / MACD / RSI / 布林，看誰年化報酬最高。',
  },
  BOLLINGER: {
    term: '布林通道',
    aka: 'Bollinger Bands',
    short: '用上下兩條線框住股價常態震盪範圍，突破代表行情轉強或轉弱。',
    detail:
      '中軌是均線，上下軌＝中軌 ± N 倍標準差。股價突破上軌常代表轉強（追突破），跌破中軌或下軌代表轉弱。通道變窄＝盤整，變寬＝波動放大。',
    example: '例：股價帶量突破上軌 → 布林策略視為買進訊號。',
  },
  MA_PERIOD: {
    term: '均線週期',
    aka: 'MA Period',
    short: '計算均線要取最近幾天（如 5、20 天），數字越小越靈敏、越大越穩。',
    detail:
      '快線用較短週期（反應快、雜訊多），慢線用較長週期（反應慢、較穩）。均線交叉策略用快線穿越慢線判斷買賣。',
    example: '例：快線 5 日、慢線 20 日，5 日線上穿 20 日線＝買進。',
  },
  MACD_FAST_PERIOD: {
    term: 'MACD 快線週期',
    aka: 'Fast Period',
    short: 'MACD 計算用的短期 EMA 週期（預設 12），抓短期動能。',
    detail: 'MACD 由快線 EMA 減慢線 EMA 得到 DIF。快線週期越短越敏感。',
    example: '例：最常見組合為快 12、慢 26、訊號 9。',
  },
  MACD_SLOW_PERIOD: {
    term: 'MACD 慢線週期',
    aka: 'Slow Period',
    short: 'MACD 計算用的長期 EMA 週期（預設 26），抓中期動能。',
    detail: '慢線 EMA 反映較長期趨勢；快慢線差距即動能強弱。',
    example: '例：快 12、慢 26、訊號 9。',
  },
  MACD_SIGNAL_PERIOD: {
    term: 'MACD 訊號線週期',
    aka: 'Signal Period',
    short: 'MACD 柱狀體的平滑週期（預設 9），用來判斷金叉死叉。',
    detail:
      '訊號線＝DIF 的 EMA；柱狀體＝DIF − 訊號線，由負翻正＝金叉（偏多），由正翻負＝死叉（偏空）。',
    example: '例：柱狀體翻紅（> 0）→ MACD 策略買進。',
  },
  RSI_PERIOD: {
    term: 'RSI 週期',
    aka: 'RSI Period',
    short: 'RSI 計算取最近幾天（預設 14），越短越敏感。',
    detail: '週期越短，RSI 越容易觸及超買 / 超賣；越長越平滑。',
    example: '例：常用 14 日 RSI。',
  },
  RSI_OVERSOLD: {
    term: 'RSI 超賣門檻',
    aka: 'Oversold',
    short: 'RSI 低於此值代表跌過頭、可能反彈（預設 30），策略在此買進。',
    detail: 'RSI 由上跌破超賣門檻，視為逢低買進訊號（逆勢操作）。門檻越低越嚴格、訊號越少。',
    example: '例：RSI 跌破 30 → 買進。',
  },
  RSI_OVERBOUGHT: {
    term: 'RSI 超買門檻',
    aka: 'Overbought',
    short: 'RSI 高於此值代表漲過頭、可能回檔（預設 70），策略在此賣出。',
    detail: 'RSI 由下突破超買門檻，視為獲利了結 / 賣出訊號。',
    example: '例：RSI 突破 70 → 賣出。',
  },
  BOLLINGER_PERIOD: {
    term: '布林週期',
    aka: 'BB Period',
    short: '布林通道中軌（均線）取最近幾天（預設 20）。',
    detail: '決定通道中心線位置與寬度反應速度。',
    example: '例：常用 20 日布林。',
  },
  BOLLINGER_STD_DEV: {
    term: '布林標準差倍數',
    aka: 'Std Dev',
    short: '上下軌離中軌幾個標準差（預設 2），數字越大通道越寬。',
    detail: '2 倍標準差約涵蓋多數價格波動；倍數越大、突破越難、訊號越少。',
    example: '例：中軌 ± 2 倍標準差為最常見設定。',
  },
};

export interface GlossaryGroup {
  /** 分類標題 */
  title: string;
  /** 此分類包含的名詞 keys */
  keys: GlossaryKey[];
}

/** 名詞分組（速查表頁與新手導覽面板共用）。 */
export const GLOSSARY_GROUPS: GlossaryGroup[] = [
  {
    title: '技術面（看走勢 / 買賣點）',
    keys: [
      'CANDLE_COLOR',
      'MA',
      'MA_BULLISH',
      'MA240',
      'KD',
      'KD_CROSS',
      'MACD',
      'RSI',
      'BIAS',
      'VOLUME',
      'DMI_ADX',
      'WILLIAMS_R',
      'CCI',
      'OBV',
      'SAR',
      'DIVERGENCE',
      'VOLUME_PRICE_DIVERGENCE',
    ],
  },
  {
    title: '籌碼面（看誰在買賣）',
    keys: [
      'INSTITUTIONS',
      'INST_STREAK',
      'CHIP_CONCENTRATION',
      'FOREIGN_HOLDING',
      'MARGIN_BALANCE',
      'SHORT_BALANCE',
      'OPEN_INTEREST',
      'LONG_SHORT_OI',
      'CHIP_SCORE',
    ],
  },
  {
    title: '基本面（看公司賺不賺錢）',
    keys: [
      'PER',
      'EPS',
      'DIVIDEND_YIELD',
      'REVENUE_YOY',
      'REVENUE_MOM',
      'VALUATION_ZONE',
      'PER_RIVER',
      'PBR_RIVER',
      'YIELD_RIVER',
      'PEG',
    ],
  },
  {
    title: '大盤 / 期貨（看整體行情）',
    keys: ['TAIEX', 'BREADTH', 'SECTOR_ROTATION', 'GLOBAL_INDEX', 'TXF', 'NIGHT_SESSION', 'BASIS'],
  },
  {
    title: '系統指標（本系統算給你看的）',
    keys: ['HEALTH_SCORE', 'ACTION', 'CONFIDENCE', 'MOMENTUM_STOCK'],
  },
  {
    title: '回測 / 策略（看策略過去表現）',
    keys: [
      'STRATEGY',
      'STRATEGY_COMPARISON',
      'BACKTEST',
      'BUY_HOLD',
      'WIN_RATE',
      'ANNUALIZED_RETURN',
      'MAX_DRAWDOWN',
      'PROFIT_FACTOR',
      'SHARPE',
      'VOLATILITY',
      'BOLLINGER',
      'MA_PERIOD',
      'MACD_FAST_PERIOD',
      'MACD_SLOW_PERIOD',
      'MACD_SIGNAL_PERIOD',
      'RSI_PERIOD',
      'RSI_OVERSOLD',
      'RSI_OVERBOUGHT',
      'BOLLINGER_PERIOD',
      'BOLLINGER_STD_DEV',
    ],
  },
];
