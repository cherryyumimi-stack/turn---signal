/* =========================================================
 * 分數 → 聲音參數（sound-mapping.js）
 * ---------------------------------------------------------
 * 所有「分數怎麼變成聲音」的規則都集中在這個檔案。
 * 想調整聲音特徵，通常只需要改 SOUND_CONFIG 的數字。
 * ========================================================= */
window.TS = window.TS || {};

TS.SOUND_CONFIG = {
  /* --- 敲擊聲本體：像木魚／節拍器的木頭敲擊，一拍只響一下 --- */
  woodHz: 720,          // 木頭共鳴的音高：越高越像小木棒，越低越像厚木塊
  modeRatio: 2.57,      // 第二個共鳴的倍數（木頭的「空心」感，木魚約 2.5～2.7）
  modeLevel: 0.4,       // 第二個共鳴的音量
  decaySoft: 0.045,     // 音色 0 分時的餘韻（秒）：較悶、較長
  decayCrisp: 0.022,    // 音色 100 分時的餘韻（秒）：較短、較脆
  lowpassSoft: 1600,    // 音色 0 分時的高頻上限（Hz）：越低越悶
  lowpassCrisp: 4500,   // 音色 100 分時的高頻上限（Hz）：越高越亮
  noiseSoft: 0.5,      // 音色 0 分時，敲擊瞬間「喀」的音量
  noiseCrisp: 1.0,     // 音色 100 分時，「喀」的音量（像樹枝折斷的乾裂聲）
  crackleMax: 1,        // 音色高時，主擊後面跟著的細碎裂聲數量（0＝不要）

  /* --- 靠近／退開：音高 --- */
  pitchRange: 7,        // 分數 0／100 時，音高最多降低／升高幾個半音（50 分＝原音高）

  /* --- 掌控／放手：速度（BPM），一拍只響一下 --- */
  bpmMin: 70,           // 分數 0（交給偶然）時的 BPM
  bpmMax: 120,          // 分數 100（想掌控）時的 BPM

  /* --- 維持／改變：音色 --- */
  // 0 分＝悶、圓、像厚木塊；100 分＝乾、脆、像樹枝折斷（見 audio-engine.js 的 voice()）

  /* --- 維持／改變：拉霸敏感度 --- */
  sensMin: 0.5,         // 分數 0：拉霸只發揮 50% 的效果
  sensMax: 1.0,         // 分數 100：拉霸發揮 100% 的效果
  glideSlow: 1.5,       // 分數 0：聲音花約 1.5 秒慢慢跟上拉霸
  glideFast: 0.35,      // 分數 100：聲音約 0.35 秒就跟上拉霸

  /* --- 安全 --- */
  maxGain: 0.9          // 主音量上限（0～1）；後面還有限幅器防止爆音
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * 維持／改變 → 拉霸敏感度（0.5～1）與聲音跟隨速度（秒）
 */
TS.sensitivity = function (change) {
  const c = TS.SOUND_CONFIG, k = clamp01(change / 100);
  return {
    amount: c.sensMin + (c.sensMax - c.sensMin) * k,
    glide: c.glideSlow + (c.glideFast - c.glideSlow) * k
  };
};

/**
 * 拉霸位置 → 目前的三個分數
 * 拉霸的意義：
 *   sliders.approach：0=想躲起來、100=想靠近（與分數同方向）
 *   sliders.letGo：   0=想掌控、100=交給偶然（與「掌控」分數反方向）
 *   sliders.change：  0=維持原樣、100=想試試看
 * 拉霸偏離初始位置的距離會乘上「敏感度」，所以維持型的聲音變化較緩和。
 */
TS.currentScores = function (initial, sliders) {
  const sens = TS.sensitivity(sliders.change).amount;
  const targetControl = 100 - sliders.letGo;
  return {
    approach: initial.approach + (sliders.approach - initial.approach) * sens,
    control: initial.control + (targetControl - initial.control) * sens,
    change: sliders.change
  };
};

/** 初始分數 → 拉霸的初始位置 */
TS.slidersFromScores = function (s) {
  return { approach: s.approach, letGo: 100 - s.control, change: s.change };
};

/**
 * 三個分數 → 聲音引擎要用的參數
 */
TS.mapScoresToSound = function (s) {
  const c = TS.SOUND_CONFIG;
  return {
    // 靠近／退開：越高音越高，越低音越低
    pitchMul: Math.pow(2, ((s.approach - 50) / 50) * c.pitchRange / 12),
    // 掌控／放手：直接決定 BPM；越想掌控越快，越交給偶然越慢
    bpm: c.bpmMin + (c.bpmMax - c.bpmMin) * clamp01(s.control / 100),
    // 維持／改變：越高越乾脆（樹枝折斷），越低越悶（厚木塊）
    timbre: clamp01(s.change / 100),
    // 維持／改變：也決定聲音多快跟上拉霸
    glide: TS.sensitivity(s.change).glide
  };
};
