/* =========================================================
 * 收集回答（submit.js）
 * ---------------------------------------------------------
 * 網頁本身沒有伺服器，所以把回答送到一份 Google 表單，
 * 回答會出現在表單的「回覆」分頁，也可以連到 Google 試算表。
 * 不收集姓名、帳號或任何個人資料，只送出下面列出的欄位。
 *
 * 設定方式（見 README.md「收集回答」）：
 *   formAction：表單網址，把結尾的 /viewform 換成 /formResponse
 *   fields：每個欄位在表單裡的 entry 編號
 * formAction 留空時，回答不會送出，頁面會如實告知。
 * ========================================================= */
window.TS = window.TS || {};

TS.SUBMIT_CONFIG = {
  formAction: "https://docs.google.com/forms/d/e/1FAIpQLSe8tk3MDLvPU0_r7fVsNQEX-UKoDxtL0nNb8WItuIO1xnPi1Q/formResponse",
  fields: {
    feeling: "entry.1428818439",  // 「剛剛的聲音，你有什麼感覺？」（表單第 1 題）
    summary: "entry.1089744386"   // 聲音數值摘要（初始與目前）（表單第 2 題）
  }
};

TS.canSubmit = function () {
  const c = TS.SUBMIT_CONFIG;
  return !!(c.formAction && c.fields.feeling);
};

/**
 * 用隱藏表單送到 Google 表單（Google 不回傳結果，所以只能確認「已送出」）
 * @param {{feeling:string, summary:string}} data
 * @returns {Promise<void>}
 */
TS.submitResponse = function (data) {
  const c = TS.SUBMIT_CONFIG;
  return new Promise(function (resolve, reject) {
    if (!TS.canSubmit()) { reject(new Error("not-configured")); return; }
    const name = "ts-submit-" + Date.now();
    const iframe = document.createElement("iframe");
    iframe.name = name; iframe.hidden = true;
    const form = document.createElement("form");
    form.method = "POST"; form.action = c.formAction; form.target = name; form.hidden = true;
    Object.keys(c.fields).forEach(function (key) {
      if (!c.fields[key]) return;
      const input = document.createElement("input");
      input.type = "hidden"; input.name = c.fields[key]; input.value = data[key] || "";
      form.appendChild(input);
    });
    document.body.append(iframe, form);
    iframe.addEventListener("load", function () {
      resolve();
      setTimeout(function () { iframe.remove(); form.remove(); }, 1000);
    });
    form.submit();
    setTimeout(function () { reject(new Error("timeout")); }, 10000);
  });
};
