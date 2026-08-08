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
let imgbbApiKeyCache = null;
let problemUidCounter = 0;

// ★ ローカルストレージへのバックアップ（作成中は "create" 用の1枠のみ使用）
const BACKUP_KEY = "problemBookBackup_create";

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

let loadingOverlay;
let loadingStatusText;
let problemsListEl;
let addProblemButton;
let submitButton;
let problemTemplate;
let choiceTemplate;
let textAnswerTemplate;
let bookTitleInput;
let bookDescriptionInput;
let bookSubjectSelect;
let bookGradeSelect;
let bookShuffleProblemsCheckbox;
let importJsonButton;
let importJsonFileInput;
let exportJsonButton;

document.addEventListener("DOMContentLoaded", () => {
  loadingOverlay = document.getElementById("loading-overlay");
  loadingStatusText = document.getElementById("loading-status-text");
  problemsListEl = document.getElementById("problems-list");
  addProblemButton = document.getElementById("add-problem-button");
  submitButton = document.getElementById("submit-button");
  problemTemplate = document.getElementById("problem-template");
  choiceTemplate = document.getElementById("choice-template");
  textAnswerTemplate = document.getElementById("text-answer-template");
  bookTitleInput = document.getElementById("book-title-input");
  bookDescriptionInput = document.getElementById("book-description-input");
  bookSubjectSelect = document.getElementById("book-subject-select");
  bookGradeSelect = document.getElementById("book-grade-select");
  bookShuffleProblemsCheckbox = document.getElementById("book-shuffle-problems-checkbox");
  importJsonButton = document.getElementById("import-json-button");
  importJsonFileInput = document.getElementById("import-json-file-input");
  exportJsonButton = document.getElementById("export-json-button");

  addProblemButton.addEventListener("click", () => addProblemBlock());
  submitButton.addEventListener("click", handleSubmit);
  importJsonButton.addEventListener("click", () => importJsonFileInput.click());
  importJsonFileInput.addEventListener("change", handleImportJsonFile);
  exportJsonButton.addEventListener("click", handleExportJson);

  // 最初は1問分の入力欄を用意しておく
  addProblemBlock();

  // ★ 前回の作業データが残っていれば復元するか確認する
  checkForBackup();

  // ★ 以降の入力変更を検知してバックアップを自動保存する（動的に追加される問題カードもまとめて拾う）
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

// ★ 最終アクセス日時の更新。優先度が低いので他の読み込みを妨げないよう、待たずに投げっぱなしにする
function updateLastChecked() {
  db.collection("users_random")
    .doc(myUserId)
    .set({ lastOpenedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
    .catch(error => console.error("最終アクセス日時の更新エラー:", error));
}

// ★ ローカルストレージへのバックアップ機能

function collectBackupSnapshot() {
  const problemCards = Array.from(problemsListEl.querySelectorAll(".problem-card"));
  const problems = problemCards.map(collectProblemForExport);
  const visibilityRadio = document.querySelector(".book-visibility-radio:checked");

  return {
    title: bookTitleInput.value,
    description: bookDescriptionInput.value,
    subjectId: bookSubjectSelect.value,
    gradeId: bookGradeSelect.value,
    shuffleProblems: bookShuffleProblemsCheckbox.checked,
    isPrivate: !!visibilityRadio && visibilityRadio.value === "private",
    problems
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

  if (typeof data.title === "string") bookTitleInput.value = data.title;
  if (typeof data.description === "string") bookDescriptionInput.value = data.description;
  if (data.subjectId !== undefined) bookSubjectSelect.value = String(data.subjectId);
  if (data.gradeId !== undefined) bookGradeSelect.value = String(data.gradeId);
  if (data.shuffleProblems !== undefined) bookShuffleProblemsCheckbox.checked = !!data.shuffleProblems;

  const visibilityRadios = document.querySelectorAll(".book-visibility-radio");
  visibilityRadios.forEach(radio => {
    radio.checked = data.isPrivate ? radio.value === "private" : radio.value === "public";
  });

  const problems = Array.isArray(data.problems) ? data.problems : [];
  if (problems.length > 0) {
    problemsListEl.innerHTML = "";
    problems.forEach(p => addProblemBlock(p));
  }
}

function checkForBackup() {
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

  if (confirm("前回の作業データが残っています。復元しますか？")) {
    applyBackupSnapshot(data);
  } else {
    clearBackup();
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

  setupImageControls(card);
  setupAnswerTypeControls(card);

  problemsListEl.appendChild(card);

  if (prefill) {
    // JSONインポートなどからの復元
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
    // 選択肢を最初から2つ用意しておく
    addChoiceRow(choicesListEl);
    addChoiceRow(choicesListEl);

    // 単語記述用の正解欄も最初から1つ用意しておく
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

function setupImageControls(card) {
  const selectImageButton = card.querySelector(".select-image-button");
  const imageFileInput = card.querySelector(".image-file-input");
  const previewWrap = card.querySelector(".problem-image-preview-wrap");
  const previewImg = card.querySelector(".problem-image-preview");
  const removeImageButton = card.querySelector(".remove-image-button");

  card._selectedImageFile = null;

  selectImageButton.addEventListener("click", () => {
    imageFileInput.click();
  });

  imageFileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    card._selectedImageFile = file;

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
  const correctCheckbox = row.querySelector(".choice-correct-checkbox");

  if (prefillText !== undefined) textInput.value = prefillText;
  if (prefillChecked) correctCheckbox.checked = true;

  removeChoiceButton.addEventListener("click", () => {
    row.remove();
    const card = choicesListEl.closest(".problem-card");
    updateChoiceButtonsState(card);
  });

  correctCheckbox.addEventListener("change", () => {
    const card = choicesListEl.closest(".problem-card");
    if (correctCheckbox.checked && getAnswerType(card) === "single") {
      enforceSingleCorrectChoice(card, correctCheckbox);
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
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      applyImportedBookJson(data);
    } catch (error) {
      console.error(error);
      alert("JSONの読み込みに失敗しました。ファイルの形式を確認してください。\n" + error);
    }
  };
  reader.readAsText(file);

  // 同じファイルを連続で選択してもchangeイベントが発火するようにリセット
  event.target.value = "";
}

function applyImportedBookJson(data) {
  if (!data || typeof data !== "object") {
    alert("JSONの形式が正しくありません。");
    return;
  }

  const problems = Array.isArray(data.problems) ? data.problems : [];
  if (problems.length === 0) {
    alert("problems配列が見つからないか、中身が空です。");
    return;
  }

  const isConfirmed = confirm(`${problems.length}問を読み込みます。現在入力中の問題はすべて置き換えられますがよろしいですか？`);
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


async function handleSubmit() {
  const title = bookTitleInput.value.trim();
  if (!title) {
    alert("タイトルを入力してください。");
    return;
  }

  const description = bookDescriptionInput.value.trim();
  const subjectId = Number(bookSubjectSelect.value);
  const gradeId = Number(bookGradeSelect.value);
  const shuffleProblems = bookShuffleProblemsCheckbox.checked;
  const visibilityRadio = document.querySelector(".book-visibility-radio:checked");
  const isPrivate = !!visibilityRadio && visibilityRadio.value === "private";

  const problemCards = Array.from(problemsListEl.querySelectorAll(".problem-card"));
  if (problemCards.length === 0) {
    alert("問題を1問以上追加してください。");
    return;
  }

  const problemsPayload = [];

  for (let i = 0; i < problemCards.length; i++) {
    const card = problemCards[i];
    const problemNumber = i + 1;

    const problemText = card.querySelector(".problem-text-input").value.trim();
    if (!problemText) {
      alert(`${problemNumber}問目の問題文を入力してください。`);
      return;
    }

    const answerType = getAnswerType(card);

    let choices = [];
    let answer = [];
    let modelAnswer = "";
    let gradingCriteria = "";

    if (answerType === "text") {
      const textAnswerInputs = Array.from(card.querySelectorAll(".text-answer-input"));
      if (textAnswerInputs.length < MIN_TEXT_ANSWERS) {
        alert(`${problemNumber}問目の正解を${MIN_TEXT_ANSWERS}つ以上入力してください。`);
        return;
      }
      for (let a = 0; a < textAnswerInputs.length; a++) {
        const text = textAnswerInputs[a].value.trim();
        if (!text) {
          alert(`${problemNumber}問目の正解${a + 1}を入力してください。`);
          return;
        }
        answer.push(text);
      }
    } else if (answerType === "descriptive") {
      modelAnswer = card.querySelector(".model-answer-input").value.trim();
      if (!modelAnswer) {
        alert(`${problemNumber}問目の模範解答を入力してください。`);
        return;
      }
      gradingCriteria = card.querySelector(".grading-criteria-input").value.trim();
    } else {
      const choiceRows = Array.from(card.querySelectorAll(".choice-row"));
      if (choiceRows.length < MIN_CHOICES) {
        alert(`${problemNumber}問目の選択肢は${MIN_CHOICES}個以上入力してください。`);
        return;
      }

      for (let c = 0; c < choiceRows.length; c++) {
        const choiceText = choiceRows[c].querySelector(".choice-text-input").value.trim();
        if (!choiceText) {
          alert(`${problemNumber}問目の選択肢${c + 1}を入力してください。`);
          return;
        }
        choices.push(choiceText);
        if (choiceRows[c].querySelector(".choice-correct-checkbox").checked) {
          answer.push(c);
        }
      }

      if (answer.length === 0) {
        alert(`${problemNumber}問目の正解を1つ以上チェックしてください。`);
        return;
      }
      if (answerType === "single" && answer.length !== 1) {
        alert(`${problemNumber}問目は単数選択なので、正解は1つだけチェックしてください。`);
        return;
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
      imageFile: card._selectedImageFile || null
    });
  }

  if (!myUserId) {
    alert("ユーザー情報を確認しています。少し待ってからもう一度お試しください。");
    return;
  }

  submitButton.disabled = true;
  loadingOverlay.classList.remove("hidden");
  setLoadingStatus("問題集を保存しています｡");

  try {
    const imageCount = problemsPayload.filter(p => p.imageFile).length;
    if (imageCount > 0) {
      let uploadedCount = 0;
      for (const p of problemsPayload) {
        if (p.imageFile) {
          uploadedCount++;
          setLoadingStatus(`画像をアップロードしています (${uploadedCount}/${imageCount})｡`);
          p.imageUrl = await uploadImageToImgbb(p.imageFile);
        } else {
          p.imageUrl = "";
        }
      }
      setLoadingStatus("問題集を保存しています｡");
    } else {
      problemsPayload.forEach(p => { p.imageUrl = ""; });
    }

    const bookRef = await db
      .collection("ProblemPosting")
      .doc("books")
      .collection("data")
      .add({
        title,
        description,
        subjectId,
        gradeId,
        madeBy: myUserId,
        problemCount: problemsPayload.length,
        shuffleProblems,
        isPrivate,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

    const batch = db.batch();
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

    alert("問題集を作成しました！");
    clearBackup();
    window.location.href = "./app.html";
  } catch (error) {
    console.error(error);
    alert("作成に失敗しました。\n" + error);
    submitButton.disabled = false;
    loadingOverlay.classList.add("hidden");
  }
}
