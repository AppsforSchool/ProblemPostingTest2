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
let flipCardEl;
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
  flipCardEl = document.getElementById("flip-card");
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
    flipCard(true);
  });
  nextCardButton.addEventListener("click", handleNextCard);

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

  gaugeBar.style.width = `${((index + 1) / cardsData.length) * 100}%`;
  nowCardCount.textContent = index + 1;

  cardFrontText.textContent = cardsData[index].front;
  cardBackText.textContent = cardsData[index].back;

  showBackButton.disabled = false;
  nextCardButton.disabled = false;
}

function flipCard(lock) {
  if (lock) {
    showBackButton.disabled = true;
    nextCardButton.disabled = true;
    setTimeout(() => {
      showBackButton.disabled = false;
      nextCardButton.disabled = false;
    }, 550);
  }
  flipCardEl.classList.toggle("flipped");
}

function handleNextCard() {
  showBackButton.disabled = true;
  nextCardButton.disabled = true;

  const nextIndex = currentCardIndex + 1;
  if (nextIndex < cardsData.length) {
    // 今は裏面が見えている状態なので、ここで表面のテキストを次のカードの内容に差し替えても見た目には影響しない
    cardFrontText.textContent = cardsData[nextIndex].front;

    // 裏→表にめくる。裏面が完全に見えなくなってから（＝表に戻り切ってから）裏面の中身を差し替える
    let finalized = false;
    const finalizeNextCard = () => {
      if (finalized) return;
      finalized = true;
      flipCardEl.removeEventListener("transitionend", onTransitionEnd);

      currentCardIndex = nextIndex;

      const gaugeBar = document.getElementById("gauge-bar");
      const nowCardCount = document.getElementById("now-problem-count");
      gaugeBar.style.width = `${((nextIndex + 1) / cardsData.length) * 100}%`;
      nowCardCount.textContent = nextIndex + 1;

      cardBackText.textContent = cardsData[nextIndex].back;

      showBackButton.disabled = false;
      nextCardButton.disabled = false;
    };

    const onTransitionEnd = (event) => {
      if (event.target !== flipCardEl || event.propertyName !== "transform") return;
      finalizeNextCard();
    };
    flipCardEl.addEventListener("transitionend", onTransitionEnd);
    // transitionendが発火しない環境（reduced motion設定など）に備えたフォールバック
    setTimeout(finalizeNextCard, 600);

    flipCardEl.classList.remove("flipped");
  } else {
    cardContainer.classList.add("hidden");
    cardFinishedArea.classList.remove("hidden");
    recordDeckSolved();
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
