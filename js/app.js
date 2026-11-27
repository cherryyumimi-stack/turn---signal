/* =========================================================
 * 介面流程（app.js）
 * 首頁 → 7 題問卷 → 聲音操作介面 → 數值整理與回饋
 * 不登入；只有使用者按「送出」時，才會送出感想與聲音數值（見 submit.js）。
 * ========================================================= */
(function () {
  const $ = (id) => document.getElementById(id);
  const engine = TS.AudioEngine();
  const STORE_KEY = "turn-signal-state-v3";

  const state = {
    answers: [],
    qi: 0,
    scores: null       // 問卷產生的三個分數
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
    state.scores = TS.computeScores(state.answers);
    save();
    enterSound();
  }

  /* ---------- 聲音介面 ---------- */
  function enterSound() {
    applySound();
    updatePlayButton();
    show("s-sound");
  }

  /** 把分數與答案轉成聲音參數交給引擎 */
  function applySound() {
    engine.setTarget(TS.mapScoresToSound(state.scores, state.answers));
  }

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
    state.scores = null;
    $("feeling").value = "";
    clearSaved();
    show("s-intro");
  }
  $("restart").addEventListener("click", restart);
  $("restart2").addEventListener("click", restart);

  /* ---------- 數值整理與回饋 ---------- */
  const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  function enterReflect() {
    const p = TS.mapScoresToSound(state.scores, state.answers);
    const midi = Math.round(69 + 12 * Math.log2(p.freq / 440));
    const code = TS.personalCode(state.answers);
    const v = {
      timbre: p.timbreName,
      bpm: Math.round(p.bpm) + " BPM",
      pitch: Math.round(p.freq) + " Hz（" + NOTES[midi % 12] + (Math.floor(midi / 12) - 1) + "）"
    };
    $("v-timbre").textContent = v.timbre;
    $("v-bpm").textContent = v.bpm;
    $("v-pitch").textContent = v.pitch;
    $("v-code").textContent = code;
    const sc = state.scores, r = Math.round;
    state.summary = "音色 " + v.timbre + "，" + v.bpm + "，" + v.pitch + "｜編號 " + code +
                    "｜分數 靠近 " + r(sc.approach) + "／掌控 " + r(sc.control) + "／改變 " + r(sc.change);
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
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ scores: state.scores, answers: state.answers })); } catch (e) {}
  }
  function clearSaved() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  }
})();
