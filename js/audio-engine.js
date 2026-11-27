/* =========================================================
 * 聲音引擎（audio-engine.js）
 * ---------------------------------------------------------
 * 用 Web Audio API 即時合成聲音，不使用音檔。
 *
 * 節奏：一拍只響一下，間隔完全固定（60 / BPM 秒），沒有額外脈衝、沒有隨機偏移。
 *
 * 三個分數各自改變一個聽得出來的特徵（數值見 sound-mapping.js）：
 *   靠近／退開 → 音高
 *   掌控／放手 → BPM
 *   維持／改變 → 音色種類（木頭、木琴、鈴鐺、撥弦、電子嗶、金屬、雷射）
 * 每個人的答案組合再微調音高、BPM、餘韻與質感。
 * ========================================================= */
window.TS = window.TS || {};

TS.AudioEngine = function () {
  const cfg = TS.SOUND_CONFIG;
  const LOOKAHEAD = 0.2;        // 往前排程的秒數
  const TICK_MS = 25;

  let ctx = null, master = null, volume = 0.8, silentEl = null, noiseBuf = null;
  let running = false, timer = null, nextTime = 0;
  let live = null;   // 目前的聲音參數
  let onPulse = function () {};

  /* ---------- 初始化（必須在使用者點擊後呼叫） ---------- */
  function ensureContext() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    // 壓縮器當作限幅器，避免爆音
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
    master.connect(limiter);
    limiter.connect(ctx.destination);

    noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.3), ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    // iPhone 的靜音鍵會讓 Web Audio 沒聲音。
    // 同時循環播放一段無聲音檔，可讓 iOS 把網頁當成「媒體播放」，靜音鍵打開也能出聲。
    try { silentEl = new Audio(silentWav()); silentEl.loop = true; silentEl.setAttribute("playsinline", ""); } catch (e) {}
  }
  function silentWav() {
    const n = 4410, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 44100, true); v.setUint32(28, 88200, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, n * 2, true);
    return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  }
  /** 在使用者點擊時呼叫，解除瀏覽器的自動播放限制 */
  function unlock() {
    ensureContext();
    if (ctx.state !== "running") ctx.resume();
    if (silentEl) silentEl.play().catch(function () {});
  }

  /* ---------- 共用小工具 ---------- */
  // 包絡：極快起音，之後以指數衰減（tau 秒）
  function env(t, peak, attack, tau, dest) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setTargetAtTime(0, t + attack, tau);
    g.connect(dest);
    return g;
  }
  function osc(type, f, t, end, dest) {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(f, t);
    o.connect(dest); o.start(t); o.stop(end);
    return o;
  }
  function noiseBurst(t, freq, q, level, tau, dest) {
    const n = ctx.createBufferSource(); n.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = Math.min(16000, freq); bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.setTargetAtTime(0, t, tau);
    n.connect(bp); bp.connect(g); g.connect(dest);
    n.start(t); n.stop(t + 0.3);
  }

  /* ---------- 7 種音色（順序同 SOUND_CONFIG.timbres） ---------- */
  const VOICES = {
    // 木頭：兩個快速衰減的共鳴＋敲擊瞬間的「叩」
    wood: function (t, p, out) {
      const tau = 0.03 * p.decayMul;
      const ratio = 2.4 + p.shade * 0.4;
      [[1, 0.8, tau], [ratio, 0.35, tau * 0.6]].forEach(function (m) {
        const g = env(t, m[1], 0.0007, m[2], out);
        const o = osc("sine", p.freq * m[0] * 1.12, t, t + m[2] * 8, g);
        o.frequency.exponentialRampToValueAtTime(p.freq * m[0], t + 0.008);
      });
      noiseBurst(t, p.freq, 8, 0.8, 0.003, out);
    },
    // 木琴：溫暖的正弦音＋第 4 倍泛音，餘韻較長
    marimba: function (t, p, out) {
      const tau = 0.14 * p.decayMul;
      osc("sine", p.freq, t, t + tau * 7, env(t, 0.75, 0.002, tau, out));
      osc("sine", p.freq * 4, t, t + tau * 3, env(t, 0.22, 0.001, tau * 0.25, out));
      osc("sine", p.freq * (9.2 + p.shade), t, t + 0.05, env(t, 0.06, 0.001, 0.008, out));
      noiseBurst(t, p.freq * 2, 3, 0.25, 0.002, out);
    },
    // 鈴鐺：FM 合成，帶不和諧泛音、清亮且延續
    bell: function (t, p, out) {
      const tau = 0.26 * p.decayMul;
      const ratio = [2.76, 3.5, 4.2][Math.floor(p.shade * 3)];
      const car = osc("sine", p.freq, t, t + tau * 7, env(t, 0.45, 0.002, tau, out));
      const modGain = ctx.createGain();
      modGain.gain.setValueAtTime(p.freq * (2 + p.shade2 * 2), t);
      modGain.gain.setTargetAtTime(p.freq * 0.2, t, tau * 0.4);
      modGain.connect(car.frequency);
      osc("sine", p.freq * ratio, t, t + tau * 7, modGain);
    },
    // 撥弦：鋸齒波經過快速關閉的低通濾波，像撥一下弦
    pluck: function (t, p, out) {
      const tau = 0.16 * p.decayMul;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.Q.value = 2 + p.shade * 6;
      lp.frequency.setValueAtTime(Math.min(16000, p.freq * (10 + p.shade2 * 10)), t);
      lp.frequency.setTargetAtTime(p.freq * 1.3, t, 0.04);
      const g = env(t, 0.5, 0.002, tau, out);
      lp.connect(g);
      osc("sawtooth", p.freq, t, t + tau * 7, lp);
      osc("sawtooth", p.freq * 1.004, t, t + tau * 7, lp);
    },
    // 電子嗶：方波，一下之內音高跳一階（「嗶─啵」），像遊戲機
    chip: function (t, p, out) {
      const len = 0.07 + 0.05 * p.decayMul;
      const tri = p.shade2 >= 0.5, peak = tri ? 0.45 : 0.22;   // 三角波較柔，音量補大一點
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.002);
      g.gain.setValueAtTime(peak, t + len);
      g.gain.linearRampToValueAtTime(0, t + len + 0.01);
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 6000;
      g.connect(lp); lp.connect(out);
      const jump = p.shade < 0.5 ? 1.5 : 2;          // 跳五度或八度
      const o = osc(tri ? "triangle" : "square", p.freq, t, t + len + 0.02, g);
      o.frequency.setValueAtTime(p.freq * jump, t + len * 0.45);
    },
    // 金屬：高調變量的不和諧 FM，像敲鐵管或鍋子
    metal: function (t, p, out) {
      const tau = 0.16 * p.decayMul;
      const ratio = [1.41, 1.73, 2.31][Math.floor(p.shade * 3)];
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = p.freq * 0.7;
      hp.connect(out);
      const car = osc("sine", p.freq, t, t + tau * 7, env(t, 0.4, 0.001, tau, hp));
      const modGain = ctx.createGain();
      modGain.gain.setValueAtTime(p.freq * (4 + p.shade2 * 4), t);
      modGain.gain.setTargetAtTime(p.freq * 1.5, t, tau);
      modGain.connect(car.frequency);
      osc("sine", p.freq * ratio, t, t + tau * 7, modGain);
      osc("triangle", p.freq * 2.76, t, t + tau * 4, env(t, 0.12, 0.001, tau * 0.5, hp));
      noiseBurst(t, p.freq * 5, 2, 0.3, 0.004, hp);
    },
    // 雷射：音高快速滑動的「咻」，加一點雜訊
    laser: function (t, p, out) {
      const len = 0.12 + 0.08 * p.decayMul;
      const up = p.shade2 >= 0.65;                       // 少數人是往上滑
      const from = up ? p.freq * 0.5 : p.freq * (2.5 + p.shade);
      const to = up ? p.freq * 2 : p.freq * 0.5;
      const g = env(t, 0.5, 0.002, len * 0.45, out);
      const o = osc(p.shade < 0.5 ? "sawtooth" : "triangle", from, t, t + len * 3, g);
      o.frequency.exponentialRampToValueAtTime(to, t + len);
      if (p.shade < 0.5) {
        const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3500;
        o.disconnect(); o.connect(lp); lp.connect(g);
      }
      noiseBurst(t, p.freq * 3, 1.5, 0.12, len * 0.3, out);
    }
  };

  function hit(t) {
    (VOICES[live.timbre] || VOICES.wood)(t, live, master);
  }

  /* ---------- 排程器：一拍一下，間隔 = 60 / BPM ---------- */
  function tick() {
    // 若手機卡頓或切到背景太久，從現在重新對齊，不一次補播
    if (nextTime < ctx.currentTime - 0.2) nextTime = ctx.currentTime + 0.05;
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      const beat = 60 / live.bpm;
      const t = Math.max(nextTime, ctx.currentTime + 0.005);
      hit(t);
      const delay = Math.max(0, (t - ctx.currentTime) * 1000);
      setTimeout(function () { if (running) onPulse(beat); }, delay);
      nextTime += beat;
    }
  }

  /* ---------- 對外介面 ---------- */
  return {
    /** 設定聲音參數（來自 TS.mapScoresToSound），下一拍開始生效 */
    setTarget: function (params) {
      live = Object.assign({}, params);
    },
    /** 音量 0～1，實際輸出會乘上 SOUND_CONFIG.maxGain */
    setVolume: function (v) {
      volume = Math.min(1, Math.max(0, v));
      if (ctx && running) master.gain.setTargetAtTime(volume * cfg.maxGain, ctx.currentTime, 0.05);
    },
    unlock: unlock,
    start: function () {
      unlock();
      if (running) return;
      running = true;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(volume * cfg.maxGain, ctx.currentTime, 0.05);
      nextTime = ctx.currentTime + 0.08;
      tick();
      timer = setInterval(tick, TICK_MS);
    },
    /** 停止：先淡出再停，避免突然斷掉 */
    stop: function () {
      if (!running) return;
      running = false;
      clearInterval(timer); timer = null;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
    },
    isRunning: function () { return running; },
    /** 每敲一下時呼叫 fn(這一拍的秒數)，用來讓燈號同步 */
    onPulse: function (fn) { onPulse = fn; }
  };
};
