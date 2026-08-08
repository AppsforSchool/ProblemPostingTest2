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

// ★ 記述式の一括採点に使うGeminiモデル。answerScript.jsと合わせておく
const GEMINI_MODEL = "gemini-3.6-flash";
let geminiApiKeyCache = null;

const BASE_SCORE = 1000;

let myUserId = "";
let bookId = "";
let problemsData = []; // [problem, choices, answer, explanation, imageUrl, answerType, shuffleChoices, modelAnswer, gradingCriteria]
let sessionData = null;
let sessionRef = null;
let serverTimeOffset = 0;

let questionTimeoutHandle = null;
let countdownIntervalHandle = null;

let loadingOverlay;
let loadingStatusText;
let noPermissionOverlay;
let hostTitleText;

let phaseWaiting, phaseCountdown, phaseQuestion, phaseGrading, phaseResults, phaseFinished, phaseSessionMissing;

let waitingParticipantsList, waitingParticipantsCount, waitingTimeLimitSelect, startSessionButton, cancelRecruitmentButton;
let countdownNumberEl;
let questionIndexText, questionText, questionImage, questionChoicesArea, questionTimerText, questionTimerBar, questionAnsweredCount, cutoffButton;
let gradingHintText, gradingSubmissionsArea, requestAiGradingButton, gradingErrorText;
let resultsCorrectArea, resultsLeaderboardArea, nextQuestionButton;
let finishedLeaderboardArea, finishedHomeButton;
let audioMuteButton;
let bgmStarted = false;
let lastRenderedStatus = null;

function updateAudioMuteButtonLabel() {
  audioMuteButton.innerHTML = LiveAudio.iconMarkup(LiveAudio.isMuted());
}

document.addEventListener("DOMContentLoaded", () => {
  loadingOverlay = document.getElementById("loading-overlay");
  loadingStatusText = document.getElementById("loading-status-text");
  noPermissionOverlay = document.getElementById("no-permission-overlay");
  hostTitleText = document.getElementById("host-title-text");

  phaseWaiting = document.getElementById("phase-waiting");
  phaseCountdown = document.getElementById("phase-countdown");
  phaseQuestion = document.getElementById("phase-question");
  phaseGrading = document.getElementById("phase-grading");
  phaseResults = document.getElementById("phase-results");
  phaseFinished = document.getElementById("phase-finished");
  phaseSessionMissing = document.getElementById("phase-session-missing");

  waitingParticipantsList = document.getElementById("waiting-participants-list");
  waitingParticipantsCount = document.getElementById("waiting-participants-count");
  waitingTimeLimitSelect = document.getElementById("waiting-time-limit-select");
  startSessionButton = document.getElementById("start-session-button");
  cancelRecruitmentButton = document.getElementById("cancel-recruitment-button");

  countdownNumberEl = document.getElementById("countdown-number");

  questionIndexText = document.getElementById("question-index-text");
  questionText = document.getElementById("host-question-text");
  questionImage = document.getElementById("host-question-image");
  questionChoicesArea = document.getElementById("host-choices-area");
  questionTimerText = document.getElementById("question-timer-text");
  questionTimerBar = document.getElementById("question-timer-bar");
  questionAnsweredCount = document.getElementById("question-answered-count");
  cutoffButton = document.getElementById("cutoff-button");

  gradingHintText = document.getElementById("grading-hint-text");
  gradingSubmissionsArea = document.getElementById("grading-submissions-area");
  requestAiGradingButton = document.getElementById("request-ai-grading-button");
  gradingErrorText = document.getElementById("grading-error-text");

  resultsCorrectArea = document.getElementById("results-correct-area");
  resultsLeaderboardArea = document.getElementById("results-leaderboard-area");
  nextQuestionButton = document.getElementById("next-question-button");

  finishedLeaderboardArea = document.getElementById("finished-leaderboard-area");
  finishedHomeButton = document.getElementById("finished-home-button");

  startSessionButton.addEventListener("click", startSession);
  document.getElementById("reset-session-button").addEventListener("click", resetBrokenSessionAndGoHome);
  cancelRecruitmentButton.addEventListener("click", cancelRecruitment);
  cutoffButton.addEventListener("click", () => lockQuestion());
  requestAiGradingButton.addEventListener("click", requestAiGrading);
  nextQuestionButton.addEventListener("click", handleNextButton);
  finishedHomeButton.addEventListener("click", finishAndGoHome);
  document.getElementById("test-reset-session-button").addEventListener("click", resetSessionForTesting);

  audioMuteButton = document.getElementById("audio-mute-button");
  updateAudioMuteButtonLabel();
  audioMuteButton.addEventListener("click", () => {
    LiveAudio.toggleMuted();
    updateAudioMuteButtonLabel();
  });

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
      loadingStatusText.textContent = "問題集の情報を確認しています｡";
      const ok = await loadBookAndVerifyHost();
      if (!ok) {
        loadingOverlay.classList.add("hidden");
        noPermissionOverlay.classList.remove("hidden");
        return;
      }
      loadingStatusText.textContent = "問題を読み込んでいます｡";
      await loadProblems();
      loadingStatusText.textContent = "画像を読み込んでいます｡";
      await preloadProblemImages();
      loadingStatusText.textContent = "進行状況に接続しています｡";
      attachSessionListener();
    } catch (error) {
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

async function loadBookAndVerifyHost() {
  const bookDoc = await db.collection("ProblemPosting").doc("books").collection("data").doc(bookId).get();
  if (!bookDoc.exists) return false;
  const data = bookDoc.data();
  hostTitleText.textContent = data.title || "";
  return data.madeBy === myUserId;
}

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
    const answerType = data.answerType || "single";
    return [
      data.problem || "",
      data.choices || [],
      data.answer || [],
      data.explanation || "",
      data.imageUrl || "",
      answerType,
      !!data.shuffleChoices,
      data.modelAnswer || "",
      data.gradingCriteria || ""
    ];
  });
}

// ★ 問題の画像をあらかじめブラウザにキャッシュさせておく（出題時の表示待ちを防ぐ）
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
          // 念のためのタイムアウト（回線が遅い場合などに読み込みを止めない）
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
        setPhase(phaseSessionMissing);
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

function setPhase(phase) {
  [phaseWaiting, phaseCountdown, phaseQuestion, phaseGrading, phaseResults, phaseFinished, phaseSessionMissing].forEach(
    el => el.classList.add("hidden")
  );
  phase.classList.remove("hidden");
}

function resetBrokenSessionAndGoHome() {
  // ★ 募集状態はFirestoreではなくRTDBのliveSessionsのみで管理しているため、
  //   セッションが無い(壊れている)場合は特に何も消さずホームへ戻ればよい
  window.location.href = "./app.html";
}

function render() {
  const status = sessionData.status;
  const participants = sessionData.participants || {};
  const participantIds = Object.keys(participants);

  if (!bgmStarted && status !== "cancelled" && status !== "finished") {
    bgmStarted = true;
    LiveAudio.startBgm();
  }

  const statusChanged = status !== lastRenderedStatus;
  lastRenderedStatus = status;
  if (statusChanged && status !== "finished") {
    finishedRevealStarted = false;
  }

  if (status === "waiting") {
    setPhase(phaseWaiting);
    waitingParticipantsCount.textContent = participantIds.length;
    if (document.activeElement !== waitingTimeLimitSelect) {
      waitingTimeLimitSelect.value = String(sessionData.timeLimitSeconds || 0);
    }
    waitingParticipantsList.innerHTML = "";
    participantIds.forEach(uid => {
      const chip = document.createElement("span");
      chip.classList.add("participant-chip");
      chip.textContent = participants[uid].name || uid;
      waitingParticipantsList.appendChild(chip);
    });
  } else if (status === "countdown") {
    setPhase(phaseCountdown);
    // カウントダウン表示自体はstartSession側のローカルタイマーで駆動
  } else if (status === "question") {
    setPhase(phaseQuestion);
    if (statusChanged) LiveAudio.playQuestionStart();
    renderQuestionPhase();
  } else if (status === "grading") {
    setPhase(phaseGrading);
    renderGradingPhase();
  } else if (status === "results") {
    setPhase(phaseResults);
    if (statusChanged) LiveAudio.playReveal();
    renderResultsPhase();
  } else if (status === "finished") {
    setPhase(phaseFinished);
    if (statusChanged) {
      LiveAudio.stopBgm();
      bgmStarted = false;
    }
    renderFinishedPhase(statusChanged);
  } else if (status === "cancelled") {
    LiveAudio.stopBgm();
    window.location.href = "./app.html";
  }
}

function renderQuestionPhase() {
  const index = sessionData.currentQuestionIndex;
  const problem = problemsData[index];
  if (!problem) return;

  questionIndexText.textContent = `第 ${index + 1} 問 / ${problemsData.length} 問`;
  questionText.textContent = problem[0];

  if (problem[4]) {
    questionImage.src = problem[4];
    questionImage.classList.remove("hidden");
  } else {
    questionImage.classList.add("hidden");
  }

  const answerType = problem[5];
  questionChoicesArea.innerHTML = "";
  if (answerType === "text") {
    const correct = problem[2];
    const p = document.createElement("p");
    p.classList.add("host-answer-key-text");
    p.textContent = `正解: ${correct.join(" / ")}`;
    questionChoicesArea.appendChild(p);
  } else if (answerType === "descriptive") {
    const p = document.createElement("p");
    p.classList.add("host-answer-key-text");
    p.textContent = `模範解答: ${problem[7]}`;
    questionChoicesArea.appendChild(p);
  } else {
    const choices = problem[1];
    const correctIndices = problem[2];
    choices.forEach((choiceText, i) => {
      const div = document.createElement("div");
      div.classList.add("host-choice-item");
      if (correctIndices.includes(i)) div.classList.add("correct");
      div.textContent = choiceText;
      questionChoicesArea.appendChild(div);
    });
  }

  const answers = (sessionData.answers && sessionData.answers[index]) || {};
  const participants = sessionData.participants || {};
  const answeredCount = Object.keys(answers).length;
  const totalCount = Object.keys(participants).length;
  questionAnsweredCount.textContent = `解答済み: ${answeredCount} / ${totalCount} 人`;

  const locked = !!sessionData.locked;
  cutoffButton.disabled = locked;
  cutoffButton.textContent = locked ? "締め切り済み" : "この問題の受付を締め切る";

  updateQuestionTimerDisplay();
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
}

function renderGradingPhase() {
  const index = sessionData.currentQuestionIndex;
  const problem = problemsData[index];
  gradingErrorText.classList.add("hidden");
  requestAiGradingButton.disabled = false;
  requestAiGradingButton.textContent = "AIに一括採点を依頼";

  const answers = (sessionData.answers && sessionData.answers[index]) || {};
  const participants = sessionData.participants || {};
  const entries = Object.entries(answers);

  gradingHintText.textContent = `${entries.length} 件の記述解答があります。まとめてAIに採点を依頼できます。`;
  gradingSubmissionsArea.innerHTML = "";
  entries.forEach(([uid, ans]) => {
    const row = document.createElement("div");
    row.classList.add("grading-submission-row");
    const name = (participants[uid] && participants[uid].name) || uid;
    row.innerHTML = `<span class="grading-submission-name">${escapeHtml(name)}</span><span class="grading-submission-text">${escapeHtml(
      ans.raw || ""
    )}</span>`;
    gradingSubmissionsArea.appendChild(row);
  });
}

function renderResultsPhase() {
  const index = sessionData.currentQuestionIndex;
  const answerKey = sessionData.currentAnswerKey || {};
  resultsCorrectArea.innerHTML = "";

  const label = document.createElement("p");
  label.classList.add("results-answer-label");
  label.textContent = "正解";
  resultsCorrectArea.appendChild(label);
  const value = document.createElement("p");
  value.classList.add("results-answer-value");
  value.textContent = answerKey.answerText || "";
  resultsCorrectArea.appendChild(value);
  if (answerKey.explanation) {
    const exp = document.createElement("p");
    exp.classList.add("results-explanation");
    exp.textContent = answerKey.explanation;
    resultsCorrectArea.appendChild(exp);
  }

  renderLeaderboard(resultsLeaderboardArea);

  const isLast = index >= problemsData.length - 1;
  nextQuestionButton.textContent = isLast ? "結果発表を見る" : "次の問題へ";
}

function buildRanking() {
  const totalScores = sessionData.totalScores || {};
  const participants = sessionData.participants || {};
  return Object.keys(participants)
    .map(uid => ({ uid, name: (participants[uid] && participants[uid].name) || uid, score: totalScores[uid] || 0 }))
    .sort((a, b) => b.score - a.score);
}

function buildLeaderboardRow(entry, rank) {
  const row = document.createElement("div");
  row.classList.add("leaderboard-row");
  row.dataset.uid = entry.uid;
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

// ★ ②最終結果は3位→2位→(ため)→1位の順に一つずつ演出しながら発表する。4位以下は即表示
let finishedRevealStarted = false;

function renderFinishedPhase(isFreshTransition) {
  if (finishedRevealStarted) return;
  finishedRevealStarted = true;

  const ranking = buildRanking();
  finishedLeaderboardArea.innerHTML = "";

  const rest = ranking.slice(3);
  const restFragment = document.createDocumentFragment();
  rest.forEach((entry, i) => restFragment.appendChild(buildLeaderboardRow(entry, i + 4)));
  finishedLeaderboardArea.appendChild(restFragment);

  const top3 = ranking.slice(0, 3);
  if (top3.length === 0) return;

  if (isFreshTransition) {
    revealPodium(top3);
  } else {
    for (let i = top3.length - 1; i >= 0; i--) {
      const row = buildLeaderboardRow(top3[i], i + 1);
      row.classList.add(`rank-${i + 1}`);
      finishedLeaderboardArea.prepend(row);
    }
  }
}

function revealPodium(top3) {
  const revealOrder = [2, 1, 0]; // top3内のindex: 3位→2位→1位の順
  const delays = [500, 1300, 2900];
  revealOrder.forEach((idx, seq) => {
    const entry = top3[idx];
    if (!entry) return;
    setTimeout(() => {
      const rank = idx + 1;
      const row = buildLeaderboardRow(entry, rank);
      row.classList.add(`rank-${rank}`, "podium-reveal");
      finishedLeaderboardArea.prepend(row);
      requestAnimationFrame(() => row.classList.add("podium-reveal-active"));
      if (rank === 1) {
        row.classList.add("podium-first-flourish");
        LiveAudio.playFanfare();
      } else {
        LiveAudio.playReveal();
      }
    }, delays[seq]);
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ================= セッション進行 =================

async function startSession() {
  startSessionButton.disabled = true;
  try {
    const timeLimitSeconds = Number(waitingTimeLimitSelect.value) || 0;
    await sessionRef.update({
      status: "countdown",
      timeLimitSeconds,
      currentQuestionIndex: 0,
      countdownStartedAt: firebase.database.ServerValue.TIMESTAMP
    });
    runLocalCountdown(() => beginQuestion(0));
  } catch (error) {
    console.error(error);
    alert("開始に失敗しました。");
    startSessionButton.disabled = false;
  }
}

function runLocalCountdown(onDone) {
  let count = 3;
  showCountdownNumber(count);
  clearInterval(countdownIntervalHandle);
  countdownIntervalHandle = setInterval(() => {
    count -= 1;
    if (count <= 0) {
      clearInterval(countdownIntervalHandle);
      onDone();
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

async function beginQuestion(index) {
  const problem = problemsData[index];
  if (!problem) return;

  const currentQuestion = {
    index,
    problem: problem[0],
    imageUrl: problem[4] || "",
    answerType: problem[5],
    choices: problem[5] === "single" || problem[5] === "multiple" ? problem[1] : null,
    shuffleChoices: problem[6]
  };

  await sessionRef.update({
    status: "question",
    currentQuestionIndex: index,
    currentQuestion,
    currentAnswerKey: null,
    questionStartedAt: firebase.database.ServerValue.TIMESTAMP,
    locked: false
  });

  clearTimeout(questionTimeoutHandle);
  const timeLimit = sessionData.timeLimitSeconds || 0;
  if (timeLimit > 0) {
    questionTimeoutHandle = setTimeout(() => lockQuestion(), timeLimit * 1000 + 400);
  }

  startTimerRefreshLoop();
}

let timerRefreshHandle = null;
function startTimerRefreshLoop() {
  clearInterval(timerRefreshHandle);
  timerRefreshHandle = setInterval(() => {
    if (sessionData && sessionData.status === "question") {
      updateQuestionTimerDisplay();
    } else {
      clearInterval(timerRefreshHandle);
    }
  }, 250);
}

async function lockQuestion() {
  if (!sessionData || sessionData.status !== "question" || sessionData.locked) return;
  clearTimeout(questionTimeoutHandle);
  LiveAudio.playLock();
  await sessionRef.update({ locked: true });

  const index = sessionData.currentQuestionIndex;
  const answerType = problemsData[index][5];
  if (answerType === "descriptive") {
    await sessionRef.update({ status: "grading" });
  } else {
    await autoGradeAndShowResults(index);
  }
}

// ★ correctFraction(0〜1)と回答時刻から、スピードボーナス込みのスコアを算出する
function computeScore(correctFraction, submittedAt, questionStartedAt, timeLimitSeconds) {
  if (correctFraction <= 0) return 0;
  if (!timeLimitSeconds) return Math.round(BASE_SCORE * correctFraction);
  const elapsedSec = Math.max(0, (submittedAt - questionStartedAt) / 1000);
  const remainingFrac = Math.max(0, Math.min(1, 1 - elapsedSec / timeLimitSeconds));
  return Math.round(BASE_SCORE * correctFraction * (0.5 + 0.5 * remainingFrac));
}

async function autoGradeAndShowResults(index) {
  const problem = problemsData[index];
  const answerType = problem[5];
  const timeLimitSeconds = sessionData.timeLimitSeconds || 0;
  const questionStartedAt = sessionData.questionStartedAt || 0;

  const answersSnap = await rtdb.ref(`liveSessions/${bookId}/answers/${index}`).get();
  const answers = answersSnap.exists() ? answersSnap.val() : {};

  const totalScoresSnap = await rtdb.ref(`liveSessions/${bookId}/totalScores`).get();
  const totalScores = totalScoresSnap.exists() ? totalScoresSnap.val() : {};

  const updates = {};
  let answerText = "";
  if (answerType === "text") {
    answerText = problem[2].join(" / ");
  } else {
    answerText = problem[1].filter((_, i) => problem[2].includes(i)).join(" / ");
  }

  Object.entries(answers).forEach(([uid, ans]) => {
    let correctFraction = 0;
    if (answerType === "text") {
      correctFraction = problem[2].includes((ans.raw || "").trim()) ? 1 : 0;
    } else {
      const selected = Array.isArray(ans.raw) ? ans.raw : [];
      const correctIndices = problem[2];
      correctFraction = isSameIndexSet(selected, correctIndices) ? 1 : 0;
    }
    const score = computeScore(correctFraction, ans.submittedAt || 0, questionStartedAt, timeLimitSeconds);
    updates[`answers/${index}/${uid}/correct`] = correctFraction >= 1;
    updates[`answers/${index}/${uid}/score`] = score;
    updates[`answers/${index}/${uid}/graded`] = true;
    totalScores[uid] = (totalScores[uid] || 0) + score;
  });

  updates["totalScores"] = totalScores;
  updates["currentAnswerKey"] = { answerText, explanation: problem[3] || "" };
  updates["status"] = "results";

  await rtdb.ref(`liveSessions/${bookId}`).update(updates);
}

function isSameIndexSet(a, b) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  return sortedA.every((value, i) => value === sortedB[i]);
}

async function requestAiGrading() {
  requestAiGradingButton.disabled = true;
  requestAiGradingButton.textContent = "採点中...";
  gradingErrorText.classList.add("hidden");

  const index = sessionData.currentQuestionIndex;
  const problem = problemsData[index];

  try {
    const answersSnap = await rtdb.ref(`liveSessions/${bookId}/answers/${index}`).get();
    const answers = answersSnap.exists() ? answersSnap.val() : {};
    const entries = Object.entries(answers);

    if (entries.length === 0) {
      await finalizeDescriptiveGrading(index, problem, {});
      return;
    }

    const results = await gradeDescriptiveBatch({
      problem: problem[0],
      modelAnswer: problem[7],
      gradingCriteria: problem[8],
      imageUrl: problem[4],
      submissions: entries.map(([uid, ans]) => ({ userId: uid, text: ans.raw || "" }))
    });

    const scoreMap = {};
    results.forEach(r => {
      scoreMap[r.userId] = { score: r.score, reason: r.reason };
    });

    await finalizeDescriptiveGrading(index, problem, scoreMap);
  } catch (error) {
    console.error(error);
    gradingErrorText.textContent = "採点でエラーが発生しました。もう一度試してください。\n" + (error.message || error);
    gradingErrorText.classList.remove("hidden");
    requestAiGradingButton.disabled = false;
    requestAiGradingButton.textContent = "AIに一括採点を依頼";
  }
}

async function finalizeDescriptiveGrading(index, problem, scoreMap) {
  const timeLimitSeconds = sessionData.timeLimitSeconds || 0;
  const questionStartedAt = sessionData.questionStartedAt || 0;

  const answersSnap = await rtdb.ref(`liveSessions/${bookId}/answers/${index}`).get();
  const answers = answersSnap.exists() ? answersSnap.val() : {};

  const totalScoresSnap = await rtdb.ref(`liveSessions/${bookId}/totalScores`).get();
  const totalScores = totalScoresSnap.exists() ? totalScoresSnap.val() : {};

  const updates = {};
  Object.entries(answers).forEach(([uid, ans]) => {
    const aiResult = scoreMap[uid] || { score: 0, reason: "" };
    const correctFraction = Math.max(0, Math.min(10, aiResult.score)) / 10;
    const score = computeScore(correctFraction, ans.submittedAt || 0, questionStartedAt, timeLimitSeconds);
    updates[`answers/${index}/${uid}/correct`] = correctFraction >= 0.6;
    updates[`answers/${index}/${uid}/score`] = score;
    updates[`answers/${index}/${uid}/graded`] = true;
    updates[`answers/${index}/${uid}/aiScore`] = aiResult.score;
    updates[`answers/${index}/${uid}/aiReason`] = aiResult.reason;
    totalScores[uid] = (totalScores[uid] || 0) + score;
  });

  updates["totalScores"] = totalScores;
  updates["currentAnswerKey"] = { answerText: problem[7], explanation: problem[3] || "" };
  updates["status"] = "results";

  await rtdb.ref(`liveSessions/${bookId}`).update(updates);
}

async function getGeminiApiKey() {
  if (geminiApiKeyCache) return geminiApiKeyCache;
  const keyDoc = await db.collection("system_keys").doc("gemini").get();
  const apiKey = keyDoc.exists ? keyDoc.data().apiKey : null;
  if (!apiKey) throw new Error("Gemini APIキーが設定されていません。（system_keys/gemini の apiKey）");
  geminiApiKeyCache = apiKey;
  return geminiApiKeyCache;
}

async function fetchImageAsBase64(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`問題画像の取得に失敗しました: ${response.status}`);
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

// ★ 記述式の解答をまとめて1回のGeminiリクエストで採点する（主催者が「一括採点」を押したときに実行）
async function gradeDescriptiveBatch({ problem, modelAnswer, gradingCriteria, imageUrl, submissions }) {
  const apiKey = await getGeminiApiKey();

  const promptLines = [
    "あなたは採点者です。以下の問題・模範解答・採点基準をもとに、複数の生徒の解答をそれぞれ10点満点で採点してください。",
    "",
    `【問題文】\n${problem}`,
    "",
    `【模範解答】\n${modelAnswer}`
  ];
  if (gradingCriteria) promptLines.push("", `【採点基準】\n${gradingCriteria}`);
  if (imageUrl) promptLines.push("", "※ 問題にはこのあとに続く画像が添付されています。採点の際は画像の内容も踏まえてください。");

  promptLines.push("", "【生徒ごとの解答】");
  submissions.forEach(s => {
    promptLines.push(`userId: ${s.userId}\n解答: ${s.text}`);
  });
  promptLines.push(
    "",
    "各生徒について、userId・0〜10の整数のscore・生徒に向けた日本語の簡潔な評価理由reasonを配列で返してください。全員分を必ず含めてください。"
  );

  const parts = [{ text: promptLines.join("\n") }];
  if (imageUrl) {
    try {
      const { mimeType, base64 } = await fetchImageAsBase64(imageUrl);
      parts.push({ inlineData: { mimeType, data: base64 } });
    } catch (error) {
      console.error("問題画像の取得に失敗しました:", error);
    }
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "array",
            items: {
              type: "object",
              properties: {
                userId: { type: "string" },
                score: { type: "integer" },
                reason: { type: "string" }
              },
              required: ["userId", "score", "reason"]
            }
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
  const resultText =
    data &&
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text;
  if (!resultText) throw new Error("Gemini APIから採点結果が得られませんでした。");

  const parsed = JSON.parse(resultText);
  if (!Array.isArray(parsed)) throw new Error("採点結果の形式が不正です。");

  return parsed.map(item => ({
    userId: String(item.userId),
    score: Math.max(0, Math.min(10, Math.round(Number(item.score) || 0))),
    reason: String(item.reason || "")
  }));
}

function handleNextButton() {
  const index = sessionData.currentQuestionIndex;
  const isLast = index >= problemsData.length - 1;
  if (isLast) {
    // ★ status を "finished" にした時点で、募集中の判定(appScript.js側)は自動的に外れる
    sessionRef.update({ status: "finished" });
  } else {
    nextQuestionButton.disabled = true;
    beginQuestion(index + 1).finally(() => {
      nextQuestionButton.disabled = false;
    });
  }
}

async function cancelRecruitment() {
  if (!confirm("募集を打ち切りますか？参加者は待機画面から締め出されます。")) return;
  cancelRecruitmentButton.disabled = true;
  try {
    await sessionRef.update({ status: "cancelled" });
    window.location.href = "./app.html";
  } catch (error) {
    console.error(error);
    alert("募集の打ち切りに失敗しました。");
    cancelRecruitmentButton.disabled = false;
  }
}

function finishAndGoHome() {
  window.location.href = "./app.html";
}

// ★ テスト用: RTDBのセッションだけを初期状態に戻して同じ問題集をもう一度最初から解けるようにする
//   (募集状態はもともとFirestoreではなくRTDBのstatusだけで判定しているので、他には何も触れない)
async function resetSessionForTesting() {
  if (!confirm("募集状態はそのままで、セッション（参加者・回答・スコア）だけリセットして最初からやり直しますか？")) return;
  try {
    await sessionRef.set({
      hostUserId: myUserId,
      status: "waiting",
      timeLimitSeconds: sessionData.timeLimitSeconds || 10,
      totalQuestions: problemsData.length,
      recruitComment: sessionData.recruitComment || "",
      currentQuestionIndex: -1,
      currentQuestion: null,
      currentAnswerKey: null,
      locked: false,
      participants: {},
      answers: {},
      totalScores: {},
      createdAt: firebase.database.ServerValue.TIMESTAMP
    });
  } catch (error) {
    console.error("セッションのリセットに失敗しました:", error);
    alert("セッションのリセットに失敗しました。");
  }
}
