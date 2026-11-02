/* =========================================================
 * 聲音引擎（audio-engine.js）
 * ---------------------------------------------------------
 * 用 Web Audio API 即時合成木頭敲擊聲，不使用音檔。
 *
 * 節奏：一拍只敲一下，間隔完全固定（60 / BPM 秒），沒有額外脈衝、沒有隨機偏移。
 *
 * 三個分數各自改變一個聽得出來的特徵（數值見 sound-mapping.js）：
 *   靠近／退開 → 音高
 *   掌控／放手 → BPM
 *   維持／改變 → 音色（悶的厚木塊 ↔ 乾脆的樹枝折斷）＋拉霸敏感度
 *
 * 參數平滑：目標參數改變時，實際參數以指數方式慢慢接近，
 * 不會中斷或跳接。接近速度由「維持／改變」決定。
 * ========================================================= */
window.TS = window.TS || {};

TS.AudioEngine = function () {
  const cfg = TS.SOUND_CONFIG;
  const LOOKAHEAD = 0.2;        // 往前排程的秒數
  const TICK_MS = 25;

  let ctx = null, master = null, volume = 0.8, silentEl = null, noiseBuf = null;
  let running = false, timer = null, lastTick = 0, nextTime = 0;
  let target = null, live = null;   // 目標參數與目前（平滑中）參數
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

    noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.03), ctx.sampleRate);
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

  /* ---------- 音色：依「維持／改變」在悶木塊與樹枝折斷之間內插 ---------- */
  function voice() {
    const T = live.timbre;
    const mix = (a, b) => a + (b - a) * T;
    return {
      f: cfg.woodHz * live.pitchMul,
      decay: mix(cfg.decaySoft, cfg.decayCrisp),
      lowpass: mix(cfg.lowpassSoft, cfg.lowpassCrisp),
      noise: mix(cfg.noiseSoft, cfg.noiseCrisp),
      crackles: Math.round(cfg.crackleMax * Math.max(0, (T - 0.4) / 0.6))
    };
  }

  /* ---------- 一下敲擊：木頭共鳴 + 敲擊瞬間的乾裂聲 ---------- */
  function hit(t) {
    const v = voice();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = v.lowpass; lp.Q.value = 0.5;
    lp.connect(master);

    // 1) 木頭共鳴：兩個正弦波，起音時音高微微下滑，快速衰減
    [[1, 1, v.decay], [cfg.modeRatio, cfg.modeLevel, v.decay * 0.6]].forEach(function (m) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(v.f * m[0] * 1.12, t);
      o.frequency.exponentialRampToValueAtTime(v.f * m[0], t + 0.008);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(m[1] * 0.9, t + 0.0007);
      g.gain.setTargetAtTime(0, t + 0.0007, m[2]);
      o.connect(g); g.connect(lp);
      o.start(t); o.stop(t + m[2] * 8);
    });

    // 2) 敲擊瞬間的木頭質感：極短的雜訊，經過「調在木頭共鳴上」的窄帶通濾波，
    //    聽起來是「叩」而不是「沙」
    noiseBurst(t, v.f, 8, v.noise, 0.003, lp);
    noiseBurst(t, v.f * cfg.modeRatio, 8, v.noise * 0.6, 0.002, lp);

    // 3) 樹枝折斷的細碎裂聲：主擊後幾毫秒，再來一兩下更小的乾裂
    for (let i = 1; i <= v.crackles; i++) {
      noiseBurst(t + 0.004 * i + Math.random() * 0.003, v.f * 3.5, 2, v.noise * 0.35 / i, 0.002, lp);
    }
  }
  function noiseBurst(t, freq, q, level, tau, dest) {
    const n = ctx.createBufferSource(); n.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = Math.min(16000, freq); bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.setTargetAtTime(0, t, tau);
    n.connect(bp); bp.connect(g); g.connect(dest);
    n.start(t); n.stop(t + 0.03);
  }

  /* ---------- 參數平滑 ---------- */
  function smooth(dt) {
    const k = 1 - Math.exp(-dt / Math.max(0.05, target.glide));
    ["pitchMul", "bpm", "timbre", "glide"].forEach(function (key) {
      live[key] += (target[key] - live[key]) * k;
    });
  }

  /* ---------- 排程器：一拍一下，間隔 = 60 / BPM ---------- */
  function tick() {
    const now = performance.now();
    smooth((now - lastTick) / 1000);
    lastTick = now;
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
    /** 設定目標聲音參數（來自 TS.mapScoresToSound），聲音會平滑過渡 */
    setTarget: function (params) {
      target = Object.assign({}, params);
      if (!live) live = Object.assign({}, params);
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
      lastTick = performance.now();
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
