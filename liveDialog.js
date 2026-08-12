// ★ ブラウザ標準のconfirm()/alert()の代わりに使う、テーマに合わせた独自モーダル。
//   liveHost.html / liveAnswer.html の両方から <script> で読み込み、グローバルの LiveDialog として使う。
const LiveDialog = (() => {
  let modal, titleEl, messageEl, okButton, cancelButton;
  let resolver = null;

  function ensureInit() {
    if (modal) return;
    modal = document.getElementById("app-dialog-modal");
    titleEl = document.getElementById("app-dialog-title");
    messageEl = document.getElementById("app-dialog-message");
    okButton = document.getElementById("app-dialog-ok-button");
    cancelButton = document.getElementById("app-dialog-cancel-button");

    okButton.addEventListener("click", () => finish(true));
    cancelButton.addEventListener("click", () => finish(false));
    modal.addEventListener("click", event => {
      if (event.target === modal) finish(false);
    });
  }

  function finish(result) {
    modal.classList.add("hidden");
    if (resolver) {
      const resolve = resolver;
      resolver = null;
      resolve(result);
    }
  }

  function show({ title, message, okText, cancelText, showCancel, danger }) {
    ensureInit();
    titleEl.textContent = title || "";
    titleEl.classList.toggle("hidden", !title);
    messageEl.textContent = message || "";
    okButton.textContent = okText || "OK";
    okButton.classList.toggle("app-dialog-danger", !!danger);
    cancelButton.textContent = cancelText || "キャンセル";
    cancelButton.classList.toggle("hidden", !showCancel);
    modal.classList.remove("hidden");
    return new Promise(resolve => {
      resolver = resolve;
    });
  }

  // ★ confirm()の代替。OKなら true、キャンセル/背景クリックなら false を返す
  function confirmDialog(message, options) {
    return show({ message, showCancel: true, ...options });
  }

  // ★ alert()の代替。閉じられたら解決する
  function alertDialog(message, options) {
    return show({ message, showCancel: false, ...options }).then(() => {});
  }

  return { confirm: confirmDialog, alert: alertDialog };
})();
