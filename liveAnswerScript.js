const firebaseConfig = {
  apiKey: "AIzaSyAqIiNj0N4WruPSOkWbeo5gxzsNyeMkuLo",
  authDomain: "appsforschool-study.firebaseapp.com",
  projectId: "appsforschool-study",
  storageBucket: "appsforschool-study.firebasestorage.app",
  messagingSenderId: "740735293440",
  appId: "1:740735293440:web:a1363adbab57f1ceec60e5",
  // ★ Realtime Databaseを使うために追加。Firebaseコンソール > Realtime Database の画面上部に
  //   表示されているURLに書き換えてください（例: "https://appsforschool-study-default-rtdb.asia-southeast1.firebasedatabase.app"）
  databaseURL: "https://appsforschool-study-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const rtdb = firebase.database();

// ★ iPadなどコンソールが見られない環境向けに、想定外のエラーをアラートで表示する
window.addEventListener("error", event => {
  const message = (event.error && event.error.message) || event.message || "不明なエラー";
  console.error("Uncaught error:", event.error || event.message);
  alert("予期しないエラーが発生しました:\n" + message);
});
window.addEventListener("unhandledrejection", event => {
  const reason = event.reason;
  const message = (reason && reason.message) || String(reason);
  console.error("Unhandled promise rejection:", reason);
  alert("予期しないエラーが発生しました:\n" + message);
});

let myUserId = "";
let myUserName = "";
let bookId = "";
let sessionData = null;
let sessionRef = null;
let serverTimeOffset = 0;

let currentDisplayedIndex = -1;
let currentChoiceOrder = [];
let selectedIndices = [];
let timerRefreshHandle = null;
let problemsData = []; // [problem, choices, answer, explanation, imageUrl, answerType, shuffleChoices, modelAnswer, gradingCriteria]

let loadingOverlay;
let loadingStatusText;
let liveHeaderTitle;

let phaseWaiting, phaseCountdown, phaseQuestion, phaseWaitingResult, phaseGrading, phaseResults, phaseFinished, phaseCancelled;

let waitingParticipantsList, waitingCommentText, leaveWaitingButton;
let countdownNumberEl;
let questionIndexText, questionTimerText, questionTimerBar, answerTypeText, questionText, questionImage,
  choicesArea, textAnswerInput, descriptiveAnswerInput, submitAnswerButton;
let resultMyScoreText, resultCorrectArea, resultLeaderboardArea, resultWaitingHint;
let finishedMyRankText, finishedLeaderboardArea, writeImpressionButton, finishedHomeButton;

let impressionModal, impressionModalClose, impressionInput, impressionSaveButton;

document.addEventListener("DOMContentLoaded", () => {
  loadingOverlay = document.getElementById("loading-overlay");
  loadingStatusText = document.getElementById("loading-status-text");
  liveHeaderTitle = document.getElementById("host-title-text");

  phaseWaiting = document.getElementById("phase-waiting");
  phaseCountdown = document.getElementById("phase-countdown");
  phaseQuestion = document.getElementById("phase-question");
  phaseWaitingResult = document.getElementById("phase-waiting-result");
  phaseGrading = document.getElementById("phase-grading");
  phaseResults = document.getElementById("phase-results");
  phaseFinished = document.getElementById("phase-finished");
  phaseCancelled = document.getElementById("phase-cancelled");

  waitingParticipantsList = document.getElementById("waiting-participants-list");
  waitingCommentText = document.getElementById("waiting-comment-text");
  leaveWaitingButton = document.getElementById("leave-waiting-button");

  countdownNumberEl = document.getElementById("countdown-number");

  questionIndexText = document.getElementById("question-index-text");
  questionTimerText = document.getElementById("question-timer-text");
  questionTimerBar = document.getElementById("question-timer-bar");
  answerTypeText = document.getElementById("answer-type-text");
  questionText = document.getElementById("problem-text");
  questionImage = document.getElementById("problem-image");
  choicesArea = document.getElementById("choices-area");
  textAnswerInput = document.getElementById("text-answer-input");
  descriptiveAnswerInput = document.getElementById("descriptive-answer-input");
  submitAnswerButton = document.getElementById("submit-answer-button");

  resultMyScoreText = document.getElementById("result-my-score-text");
  resultCorrectArea = document.getElementById("result-correct-area");
  resultLeaderboardArea = document.getElementById("result-leaderboard-area");
  resultWaitingHint = document.getElementById("result-waiting-hint");

  finishedMyRankText = document.getElementById("finished-my-rank-text");
  finishedLeaderboardArea = document.getElementById("finished-leaderboard-area");
  writeImpressionButton = document.getElementById("write-impression-button");
  finishedHomeButton = document.getElementById("finished-home-button");

  impressionModal = document.getElementById("impression-modal");
  impressionModalClose = document.getElementById("impression-modal-close");
  impressionInput = document.getElementById("impression-input");
  impressionSaveButton = document.getElementById("impression-save-button");

  leaveWaitingButton.addEventListener("click", leaveSession);
  textAnswerInput.addEventListener("input", updateSubmitButtonState);
  descriptiveAnswerInput.addEventListener("input", updateSubmitButtonState);
  submitAnswerButton.addEventListener("click", submitAnswer);
  finishedHomeButton.addEventListener("click", () => {
    window.location.href = "./app.html";
  });
  document.getElementById("cancelled-home-button").addEventListener("click", () => {
    window.location.href = "./app.html";
  });
  writeImpressionButton.addEventListener("click", openImpressionModal);
  impressionModalClose.addEventListener("click", () => impressionModal.classList.add("hidden"));
  impressionSaveButton.addEventListener("click", saveImpression);

  rtdb.ref(".info/serverTimeOffset").on("value", snap => {
    serverTimeOffset = snap.val() || 0;
  });

  auth.onAuthStateChanged(async user => {
    if (!user) {
      window.location.href = "./index.html";
      return;
    }
    myUserId = user.email.split("@")[0];

    bookId = getParmFromUrl("id");
    if (!bookId) {
      alert("問題集が指定されていません。");
      window.location.href = "./app.html";
      return;
    }

    try {
      loadingStatusText.textContent = "ユーザー情報を確認しています｡";
      const userSnap = await db.collection("users_random").doc(myUserId).get();
      myUserName = (userSnap.exists && userSnap.data().name) || myUserId;

      const bookDoc = await db.collection("ProblemPosting").doc("books").collection("data").doc(bookId).get();
      if (bookDoc.exists) {
        liveHeaderTitle.textContent = bookDoc.data().title || "";
      }

      loadingStatusText.textContent = "問題を読み込んでいます｡";
      await Promise.all([ensureJoined(), loadProblems()]);
      loadingStatusText.textContent = "画像を読み込んでいます｡";
      await preloadProblemImages();
      loadingStatusText.textContent = "進行状況に接続しています｡";
      attachSessionListener();
    } catch (error) {
      if (error && error.message === "ALREADY_STARTED") return;
      console.error(error);
      loadingOverlay.classList.add("hidden");
      alert("読み込みに失敗しました。\n" + error);
    }
  });
});

function getParmFromUrl(parm) {
  const params = new URLSearchParams(window.location.search);
  return params.get(parm);
}
function now() {
  return Date.now() + serverTimeOffset;
}

async function ensureJoined() {
  const sessionSnap = await rtdb.ref(`liveSessions/${bookId}`).get();
  const session = sessionSnap.exists() ? sessionSnap.val() : null;
  const alreadyParticipant = !!(session && session.participants && session.participants[myUserId]);

  if (!alreadyParticipant && session && session.status !== "waiting") {
    // ★ 未参加のまま既に開始済みのセッションには参加させない
    loadingOverlay.classList.add("hidden");
    const cancelledTitle = document.querySelector("#phase-cancelled .live-phase-title");
    const cancelledHint = document.querySelector("#phase-cancelled .waiting-result-hint");
    if (cancelledTitle) cancelledTitle.textContent = "参加できません";
    if (cancelledHint) cancelledHint.textContent = "すでに開始済みのため、この問題集には参加できません。";
    document.getElementById("phase-cancelled").classList.remove("hidden");
    throw new Error("ALREADY_STARTED");
  }

  await rtdb.ref(`liveSessions/${bookId}/participants/${myUserId}`).set({
    name: myUserName,
    joinedAt: firebase.database.ServerValue.TIMESTAMP
  });
  try {
    await db
      .collection("ProblemPosting")
      .doc("books")
      .collection("data")
      .doc(bookId)
      .update({ recruitParticipants: firebase.firestore.FieldValue.arrayUnion(myUserId) });
  } catch (error) {
    console.error("参加者記録の更新エラー:", error);
  }
}

async function leaveSession() {
  if (!confirm("参加を取り消しますか？")) return;
  try {
    await rtdb.ref(`liveSessions/${bookId}/participants/${myUserId}`).remove();
    await db
      .collection("ProblemPosting")
      .doc("books")
      .collection("data")
      .doc(bookId)
      .update({ recruitParticipants: firebase.firestore.FieldValue.arrayRemove(myUserId) });
  } catch (error) {
    console.error(error);
  }
  window.location.href = "./app.html";
}

// ★ 開いた時点で問題一式（画像含む）を読み込んでおき、出題時の表示待ちを防ぐ
async function loadProblems() {
  const snapshot = await db
    .collection("ProblemPosting")
    .doc("books")
    .collection("data")
    .doc(bookId)
    .collection("problems")
    .orderBy("no")
    .get();

  problemsData = snapshot.docs.map(doc => {
    const data = doc.data();
    return [
      data.problem || "",
      data.choices || [],
      data.answer || [],
      data.explanation || "",
      data.imageUrl || "",
      data.answerType || "single",
      !!data.shuffleChoices,
      data.modelAnswer || "",
      data.gradingCriteria || ""
    ];
  });
}

function preloadProblemImages() {
  const urls = problemsData.map(problem => problem[4]).filter(Boolean);
  if (urls.length === 0) return Promise.resolve();

  return Promise.all(
    urls.map(
      url =>
        new Promise(resolve => {
          const img = new Image();
          img.onload = resolve;
          img.onerror = resolve; // 画像取得に失敗しても全体の読み込みは止めない
          img.src = url;
          setTimeout(resolve, 8000);
        })
    )
  );
}

function attachSessionListener() {
  sessionRef = rtdb.ref(`liveSessions/${bookId}`);
  sessionRef.on(
    "value",
    snap => {
      sessionData = snap.val();
      loadingOverlay.classList.add("hidden");
      if (!sessionData) {
        showCancelledMessage("セッション情報が見つかりません", "主催者側で募集がリセットされた可能性があります。");
        setPhase(phaseCancelled);
        return;
      }
      render();
    },
    error => {
      console.error("セッション情報の取得に失敗しました:", error);
      loadingOverlay.classList.add("hidden");
      alert("セッション情報の取得に失敗しました。権限設定をご確認ください。\n" + error.message);
    }
  );
}

function showCancelledMessage(title, hint) {
  const cancelledTitle = document.querySelector("#phase-cancelled .live-phase-title");
  const cancelledHint = document.querySelector("#phase-cancelled .waiting-result-hint");
  if (cancelledTitle) cancelledTitle.textContent = title;
  if (cancelledHint) cancelledHint.textContent = hint;
}

function setPhase(phase) {
  [phaseWaiting, phaseCountdown, phaseQuestion, phaseWaitingResult, phaseGrading, phaseResults, phaseFinished, phaseCancelled].forEach(
    el => el.classList.add("hidden")
  );
  phase.classList.remove("hidden");
}

function render() {
  const status = sessionData.status;

  if (status === "waiting") {
    setPhase(phaseWaiting);
    renderWaitingPhase();
  } else if (status === "countdown") {
    setPhase(phaseCountdown);
    runLocalCountdownIfNeeded();
  } else if (status === "question") {
    const index = sessionData.currentQuestionIndex;
    const myAnswer = sessionData.answers && sessionData.answers[index] && sessionData.answers[index][myUserId];
    if (myAnswer) {
      setPhase(phaseWaitingResult);
    } else {
      setPhase(phaseQuestion);
      renderQuestionPhase();
    }
  } else if (status === "grading") {
    setPhase(phaseGrading);
  } else if (status === "results") {
    setPhase(phaseResults);
    renderResultsPhase();
  } else if (status === "finished") {
    setPhase(phaseFinished);
    renderFinishedPhase();
  } else if (status === "cancelled") {
    setPhase(phaseCancelled);
  }
}

function renderWaitingPhase() {
  const participants = sessionData.participants || {};
  waitingCommentText.textContent = sessionData.recruitComment || "";
  waitingParticipantsList.innerHTML = "";
  Object.values(participants).forEach(p => {
    const chip = document.createElement("span");
    chip.classList.add("participant-chip");
    chip.textContent = p.name || "";
    waitingParticipantsList.appendChild(chip);
  });
}

let countdownRunning = false;
function runLocalCountdownIfNeeded() {
  if (countdownRunning) return;
  countdownRunning = true;
  let count = 3;
  showCountdownNumber(count);
  const interval = setInterval(() => {
    count -= 1;
    if (count <= 0) {
      clearInterval(interval);
      countdownRunning = false;
    } else {
      showCountdownNumber(count);
    }
  }, 1000);
}

// ★ クラスを一度外して付け直すことで、切り替わるたびにポップイン(最大サイズ)から演出をやり直す
function showCountdownNumber(count) {
  countdownNumberEl.textContent = count;
  countdownNumberEl.classList.remove("pop");
  void countdownNumberEl.offsetWidth;
  countdownNumberEl.classList.add("pop");
}

function renderQuestionPhase() {
  const index = sessionData.currentQuestionIndex;
  const problem = problemsData[index];
  if (!problem) return;

  if (currentDisplayedIndex !== index) {
    currentDisplayedIndex = index;
    selectedIndices = [];
    textAnswerInput.value = "";
    descriptiveAnswerInput.value = "";
    choicesArea.innerHTML = "";
  }

  questionIndexText.textContent = `第 ${index + 1} 問 / ${problemsData.length || sessionData.totalQuestions || "?"} 問`;
  questionText.textContent = problem[0];

  const imageUrl = problem[4];
  if (imageUrl) {
    questionImage.src = imageUrl;
    questionImage.classList.remove("hidden");
  } else {
    questionImage.classList.add("hidden");
  }

  const answerType = problem[5];
  const isText = answerType === "text";
  const isDescriptive = answerType === "descriptive";
  const isSingle = answerType === "single";

  choicesArea.classList.toggle("hidden", isText || isDescriptive);
  textAnswerInput.classList.toggle("hidden", !isText);
  descriptiveAnswerInput.classList.toggle("hidden", !isDescriptive);
  answerTypeText.textContent = isText ? "単語記述" : isDescriptive ? "記述" : isSingle ? "単数選択" : "複数選択";

  if (!isText && !isDescriptive && choicesArea.childElementCount === 0) {
    const choices = problem[1] || [];
    currentChoiceOrder = choices.map((_, i) => i);
    if (problem[6]) currentChoiceOrder = shuffleArray(currentChoiceOrder);

    currentChoiceOrder.forEach(i => {
      const button = document.createElement("button");
      button.textContent = choices[i];
      button.dataset.index = i;
      button.addEventListener("click", () => {
        if (isSingle) {
          Array.from(choicesArea.children).forEach(b => b.classList.remove("active"));
          button.classList.add("active");
          selectedIndices = [i];
        } else {
          button.classList.toggle("active");
          const idx = selectedIndices.indexOf(i);
          if (button.classList.contains("active") && idx === -1) selectedIndices.push(i);
          if (!button.classList.contains("active") && idx !== -1) selectedIndices.splice(idx, 1);
        }
        updateSubmitButtonState();
      });
      choicesArea.appendChild(button);
    });
  }

  updateSubmitButtonState();
  updateQuestionTimerDisplay();

  clearInterval(timerRefreshHandle);
  timerRefreshHandle = setInterval(() => {
    if (sessionData && sessionData.status === "question") {
      updateQuestionTimerDisplay();
    } else {
      clearInterval(timerRefreshHandle);
    }
  }, 250);
}

function updateQuestionTimerDisplay() {
  const timeLimit = sessionData.timeLimitSeconds || 0;
  if (timeLimit <= 0) {
    questionTimerText.textContent = "無制限";
    questionTimerBar.style.width = "100%";
    return;
  }
  const startedAt = sessionData.questionStartedAt || now();
  const elapsedSec = (now() - startedAt) / 1000;
  const remainingSec = Math.max(0, Math.ceil(timeLimit - elapsedSec));
  questionTimerText.textContent = `残り ${remainingSec} 秒`;
  const ratio = Math.max(0, Math.min(1, (timeLimit - elapsedSec) / timeLimit));
  questionTimerBar.style.width = `${ratio * 100}%`;
  questionTimerBar.classList.toggle("timer-warning", ratio < 0.3);

  if (remainingSec <= 0) {
    submitAnswerButton.disabled = true;
  }
}

function updateSubmitButtonState() {
  const index = sessionData && sessionData.currentQuestionIndex;
  const problem = problemsData[index];
  if (!problem) return;
  if (sessionData.locked) {
    submitAnswerButton.disabled = true;
    return;
  }
  const answerType = problem[5];
  if (answerType === "text") {
    submitAnswerButton.disabled = textAnswerInput.value.trim() === "";
  } else if (answerType === "descriptive") {
    submitAnswerButton.disabled = descriptiveAnswerInput.value.trim() === "";
  } else {
    submitAnswerButton.disabled = selectedIndices.length === 0;
  }
}

function shuffleArray(array) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function submitAnswer() {
  const index = sessionData.currentQuestionIndex;
  const problem = problemsData[index];
  const answerType = problem[5];
  let raw;
  if (answerType === "text") {
    raw = textAnswerInput.value.trim();
  } else if (answerType === "descriptive") {
    raw = descriptiveAnswerInput.value.trim();
  } else {
    raw = selectedIndices;
  }

  submitAnswerButton.disabled = true;
  try {
    await rtdb.ref(`liveSessions/${bookId}/answers/${index}/${myUserId}`).set({
      raw,
      submittedAt: firebase.database.ServerValue.TIMESTAMP,
      graded: false
    });
  } catch (error) {
    console.error(error);
    alert("解答の送信に失敗しました。");
    submitAnswerButton.disabled = false;
  }
}

function renderResultsPhase() {
  const index = sessionData.currentQuestionIndex;
  const answerKey = sessionData.currentAnswerKey || {};
  const myAnswer = (sessionData.answers && sessionData.answers[index] && sessionData.answers[index][myUserId]) || null;

  resultCorrectArea.innerHTML = "";
  const label = document.createElement("p");
  label.classList.add("results-answer-label");
  label.textContent = "正解";
  resultCorrectArea.appendChild(label);
  const value = document.createElement("p");
  value.classList.add("results-answer-value");
  value.textContent = answerKey.answerText || "";
  resultCorrectArea.appendChild(value);
  if (answerKey.explanation) {
    const exp = document.createElement("p");
    exp.classList.add("results-explanation");
    exp.textContent = answerKey.explanation;
    resultCorrectArea.appendChild(exp);
  }

  if (myAnswer && myAnswer.graded) {
    resultWaitingHint.classList.add("hidden");
    resultMyScoreText.classList.remove("hidden");
    resultMyScoreText.textContent = myAnswer.correct
      ? `正解！ +${myAnswer.score} 点`
      : `不正解... +${myAnswer.score} 点`;
    resultMyScoreText.classList.toggle("correct-text", !!myAnswer.correct);
    resultMyScoreText.classList.toggle("incorrect-text", !myAnswer.correct);
  } else if (!myAnswer) {
    resultWaitingHint.classList.add("hidden");
    resultMyScoreText.classList.remove("hidden");
    resultMyScoreText.textContent = "未回答でした (+0 点)";
    resultMyScoreText.classList.remove("correct-text");
    resultMyScoreText.classList.add("incorrect-text");
  } else {
    resultMyScoreText.classList.add("hidden");
    resultWaitingHint.classList.remove("hidden");
  }

  renderLeaderboard(resultLeaderboardArea);
}

function renderFinishedPhase() {
  renderLeaderboard(finishedLeaderboardArea, true);
  const totalScores = sessionData.totalScores || {};
  const participants = sessionData.participants || {};
  const ranking = Object.keys(participants)
    .map(uid => ({ uid, score: totalScores[uid] || 0 }))
    .sort((a, b) => b.score - a.score);
  const myRank = ranking.findIndex(r => r.uid === myUserId) + 1;
  finishedMyRankText.textContent = myRank > 0 ? `あなたの順位: ${myRank} 位 (${totalScores[myUserId] || 0} 点)` : "";
}

function renderLeaderboard(container, isFinal) {
  const totalScores = sessionData.totalScores || {};
  const participants = sessionData.participants || {};
  const ranking = Object.keys(participants)
    .map(uid => ({ uid, name: (participants[uid] && participants[uid].name) || uid, score: totalScores[uid] || 0 }))
    .sort((a, b) => b.score - a.score);

  container.innerHTML = "";
  ranking.forEach((entry, i) => {
    const row = document.createElement("div");
    row.classList.add("leaderboard-row");
    if (entry.uid === myUserId) row.classList.add("is-me");
    if (isFinal && i < 3) row.classList.add(`rank-${i + 1}`);
    row.innerHTML = `<span class="leaderboard-rank">${i + 1}</span><span class="leaderboard-name">${escapeHtml(
      entry.name
    )}</span><span class="leaderboard-score">${entry.score}</span>`;
    container.appendChild(row);
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

async function openImpressionModal() {
  impressionInput.value = "";
  impressionInput.disabled = true;
  impressionModal.classList.remove("hidden");
  try {
    const bookSnap = await db.collection("ProblemPosting").doc("books").collection("data").doc(bookId).get();
    const impressions = (bookSnap.exists && bookSnap.data().impressions) || {};
    impressionInput.value = impressions[myUserId] || "";
  } catch (error) {
    console.error(error);
  } finally {
    impressionInput.disabled = false;
  }
}

async function saveImpression() {
  const text = impressionInput.value.trim();
  impressionSaveButton.disabled = true;
  try {
    await db
      .collection("ProblemPosting")
      .doc("books")
      .collection("data")
      .doc(bookId)
      .update({ [`impressions.${myUserId}`]: text });
    alert("感想を保存しました。");
    impressionModal.classList.add("hidden");
  } catch (error) {
    console.error(error);
    alert("感想の保存に失敗しました。");
  } finally {
    impressionSaveButton.disabled = false;
  }
}
