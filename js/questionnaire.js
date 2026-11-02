/* =========================================================
 * 問卷與計分（questionnaire.js）
 * ---------------------------------------------------------
 * - 每題屬於一個維度：approach（靠近／退開）、control（掌控／放手）、change（維持／改變）
 * - 每個選項的 score 是 0、50 或 100（依作品規格，請勿任意更改）
 * - 每個維度 = 所屬題目分數的平均（0～100）
 * - 分數只是聲音生成的依據，不是心理診斷或人格測驗
 *
 * 題目文字（q、選項文字）可以自由替換；
 * 只要保留每個選項的 score，計分規則就不會變。
 * ========================================================= */
window.TS = window.TS || {};

TS.QUESTIONS = [
  { // 題目 1：靠近／退開　A=100、B=50、C=0、D=100
    dim: "approach",
    q: "你走進一間派對，裡面只有三個人，正在聊一個你完全不懂的話題。你會：",
    options: [
      { text: "直接問：「你們在聊什麼？」反正都來了。", score: 100 },
      { text: "先在旁邊聽，找到機會再加入。", score: 50 },
      { text: "找個角落坐下，先觀察人類。", score: 0 },
      { text: "拿杯飲料走過去，先自我介紹。", score: 100 }
    ]
  },
  { // 題目 2：靠近／退開　A=100、B=50、C=0、D=50
    dim: "approach",
    q: "電梯裡只有你和一位不太熟的鄰居，對方好像想說些什麼。你會：",
    options: [
      { text: "先開口打招呼，順便聊聊天氣。", score: 100 },
      { text: "對方開口的話，就好好回應。", score: 50 },
      { text: "盯著樓層數字，假裝在想事情。", score: 0 },
      { text: "微笑點頭，保持友善。", score: 50 }
    ]
  },
  { // 題目 3：掌控／放手　A=0、B=50、C=100、D=50
    dim: "control",
    q: "群組裡大家決定了一個你不太想去的行程。你會：",
    options: [
      { text: "已讀，讓宇宙替我做決定。", score: 0 },
      { text: "先說好，當天再看狀況。", score: 50 },
      { text: "直接提出一個完整的替代方案。", score: 100 },
      { text: "問大家能不能換個地方。", score: 50 }
    ]
  },
  { // 題目 4：掌控／放手　A=100、B=50、C=0、D=0
    dim: "control",
    q: "旅行第一天，訂好的餐廳臨時公休。你會：",
    options: [
      { text: "打開備案清單，照第二順位走。", score: 100 },
      { text: "查一下附近評價，再決定吃哪家。", score: 50 },
      { text: "隨便走走，看到哪家就吃哪家。", score: 0 },
      { text: "問路人推薦，跟著走就對了。", score: 0 }
    ]
  },
  { // 題目 5：維持／改變　A=100、B=50、C=50、D=0
    dim: "change",
    q: "你點了一杯飲料，店員說：「今天新品，我幫你隨機做一杯。」你會：",
    options: [
      { text: "好啊，人生就是一場實驗。", score: 100 },
      { text: "可以，但不要有香菜。", score: 50 },
      { text: "請問可以先告訴我裡面有什麼嗎？", score: 50 },
      { text: "我還是要原本那杯，謝謝。", score: 0 }
    ]
  },
  { // 題目 6：維持／改變　A=100、B=50、C=50、D=0
    dim: "change",
    q: "常去的理髮師問：「要不要試試完全不一樣的髮型？」你會：",
    options: [
      { text: "好，交給你。", score: 100 },
      { text: "可以，但只改一點點。", score: 50 },
      { text: "先給我看看照片。", score: 50 },
      { text: "照舊就好。", score: 0 }
    ]
  },
  { // 題目 7：維持／改變　A=100、B=50、C=0、D=50
    dim: "change",
    q: "有人邀你下個月到另一座城市住一個月。你會：",
    options: [
      { text: "立刻開始收行李。", score: 100 },
      { text: "先問清楚細節，再想想看。", score: 50 },
      { text: "謝謝，我習慣現在的生活。", score: 0 },
      { text: "如果可以短一點，我就去。", score: 50 }
    ]
  }
];

/**
 * 計算三個維度的分數
 * @param {number[]} answers 每題選了第幾個選項（0=A, 1=B, 2=C, 3=D）
 * @returns {{approach:number, control:number, change:number}} 0～100
 */
TS.computeScores = function (answers) {
  const sum = { approach: 0, control: 0, change: 0 };
  const count = { approach: 0, control: 0, change: 0 };
  TS.QUESTIONS.forEach(function (q, i) {
    sum[q.dim] += q.options[answers[i]].score;
    count[q.dim] += 1;
  });
  return {
    approach: sum.approach / count.approach,
    control: sum.control / count.control,
    change: sum.change / count.change
  };
};
