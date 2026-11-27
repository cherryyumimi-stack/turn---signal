/* =========================================================
 * 分數 → 聲音參數（sound-mapping.js）
 * ---------------------------------------------------------
 * 所有「問卷怎麼變成聲音」的規則都集中在這個檔案。
 * 想調整聲音特徵，通常只需要改 SOUND_CONFIG 的數字。
 *
 * 三個維度各自控制一個聽得很清楚的特徵：
 *   靠近／退開 → 音高（低沉 ↔ 高亢，跨兩個八度）
 *   掌控／放手 → 速度（BPM）
 *   維持／改變 → 音色種類（7 種完全不同的聲音）
 * 另外，每個人選的「A／B／C／D 組合」會產生一個個人編號，
 * 讓分數相同的人也會在音高、餘韻、質感上有些不同。
 * ========================================================= */
window.TS = window.TS || {};

TS.SOUND_CONFIG = {
  /* --- 維持／改變：音色種類（分數由低到高排列）---
   * 維持型 → 熟悉、圓潤的聲音；改變型 → 奇特、電子、會變形的聲音
   * baseHz：這種音色在「靠近／退開 50 分」時的音高 */
  timbres: [
    { id: "wood",    name: "木頭",   baseHz: 700 },  // 0 分：木魚、節拍器般的敲擊
    { id: "marimba", name: "木琴",   baseHz: 520 },  // 17 分：溫暖、有音高的木琴
    { id: "bell",    name: "鈴鐺",   baseHz: 880 },  // 33 分：清亮、會延續的鐘聲
    { id: "pluck",   name: "撥弦",   baseHz: 330 },  // 50 分：像吉他或豎琴撥一下
    { id: "chip",    name: "電子嗶", baseHz: 660 },  // 67 分：遊戲機般的方波「嗶」
    { id: "metal",   name: "金屬",   baseHz: 440 },  // 83 分：敲金屬管的不和諧泛音
    { id: "laser",   name: "雷射",   baseHz: 600 }   // 100 分：音高快速滑落的「咻」
  ],

  /* --- 靠近／退開：音高 --- */
  pitchRange: 12,       // 分數 0／100 時，音高最多降低／升高幾個半音（12＝一個八度）
  scale: [0, 2, 4, 7, 9], // 音高對齊五聲音階，很多人同時響時不會太刺耳

  /* --- 掌控／放手：速度（BPM），一拍只響一下 --- */
  bpmMin: 70,           // 分數 0（交給偶然）時的 BPM
  bpmMax: 120,          // 分數 100（想掌控）時的 BPM
  // 現場節拍器是 60 BPM，最低 70 是為了不跟節拍器重疊

  /* --- 個人差異（由每題選了哪個選項決定，同樣的答案永遠得到同樣的聲音）--- */
  personalPitchSteps: 1, // 音高再往上或往下移動最多幾個音階
  personalBpm: 4,        // BPM 再加減最多幾拍
  decayMin: 0.75,        // 餘韻長度的倍數範圍
  decayMax: 1.35,

  /* --- 安全 --- */
  maxGain: 0.9          // 主音量上限（0～1）；後面還有限幅器防止爆音
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** 答案組合 → 0～1 之間固定的亂數產生器（同樣答案永遠一樣） */
TS.personalRandom = function (answers) {
  let h = 2166136261;
  const s = (answers || []).join("");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  let x = h >>> 0;
  return function () {
    x = (x + 0x6D2B79F5) >>> 0;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** 答案組合 → 四碼個人編號（顯示與送出用） */
TS.personalCode = function (answers) {
  return (answers || []).map((i) => "ABCD"[i]).join("");
};

/** 把半音數對齊到五聲音階，並往上／下移動 steps 個音階 */
function snapToScale(semis, steps) {
  const sc = TS.SOUND_CONFIG.scale;
  const notes = [];
  for (let o = -3; o <= 3; o++) sc.forEach((d) => notes.push(o * 12 + d));
  let best = 0;
  notes.forEach((n, i) => { if (Math.abs(n - semis) < Math.abs(notes[best] - semis)) best = i; });
  return notes[Math.min(notes.length - 1, Math.max(0, best + steps))];
}

/**
 * 三個分數＋答案 → 聲音引擎要用的參數
 * @param {{approach:number, control:number, change:number}} s 0～100
 * @param {number[]} answers 每題選的選項（0=A … 3=D）
 */
TS.mapScoresToSound = function (s, answers) {
  const c = TS.SOUND_CONFIG;
  const rnd = TS.personalRandom(answers);
  const r = [rnd(), rnd(), rnd(), rnd(), rnd(), rnd()];

  const ti = Math.round(clamp01(s.change / 100) * (c.timbres.length - 1));
  const timbre = c.timbres[ti];

  const pStep = Math.round((r[0] * 2 - 1) * c.personalPitchSteps);
  const semis = snapToScale(((s.approach - 50) / 50) * c.pitchRange, pStep);

  const bpm = c.bpmMin + (c.bpmMax - c.bpmMin) * clamp01(s.control / 100)
            + Math.round((r[1] * 2 - 1) * c.personalBpm);

  return {
    timbre: timbre.id,
    timbreName: timbre.name,
    timbreIndex: ti,
    freq: timbre.baseHz * Math.pow(2, semis / 12),
    bpm: Math.max(64, bpm),
    decayMul: c.decayMin + (c.decayMax - c.decayMin) * r[2],
    shade: r[3],   // 每種音色內部的質感變化（亮／暗、比例等）
    shade2: r[4]
  };
};
