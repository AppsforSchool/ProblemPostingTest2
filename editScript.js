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

const MIN_CHOICES = 2;
const MAX_CHOICES = 6;
const MIN_TEXT_ANSWERS = 1;
const MAX_TEXT_ANSWERS = 6;

let myUserId = "";
let meIsAdmin = false;
let currentBookId = "";
let wasAlreadyPublic = false;
let imgbbApiKeyCache = null;
let problemUidCounter = 0;

// ★ ImgBBへの画像アップロード（チャットサイトと同じ仕様：system_keys/imgbb からAPIキーを取得してアップロードし、URLを保存する）
async function uploadImageToImgbb(file) {
  if (!imgbbApiKeyCache) {
    const keyDoc = await db.collection("system_keys").doc("imgbb").get();
    if (!keyDoc.exists) {
      throw new Error("APIキーの設定が見つかりません。セキュリティルールかドキュメントを確認してください。");
    }
    imgbbApiKeyCache = keyDoc.data().apiKey;
  }

  const formData = new FormData();
  formData.append("image", file);

  const response = await fetch(`https://api.imgbb.com/1/upload?key=${imgbbApiKeyCache}`, {
    method: "POST",
    body: formData
  });

  const result = await response.json();
  if (!result.success) {
    throw new Error("画像のアップロードに失敗しました。");
  }
  return result.data.url;
}

function getParmFromUrl(parm) {
  const params = new URLSearchParams(window.location.search);
  return params.get(parm);
}

let loadingOverlay;
let loadingStatusText;
let noPermissionOverlay;
let noPermissionHomeButton;
let problemsListEl;
let addProblemButton;
let submitButton;
let deleteBookButton;
let problemTemplate;
let choiceTemplate;
let textAnswerTemplate;
let bookTitleInput;
let bookDescriptionInput;
let bookSubjectSelect;
let bookGradeSelect;
let bookShuffleProblemsCheckbox;
let madeByArea;
let bookMadeByInput;
let importJsonButton;
let importJsonFileInput;
let exportJsonButton;

document.addEventListener("DOMContentLoaded", () => {
  loadingOverlay = document.getElementById("loading-overlay");
  loadingStatusText = document.getElementById("loading-status-text");
  noPermissionOverlay = document.getElementById("no-permission-overlay");
  noPermissionHomeButton = document.getElementById("no-permission-home-button");
  problemsListEl = document.getElementById("problems-list");
  addProblemButton = document.getElementById("add-problem-button");
  submitButton = document.getElementById("submit-button");
  deleteBookButton = document.getElementById("delete-book-button");
  problemTemplate = document.getElementById("problem-template");
  choiceTemplate = document.getElementById("choice-template");
  textAnswerTemplate = document.getElementById("text-answer-template");
  bookTitleInput = document.getElementById("book-title-input");
  bookDescriptionInput = document.getElementById("book-description-input");
  bookSubjectSelect = document.getElementById("book-subject-select");
  bookGradeSelect = document.getElementById("book-grade-select");
  bookShuffleProblemsCheckbox = document.getElementById("book-shuffle-problems-checkbox");
  madeByArea = document.getElementById("made-by-area");
  bookMadeByInput = document.getElementById("book-madeBy-input");
  importJsonButton = document.getElementById("import-json-button");
  importJsonFileInput = document.getElementById("import-json-file-input");
  exportJsonButton = document.getElementById("export-json-button");

  addProblemButton.addEventListener("click", () => addProblemBlock());
  submitButton.addEventListener("click", handleUpdate);
  deleteBookButton.addEventListener("click", handleDeleteBook);
  noPermissionHomeButton.addEventListener("click", () => {
    window.location.href = "./app.html";
  });
  importJsonButton.addEventListener("click", () => importJsonFileInput.click());
  importJsonFileInput.addEventListener("change", handleImportJsonFile);
  exportJsonButton.addEventListener("click", handleExportJson);

  // ★ 入力変更を検知してバックアップを自動保存する（動的に追加される問題カードもまとめて拾う）
  const makeContainer = document.querySelector(".make-container");
  makeContainer.addEventListener("input", scheduleBackupSave);
  makeContainer.addEventListener("change", scheduleBackupSave);
});

document.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      setLoadingStatus("ユーザー情報を確認しています｡");
      myUserId = user.email.split("@")[0];

      const mySnapshot = await db.collection("users_random").doc(myUserId).get();
      meIsAdmin = mySnapshot.exists ? !!mySnapshot.data().isAdmin : false;

      currentBookId = getParmFromUrl("id");
      if (!currentBookId) {
        await AppDialog.alert("問題集が指定されていません。");
        window.location.href = "./app.html";
        return;
      }

      await loadBookData(currentBookId);
      updateLastChecked();
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

// ★ 最終アクセス日時の更新。優先度が低いので他の読み込みを妨げないよう、待たずに投げっぱなしにする
function updateLastChecked() {
  db.collection("users_random")
    .doc(myUserId)
    .set({ lastOpenedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
    .catch(error => console.error("最終アクセス日時の更新エラー:", error));
}

// ★ ローカルストレージへのバックアップ機能（編集中の問題集ごとに枠を分ける）

function getBackupKey() {
  return `problemBookBackup_edit_${currentBookId}`;
}

function collectBackupSnapshot() {
  const problemCards = Array.from(problemsListEl.querySelectorAll(".problem-card"));
  const problems = problemCards.map(collectProblemForExport);
  const visibilityRadio = document.querySelector(".book-visibility-radio:checked");

  const snapshot = {
    title: bookTitleInput.value,
    description: bookDescriptionInput.value,
    subjectId: bookSubjectSelect.value,
    gradeId: bookGradeSelect.value,
    shuffleProblems: bookShuffleProblemsCheckbox.checked,
    isPrivate: !!visibilityRadio && visibilityRadio.value === "private",
    problems
  };
  if (meIsAdmin) {
    snapshot.madeBy = bookMadeByInput.value;
  }
  return snapshot;
}

function saveBackupNow() {
  try {
    localStorage.setItem(getBackupKey(), JSON.stringify(collectBackupSnapshot()));
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
  localStorage.removeItem(getBackupKey());
}

function applyBackupSnapshot(data) {
  if (!data) return;

  if (typeof data.title === "string") bookTitleInput.value = data.title;
  if (typeof data.description === "string") bookDescriptionInput.value = data.description;
  if (data.subjectId !== undefined) bookSubjectSelect.value = String(data.subjectId);
  if (data.gradeId !== undefined) bookGradeSelect.value = String(data.gradeId);
  if (data.shuffleProblems !== undefined) bookShuffleProblemsCheckbox.checked = !!data.shuffleProblems;

  // 一度公開された問題集は非公開に戻せないため、その場合は復元時も公開設定を変更しない
  if (!wasAlreadyPublic) {
    const visibilityRadios = document.querySelectorAll(".book-visibility-radio");
    visibilityRadios.forEach(radio => {
      radio.checked = data.isPrivate ? radio.value === "private" : radio.value === "public";
    });
  }

  if (meIsAdmin && typeof data.madeBy === "string") {
    bookMadeByInput.value = data.madeBy;
  }

  const problems = Array.isArray(data.problems) ? data.problems : [];
  if (problems.length > 0) {
    problemsListEl.innerHTML = "";
    problems.forEach(p => addProblemBlock(p));
  }
}

async function checkForBackup() {
  let raw;
  try {
    raw = localStorage.getItem(getBackupKey());
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

async function loadBookData(bookId) {
  try {
    setLoadingStatus("問題集の情報を読み込んでいます｡");

    const bookRef = db
      .collection("ProblemPosting")
      .doc("books")
      .collection("data")
      .doc(bookId);
    const bookSnap = await bookRef.get();

    if (!bookSnap.exists) {
      await AppDialog.alert("問題集が見つかりません。");
      window.location.href = "./app.html";
      return;
    }

    const bookData = bookSnap.data();

    if (bookData.madeBy !== myUserId && !meIsAdmin) {
      loadingOverlay.classList.add("hidden");
      noPermissionOverlay.classList.remove("hidden");
      return;
    }

    bookTitleInput.value = bookData.title || "";
    bookDescriptionInput.value = bookData.description || "";
    bookSubjectSelect.value = String(bookData.subjectId || 0);
    bookGradeSelect.value = String(bookData.gradeId || 0);
    bookShuffleProblemsCheckbox.checked = !!bookData.shuffleProblems;

    wasAlreadyPublic = !bookData.isPrivate;
    const visibilityRadios = document.querySelectorAll(".book-visibility-radio");
    visibilityRadios.forEach(radio => {
      radio.checked = bookData.isPrivate ? radio.value === "private" : radio.value === "public";
      // 一度公開された問題集は、非公開に戻せないようにする
      if (wasAlreadyPublic) {
        radio.disabled = radio.value === "private";
      }
    });
    const visibilityLockedMessage = document.getElementById("visibility-locked-message");
    if (visibilityLockedMessage) visibilityLockedMessage.classList.toggle("hidden", !wasAlreadyPublic);

    if (meIsAdmin) {
      madeByArea.classList.remove("hidden");
      bookMadeByInput.value = bookData.madeBy || "";
    }

    const problemsSnap = await bookRef.collection("problems").orderBy("no").get();
    problemsListEl.innerHTML = "";
    setLoadingStatus("問題を読み込んでいます｡");

    problemsSnap.forEach(doc => {
      const data = doc.data();
      const answer = data.answer || [];
      const inferredAnswerType = answer.length === 1 ? "single" : "multiple";
      addProblemBlock({
        problem: data.problem || "",
        choices: data.choices || [],
        answer,
        answerType: data.answerType || inferredAnswerType,
        modelAnswer: data.modelAnswer || "",
        gradingCriteria: data.gradingCriteria || "",
        shuffleChoices: data.shuffleChoices || false,
        explanation: data.explanation || "",
        imageUrl: data.imageUrl || ""
      });
    });

    if (problemsListEl.children.length === 0) {
      addProblemBlock();
    }

    loadingOverlay.classList.add("hidden");

    // ★ 前回の作業データが残っていれば復元するか確認する（このbookId専用のバックアップ枠）
    checkForBackup();
  } catch (error) {
    console.error(error);
    await AppDialog.alert("問題集の読み込みに失敗しました。\n" + error);
  }
}


function addProblemBlock(prefill) {
  const fragment = problemTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".problem-card");
  const choicesListEl = card.querySelector(".choices-list");
  const addChoiceButton = card.querySelector(".add-choice-button");
  const removeProblemButton = card.querySelector(".remove-problem-button");
  const problemTextInput = card.querySelector(".problem-text-input");
  const explanationInput = card.querySelector(".explanation-input");
  const textAnswersListEl = card.querySelector(".text-answers-list");
  const addTextAnswerButton = card.querySelector(".add-text-answer-button");

  card.dataset.uid = String(problemUidCounter++);

  removeProblemButton.addEventListener("click", () => {
    card.remove();
    renumberProblems();
  });
  addChoiceButton.addEventListener("click", () => {
    addChoiceRow(choicesListEl);
    updateChoiceButtonsState(card);
  });
  addTextAnswerButton.addEventListener("click", () => {
    addTextAnswerRow(textAnswersListEl);
    updateTextAnswerButtonsState(card);
  });

  setupImageControls(card, prefill ? prefill.imageUrl : "");
  setupAnswerTypeControls(card);

  problemsListEl.appendChild(card);

  if (prefill) {
    problemTextInput.value = prefill.problem || "";
    explanationInput.value = prefill.explanation || "";

    const shuffleChoicesCheckbox = card.querySelector(".shuffle-choices-checkbox");
    if (shuffleChoicesCheckbox) shuffleChoicesCheckbox.checked = !!prefill.shuffleChoices;

    const answerTypeValue = ["single", "multiple", "text", "descriptive"].includes(prefill.answerType)
      ? prefill.answerType
      : "single";
    const answerTypeRadio = card.querySelector(
      `.answer-type-radio[value="${answerTypeValue}"]`
    );
    if (answerTypeRadio) answerTypeRadio.checked = true;

    if (answerTypeValue === "text") {
      const textAnswers = prefill.answer && prefill.answer.length ? prefill.answer : [""];
      textAnswers.forEach(text => {
        addTextAnswerRow(textAnswersListEl, text);
      });
      // 選択肢欄も念のため最低数だけ用意しておく（後で選択式に切り替えても壊れないように）
      addChoiceRow(choicesListEl);
      addChoiceRow(choicesListEl);
    } else if (answerTypeValue === "descriptive") {
      card.querySelector(".model-answer-input").value = prefill.modelAnswer || "";
      card.querySelector(".grading-criteria-input").value = prefill.gradingCriteria || "";
      // 選択肢欄・単語記述欄も念のため最低限用意しておく（後で切り替えても壊れないように）
      addChoiceRow(choicesListEl);
      addChoiceRow(choicesListEl);
      addTextAnswerRow(textAnswersListEl);
    } else {
      const choices = prefill.choices && prefill.choices.length ? prefill.choices : ["", ""];
      const answer = prefill.answer || [];
      choices.forEach((choiceText, index) => {
        addChoiceRow(choicesListEl, choiceText, answer.includes(index));
      });
      addTextAnswerRow(textAnswersListEl);
    }
  } else {
    // 新規追加時は選択肢を最初から2つ用意しておく
    addChoiceRow(choicesListEl);
    addChoiceRow(choicesListEl);
    addTextAnswerRow(textAnswersListEl);
  }

  updateChoiceButtonsState(card);
  updateTextAnswerButtonsState(card);
  updateAnswerTypeUI(card);
  renumberProblems();
}

function updateAnswerTypeUI(card) {
  const answerType = getAnswerType(card);
  const choicesAreaWrap = card.querySelector(".choices-area-wrap");
  const textAnswersArea = card.querySelector(".text-answers-area");
  const descriptiveAnswerArea = card.querySelector(".descriptive-answer-area");

  choicesAreaWrap.classList.toggle("hidden", answerType !== "single" && answerType !== "multiple");
  textAnswersArea.classList.toggle("hidden", answerType !== "text");
  descriptiveAnswerArea.classList.toggle("hidden", answerType !== "descriptive");
}

function setupAnswerTypeControls(card) {
  const radios = card.querySelectorAll(".answer-type-radio");
  radios.forEach(radio => {
    radio.name = `answer-type-${card.dataset.uid}`;
    radio.addEventListener("change", () => {
      if (radio.checked) {
        if (radio.value === "single") {
          enforceSingleCorrectChoice(card);
        }
        updateAnswerTypeUI(card);
      }
    });
  });
}

function getAnswerType(card) {
  const checked = card.querySelector(".answer-type-radio:checked");
  return checked ? checked.value : "single";
}

function enforceSingleCorrectChoice(card, keepCheckbox) {
  const checkboxes = Array.from(card.querySelectorAll(".choice-correct-checkbox"));
  const checked = checkboxes.filter(cb => cb.checked);
  if (checked.length <= 1) return;

  const toKeep = keepCheckbox && checked.includes(keepCheckbox) ? keepCheckbox : checked[0];
  checked.forEach(cb => {
    if (cb !== toKeep) cb.checked = false;
  });
}

function setupImageControls(card, existingImageUrl) {
  const selectImageButton = card.querySelector(".select-image-button");
  const imageFileInput = card.querySelector(".image-file-input");
  const previewWrap = card.querySelector(".problem-image-preview-wrap");
  const previewImg = card.querySelector(".problem-image-preview");
  const removeImageButton = card.querySelector(".remove-image-button");

  card._selectedImageFile = null;
  card._existingImageUrl = existingImageUrl || "";
  card._imageRemoved = false;

  if (card._existingImageUrl) {
    previewImg.src = card._existingImageUrl;
    previewWrap.classList.remove("hidden");
    selectImageButton.classList.add("hidden");
  }

  selectImageButton.addEventListener("click", () => {
    imageFileInput.click();
  });

  imageFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    card._selectedImageFile = file;
    card._imageRemoved = false;

    const reader = new FileReader();
    reader.onload = (event) => {
      previewImg.src = event.target.result;
      previewWrap.classList.remove("hidden");
      selectImageButton.classList.add("hidden");
    };
    reader.readAsDataURL(file);
  });

  removeImageButton.addEventListener("click", () => {
    card._selectedImageFile = null;
    card._imageRemoved = true;
    imageFileInput.value = "";
    previewImg.src = "";
    previewWrap.classList.add("hidden");
    selectImageButton.classList.remove("hidden");
  });
}

function addChoiceRow(choicesListEl, prefillText, prefillChecked) {
  if (choicesListEl.children.length >= MAX_CHOICES) return;

  const fragment = choiceTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".choice-row");
  const removeChoiceButton = row.querySelector(".remove-choice-button");
  const textInput = row.querySelector(".choice-text-input");
  const checkbox = row.querySelector(".choice-correct-checkbox");

  if (prefillText !== undefined) textInput.value = prefillText;
  if (prefillChecked) checkbox.checked = true;

  removeChoiceButton.addEventListener("click", () => {
    row.remove();
    const card = choicesListEl.closest(".problem-card");
    updateChoiceButtonsState(card);
  });

  checkbox.addEventListener("change", () => {
    const card = choicesListEl.closest(".problem-card");
    if (checkbox.checked && getAnswerType(card) === "single") {
      enforceSingleCorrectChoice(card, checkbox);
    }
  });

  choicesListEl.appendChild(row);
}

function updateChoiceButtonsState(card) {
  const choicesListEl = card.querySelector(".choices-list");
  const addChoiceButton = card.querySelector(".add-choice-button");
  const removeChoiceButtons = card.querySelectorAll(".remove-choice-button");

  const count = choicesListEl.children.length;

  addChoiceButton.disabled = count >= MAX_CHOICES;
  removeChoiceButtons.forEach(button => {
    button.disabled = count <= MIN_CHOICES;
  });
}

function addTextAnswerRow(textAnswersListEl, prefillText) {
  if (textAnswersListEl.children.length >= MAX_TEXT_ANSWERS) return;

  const fragment = textAnswerTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".text-answer-row");
  const input = row.querySelector(".text-answer-input");
  const removeButton = row.querySelector(".remove-text-answer-button");

  if (prefillText !== undefined) input.value = prefillText;

  removeButton.addEventListener("click", () => {
    row.remove();
    const card = textAnswersListEl.closest(".problem-card");
    updateTextAnswerButtonsState(card);
  });

  textAnswersListEl.appendChild(row);
}

function updateTextAnswerButtonsState(card) {
  const textAnswersListEl = card.querySelector(".text-answers-list");
  const addTextAnswerButton = card.querySelector(".add-text-answer-button");
  const removeTextAnswerButtons = card.querySelectorAll(".remove-text-answer-button");

  const count = textAnswersListEl.children.length;

  addTextAnswerButton.disabled = count >= MAX_TEXT_ANSWERS;
  removeTextAnswerButtons.forEach(button => {
    button.disabled = count <= MIN_TEXT_ANSWERS;
  });
}

function renumberProblems() {
  const cards = problemsListEl.querySelectorAll(".problem-card");
  cards.forEach((card, index) => {
    card.querySelector(".problem-card-title").textContent = `問題 ${index + 1}`;
  });
}


// ★ JSONエクスポート・インポート（AIで作った問題を取り込めるようにする機能）

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
  const base = (name || "problem-book").trim() || "problem-book";
  return base.replace(/[\\/:*?"<>|]/g, "_") + ".json";
}

function collectProblemForExport(card) {
  const answerType = getAnswerType(card);
  let choices = [];
  let answer = [];
  let modelAnswer = "";
  let gradingCriteria = "";

  if (answerType === "text") {
    answer = Array.from(card.querySelectorAll(".text-answer-input")).map(input => input.value.trim());
  } else if (answerType === "descriptive") {
    modelAnswer = card.querySelector(".model-answer-input").value.trim();
    gradingCriteria = card.querySelector(".grading-criteria-input").value.trim();
  } else {
    const choiceRows = Array.from(card.querySelectorAll(".choice-row"));
    choiceRows.forEach((row, index) => {
      choices.push(row.querySelector(".choice-text-input").value.trim());
      if (row.querySelector(".choice-correct-checkbox").checked) answer.push(index);
    });
  }

  const shuffleChoicesCheckbox = card.querySelector(".shuffle-choices-checkbox");

  return {
    problem: card.querySelector(".problem-text-input").value.trim(),
    answerType,
    choices,
    answer,
    modelAnswer,
    gradingCriteria,
    shuffleChoices: (answerType === "single" || answerType === "multiple") && !!shuffleChoicesCheckbox && shuffleChoicesCheckbox.checked,
    explanation: card.querySelector(".explanation-input").value.trim()
  };
}

function handleExportJson() {
  const problemCards = Array.from(problemsListEl.querySelectorAll(".problem-card"));
  const problems = problemCards.map(collectProblemForExport);

  const data = {
    title: bookTitleInput.value.trim(),
    description: bookDescriptionInput.value.trim(),
    subjectId: Number(bookSubjectSelect.value) || 0,
    gradeId: Number(bookGradeSelect.value) || 0,
    shuffleProblems: bookShuffleProblemsCheckbox.checked,
    problems
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
      await applyImportedBookJson(data);
    } catch (error) {
      console.error(error);
      await AppDialog.alert("JSONの読み込みに失敗しました。ファイルの形式を確認してください。\n" + error);
    }
  };
  reader.readAsText(file);

  // 同じファイルを連続で選択してもchangeイベントが発火するようにリセット
  event.target.value = "";
}

async function applyImportedBookJson(data) {
  if (!data || typeof data !== "object") {
    await AppDialog.alert("JSONの形式が正しくありません。");
    return;
  }

  const problems = Array.isArray(data.problems) ? data.problems : [];
  if (problems.length === 0) {
    await AppDialog.alert("problems配列が見つからないか、中身が空です。");
    return;
  }

  const isConfirmed = await AppDialog.confirm(`${problems.length}問を読み込みます。現在の問題はすべて置き換えられますがよろしいですか？（画像は引き継がれません）`);
  if (!isConfirmed) return;

  if (typeof data.title === "string") bookTitleInput.value = data.title;
  if (typeof data.description === "string") bookDescriptionInput.value = data.description;
  if (data.subjectId !== undefined) bookSubjectSelect.value = String(Number(data.subjectId) || 0);
  if (data.gradeId !== undefined) bookGradeSelect.value = String(Number(data.gradeId) || 0);
  if (data.shuffleProblems !== undefined) bookShuffleProblemsCheckbox.checked = !!data.shuffleProblems;

  problemsListEl.innerHTML = "";
  problems.forEach(p => addProblemBlock(p));

  if (problemsListEl.children.length === 0) {
    addProblemBlock();
  }

  saveBackupNow();
}


async function validateAndCollectPayload() {
  const title = bookTitleInput.value.trim();
  if (!title) {
    await AppDialog.alert("タイトルを入力してください。");
    return null;
  }

  const description = bookDescriptionInput.value.trim();
  const subjectId = Number(bookSubjectSelect.value);
  const gradeId = Number(bookGradeSelect.value);
  const shuffleProblems = bookShuffleProblemsCheckbox.checked;

  const visibilityRadio = document.querySelector(".book-visibility-radio:checked");
  // 一度公開された問題集は、UIを迂回されても非公開に戻せないようにする
  const isPrivate = wasAlreadyPublic ? false : (!!visibilityRadio && visibilityRadio.value === "private");

  let madeBy = null;
  if (meIsAdmin) {
    madeBy = bookMadeByInput.value.trim();
    if (!madeBy) {
      await AppDialog.alert("作成者のユーザーIDを入力してください。");
      return null;
    }
  }

  const problemCards = Array.from(problemsListEl.querySelectorAll(".problem-card"));
  if (problemCards.length === 0) {
    await AppDialog.alert("問題を1問以上追加してください。");
    return null;
  }

  const problemsPayload = [];

  for (let i = 0; i < problemCards.length; i++) {
    const card = problemCards[i];
    const problemNumber = i + 1;

    const problemText = card.querySelector(".problem-text-input").value.trim();
    if (!problemText) {
      await AppDialog.alert(`${problemNumber}問目の問題文を入力してください。`);
      return null;
    }

    const answerType = getAnswerType(card);

    let choices = [];
    let answer = [];
    let modelAnswer = "";
    let gradingCriteria = "";

    if (answerType === "text") {
      const textAnswerInputs = Array.from(card.querySelectorAll(".text-answer-input"));
      if (textAnswerInputs.length < MIN_TEXT_ANSWERS) {
        await AppDialog.alert(`${problemNumber}問目の正解を${MIN_TEXT_ANSWERS}つ以上入力してください。`);
        return null;
      }
      for (let a = 0; a < textAnswerInputs.length; a++) {
        const text = textAnswerInputs[a].value.trim();
        if (!text) {
          await AppDialog.alert(`${problemNumber}問目の正解${a + 1}を入力してください。`);
          return null;
        }
        answer.push(text);
      }
    } else if (answerType === "descriptive") {
      modelAnswer = card.querySelector(".model-answer-input").value.trim();
      if (!modelAnswer) {
        await AppDialog.alert(`${problemNumber}問目の模範解答を入力してください。`);
        return null;
      }
      gradingCriteria = card.querySelector(".grading-criteria-input").value.trim();
    } else {
      const choiceRows = Array.from(card.querySelectorAll(".choice-row"));
      if (choiceRows.length < MIN_CHOICES) {
        await AppDialog.alert(`${problemNumber}問目の選択肢は${MIN_CHOICES}個以上入力してください。`);
        return null;
      }

      for (let c = 0; c < choiceRows.length; c++) {
        const choiceText = choiceRows[c].querySelector(".choice-text-input").value.trim();
        if (!choiceText) {
          await AppDialog.alert(`${problemNumber}問目の選択肢${c + 1}を入力してください。`);
          return null;
        }
        choices.push(choiceText);
        if (choiceRows[c].querySelector(".choice-correct-checkbox").checked) {
          answer.push(c);
        }
      }

      if (answer.length === 0) {
        await AppDialog.alert(`${problemNumber}問目の正解を1つ以上チェックしてください。`);
        return null;
      }
      if (answerType === "single" && answer.length !== 1) {
        await AppDialog.alert(`${problemNumber}問目は単数選択なので、正解は1つだけチェックしてください。`);
        return null;
      }
    }

    const explanation = card.querySelector(".explanation-input").value.trim();
    const shuffleChoicesCheckbox = card.querySelector(".shuffle-choices-checkbox");
    const shuffleChoices = (answerType === "single" || answerType === "multiple") && !!shuffleChoicesCheckbox && shuffleChoicesCheckbox.checked;

    problemsPayload.push({
      problem: problemText,
      choices,
      answer,
      answerType,
      modelAnswer,
      gradingCriteria,
      shuffleChoices,
      explanation,
      imageFile: card._selectedImageFile || null,
      imageRemoved: !!card._imageRemoved,
      existingImageUrl: card._existingImageUrl || ""
    });
  }

  return { title, description, subjectId, gradeId, shuffleProblems, isPrivate, madeBy, problemsPayload };
}

async function handleUpdate() {
  const collected = await validateAndCollectPayload();
  if (!collected) return;
  const { title, description, subjectId, gradeId, shuffleProblems, isPrivate, madeBy, problemsPayload } = collected;

  if (!myUserId) {
    await AppDialog.alert("ユーザー情報を確認しています。少し待ってからもう一度お試しください。");
    return;
  }

  submitButton.disabled = true;
  deleteBookButton.disabled = true;
  loadingOverlay.classList.remove("hidden");
  const loadingText = loadingOverlay.querySelector("p");
  if (loadingText) loadingText.textContent = "問題集を更新しています｡";

  try {
    const imageCount = problemsPayload.filter(p => p.imageFile).length;
    if (imageCount > 0) {
      let uploadedCount = 0;
      for (const p of problemsPayload) {
        if (p.imageFile) {
          uploadedCount++;
          if (loadingText) loadingText.textContent = `画像をアップロードしています (${uploadedCount}/${imageCount})｡`;
          p.imageUrl = await uploadImageToImgbb(p.imageFile);
        } else if (p.imageRemoved) {
          p.imageUrl = "";
        } else {
          p.imageUrl = p.existingImageUrl;
        }
      }
      if (loadingText) loadingText.textContent = "保存しています｡";
    } else {
      problemsPayload.forEach(p => {
        p.imageUrl = p.imageRemoved ? "" : p.existingImageUrl;
      });
    }

    const bookRef = db
      .collection("ProblemPosting")
      .doc("books")
      .collection("data")
      .doc(currentBookId);

    const existingProblemsSnap = await bookRef.collection("problems").get();

    const batch = db.batch();
    const bookUpdateData = {
      title,
      description,
      subjectId,
      gradeId,
      problemCount: problemsPayload.length,
      shuffleProblems,
      isPrivate,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (meIsAdmin && madeBy) {
      bookUpdateData.madeBy = madeBy;
    }
    batch.update(bookRef, bookUpdateData);
    existingProblemsSnap.forEach(doc => batch.delete(doc.ref));
    problemsPayload.forEach((p, index) => {
      const problemRef = bookRef.collection("problems").doc();
      batch.set(problemRef, {
        no: index + 1,
        problem: p.problem,
        choices: p.choices,
        answer: p.answer,
        answerType: p.answerType,
        modelAnswer: p.modelAnswer,
        gradingCriteria: p.gradingCriteria,
        shuffleChoices: p.shuffleChoices,
        explanation: p.explanation,
        imageUrl: p.imageUrl
      });
    });
    await batch.commit();

    await AppDialog.alert("問題集を更新しました！");
    clearBackup();
    window.location.href = "./app.html";
  } catch (error) {
    console.error(error);
    await AppDialog.alert("更新に失敗しました。\n" + error);
    submitButton.disabled = false;
    deleteBookButton.disabled = false;
    loadingOverlay.classList.add("hidden");
  }
}

async function handleDeleteBook() {
  const isConfirmed = await AppDialog.confirm("本当にこの問題集を削除しますか？この操作は取り消せません。", {
    okText: "削除する",
    danger: true
  });
  if (!isConfirmed) return;

  submitButton.disabled = true;
  deleteBookButton.disabled = true;
  loadingOverlay.classList.remove("hidden");
  const loadingText = loadingOverlay.querySelector("p");
  if (loadingText) loadingText.textContent = "削除しています｡";

  try {
    const bookRef = db
      .collection("ProblemPosting")
      .doc("books")
      .collection("data")
      .doc(currentBookId);

    const problemsSnap = await bookRef.collection("problems").get();
    const batch = db.batch();
    problemsSnap.forEach(doc => batch.delete(doc.ref));
    batch.delete(bookRef);
    await batch.commit();

    await AppDialog.alert("削除しました。");
    clearBackup();
    window.location.href = "./app.html";
  } catch (error) {
    console.error(error);
    await AppDialog.alert("削除に失敗しました。\n" + error);
    submitButton.disabled = false;
    deleteBookButton.disabled = false;
    loadingOverlay.classList.add("hidden");
  }
}
