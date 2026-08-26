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
  LiveDialog.alert("予期しないエラーが発生しました:\n" + message);
});
window.addEventListener("unhandledrejection", event => {
  const reason = event.reason;
  const message = (reason && reason.message) || String(reason);
  console.error("Unhandled promise rejection:", reason);
  LiveDialog.alert("予期しないエラーが発生しました:\n" + message);
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

let phaseWaiting, phaseCountdown, phaseQuestion, phaseGrading, phaseResults, phaseFinished, phaseCancelled, phaseSessionEnded;

let waitingParticipantsList, waitingCommentText, leaveWaitingButton;
let countdownNumberEl;
let questionIndexText, questionTimerText, questionTimerBar, answerTypeText, questionText, questionImage,
  choicesArea, textAnswerInput, descriptiveAnswerInput, submitAnswerButton, submittedHintText;
let resultMyScoreText, resultCorrectArea, resultLeaderboardArea, resultWaitingHint;
let finishedMyRankText, finishedLeaderboardArea, finishedButtonsArea, writeImpressionButton, finishedHomeButton;

let impressionModal, impressionModalClose, impressionInput, impressionSaveButton;
let prizeModal, prizeModalClose, prizeModalText;
let audioMuteButton;
let liveShareModal, liveShareModalClose, liveShareQr, liveShareUrl, waitingShareButton;
let bgmStarted = false;
let lastRenderedStatus = null;
let resultsRevealTimeoutHandle = null;
let answerRevealBanner, answerRevealText;

function updateAudioMuteButtonLabel() {
  audioMuteButton.innerHTML = LiveAudio.iconMarkup(LiveAudio.isMuted());
}

// ★ テーマカラーのグラデーション・角丸モジュールのQRコードを、qr-code-stylingでその場で描画する
let liveShareQrCode = null;
function openLiveShareModal(targetBookId) {
  const targetUrl = new URL(`app.html#${targetBookId}`, window.location.href).href;
  liveShareUrl.textContent = targetUrl;

  const qrOptions = {
    width: 200,
    height: 200,
    type: "svg",
    data: targetUrl,
    margin: 4,
    qrOptions: { errorCorrectionLevel: "M" },
    backgroundOptions: { color: "rgba(0,0,0,0)" },
    dotsOptions: {
      type: "rounded",
      gradient: {
        type: "linear",
        rotation: Math.PI / 4,
        colorStops: [
          { offset: 0, color: "#CE579B" },
          { offset: 1, color: "#5b6ee8" }
        ]
      }
    },
    cornersSquareOptions: {
      type: "extra-rounded",
      gradient: {
        type: "linear",
        rotation: Math.PI / 4,
        colorStops: [
          { offset: 0, color: "#CE579B" },
          { offset: 1, color: "#5b6ee8" }
        ]
      }
    },
    cornersDotOptions: { type: "dot", color: "#5b6ee8" }
  };

  if (!liveShareQrCode) {
    liveShareQrCode = new QRCodeStyling(qrOptions);
    liveShareQr.innerHTML = "";
    liveShareQrCode.append(liveShareQr);
  } else {
    liveShareQrCode.update(qrOptions);
  }

  liveShareModal.classList.remove("hidden");
}

document.addEventListener("DOMContentLoaded", () => {
  loadingOverlay = document.getElementById("loading-overlay");
  loadingStatusText = document.getElementById("loading-status-text");
  liveHeaderTitle = document.getElementById("host-title-text");

  phaseWaiting = document.getElementById("phase-waiting");
  phaseCountdown = document.getElementById("phase-countdown");
  phaseQuestion = document.getElementById("phase-question");
  phaseGrading = document.getElementById("phase-grading");
  phaseResults = document.getElementById("phase-results");
  phaseFinished = document.getElementById("phase-finished");
  phaseCancelled = document.getElementById("phase-cancelled");
  phaseSessionEnded = document.getElementById("phase-session-ended");
  answerRevealBanner = document.getElementById("answer-reveal-banner");
  answerRevealText = document.getElementById("answer-reveal-text");

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
  submittedHintText = document.getElementById("submitted-hint-text");

  resultMyScoreText = document.getElementById("result-my-score-text");
  resultCorrectArea = document.getElementById("result-correct-area");
  resultLeaderboardArea = document.getElementById("result-leaderboard-area");
  resultWaitingHint = document.getElementById("result-waiting-hint");

  finishedMyRankText = document.getElementById("finished-my-rank-text");
  finishedLeaderboardArea = document.getElementById("finished-leaderboard-area");
  finishedButtonsArea = document.getElementById("finished-buttons-area");
  writeImpressionButton = document.getElementById("write-impression-button");
  finishedHomeButton = document.getElementById("finished-home-button");

  impressionModal = document.getElementById("impression-modal");
  impressionModalClose = document.getElementById("impression-modal-close");
  impressionInput = document.getElementById("impression-input");
  impressionSaveButton = document.getElementById("impression-save-button");

  prizeModal = document.getElementById("prize-modal");
  prizeModalClose = document.getElementById("prize-modal-close");
  prizeModalText = document.getElementById("prize-modal-text");
  prizeModalClose.addEventListener("click", () => prizeModal.classList.add("hidden"));
  prizeModal.addEventListener("click", event => {
    if (event.target === prizeModal) prizeModal.classList.add("hidden");
  });

  audioMuteButton = document.getElementById("audio-mute-button");
  updateAudioMuteButtonLabel();
  audioMuteButton.addEventListener("click", () => {
    LiveAudio.toggleMuted();
    updateAudioMuteButtonLabel();
  });

  liveShareModal = document.getElementById("live-share-modal");
  liveShareModalClose = document.getElementById("live-share-modal-close");
  liveShareQr = document.getElementById("live-share-qr");
  liveShareUrl = document.getElementById("live-share-url");
  waitingShareButton = document.getElementById("waiting-share-button");
  waitingShareButton.addEventListener("click", () => openLiveShareModal(bookId));
  liveShareModalClose.addEventListener("click", () => {
    liveShareModal.classList.add("hidden");
  });

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
  document.getElementById("session-ended-home-button").addEventListener("click", () => {
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
      LiveDialog.alert("問題集が指定されていません。");
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
      LiveDialog.alert("読み込みに失敗しました。\n" + error);
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
}

async function leaveSession() {
  if (!(await LiveDialog.confirm("参加を取り消しますか？", { danger: true, okText: "取り消す" }))) return;
  try {
    await rtdb.ref(`liveSessions/${bookId}/participants/${myUserId}`).remove();
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
      LiveDialog.alert("セッション情報の取得に失敗しました。権限設定をご確認ください。\n" + error.message);
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
  [phaseWaiting, phaseCountdown, phaseQuestion, phaseGrading, phaseResults, phaseFinished, phaseCancelled, phaseSessionEnded].forEach(
    el => el.classList.add("hidden")
  );
  phaseQuestion.classList.remove("question-settled");
  phaseResults.classList.remove("show", "stacked-below");
  phase.classList.remove("hidden");
}

// ★ ③ 正解発表後も問題を消さず、少し縮めて下にどかしたまま残し、その下に結果(得点・ランキング)を表示する
function showResultsStackedBelowQuestion() {
  phaseQuestion.classList.remove("hidden");
  phaseQuestion.classList.add("question-settled");
  submittedHintText.classList.add("hidden"); // 「他の参加者を待っています」は結果が出た後は不要
  phaseResults.classList.remove("hidden");
  phaseResults.classList.add("stacked-below");
  requestAnimationFrame(() => phaseResults.classList.add("show"));
}

function render() {
  const status = sessionData.status;

  if (!bgmStarted && status !== "cancelled" && status !== "finished" && status !== "ended") {
    bgmStarted = true;
    LiveAudio.startBgm();
  }

  const statusChanged = status !== lastRenderedStatus;
  lastRenderedStatus = status;
  if (statusChanged && status !== "finished") {
    finishedRevealStarted = false;
  }
  if (statusChanged && status !== "results" && resultsRevealTimeoutHandle) {
    clearTimeout(resultsRevealTimeoutHandle);
    resultsRevealTimeoutHandle = null;
    answerRevealBanner.classList.remove("show");
    answerRevealBanner.classList.add("hidden");
  }

  if (status === "waiting") {
    setPhase(phaseWaiting);
    renderWaitingPhase();
  } else if (status === "countdown") {
    setPhase(phaseCountdown);
    runLocalCountdownIfNeeded();
  } else if (status === "question") {
    if (statusChanged) LiveAudio.playQuestionStart();
    setPhase(phaseQuestion);
    renderQuestionPhase();
  } else if (status === "grading") {
    setPhase(phaseGrading);
  } else if (status === "results") {
    if (statusChanged) {
      clearTimeout(resultsRevealTimeoutHandle);
      showAnswerRevealBanner();
      resultsRevealTimeoutHandle = setTimeout(() => {
        resultsRevealTimeoutHandle = null;
        hideAnswerRevealBanner();
        showResultsStackedBelowQuestion();
        renderResultsPhase();
      }, 1600);
    } else if (!resultsRevealTimeoutHandle) {
      showResultsStackedBelowQuestion();
      renderResultsPhase();
    }
  } else if (status === "finished") {
    setPhase(phaseFinished);
    if (statusChanged) {
      LiveAudio.stopBgm();
      bgmStarted = false;
    }
    renderFinishedPhase(statusChanged);
  } else if (status === "cancelled") {
    LiveAudio.stopBgm();
    setPhase(phaseCancelled);
  } else if (status === "ended") {
    LiveAudio.stopBgm();
    setPhase(phaseSessionEnded);
  }
}

function renderWaitingPhase() {
  const participants = sessionData.participants || {};
  const comment = (sessionData.recruitComment || "").trim();
  waitingCommentText.textContent = comment;
  waitingCommentText.classList.toggle("hidden", comment === "");
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
  LiveAudio.playCountdownTick(count === 1);
}

function myAnswerForCurrentQuestion() {
  const index = sessionData && sessionData.currentQuestionIndex;
  return sessionData && sessionData.answers && sessionData.answers[index] && sessionData.answers[index][myUserId];
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
        if (myAnswerForCurrentQuestion()) return; // 送信済みなら選択を変更させない
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

  // ★ 既に解答を送信済みなら、自分の解答内容を表示したまま読み取り専用にする
  const myAnswer = myAnswerForCurrentQuestion();
  if (myAnswer) {
    if (isText) {
      textAnswerInput.value = myAnswer.raw || "";
      textAnswerInput.disabled = true;
    } else if (isDescriptive) {
      descriptiveAnswerInput.value = myAnswer.raw || "";
      descriptiveAnswerInput.disabled = true;
    } else {
      const selected = Array.isArray(myAnswer.raw) ? myAnswer.raw : [];
      Array.from(choicesArea.children).forEach(button => {
        const i = Number(button.dataset.index);
        button.classList.toggle("active", selected.includes(i));
        button.disabled = true;
      });
    }
    submitAnswerButton.disabled = true;
    submitAnswerButton.classList.add("hidden");
    submittedHintText.classList.remove("hidden");
  } else {
    textAnswerInput.disabled = false;
    descriptiveAnswerInput.disabled = false;
    Array.from(choicesArea.children).forEach(button => (button.disabled = false));
    submitAnswerButton.classList.remove("hidden");
    submittedHintText.classList.add("hidden");
    updateSubmitButtonState();
  }

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
  if (sessionData.locked || myAnswerForCurrentQuestion()) {
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
    incrementMonthlyProblemCount();
  } catch (error) {
    console.error(error);
    LiveDialog.alert("解答の送信に失敗しました。");
    submitAnswerButton.disabled = false;
  }
}

// ★ 月ごとの解答済み問題数を加算する（通常の解答モードと同じ集計に合流させる）
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

// ★ まず問題画面の上に大きく「正解！」/「不正解...」を表示し、その後で結果画面(得点・ランキング)へ切り替える
function showAnswerRevealBanner() {
  const index = sessionData.currentQuestionIndex;
  const myAnswer = sessionData.answers && sessionData.answers[index] && sessionData.answers[index][myUserId];

  // 問題画面(選んだ答えが読み取り専用でハイライトされた状態)をそのまま裏に表示し続ける
  setPhase(phaseQuestion);
  renderQuestionPhase();

  answerRevealBanner.classList.remove("hidden");
  if (!myAnswer) {
    answerRevealText.textContent = "未回答...";
  } else if (myAnswer.correct) {
    answerRevealText.textContent = "正解！";
    LiveAudio.playCorrect();
  } else {
    answerRevealText.textContent = "不正解...";
    LiveAudio.playIncorrect();
  }

  requestAnimationFrame(() => answerRevealBanner.classList.add("show"));
}

function hideAnswerRevealBanner() {
  answerRevealBanner.classList.remove("show");
  setTimeout(() => answerRevealBanner.classList.add("hidden"), 300);
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

function buildRanking() {
  const totalScores = sessionData.totalScores || {};
  const participants = sessionData.participants || {};
  return Object.keys(participants)
    .map(uid => ({ uid, name: (participants[uid] && participants[uid].name) || uid, score: totalScores[uid] || 0 }))
    .filter(entry => entry.score > 0) // ★ 0点の人はランキングから除外する
    .sort((a, b) => b.score - a.score);
}

function buildLeaderboardRow(entry, rank) {
  const row = document.createElement("div");
  row.classList.add("leaderboard-row");
  row.dataset.uid = entry.uid;
  if (entry.uid === myUserId) row.classList.add("is-me");
  row.innerHTML = `<span class="leaderboard-rank">${rank}</span><span class="leaderboard-name">${escapeHtml(
    entry.name
  )}</span><span class="leaderboard-score">${entry.score}</span>`;
  return row;
}

// ★ ①ランキングが変動したら、順位の入れ替わりを滑らかにアニメーションさせる(FLIPテクニック)
function renderLeaderboard(container, isFinal) {
  const ranking = buildRanking();

  const firstRects = {};
  Array.from(container.children).forEach(row => {
    if (row.dataset.uid) firstRects[row.dataset.uid] = row.getBoundingClientRect();
  });

  container.innerHTML = "";
  ranking.forEach((entry, i) => {
    const rank = i + 1;
    const row = buildLeaderboardRow(entry, rank);
    if (isFinal && rank <= 3) row.classList.add(`rank-${rank}`);
    container.appendChild(row);
  });

  Array.from(container.children).forEach(row => {
    const first = firstRects[row.dataset.uid];
    if (!first) {
      row.classList.add("row-pop-in");
      return;
    }
    const last = row.getBoundingClientRect();
    const deltaY = first.top - last.top;
    if (Math.abs(deltaY) > 1) {
      row.style.transition = "none";
      row.style.transform = `translateY(${deltaY}px)`;
      requestAnimationFrame(() => {
        row.style.transition = "transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)";
        row.style.transform = "";
      });
    }
  });
}

// ★ ②最終結果は3位→2位→(ため)→1位の順に一つずつ演出しながら発表する。
//   自分が4位以下の場合は、順位表示欄に自分の順位を出す(トップ3の場合はポディウム内に既に表示されるので隠す)
let finishedRevealStarted = false;
let prizeModalShown = false;
const PRIZE_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 1週間 (liveHostScript.jsの付与処理と揃えてある)

function renderFinishedPhase(isFreshTransition) {
  const ranking = buildRanking();
  const myIndex = ranking.findIndex(r => r.uid === myUserId);

  if (myIndex >= 0 && myIndex < 3) {
    finishedMyRankText.classList.add("hidden");
  } else if (myIndex >= 3) {
    finishedMyRankText.textContent = `あなたの順位: ${myIndex + 1} 位 (${ranking[myIndex].score} 点)`;
    finishedMyRankText.classList.remove("hidden");
  } else {
    finishedMyRankText.classList.add("hidden");
  }

  if (finishedRevealStarted) return;
  finishedRevealStarted = true;

  finishedLeaderboardArea.innerHTML = "";
  finishedButtonsArea.classList.remove("show");
  finishedButtonsArea.classList.add("hidden");

  // ★ ②表彰台(1〜3位)は最初から場所を確保しておき、中身は隠した状態で挿入する(あとで見た目だけ変える)
  const top3 = [0, 1, 2].map(i => ranking[i] || { uid: `placeholder-rank-${i + 1}`, name: "-", score: "-" });
  const podiumRows = top3.map((entry, i) => {
    const row = buildLeaderboardRow(entry, i + 1);
    row.classList.add(`rank-${i + 1}`, "podium-reveal");
    finishedLeaderboardArea.appendChild(row);
    return row;
  });

  const rest = ranking.slice(3);
  const restFragment = document.createDocumentFragment();
  rest.forEach((entry, i) => restFragment.appendChild(buildLeaderboardRow(entry, i + 4)));
  finishedLeaderboardArea.appendChild(restFragment);

  if (isFreshTransition) {
    revealPodium(podiumRows, ranking);
  } else {
    podiumRows.forEach(row => row.classList.add("podium-reveal-active"));
    showFinishedButtons();
    maybeShowPrizeModal(ranking);
  }
}

function revealPodium(podiumRows, ranking) {
  // podiumRows[0]=1位, [1]=2位, [2]=3位 (既にDOM上には配置済み。表示だけ後から切り替える)
  const revealSeq = [2, 1, 0]; // 3位→2位→1位の順
  const delays = [500, 1300, 2900];
  revealSeq.forEach((idx, seq) => {
    const row = podiumRows[idx];
    if (!row) return;
    setTimeout(() => {
      row.classList.add("podium-reveal-active");
      if (idx === 0) {
        row.classList.add("podium-first-flourish");
        LiveAudio.playFanfare();
        setTimeout(() => {
          showFinishedButtons();
          maybeShowPrizeModal(ranking);
        }, 900);
      } else {
        LiveAudio.playReveal();
      }
    }, delays[seq]);
  });
}

function showFinishedButtons() {
  finishedButtonsArea.classList.remove("hidden");
  requestAnimationFrame(() => finishedButtonsArea.classList.add("show"));
}

// ★ スペシャルライブで自分が1位だったときだけ、景品獲得モーダルを一度だけ表示する
function maybeShowPrizeModal(ranking) {
  if (prizeModalShown) return;
  if (!sessionData.isSpecial) return;
  const winner = ranking[0];
  if (!winner || winner.uid !== myUserId) return;

  prizeModalShown = true;

  // ★ liveHostScript.js側で実際にFirestoreへ書き込む有効期限とは、host/participant間で
  //   数秒程度ズレる可能性があるが、表示上の目安としては十分な精度
  const expiresAt = new Date(now() + PRIZE_DURATION_MS);
  prizeModalText.textContent =
    `おめでとうございます！\n今日から1週間(${formatDateTime(expiresAt)}まで)、ユーザー名が虹色に発光します！`;
  prizeModal.classList.remove("hidden");
}

// ★ Dateを "YYYY/MM/DD HH:MM" 形式に整形する
function formatDateTime(date) {
  const pad = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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
    LiveDialog.alert("感想を保存しました。");
    impressionModal.classList.add("hidden");
  } catch (error) {
    console.error(error);
    LiveDialog.alert("感想の保存に失敗しました。");
  } finally {
    impressionSaveButton.disabled = false;
  }
}
