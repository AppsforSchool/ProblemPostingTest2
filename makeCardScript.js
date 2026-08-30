const firebaseConfig = {
  apiKey: "AIzaSyAqIiNj0N4WruPSOkWbeo5gxzsNyeMkuLo",
  authDomain: "appsforschool-study.firebaseapp.com",
  projectId: "appsforschool-study",
  storageBucket: "appsforschool-study.firebasestorage.app",
  messagingSenderId: "740735293440",
  appId: "1:740735293440:web:a1363adbab57f1ceec60e5"
};

const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const MIN_CARDS = 1;
const MAX_CARDS = 100;

let myUserId = "";

// ★ ローカルストレージへのバックアップ（作成中は "create" 用の1枠のみ使用）
const BACKUP_KEY = "cardDeckBackup_create";

let loadingOverlay;
let loadingStatusText;
let cardsListEl;
let addCardButton;
let submitButton;
let cardTemplate;
let deckTitleInput;
let deckDescriptionInput;
let deckSubjectSelect;
let deckGradeSelect;
let deckAllowFlipCheckbox;
let importJsonButton;
let importJsonFileInput;
let exportJsonButton;

document.addEventListener("DOMContentLoaded", () => {
  loadingOverlay = document.getElementById("loading-overlay");
  loadingStatusText = document.getElementById("loading-status-text");
  cardsListEl = document.getElementById("cards-list");
  addCardButton = document.getElementById("add-card-button");
  submitButton = document.getElementById("submit-button");
  cardTemplate = document.getElementById("card-template");
  deckTitleInput = document.getElementById("deck-title-input");
  deckDescriptionInput = document.getElementById("deck-description-input");
  deckSubjectSelect = document.getElementById("deck-subject-select");
  deckGradeSelect = document.getElementById("deck-grade-select");
  deckAllowFlipCheckbox = document.getElementById("deck-allow-flip-checkbox");
  importJsonButton = document.getElementById("import-json-button");
  importJsonFileInput = document.getElementById("import-json-file-input");
  exportJsonButton = document.getElementById("export-json-button");

  addCardButton.addEventListener("click", () => addCardBlock());
  submitButton.addEventListener("click", handleSubmit);
  importJsonButton.addEventListener("click", () => importJsonFileInput.click());
  importJsonFileInput.addEventListener("change", handleImportJsonFile);
  exportJsonButton.addEventListener("click", handleExportJson);

  // 最初は2枚分の入力欄を用意しておく
  addCardBlock();
  addCardBlock();

  // ★ 前回の作業データが残っていれば復元するか確認する
  checkForBackup();

  // ★ 以降の入力変更を検知してバックアップを自動保存する（動的に追加されるカードもまとめて拾う）
  const makeContainer = document.querySelector(".make-container");
  makeContainer.addEventListener("input", scheduleBackupSave);
  makeContainer.addEventListener("change", scheduleBackupSave);
});

document.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged((user) => {
    if (user) {
      setLoadingStatus("ユーザー情報を確認しています｡");
      myUserId = user.email.split("@")[0];
      updateLastChecked();
      loadingOverlay.classList.add("hidden");
    } else {
      console.log("logout");
      window.location.href = "./index.html";
    }
  });
});

// ★ ローディングオーバーレイ下部の小さいテキストを更新する
function setLoadingStatus(text) {
  if (loadingStatusText) loadingStatusText.textContent = text;
}

// ★ ローカルストレージへのバックアップ機能

function collectBackupSnapshot() {
  const cardBlocks = Array.from(cardsListEl.querySelectorAll(".problem-card"));
  const cards = cardBlocks.map(card => ({
    front: card.querySelector(".card-front-input").value,
    back: card.querySelector(".card-back-input").value
  }));
  const visibilityRadio = document.querySelector(".deck-visibility-radio:checked");

  return {
    title: deckTitleInput.value,
    description: deckDescriptionInput.value,
    subjectId: deckSubjectSelect.value,
    gradeId: deckGradeSelect.value,
    allowFlip: deckAllowFlipCheckbox.checked,
    isPrivate: !!visibilityRadio && visibilityRadio.value === "private",
    cards
  };
}

function saveBackupNow() {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(collectBackupSnapshot()));
  } catch (error) {
    console.error("バックアップの保存に失敗しました:", error);
  }
}

let backupSaveTimer = null;
function scheduleBackupSave() {
  clearTimeout(backupSaveTimer);
  backupSaveTimer = setTimeout(saveBackupNow, 800);
}

function clearBackup() {
  localStorage.removeItem(BACKUP_KEY);
}

function applyBackupSnapshot(data) {
  if (!data) return;

  if (typeof data.title === "string") deckTitleInput.value = data.title;
  if (typeof data.description === "string") deckDescriptionInput.value = data.description;
  if (data.subjectId !== undefined) deckSubjectSelect.value = String(data.subjectId);
  if (data.gradeId !== undefined) deckGradeSelect.value = String(data.gradeId);
  if (data.allowFlip !== undefined) deckAllowFlipCheckbox.checked = !!data.allowFlip;

  const visibilityRadios = document.querySelectorAll(".deck-visibility-radio");
  visibilityRadios.forEach(radio => {
    radio.checked = data.isPrivate ? radio.value === "private" : radio.value === "public";
  });

  const cards = Array.isArray(data.cards) ? data.cards : [];
  if (cards.length > 0) {
    cardsListEl.innerHTML = "";
    cards.forEach(c => addCardBlock(c));
  }
}

async function checkForBackup() {
  let raw;
  try {
    raw = localStorage.getItem(BACKUP_KEY);
  } catch (error) {
    console.error("バックアップの読み込みに失敗しました:", error);
    return;
  }
  if (!raw) return;

  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    console.error("バックアップの解析に失敗しました:", error);
    clearBackup();
    return;
  }

  if (await AppDialog.confirm("前回の作業データが残っています。復元しますか？")) {
    applyBackupSnapshot(data);
  } else {
    clearBackup();
  }
}

// ★ 最終アクセス日時の更新。優先度が低いので他の読み込みを妨げないよう、待たずに投げっぱなしにする
function updateLastChecked() {
  db.collection("users_random")
    .doc(myUserId)
    .set({ lastOpenedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
    .catch(error => console.error("最終アクセス日時の更新エラー:", error));
}


function addCardBlock(prefill) {
  const fragment = cardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".problem-card");
  const removeButton = card.querySelector(".remove-problem-button");

  removeButton.addEventListener("click", () => {
    card.remove();
    renumberCards();
  });

  cardsListEl.appendChild(card);

  if (prefill) {
    card.querySelector(".card-front-input").value = prefill.front || "";
    card.querySelector(".card-back-input").value = prefill.back || "";
  }

  renumberCards();
}

function renumberCards() {
  const cards = cardsListEl.querySelectorAll(".problem-card");
  cards.forEach((card, index) => {
    card.querySelector(".problem-card-title").textContent = `カード ${index + 1}`;
  });
}


// ★ JSONエクスポート・インポート（AIで作ったカードを取り込めるようにする機能）

function downloadJsonFile(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safeFileName(name) {
  const base = (name || "card-deck").trim() || "card-deck";
  return base.replace(/[\\/:*?"<>|]/g, "_") + ".json";
}

function handleExportJson() {
  const cardBlocks = Array.from(cardsListEl.querySelectorAll(".problem-card"));
  const cards = cardBlocks.map(card => ({
    front: card.querySelector(".card-front-input").value.trim(),
    back: card.querySelector(".card-back-input").value.trim()
  }));

  const data = {
    title: deckTitleInput.value.trim(),
    description: deckDescriptionInput.value.trim(),
    subjectId: Number(deckSubjectSelect.value) || 0,
    gradeId: Number(deckGradeSelect.value) || 0,
    allowFlip: deckAllowFlipCheckbox.checked,
    cards
  };

  downloadJsonFile(data, safeFileName(data.title));
}

function handleImportJsonFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      await applyImportedDeckJson(data);
    } catch (error) {
      console.error(error);
      await AppDialog.alert("JSONの読み込みに失敗しました。ファイルの形式を確認してください。\n" + error);
    }
  };
  reader.readAsText(file);

  // 同じファイルを連続で選択してもchangeイベントが発火するようにリセット
  event.target.value = "";
}

async function applyImportedDeckJson(data) {
  if (!data || typeof data !== "object") {
    await AppDialog.alert("JSONの形式が正しくありません。");
    return;
  }

  const cards = Array.isArray(data.cards) ? data.cards : [];
  if (cards.length === 0) {
    await AppDialog.alert("cards配列が見つからないか、中身が空です。");
    return;
  }

  const isConfirmed = await AppDialog.confirm(`${cards.length}枚を読み込みます。現在入力中のカードはすべて置き換えられますがよろしいですか？`);
  if (!isConfirmed) return;

  if (typeof data.title === "string") deckTitleInput.value = data.title;
  if (typeof data.description === "string") deckDescriptionInput.value = data.description;
  if (data.subjectId !== undefined) deckSubjectSelect.value = String(Number(data.subjectId) || 0);
  if (data.gradeId !== undefined) deckGradeSelect.value = String(Number(data.gradeId) || 0);
  if (data.allowFlip !== undefined) deckAllowFlipCheckbox.checked = !!data.allowFlip;

  cardsListEl.innerHTML = "";
  cards.forEach(c => addCardBlock(c));

  if (cardsListEl.children.length === 0) {
    addCardBlock();
  }

  saveBackupNow();
}


async function handleSubmit() {
  const title = deckTitleInput.value.trim();
  if (!title) {
    await AppDialog.alert("タイトルを入力してください。");
    return;
  }

  const description = deckDescriptionInput.value.trim();
  const subjectId = Number(deckSubjectSelect.value);
  const gradeId = Number(deckGradeSelect.value);
  const allowFlip = deckAllowFlipCheckbox.checked;
  const visibilityRadio = document.querySelector(".deck-visibility-radio:checked");
  const isPrivate = !!visibilityRadio && visibilityRadio.value === "private";

  const cardBlocks = Array.from(cardsListEl.querySelectorAll(".problem-card"));
  if (cardBlocks.length < MIN_CARDS) {
    await AppDialog.alert("カードを1枚以上追加してください。");
    return;
  }

  const cardsPayload = [];
  for (let i = 0; i < cardBlocks.length; i++) {
    const cardNumber = i + 1;
    const front = cardBlocks[i].querySelector(".card-front-input").value.trim();
    const back = cardBlocks[i].querySelector(".card-back-input").value.trim();

    if (!front) {
      await AppDialog.alert(`${cardNumber}枚目の表面を入力してください。`);
      return;
    }
    if (!back) {
      await AppDialog.alert(`${cardNumber}枚目の裏面を入力してください。`);
      return;
    }

    cardsPayload.push({ front, back });
  }

  if (!myUserId) {
    await AppDialog.alert("ユーザー情報を確認しています。少し待ってからもう一度お試しください。");
    return;
  }

  submitButton.disabled = true;
  loadingOverlay.classList.remove("hidden");
  setLoadingStatus("暗記カードを保存しています｡");

  try {
    await db
      .collection("ProblemPosting")
      .doc("cards")
      .collection("data")
      .add({
        title,
        description,
        subjectId,
        gradeId,
        madeBy: myUserId,
        allowFlip,
        isPrivate,
        cardCount: cardsPayload.length,
        cards: cardsPayload,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

    await AppDialog.alert("暗記カードを作成しました！");
    clearBackup();
    window.location.href = "./app.html";
  } catch (error) {
    console.error(error);
    await AppDialog.alert("作成に失敗しました。\n" + error);
    submitButton.disabled = false;
    loadingOverlay.classList.add("hidden");
  }
}
