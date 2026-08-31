const firebaseConfig = {
  apiKey: "AIzaSyAqIiNj0N4WruPSOkWbeo5gxzsNyeMkuLo",
  authDomain: "appsforschool-study.firebaseapp.com",
  projectId: "appsforschool-study",
  storageBucket: "appsforschool-study.firebasestorage.app",
  messagingSenderId: "740735293440",
  appId: "1:740735293440:web:a1363adbab57f1ceec60e5"
};

// Firebase 初期化とサービス取得
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const subjectIdList = [
  "不明",
  "国語",
  "数学",
  "理科",
  "英語",
  "社会(歴史)",
  "社会(地理)",
  "社会(公民)",
  "保健体育(保健)",
  "保健体育(実技)"
];
const gradeIdList = ["不明", "1年", "2年", "3年", "総合"];

// ★ 記述式の採点に使うGeminiモデル。廃止された場合はここを新しいモデルIDに差し替える
const GEMINI_MODEL = "gemini-3.6-flash";
let geminiApiKeyCache = null;
let lastDescriptiveSubmission = null;

let myUid = "";
let myUserId = "";
let meIsAdmin = false;

let problemsData = [];

let currentProblemIndex = 0;
let correctAnswersCount = 0;
let currentBookId = "";

let answerButton;
let skipButton;
let textAnswerInputEl;
let descriptiveAnswerInputEl;
let answerModal;
let answerResultText;
let gradingDisclaimerText;
let answerCorrectAreaEl;
let answerCorrectLabelEl;
let answerExplanationArea;
let answerExplanationText;
let answerCorrectList;
let answerModalActionsRow;
let answerModalNextButton;
let showProblemButton;
let viewExplanationButton;
let answerActionsRow;
let lastAnswerResult = null;

let gradingStatusArea;
let gradingErrorArea;
let gradingErrorText;
let gradingRetryButton;
let gradingCriteriaArea;
let gradingCriteriaText;
let gradingReasonArea;
let gradingReasonText;

let homeButton;
let resultModal;
let resultScoreText;
let resultHomeButton;

let writeImpressionButton;
let impressionModal;
let impressionModalClose;
let impressionInput;
let impressionSaveButton;

let loadingOverlay;
let loadingStatusText;
let drawerOverlay;
let accountSettingsDrawer;
let drawerCloseButton;
let accountSettingsButton;
let drawerUserId;
let drawerUsername;
let drawerLogoutButton;
let drawerEditProfileButton;
let drawerUserListButton;
document.addEventListener("DOMContentLoaded", () => {
  loadingOverlay = document.getElementById("loading-overlay");
  loadingStatusText = document.getElementById("loading-status-text");
  drawerOverlay = document.getElementById("drawerOverlay");
  accountSettingsDrawer = document.getElementById("accountSettingsDrawer");
  drawerCloseButton = document.getElementById("drawerCloseButton");
  accountSettingsButton = document.getElementById("setting-button");

  drawerUserId = document.getElementById("drawerUserId");
  drawerUsername = document.getElementById("drawerUsername");
  drawerLogoutButton = document.getElementById("logout-button");
  drawerEditProfileButton = document.getElementById("drawer-edit-profile-button");
  drawerUserListButton = document.getElementById("drawer-user-list-button");

  accountSettingsButton.addEventListener("click", openDrawer);
  drawerCloseButton.addEventListener("click", closeDrawer);
  drawerOverlay.addEventListener("click", closeDrawer);
  drawerLogoutButton.addEventListener("click", handleLogout);
  drawerEditProfileButton.addEventListener("click", () => {
    openProfileModal(myUserId);
  });
  drawerUserListButton.addEventListener("click", openUserListModal);

  answerButton = document.getElementById("answer-button");
  skipButton = document.getElementById("skip-button");
  textAnswerInputEl = document.getElementById("text-answer-input");
  descriptiveAnswerInputEl = document.getElementById("descriptive-answer-input");
  answerModal = document.getElementById("answer-modal");
  answerResultText = document.getElementById("answer-result-text");
  gradingDisclaimerText = document.getElementById("grading-disclaimer-text");
  answerCorrectAreaEl = document.getElementById("answer-correct-area");
  answerCorrectLabelEl = document.getElementById("answer-correct-label");
  answerExplanationArea = document.getElementById("answer-explanation-area");
  answerExplanationText = document.getElementById("answer-explanation-text");
  answerCorrectList = document.getElementById("answer-correct-list");
  answerModalActionsRow = document.getElementById("answer-modal-actions-row");
  answerModalNextButton = document.getElementById("answer-modal-next-button");
  showProblemButton = document.getElementById("show-problem-button");
  viewExplanationButton = document.getElementById("view-explanation-button");
  answerActionsRow = document.querySelector(".answer-actions");

  gradingStatusArea = document.getElementById("grading-status-area");
  gradingErrorArea = document.getElementById("grading-error-area");
  gradingErrorText = document.getElementById("grading-error-text");
  gradingRetryButton = document.getElementById("grading-retry-button");
  gradingCriteriaArea = document.getElementById("grading-criteria-area");
  gradingCriteriaText = document.getElementById("grading-criteria-text");
  gradingReasonArea = document.getElementById("grading-reason-area");
  gradingReasonText = document.getElementById("grading-reason-text");

  answerButton.addEventListener("click", handleAnswerSubmit);
  skipButton.addEventListener("click", handleSkip);
  textAnswerInputEl.addEventListener("input", updateAnswerButtonState);
  descriptiveAnswerInputEl.addEventListener("input", updateAnswerButtonState);
  answerModalNextButton.addEventListener("click", handleAnswerModalNext);
  showProblemButton.addEventListener("click", () => {
    answerModal.classList.add("hidden");
  });
  viewExplanationButton.addEventListener("click", () => {
    reopenAnswerModal();
  });
  gradingRetryButton.addEventListener("click", () => {
    if (lastDescriptiveSubmission !== null) {
      runDescriptiveGrading(lastDescriptiveSubmission);
    }
  });

  homeButton = document.getElementById("home-button");
  resultModal = document.getElementById("result-modal");
  resultScoreText = document.getElementById("result-score-text");
  resultHomeButton = document.getElementById("result-home-button");

  writeImpressionButton = document.getElementById("write-impression-button");
  impressionModal = document.getElementById("impression-modal");
  impressionModalClose = document.getElementById("impression-modal-close");
  impressionInput = document.getElementById("impression-input");
  impressionSaveButton = document.getElementById("impression-save-button");

  homeButton.addEventListener("click", async () => {
    if (await AppDialog.confirm("本当にやめますか？")) {
      window.location.href = "./app.html";
    }
  });
  resultHomeButton.addEventListener("click", () => {
    window.location.href = "./app.html";
  });

  writeImpressionButton.addEventListener("click", openImpressionModal);
  impressionModalClose.addEventListener("click", () => {
    impressionModal.classList.add("hidden");
  });
  impressionSaveButton.addEventListener("click", saveImpression);
});

async function openImpressionModal() {
  impressionInput.value = "";
  impressionInput.disabled = true;
  impressionModal.classList.remove("hidden");

  try {
    const bookSnap = await db
      .collection("ProblemPosting")
      .doc("books")
      .collection("data")
      .doc(currentBookId)
      .get();
    const impressions = (bookSnap.exists && bookSnap.data().impressions) || {};
    impressionInput.value = impressions[myUserId] || "";
  } catch (error) {
    console.error("感想の取得エラー:", error);
  } finally {
    impressionInput.disabled = false;
  }
}

async function saveImpression() {
  const text = impressionInput.value.trim();

  impressionSaveButton.disabled = true;
  impressionSaveButton.textContent = "保存中...";

  try {
    await db
      .collection("ProblemPosting")
      .doc("books")
      .collection("data")
      .doc(currentBookId)
      .update({
        [`impressions.${myUserId}`]: text
      });
    await AppDialog.alert("感想を保存しました。");
    impressionModal.classList.add("hidden");
  } catch (error) {
    console.error("感想の保存エラー:", error);
    await AppDialog.alert("感想の保存に失敗しました。\n" + error);
  } finally {
    impressionSaveButton.disabled = false;
    impressionSaveButton.textContent = "保存する";
  }
}

function openDrawer() {
  accountSettingsDrawer.classList.add("is-open");
  drawerOverlay.classList.add("is-open");
}
function closeDrawer() {
  accountSettingsDrawer.classList.remove("is-open");
  drawerOverlay.classList.remove("is-open");
}

document.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      myUserId = user.email.split("@")[0];
      drawerUserId.textContent = myUserId;

      const userSnapshot = await db
        .collection("users_random")
        .doc(myUserId)
        .get();
      const userData = userSnapshot.data();
      setUserCache(myUserId, {
        name: userData.name,
        isAdmin: userData.isAdmin,
        imageUrl: userData.imageUrl || "",
        profileText: userData.profileText || "",
        prizeExpiresAt: toMillisOrNull(userData.prizeExpiresAt)
      });
      meIsAdmin = userData.isAdmin || false;
      drawerUsername.textContent = userData.name;
      if (meIsAdmin) {
        drawerUsername.classList.add("admin");
      } else if (hasActivePrize(getUserCache(myUserId))) {
        drawerUsername.classList.add("prize");
      }
      drawerUserListButton.classList.toggle("hidden", !meIsAdmin);

      myUid = userData.uid;

      const bookId = getParmFromUrl("id");
      if (!bookId) {
        await AppDialog.alert("問題集が指定されていません。");
        return;
      }
      currentBookId = bookId;
      const ok = await loadProblemBook(bookId);
      if (!ok) {
        loadingOverlay.classList.add("hidden");
        document.getElementById("no-permission-overlay").classList.remove("hidden");
        return;
      }
      await preloadAllProblemImages();
      loadingOverlay.classList.add("hidden");
      document.getElementById("problem-area").classList.remove("hidden");
      
      nextProblem(0);
      updateLastChecked();
    } else {
      console.log("logout");
      window.location.href = "./index.html";
    }
  });
});

// ★ 最終アクセス日時の更新。優先度が低いので他の読み込みを妨げないよう、待たずに投げっぱなしにする
function updateLastChecked() {
  db.collection("users_random")
    .doc(myUserId)
    .set({ lastOpenedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
    .catch(error => console.error("最終アクセス日時の更新エラー:", error));
}

// ★ 月ごとの解答済み問題数を加算する（key: "YYYYMM", value: 問題数）
function incrementMonthlyProblemCount() {
  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

  db.collection("users_random")
    .doc(myUserId)
    .set(
      {
        monthlyProblemCounts: {
          [yearMonth]: firebase.firestore.FieldValue.increment(1)
        }
      },
      { merge: true }
    )
    .catch(error => console.error("月間解答数の更新エラー:", error));
}

const handleLogout = async () => {
  const isConfirmed = await AppDialog.confirm("ログアウトしますか？", { okText: "ログアウトする", danger: true });
  if (isConfirmed) {
    try {
      await auth.signOut(auth);
      console.log("ログアウトしました！");
      await AppDialog.alert("ログアウトしました。");
      window.location.href = "./index.html";
    } catch (error) {
      console.error("ログアウトエラー:", error);
      await AppDialog.alert("ログアウトに失敗しました。");
    }
  }
};


function getParmFromUrl(parm) {
  const params = new URLSearchParams(window.location.search);
  return params.get(parm);
}

// ★ Fisher-Yatesシャッフル（元の配列は変更せず、シャッフル済みの新しい配列を返す）
function shuffleArray(array) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function loadProblemBook(bookId) {
  try {
    const titleAreaTitle = document.getElementById("title-area-title");
    const allProblemsCount = document.getElementById("all-problems-count");
    
    const bookDocRef = await db
      .collection("ProblemPosting")
      .doc("books")
      .collection("data")
      .doc(bookId);
    const bookData = await bookDocRef.get();

    if (!bookData.exists) return false;

    // ★ 非公開の問題集は、作成者本人か管理者以外はIDを知っていても解けないようにする
    const isPrivate = !!bookData.get("isPrivate");
    const madeBy = bookData.get("madeBy");
    if (isPrivate && madeBy !== myUserId && !meIsAdmin) {
      return false;
    }

    titleAreaTitle.textContent = bookData.get("title");
    
    const problemsSnapshot = await db
      .collection("ProblemPosting")
      .doc("books")
      .collection("data")
      .doc(bookId)
      .collection("problems")
      .orderBy("no")
      .get();
    
    allProblemsCount.textContent = problemsSnapshot.size;

    for (const doc of problemsSnapshot.docs) {
      const data = doc.data();
      if (!data.problem) throw new Error("問題文がありません");
      const problem = data.problem;

      const answerType = data.answerType || (data.answer && data.answer.length === 1 ? "single" : "multiple");
      const shuffleChoices = data.shuffleChoices || false;
      const explanation = data.explanation || "";
      const imageUrl = data.imageUrl || "";

      let choices = [];
      let answer = [];
      let modelAnswer = "";
      let gradingCriteria = "";

      if (answerType === "descriptive") {
        if (!data.modelAnswer) throw new Error("模範解答がありません");
        modelAnswer = data.modelAnswer;
        gradingCriteria = data.gradingCriteria || "";
      } else {
        if (!data.choices) throw new Error("選択肢がありません");
        choices = data.choices;
        if (!data.answer) throw new Error("解答がありません");
        answer = data.answer;
      }

      problemsData.push([problem, choices, answer, explanation, imageUrl, answerType, shuffleChoices, modelAnswer, gradingCriteria]);
    }

    const shuffleRequested = getParmFromUrl("shuffle") === "1";
    const shuffleAllowed = !!bookData.get("shuffleProblems");
    if (shuffleRequested && shuffleAllowed) {
      problemsData = shuffleArray(problemsData);
    }
    return true;
  } catch (error) {
    console.log(error);
    await AppDialog.alert(String(error));
    return false;
  }
}

// ★ ローディングオーバーレイ下部の小さいテキストを更新する
function setLoadingStatus(text) {
  if (loadingStatusText) loadingStatusText.textContent = text;
}

// ★ 1枚の画像を読み込む。失敗しても他の画像の読み込みを止めないよう、常にresolveする
function preloadImage(url) {
  return new Promise(resolve => {
    if (!url) {
      resolve();
      return;
    }
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
}

// ★ 問題集内の全ての画像を、ローディング中にまとめて読み込み切っておく
//   （こうしておくと、解答中に問題を切り替えても画像は既にブラウザにキャッシュされているため即表示される）
async function preloadAllProblemImages() {
  const imageUrls = problemsData.map(p => p[4]).filter(url => !!url);
  if (imageUrls.length === 0) return;

  let loadedCount = 0;
  setLoadingStatus(`画像を読み込んでいます (${loadedCount}/${imageUrls.length})｡`);

  await Promise.all(imageUrls.map(url =>
    preloadImage(url).then(() => {
      loadedCount++;
      setLoadingStatus(`画像を読み込んでいます (${loadedCount}/${imageUrls.length})｡`);
    })
  ));
}



function nextProblem(problemCount) {
  currentProblemIndex = problemCount;

  const gaugeBar = document.getElementById("gauge-bar");
  const nowProblemCount = document.getElementById("now-problem-count");
  const problemText = document.getElementById("problem-text");
  const choicesArea = document.getElementById("choices-area");
  const textAnswerInput = document.getElementById("text-answer-input");
  const answerTypeText = document.getElementById("answer-type-text");
  
  choicesArea.innerHTML = "";
  textAnswerInput.value = "";
  textAnswerInput.disabled = false;
  descriptiveAnswerInputEl.value = "";
  descriptiveAnswerInputEl.disabled = false;
  skipButton.disabled = false;
  answerActionsRow.classList.remove("hidden");
  viewExplanationButton.classList.add("hidden");

  // 前の問題の採点関連の表示状態をリセットしておく
  answerCorrectLabelEl.textContent = "正解";
  answerCorrectAreaEl.classList.remove("hidden");
  gradingDisclaimerText.classList.add("hidden");
  gradingStatusArea.classList.add("hidden");
  gradingErrorArea.classList.add("hidden");
  gradingCriteriaArea.classList.add("hidden");
  gradingReasonArea.classList.add("hidden");
  showProblemButton.classList.remove("hidden");
  answerModalNextButton.classList.remove("hidden");
  answerModalActionsRow.classList.remove("hidden");
  lastDescriptiveSubmission = null;

  const answerType = problemsData[problemCount][5];
  const isSingle = answerType === "single";
  const isText = answerType === "text";
  const isDescriptive = answerType === "descriptive";

  if (isText) {
    answerTypeText.textContent = "単語記述";
    choicesArea.classList.add("hidden");
    textAnswerInput.classList.remove("hidden");
    descriptiveAnswerInputEl.classList.add("hidden");
  } else if (isDescriptive) {
    answerTypeText.textContent = "記述";
    choicesArea.classList.add("hidden");
    textAnswerInput.classList.add("hidden");
    descriptiveAnswerInputEl.classList.remove("hidden");
  } else {
    answerTypeText.textContent = isSingle ? "単数選択" : "複数選択";
    choicesArea.classList.remove("hidden");
    textAnswerInput.classList.add("hidden");
    descriptiveAnswerInputEl.classList.add("hidden");
  }
  
  gaugeBar.style.width = `${((problemCount + 1) / problemsData.length) * 100}%`;
  nowProblemCount.textContent = problemCount + 1;
  problemText.textContent = problemsData[problemCount][0];
  
  const problemImage = document.getElementById("problem-image");
  const imageUrl = problemsData[problemCount][4];
  if (imageUrl) {
    problemImage.src = imageUrl;
    problemImage.classList.remove("hidden");
  } else {
    problemImage.src = "";
    problemImage.classList.add("hidden");
  }
  
  if (!isText && !isDescriptive) {
    const choices = problemsData[problemCount][1];
    const shuffleChoices = problemsData[problemCount][6];

    let displayOrder = choices.map((_, index) => index);
    if (shuffleChoices) {
      displayOrder = shuffleArray(displayOrder);
    }

    let choiceButtons = [];
    displayOrder.forEach(index => {
      const button = document.createElement("button");
      button.textContent = choices[index];
      button.dataset.index = index;
      choiceButtons.push(button);
      
      choicesArea.appendChild(button);
    });
    choiceButtons.forEach(button => {
      if (isSingle) {
        button.addEventListener("click", () => {
          choiceButtons.forEach(choice => {
            choice.classList.remove("active");
          });
          button.classList.add("active");
          updateAnswerButtonState();
        });
      } else {
        button.addEventListener("click", () => {
          button.classList.toggle("active");
          updateAnswerButtonState();
        });
      }
    });
  }
  
  updateAnswerButtonState();
}

function updateAnswerButtonState() {
  const answerType = problemsData[currentProblemIndex][5];
  if (answerType === "text") {
    answerButton.disabled = textAnswerInputEl.value.trim() === "";
  } else if (answerType === "descriptive") {
    answerButton.disabled = descriptiveAnswerInputEl.value.trim() === "";
  } else {
    const choicesArea = document.getElementById("choices-area");
    const hasActive = choicesArea.querySelector("button.active") !== null;
    answerButton.disabled = !hasActive;
  }
}


async function handleAnswerSubmit() {
  const answerType = problemsData[currentProblemIndex][5];

  if (answerType === "descriptive") {
    const submittedText = descriptiveAnswerInputEl.value.trim();
    if (!submittedText) {
      await AppDialog.alert("答えを入力してください。");
      return;
    }

    descriptiveAnswerInputEl.disabled = true;
    answerButton.disabled = true;
    skipButton.disabled = true;

    incrementMonthlyProblemCount();
    runDescriptiveGrading(submittedText);
    return;
  }

  if (answerType === "text") {
    const textAnswerInput = document.getElementById("text-answer-input");
    const submittedText = textAnswerInput.value.trim();

    if (!submittedText) {
      await AppDialog.alert("答えを入力してください。");
      return;
    }

    const correctAnswers = problemsData[currentProblemIndex][2];
    const isCorrect = correctAnswers.includes(submittedText);

    if (isCorrect) correctAnswersCount++;

    textAnswerInput.disabled = true;
    answerButton.disabled = true;

    incrementMonthlyProblemCount();
    showAnswerModal(isCorrect);
    return;
  }

  const choicesArea = document.getElementById("choices-area");
  const buttons = Array.from(choicesArea.querySelectorAll("button"));

  const selectedIndices = buttons
    .filter(button => button.classList.contains("active"))
    .map(button => Number(button.dataset.index));

  if (selectedIndices.length === 0) {
    await AppDialog.alert("選択肢を選んでください。");
    return;
  }

  const correctIndices = problemsData[currentProblemIndex][2];
  const isCorrect = isSameIndexSet(selectedIndices, correctIndices);

  if (isCorrect) correctAnswersCount++;

  buttons.forEach(button => {
    const index = Number(button.dataset.index);
    button.classList.remove("active");
    if (correctIndices.includes(index)) {
      button.classList.add("correct");
    } else if (selectedIndices.includes(index)) {
      button.classList.add("incorrect");
    }
    button.disabled = true;
  });

  answerButton.disabled = true;

  incrementMonthlyProblemCount();
  showAnswerModal(isCorrect);
}

function handleSkip() {
  const answerType = problemsData[currentProblemIndex][5];

  if (answerType === "text") {
    textAnswerInputEl.disabled = true;
  } else if (answerType === "descriptive") {
    descriptiveAnswerInputEl.disabled = true;
  } else {
    const choicesArea = document.getElementById("choices-area");
    const buttons = Array.from(choicesArea.querySelectorAll("button"));
    const correctIndices = problemsData[currentProblemIndex][2];

    buttons.forEach(button => {
      const index = Number(button.dataset.index);
      button.classList.remove("active");
      if (correctIndices.includes(index)) {
        button.classList.add("correct");
      }
      button.disabled = true;
    });
  }

  answerButton.disabled = true;
  skipButton.disabled = true;

  // スキップした問題は不正解扱い（correctAnswersCountは増やさない）かつカウント対象外
  if (answerType === "descriptive") {
    showDescriptiveModal({ phase: "skipped" });
  } else {
    showAnswerModal(null);
  }
}

function isSameIndexSet(a, b) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  return sortedA.every((value, i) => value === sortedB[i]);
}

function showAnswerModal(isCorrect) {
  lastAnswerResult = isCorrect;
  answerActionsRow.classList.add("hidden");
  viewExplanationButton.classList.remove("hidden");

  if (isCorrect === null) {
    answerResultText.classList.add("hidden");
  } else {
    answerResultText.classList.remove("hidden");
    answerResultText.textContent = isCorrect ? "正解！" : "不正解...";
    answerResultText.classList.toggle("correct-text", isCorrect);
    answerResultText.classList.toggle("incorrect-text", !isCorrect);
  }

  const answerType = problemsData[currentProblemIndex][5];
  answerCorrectList.innerHTML = "";

  if (answerType === "text") {
    const correctAnswers = problemsData[currentProblemIndex][2];
    correctAnswers.forEach(text => {
      const li = document.createElement("li");
      li.textContent = text;
      answerCorrectList.appendChild(li);
    });
  } else {
    const choices = problemsData[currentProblemIndex][1];
    const correctIndices = problemsData[currentProblemIndex][2];
    correctIndices.forEach(index => {
      const li = document.createElement("li");
      li.textContent = choices[index];
      answerCorrectList.appendChild(li);
    });
  }
  
  const explanation = problemsData[currentProblemIndex][3];
  if (explanation) {
    answerExplanationText.textContent = explanation;
    answerExplanationArea.classList.remove("hidden");
  } else {
    answerExplanationArea.classList.add("hidden");
  }

  const isLastProblem = currentProblemIndex === problemsData.length - 1;
  answerModalNextButton.textContent = isLastProblem ? "結果を見る" : "次へ";

  answerModal.classList.remove("hidden");
}

// ★ モーダルを再度開くときに、問題タイプに応じた表示関数へ振り分ける
function reopenAnswerModal() {
  const answerType = problemsData[currentProblemIndex][5];
  if (answerType === "descriptive") {
    showDescriptiveModal(lastAnswerResult);
  } else {
    showAnswerModal(lastAnswerResult);
  }
}

// ★ 記述式問題の解答モーダル表示。state.phase は "grading" | "result" | "skipped" | "error"
function showDescriptiveModal(state) {
  lastAnswerResult = state;

  answerActionsRow.classList.add("hidden");
  answerResultText.classList.add("hidden");
  gradingDisclaimerText.classList.add("hidden");
  answerCorrectAreaEl.classList.add("hidden");
  gradingCriteriaArea.classList.add("hidden");
  gradingReasonArea.classList.add("hidden");
  answerExplanationArea.classList.add("hidden");
  gradingStatusArea.classList.add("hidden");
  gradingErrorArea.classList.add("hidden");

  if (state.phase === "grading") {
    // 採点中は結果を確実に確認してもらうため、閉じる手段を出さない
    answerModalActionsRow.classList.add("hidden");
    viewExplanationButton.classList.add("hidden");
    gradingStatusArea.classList.remove("hidden");
    answerModal.classList.remove("hidden");
    return;
  }

  if (state.phase === "error") {
    gradingErrorArea.classList.remove("hidden");

    // 採点に失敗しても行き詰まらないよう、問題に戻れるようにしておく（「次へ」は出さない）
    showProblemButton.classList.remove("hidden");
    answerModalNextButton.classList.add("hidden");
    answerModalActionsRow.classList.remove("hidden");
    viewExplanationButton.classList.remove("hidden");

    answerModal.classList.remove("hidden");
    return;
  }

  // "result"（採点完了）または "skipped"（スキップ）の場合は模範解答などをまとめて表示する
  const problemInfo = problemsData[currentProblemIndex];
  const modelAnswer = problemInfo[7];
  const gradingCriteria = problemInfo[8];
  const explanation = problemInfo[3];

  if (state.phase === "result") {
    answerResultText.classList.remove("hidden");
    answerResultText.textContent = `${state.score}/10点`;
    answerResultText.classList.toggle("correct-text", state.score >= 6);
    answerResultText.classList.toggle("incorrect-text", state.score < 6);
    gradingDisclaimerText.classList.remove("hidden");
  }

  answerCorrectLabelEl.textContent = "模範解答";
  answerCorrectList.innerHTML = "";
  const li = document.createElement("li");
  li.textContent = modelAnswer;
  answerCorrectList.appendChild(li);
  answerCorrectAreaEl.classList.remove("hidden");

  if (gradingCriteria) {
    gradingCriteriaText.textContent = gradingCriteria;
    gradingCriteriaArea.classList.remove("hidden");
  }

  if (state.phase === "result" && state.reason) {
    gradingReasonText.textContent = state.reason;
    gradingReasonArea.classList.remove("hidden");
  }

  if (explanation) {
    answerExplanationText.textContent = explanation;
    answerExplanationArea.classList.remove("hidden");
  }

  showProblemButton.classList.remove("hidden");
  answerModalNextButton.classList.remove("hidden");
  viewExplanationButton.classList.remove("hidden");
  answerModalActionsRow.classList.remove("hidden");

  const isLastProblem = currentProblemIndex === problemsData.length - 1;
  answerModalNextButton.textContent = isLastProblem ? "結果を見る" : "次へ";

  answerModal.classList.remove("hidden");
}

// ★ Gemini採点の実行。採点中モーダル→結果 or エラーモーダルの順に表示を更新する
async function runDescriptiveGrading(submittedText) {
  lastDescriptiveSubmission = submittedText;
  showDescriptiveModal({ phase: "grading" });

  const problemInfo = problemsData[currentProblemIndex];
  const problemText = problemInfo[0];
  const imageUrl = problemInfo[4];
  const modelAnswer = problemInfo[7];
  const gradingCriteria = problemInfo[8];

  try {
    const result = await gradeDescriptiveAnswer({
      problem: problemText,
      modelAnswer,
      gradingCriteria,
      submittedText,
      imageUrl
    });

    // 6/10点以上を「正解」扱いとして結果画面の正解数にカウントする（あくまで目安の合格ライン）
    if (result.score >= 6) correctAnswersCount++;

    showDescriptiveModal({ phase: "result", score: result.score, reason: result.reason });
  } catch (error) {
    console.error("Gemini採点エラー:", error);
    await AppDialog.alert("採点でエラーが発生しました。\n" + (error && error.message ? error.message : error));
    showDescriptiveModal({ phase: "error" });
  }
}

// ★ imgbbのAPIキーと同じ system_keys コレクションに、Geminiのキー用ドキュメントとして保存する想定
//   system_keys/gemini の apiKey フィールド
async function getGeminiApiKey() {
  if (geminiApiKeyCache) return geminiApiKeyCache;

  const keyDoc = await db.collection("system_keys").doc("gemini").get();
  const apiKey = keyDoc.exists ? keyDoc.data().apiKey : null;
  if (!apiKey) {
    throw new Error("Gemini APIキーが設定されていません。（system_keys/gemini の apiKey）");
  }

  geminiApiKeyCache = apiKey;
  return geminiApiKeyCache;
}

// ★ 問題画像のURLを取得し、Geminiに渡せるBase64データへ変換する
async function fetchImageAsBase64(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`問題画像の取得に失敗しました: ${response.status}`);
  }
  const blob = await response.blob();
  const mimeType = blob.type || "image/jpeg";
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error || new Error("画像の読み込みに失敗しました"));
    reader.readAsDataURL(blob);
  });
  return { mimeType, base64 };
}

async function gradeDescriptiveAnswer({ problem, modelAnswer, gradingCriteria, submittedText, imageUrl }) {
  const apiKey = await getGeminiApiKey();

  const promptLines = [
    "あなたは採点者です。以下の問題・模範解答・採点基準をもとに、生徒の解答を10点満点で採点してください。",
    "",
    `【問題文】\n${problem}`,
    "",
    `【模範解答】\n${modelAnswer}`
  ];
  if (gradingCriteria) {
    promptLines.push("", `【採点基準】\n${gradingCriteria}`);
  }
  if (imageUrl) {
    promptLines.push("", "※ 問題にはこのあとに続く画像が添付されています。採点の際は画像の内容も踏まえてください。");
  }
  promptLines.push(
    "",
    `【生徒の解答】\n${submittedText}`,
    "",
    "採点基準（採点基準が無い場合は模範解答との一致度や妥当性）をもとに、0〜10の整数のscoreと、生徒に向けた日本語の簡潔な評価理由reasonを返してください。"
  );
  const prompt = promptLines.join("\n");

  const parts = [{ text: prompt }];

  if (imageUrl) {
    try {
      const { mimeType, base64 } = await fetchImageAsBase64(imageUrl);
      parts.push({ inlineData: { mimeType, data: base64 } });
    } catch (error) {
      // 画像が取得できなくても採点自体は続行する（テキストのみで採点）
      console.error("問題画像の取得に失敗しました:", error);
    }
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              score: { type: "integer" },
              reason: { type: "string" }
            },
            required: ["score", "reason"]
          }
        }
      })
    }
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Gemini APIエラー: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  const resultText = data && data.candidates && data.candidates[0] && data.candidates[0].content &&
    data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text;
  if (!resultText) {
    throw new Error("Gemini APIから採点結果が得られませんでした。");
  }

  const parsed = JSON.parse(resultText);
  let score = Number(parsed.score);
  if (!Number.isFinite(score)) score = 0;
  score = Math.max(0, Math.min(10, Math.round(score)));

  return { score, reason: String(parsed.reason || "") };
}

function handleAnswerModalNext() {
  answerModal.classList.add("hidden");

  const nextIndex = currentProblemIndex + 1;
  if (nextIndex < problemsData.length) {
    nextProblem(nextIndex);
  } else {
    showResultModal();
  }
}

function showResultModal() {
  resultScoreText.textContent = `${correctAnswersCount} / ${problemsData.length} 問正解`;
  resultModal.classList.remove("hidden");

  db.collection("ProblemPosting")
    .doc("books")
    .collection("data")
    .doc(currentBookId)
    .update({
      solvedBy: firebase.firestore.FieldValue.arrayUnion(myUserId)
    })
    .catch(error => console.error("解答済み記録エラー:", error));
}





let shareModalBtn;
let shareModal;
let shareModalClose;
document.addEventListener("DOMContentLoaded", () => {
  shareModalBtn = document.getElementById("share-modal-btn");
  shareModal = document.getElementById("share-modal");
  shareModalClose = document.getElementById("share-modal-close");

  shareModalBtn.addEventListener("click", () => {
    shareModal.classList.remove("hidden");
  });
  shareModalClose.addEventListener("click", () => {
    shareModal.classList.add("hidden");
  });
});
