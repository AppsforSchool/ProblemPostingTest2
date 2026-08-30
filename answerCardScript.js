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

let myUid = "";
let myUserId = "";
let currentDeckId = "";

let cardsData = [];
let currentCardIndex = 0;
let isTransitioning = false; // ★ カード切替アニメーション中は多重操作を防ぐ

let loadingOverlay;
let myIsAdmin = false;
let drawerOverlay;
let accountSettingsDrawer;
let drawerCloseButton;
let accountSettingsButton;
let drawerUserId;
let drawerLogoutButton;
let homeButton;

let cardContainer;
let cardFinishedArea;
let flipCardContainerEl;
let flipCardSlideEl;
let flipCardEl;
let flipCardPeekEl;
let peekCardText;
let peekCardButton;
let cardFrontText;
let cardBackText;
let showBackButton;
let nextCardButton;
let finishedHomeButton;

let writeImpressionButton;
let impressionModal;
let impressionModalClose;
let impressionInput;
let impressionSaveButton;

document.addEventListener("DOMContentLoaded", () => {
  loadingOverlay = document.getElementById("loading-overlay");
  drawerOverlay = document.getElementById("drawerOverlay");
  accountSettingsDrawer = document.getElementById("accountSettingsDrawer");
  drawerCloseButton = document.getElementById("drawerCloseButton");
  accountSettingsButton = document.getElementById("setting-button");
  drawerUserId = document.getElementById("drawerUserId");
  drawerLogoutButton = document.getElementById("logout-button");
  homeButton = document.getElementById("home-button");

  cardContainer = document.getElementById("card-container");
  cardFinishedArea = document.getElementById("card-finished-area");
  flipCardContainerEl = document.getElementById("flip-card-container");
  flipCardSlideEl = document.getElementById("flip-card-slide");
  flipCardEl = document.getElementById("flip-card");
  flipCardPeekEl = document.getElementById("flip-card-peek");
  peekCardText = document.getElementById("peek-card-text");
  peekCardButton = document.getElementById("peek-card-button");
  cardFrontText = document.getElementById("card-front-text");
  cardBackText = document.getElementById("card-back-text");
  showBackButton = document.getElementById("show-back-button");
  nextCardButton = document.getElementById("next-card-button");
  finishedHomeButton = document.getElementById("finished-home-button");

  writeImpressionButton = document.getElementById("write-impression-button");
  impressionModal = document.getElementById("impression-modal");
  impressionModalClose = document.getElementById("impression-modal-close");
  impressionInput = document.getElementById("impression-input");
  impressionSaveButton = document.getElementById("impression-save-button");

  accountSettingsButton.addEventListener("click", openDrawer);
  drawerCloseButton.addEventListener("click", closeDrawer);
  drawerOverlay.addEventListener("click", closeDrawer);
  drawerLogoutButton.addEventListener("click", handleLogout);

  homeButton.addEventListener("click", () => {
    if (confirm("本当にやめますか？")) {
      window.location.href = "./app.html#cards";
    }
  });
  finishedHomeButton.addEventListener("click", () => {
    window.location.href = "./app.html#cards";
  });

  showBackButton.addEventListener("click", () => {
    flipToBack();
  });
  nextCardButton.addEventListener("click", () => {
    goToNextCard();
  });
  initSwipeHandlers();

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
    const deckSnap = await db
      .collection("ProblemPosting")
      .doc("cards")
      .collection("data")
      .doc(currentDeckId)
      .get();
    const impressions = (deckSnap.exists && deckSnap.data().impressions) || {};
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
      .doc("cards")
      .collection("data")
      .doc(currentDeckId)
      .update({
        [`impressions.${myUserId}`]: text
      });
    alert("感想を保存しました。");
    impressionModal.classList.add("hidden");
  } catch (error) {
    console.error("感想の保存エラー:", error);
    alert("感想の保存に失敗しました。\n" + error);
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

      const userSnapshot = await db.collection("users_random").doc(myUserId).get();
      const userData = userSnapshot.data();
      myUid = userData.uid;
      myIsAdmin = !!userData.isAdmin;

      const deckId = getParmFromUrl("id");
      if (!deckId) {
        alert("暗記カードが指定されていません。");
        return;
      }
      currentDeckId = deckId;

      const ok = await loadDeck(deckId);
      if (!ok) {
        loadingOverlay.classList.add("hidden");
        document.getElementById("no-permission-overlay").classList.remove("hidden");
        return;
      }
      loadingOverlay.classList.add("hidden");
      cardContainer.classList.remove("hidden");

      showCard(0);
      updateLastChecked();
    } else {
      console.log("logout");
      window.location.href = "./index.html";
    }
  });
});

const handleLogout = async () => {
  const isConfirmed = confirm("ログアウトしますか？");
  if (isConfirmed) {
    try {
      await auth.signOut(auth);
      alert("ログアウトしました。");
      window.location.href = "./index.html";
    } catch (error) {
      console.error("ログアウトエラー:", error);
      alert("ログアウトに失敗しました。");
    }
  }
};

// ★ 最終アクセス日時の更新。優先度が低いので他の読み込みを妨げないよう、待たずに投げっぱなしにする
function updateLastChecked() {
  db.collection("users_random")
    .doc(myUserId)
    .set({ lastOpenedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
    .catch(error => console.error("最終アクセス日時の更新エラー:", error));
}

function getParmFromUrl(parm) {
  const params = new URLSearchParams(window.location.search);
  return params.get(parm);
}

// ★ Fisher-Yatesシャッフル
function shuffleArray(array) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function loadDeck(deckId) {
  try {
    const titleAreaTitle = document.getElementById("title-area-title");
    const allCardsCount = document.getElementById("all-problems-count");

    const deckRef = db.collection("ProblemPosting").doc("cards").collection("data").doc(deckId);
    const deckSnap = await deckRef.get();

    if (!deckSnap.exists) {
      alert("暗記カードが見つかりません。");
      return;
    }

    const deckData = deckSnap.data();

    // ★ 非公開の暗記カードは、作成者本人か管理者以外はIDを知っていても解けないようにする
    const isPrivate = !!deckData.isPrivate;
    const madeBy = deckData.madeBy;
    if (isPrivate && madeBy !== myUserId && !myIsAdmin) {
      return false;
    }

    titleAreaTitle.textContent = deckData.title || "";

    const rawCards = deckData.cards || [];
    const flipRequested = getParmFromUrl("flip") === "1";
    const flipAllowed = !!deckData.allowFlip;
    const shouldFlip = flipRequested && flipAllowed;

    cardsData = rawCards.map(c => {
      return shouldFlip
        ? { front: c.back, back: c.front }
        : { front: c.front, back: c.back };
    });

    // ★ 出題順のシャッフルは無条件に行う
    cardsData = shuffleArray(cardsData);

    allCardsCount.textContent = cardsData.length;
    return true;
  } catch (error) {
    console.error(error);
    alert(error);
    return false;
  }
}

function showCard(index) {
  currentCardIndex = index;

  const gaugeBar = document.getElementById("gauge-bar");
  const nowCardCount = document.getElementById("now-problem-count");

  flipCardEl.classList.remove("flipped");
  flipCardSlideEl.classList.remove("card-exit-left", "card-exit-right", "card-enter");
  hidePeek();

  gaugeBar.style.width = `${((index + 1) / cardsData.length) * 100}%`;
  nowCardCount.textContent = index + 1;

  cardFrontText.textContent = cardsData[index].front;
  cardBackText.textContent = cardsData[index].back;

  showBackButton.disabled = false;
  nextCardButton.disabled = false;
}

function isCardFlipped() {
  return flipCardEl.classList.contains("flipped");
}

// ★ 表→裏 のみ(カードの切り替えは伴わない、その場でのフリップ)
function flipToBack() {
  if (isTransitioning || isCardFlipped()) return;
  flipInPlace(true);
}
// ★ 裏→表 のみ(カードの切り替えは伴わない、その場でのフリップ)
function flipToFront() {
  if (isTransitioning || !isCardFlipped()) return;
  flipInPlace(false);
}
function flipInPlace(toBack) {
  showBackButton.disabled = true;
  nextCardButton.disabled = true;
  setTimeout(() => {
    showBackButton.disabled = false;
    nextCardButton.disabled = false;
  }, 550);
  flipCardEl.classList.toggle("flipped", toBack);
}

// ★ 覗き見レイヤー(次/前のカードを、切替アニメーション中だけ後ろにうっすら見せる)
//   ボタンも一緒に出しておくことで、「ボタンが無い/小さい」ように見えてしまうのを防ぐ(操作は不可のまま)
function showPeek(text, faceClass) {
  peekCardText.textContent = text;
  peekCardButton.textContent = faceClass === "is-front" ? "答えをみる" : "次へ";
  flipCardPeekEl.classList.remove("is-front", "is-back");
  flipCardPeekEl.classList.add(faceClass);
  flipCardPeekEl.classList.add("is-active");
}
function hidePeek() {
  flipCardPeekEl.classList.remove("is-active", "is-growing");
}

// ★ 次のカードへ(現在のカードが左へスライドして抜けていき、後ろに次のカードが現れて等倍に育つ)
function goToNextCard() {
  if (isTransitioning) return;
  const nextIndex = currentCardIndex + 1;

  isTransitioning = true;
  showBackButton.disabled = true;
  nextCardButton.disabled = true;

  if (nextIndex >= cardsData.length) {
    flipCardSlideEl.classList.add("card-exit-left");
    setTimeout(() => {
      cardContainer.classList.add("hidden");
      cardFinishedArea.classList.remove("hidden");
      recordDeckSolved();
    }, 320);
    return;
  }

  showPeek(cardsData[nextIndex].front, "is-front");
  flipCardSlideEl.classList.add("card-exit-left");
  runExitThenGrow(() => applyCardChange(nextIndex, false));
}

// ★ 前のカードへ(現在のカードが右へスライドして抜けていき、後ろに前のカードの裏面が現れて等倍に育つ)
function goToPreviousCard() {
  if (isTransitioning) return;
  const prevIndex = currentCardIndex - 1;
  if (prevIndex < 0) return; // 最初のカードより前には戻れない

  isTransitioning = true;
  showBackButton.disabled = true;
  nextCardButton.disabled = true;

  showPeek(cardsData[prevIndex].back, "is-back");
  flipCardSlideEl.classList.add("card-exit-right");
  runExitThenGrow(() => applyCardChange(prevIndex, true)); // 前のカードは「裏」の状態から再開する
}

// ★ 「今のカードが抜けていく」→「後ろのカードが等倍まで育つ」の2段階を順番に実行し、最後にonDoneを呼ぶ
function runExitThenGrow(onDone) {
  let exitFinalized = false;
  const finalizeExit = () => {
    if (exitFinalized) return;
    exitFinalized = true;
    flipCardSlideEl.removeEventListener("transitionend", onExitTransitionEnd);

    // ★ 覗いていた次/前のカードを、ここで等倍までアニメーションさせて「育てる」
    flipCardPeekEl.classList.add("is-growing");

    let growFinalized = false;
    const finalizeGrow = () => {
      if (growFinalized) return;
      growFinalized = true;
      flipCardPeekEl.removeEventListener("transitionend", onGrowTransitionEnd);
      onDone();
    };
    const onGrowTransitionEnd = (event) => {
      if (event.target !== flipCardPeekEl || event.propertyName !== "transform") return;
      finalizeGrow();
    };
    flipCardPeekEl.addEventListener("transitionend", onGrowTransitionEnd);
    // transitionendが発火しない環境に備えたフォールバック
    setTimeout(finalizeGrow, 320);
  };
  const onExitTransitionEnd = (event) => {
    if (event.target !== flipCardSlideEl || event.propertyName !== "transform") return;
    finalizeExit();
  };
  flipCardSlideEl.addEventListener("transitionend", onExitTransitionEnd);
  // transitionendが発火しない環境に備えたフォールバック
  setTimeout(finalizeExit, 420);
}

// ★ カード切替の完了処理。新しいカードの内容を反映し、位置/表裏のリセットはアニメーション無しで瞬時に行う
//   (この時点で覗き見レイヤーは既に等倍まで育っているので、表側カードとサイズが一致しており入れ替えても違和感が無い)
function applyCardChange(index, showBack) {
  currentCardIndex = index;

  const gaugeBar = document.getElementById("gauge-bar");
  const nowCardCount = document.getElementById("now-problem-count");
  gaugeBar.style.width = `${((index + 1) / cardsData.length) * 100}%`;
  nowCardCount.textContent = index + 1;

  cardFrontText.textContent = cardsData[index].front;
  cardBackText.textContent = cardsData[index].back;

  // ★ このタイミングだけtransitionを止め、位置リセットと表裏の切替を瞬時に行う(見た目には隠れているので違和感が無い)
  flipCardSlideEl.classList.add("card-enter");
  flipCardEl.classList.add("no-transition");

  flipCardSlideEl.classList.remove("card-exit-left", "card-exit-right");
  flipCardEl.classList.toggle("flipped", showBack);

  hidePeek();

  // 強制リフローを挟んでから、次のフレームでtransitionを復活させる
  void flipCardSlideEl.offsetWidth;
  requestAnimationFrame(() => {
    flipCardSlideEl.classList.remove("card-enter");
    flipCardEl.classList.remove("no-transition");
  });

  showBackButton.disabled = false;
  nextCardButton.disabled = false;
  isTransitioning = false;
}

// ★ スワイプ操作(ポインターイベントで統一し、タッチ/マウス両対応)
let swipeStartX = null;
let swipeStartY = null;
let swipeActive = false;
const SWIPE_DISTANCE_THRESHOLD = 60; // px

function initSwipeHandlers() {
  flipCardContainerEl.addEventListener("pointerdown", onSwipePointerDown);
  flipCardContainerEl.addEventListener("pointerup", onSwipePointerUp);
  flipCardContainerEl.addEventListener("pointercancel", onSwipePointerCancel);
}
function onSwipePointerDown(event) {
  if (isTransitioning) return;
  swipeStartX = event.clientX;
  swipeStartY = event.clientY;
  swipeActive = true;
}
function onSwipePointerCancel() {
  swipeActive = false;
}
function onSwipePointerUp(event) {
  if (!swipeActive) return;
  swipeActive = false;
  if (isTransitioning) return;

  const dx = event.clientX - swipeStartX;
  const dy = event.clientY - swipeStartY;
  // 横方向優位で、かつ一定距離以上動いた場合だけスワイプとして扱う(タップやボタン操作と混同しないため)
  if (Math.abs(dx) < SWIPE_DISTANCE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;

  if (dx < 0) {
    // 右から左へのスワイプ: 裏返す or 次のカードへ
    if (isCardFlipped()) {
      goToNextCard();
    } else {
      flipToBack();
    }
  } else {
    // 左から右へのスワイプ: 表に返す or 前のカードに戻る
    if (isCardFlipped()) {
      flipToFront();
    } else {
      goToPreviousCard();
    }
  }
}

function recordDeckSolved() {
  db.collection("ProblemPosting")
    .doc("cards")
    .collection("data")
    .doc(currentDeckId)
    .update({
      solvedBy: firebase.firestore.FieldValue.arrayUnion(myUserId)
    })
    .catch(error => console.error("解答済み記録エラー:", error));
}
