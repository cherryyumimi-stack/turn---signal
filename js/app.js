/* =========================================================
 * 介面流程（app.js）
 * 首頁 → 7 題問卷 → 聲音操作介面 → 數值整理與回饋
 * 不登入；只有使用者按「送出」時，才會送出感想與聲音數值（見 submit.js）。
 * ========================================================= */
(function () {
  const $ = (id) => document.getElementById(id);
  const engine = TS.AudioEngine();
  const STORE_KEY = "turn-signal-state-v2";

  const state = {
    answers: [],
    qi: 0,
    initial: null,     // 問卷產生的初始分數（不會被拉霸改動）
    sliders: null,     // 使用者目前的拉霸位置
    mode: "current"    // "initial" = 聽初始聲音；"current" = 聽目前聲音
  };

  /* ---------- 畫面切換 ---------- */
  const SCREENS = ["s-intro", "s-quiz", "s-sound", "s-reflect"];
  function show(id) {
    SCREENS.forEach((s) => { $(s).hidden = s !== id; });
    window.scrollTo(0, 0);
  }

  /* ---------- 問卷 ---------- */
  function renderQuestion() {
    const Q = TS.QUESTIONS[state.qi];
    const n = TS.QUESTIONS.length;
    $("q-count").textContent = String(state.qi + 1).padStart(2, "0") + " / " + String(n).padStart(2, "0");
    $("q-bar").style.width = ((state.qi + 1) / n * 100) + "%";
    $("q-text").textContent = Q.q;
    const box = $("q-options");
    box.innerHTML = "";
    Q.options.forEach((opt, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "opt" + (state.answers[state.qi] === i ? " picked" : "");
      const k = document.createElement("span");
      k.className = "opt-key"; k.textContent = "ABCD"[i];
      const t = document.createElement("span");
      t.textContent = opt.text;
      b.append(k, t);
      b.addEventListener("click", () => choose(i));
      box.appendChild(b);
    });
    $("q-back").hidden = state.qi === 0;
  }
  function choose(i) {
    state.answers[state.qi] = i;
    if (state.qi < TS.QUESTIONS.length - 1) { state.qi++; renderQuestion(); }
    else finishQuiz();
  }
  function finishQuiz() {
    state.initial = TS.computeScores(state.answers);
    state.sliders = TS.slidersFromScores(state.initial);
    state.mode = "current";
    save();
    enterSound();
  }

  /* ---------- 聲音介面 ---------- */
  const SLIDERS = [["sl-approach", "approach"], ["sl-letgo", "letGo"], ["sl-change", "change"]];

  function enterSound() {
    const init = TS.slidersFromScores(state.initial);
    SLIDERS.forEach(([id, key]) => {
      $(id).value = state.sliders[key];
      // 在拉霸上標出初始位置
      $(id + "-mark").style.left = "calc(14px + (100% - 28px) * " + (init[key] / 100) + ")";
    });
    setMode(state.mode);
    updatePlayButton();
    show("s-sound");
  }

  /** 依照目前模式，把分數轉成聲音參數交給引擎 */
  function applySound() {
    const scores = state.mode === "initial"
      ? state.initial
      : TS.currentScores(state.initial, state.sliders);
    engine.setTarget(TS.mapScoresToSound(scores));
  }

  function setMode(mode) {
    state.mode = mode;
    $("mode-initial").setAttribute("aria-pressed", mode === "initial");
    $("mode-current").setAttribute("aria-pressed", mode === "current");
    $("sliders").classList.toggle("dimmed", mode === "initial");
    applySound();
  }

  SLIDERS.forEach(([id, key]) => {
    $(id).addEventListener("input", (e) => {
      state.sliders[key] = Number(e.target.value);
      if (state.mode !== "current") setMode("current"); else applySound();
      save();
    });
  });
  $("mode-initial").addEventListener("click", () => setMode("initial"));
  $("mode-current").addEventListener("click", () => setMode("current"));
  $("reset-sliders").addEventListener("click", () => {
    state.sliders = TS.slidersFromScores(state.initial);
    SLIDERS.forEach(([id, key]) => { $(id).value = state.sliders[key]; });
    setMode("current");
    save();
  });

  /* 播放／停止 */
  function updatePlayButton() {
    const on = engine.isRunning();
    $("play-label").textContent = on ? "停止" : "開始聲音";
    $("play").setAttribute("aria-pressed", on);
    if (!on) $("lamp").classList.remove("on", "on-weak");
  }
  $("play").addEventListener("click", () => {
    if (engine.isRunning()) engine.stop();
    else { applySound(); engine.start(); }
    updatePlayButton();
  });
  $("volume").addEventListener("input", (e) => engine.setVolume(e.target.value / 100));
  engine.setVolume($("volume").value / 100);

  /* 燈號與聲音同步：每一拍敲下時亮起，半拍後熄滅，像方向燈 */
  let lampTimer = null;
  engine.onPulse((beatSeconds) => {
    const lamp = $("lamp");
    lamp.classList.add("on");
    clearTimeout(lampTimer);
    lampTimer = setTimeout(() => lamp.classList.remove("on"), beatSeconds * 500);
  });

  /* 切到背景時停止，避免手機在口袋裡一直響 */
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && engine.isRunning()) { engine.stop(); updatePlayButton(); }
  });

  /* ---------- 重新開始 ---------- */
  function restart() {
    engine.stop();
    updatePlayButton();
    state.answers = []; state.qi = 0;
    state.initial = null; state.sliders = null;
    $("feeling").value = "";
    clearSaved();
    show("s-intro");
  }
  $("restart").addEventListener("click", restart);
  $("restart2").addEventListener("click", restart);

  /* ---------- 數值整理與回饋 ---------- */
  const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  function describe(scores) {
    const p = TS.mapScoresToSound(scores);
    const hz = TS.SOUND_CONFIG.woodHz * p.pitchMul;
    const midi = Math.round(69 + 12 * Math.log2(hz / 440));
    const t = Math.round(p.timbre * 100);
    const tw = t < 34 ? "悶" : t < 67 ? "木頭" : "脆";
    return {
      bpm: Math.round(p.bpm) + " BPM",
      pitch: Math.round(hz) + " Hz（" + NOTES[midi % 12] + (Math.floor(midi / 12) - 1) + "）",
      timbre: t + "（" + tw + "）"
    };
  }
  function enterReflect() {
    const i = describe(state.initial);
    const c = describe(TS.currentScores(state.initial, state.sliders));
    $("v-bpm-i").textContent = i.bpm;     $("v-bpm-c").textContent = c.bpm;
    $("v-pitch-i").textContent = i.pitch; $("v-pitch-c").textContent = c.pitch;
    $("v-timbre-i").textContent = i.timbre; $("v-timbre-c").textContent = c.timbre;
    state.summary = "初始：" + i.bpm + "，" + i.pitch + "，音色 " + i.timbre +
                    "｜目前：" + c.bpm + "，" + c.pitch + "，音色 " + c.timbre;
    $("send-status").textContent = TS.canSubmit() ? "" : "這個版本還沒有設定收集回答的地方，按下送出不會傳到任何地方。";
    show("s-reflect");
  }
  $("to-reflect").addEventListener("click", enterReflect);
  $("back-sound").addEventListener("click", () => show("s-sound"));
  $("ask").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = $("feeling").value.trim();
    if (!text) { $("send-status").textContent = "請先寫下一些感覺再送出。"; return; }
    if (!TS.canSubmit()) { $("send-status").textContent = "這個版本還沒有設定收集回答的地方，回答沒有送出。"; return; }
    $("send").disabled = true;
    $("send-status").textContent = "送出中…";
    TS.submitResponse({ feeling: text, summary: state.summary })
      .then(() => { $("send-status").textContent = "已送出，謝謝你。"; $("feeling").value = ""; })
      .catch(() => { $("send-status").textContent = "送出失敗，請確認網路後再試一次。"; })
      .finally(() => { $("send").disabled = false; });
  });

  /* ---------- 開始 ---------- */
  $("start").addEventListener("click", () => {
    engine.unlock();
    state.answers = []; state.qi = 0;
    renderQuestion();
    show("s-quiz");
  });
  $("q-back").addEventListener("click", () => {
    if (state.qi > 0) { state.qi--; renderQuestion(); }
  });

  /* ---------- 只存在本機瀏覽器（重新整理後可接續），不上傳 ---------- */
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ initial: state.initial, sliders: state.sliders })); } catch (e) {}
  }
  function clearSaved() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  }
})();
