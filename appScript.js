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
const rtdb = firebase.database();
const DEFAULT_RECRUIT_TIME_LIMIT_SECONDS = 10; // ★ 初期値。主催者は待機画面(liveHost.html)で変更できる

const STACK_ICON_SVG = `<svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <rect x="3" y="1" width="11" height="8" rx="1.4" opacity="0.45"></rect>
  <rect x="1.5" y="4" width="11" height="8" rx="1.4" opacity="0.7"></rect>
  <rect x="0" y="7" width="11" height="8" rx="1.4"></rect>
</svg>`;
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

let loadingOverlay;
let myUid = "";
let myUserId = "";
let meIsAdmin = false;

let userDataCache = {};
function getUserCache(userId) {
  return userDataCache[userId] || null;
}
function setUserCache(userId, data) {
  userDataCache[userId] = Object.assign({}, userDataCache[userId] || {}, data);
  return userDataCache[userId];
}

let bookCache = {};

function getParmFromUrl(parm) {
  const params = new URLSearchParams(window.location.search);
  return params.get(parm);
}
let deckCache = {};
let imgbbApiKeyCache = null;

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

// ★ アバターの頭文字を安全に取り出すヘルパー
function getInitial(name) {
  if (!name) return "?";
  return Array.from(name.trim())[0] || "?";
}

// ★ 頭文字アバター、または画像アバターを生成するヘルパー（size: "small" | "large" | 省略で通常サイズ）
function createAvatar(name, size, imageUrl) {
  if (imageUrl) {
    const img = document.createElement("img");
    img.classList.add("avatar-circle");
    if (size === "small") img.classList.add("small");
    if (size === "large") img.classList.add("large");
    img.src = imageUrl;
    img.alt = name || "";
    return img;
  }
  const avatar = document.createElement("div");
  avatar.classList.add("avatar-circle");
  if (size === "small") avatar.classList.add("small");
  if (size === "large") avatar.classList.add("large");
  avatar.textContent = getInitial(name);
  return avatar;
}

// ★ 指定したユーザーの情報（name/isAdmin/imageUrl/profileText）がキャッシュになければ取得する
async function ensureUserCached(userId) {
  if (getUserCache(userId)) return;

  const userSnapshot = await db.collection("users_random").doc(userId).get();
  if (userSnapshot.exists) {
    const userData = userSnapshot.data();
    setUserCache(userId, {
      name: userData.name || "名前未設定",
      isAdmin: userData.isAdmin || false,
      imageUrl: userData.imageUrl || "",
      profileText: userData.profileText || ""
    });
  } else {
    setUserCache(userId, { name: "不明なユーザー", isAdmin: false, imageUrl: "", profileText: "" });
  }
}

let drawerOverlay;
let accountSettingsDrawer;
let drawerCloseButton;
let accountSettingsButton;
let drawerUserId;
let drawerUsername;
let drawerLogoutButton;
let drawerEditProfileButton;
let drawerUserListButton;

let subjectSelect;
let gradeSelect;
let sortOrderSelect;
let solvedFilterSelect;
let contentTypeSelect;

document.addEventListener("DOMContentLoaded", () => {
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
    closeDrawer();
    openProfileModal(myUserId, true);
  });
  drawerUserListButton.addEventListener("click", () => {
    closeDrawer();
    openUserListModal();
  });

  subjectSelect = document.getElementById("subject-select");
  gradeSelect = document.getElementById("grade-select");
  sortOrderSelect = document.getElementById("sort-order-select");
  solvedFilterSelect = document.getElementById("solved-filter-select");
  contentTypeSelect = document.getElementById("content-type-select");

  subjectSelect.addEventListener("change", handleFilterChange);
  gradeSelect.addEventListener("change", handleFilterChange);
  sortOrderSelect.addEventListener("change", handleFilterChange);
  solvedFilterSelect.addEventListener("change", handleFilterChange);
  contentTypeSelect.addEventListener("change", handleFilterChange);
});

function handleFilterChange() {
  const isCardMode = contentTypeSelect.value === "cards";

  if (isCardMode) {
    makeDisplayCards(subjectSelect.value, gradeSelect.value, sortOrderSelect.value, solvedFilterSelect.value);
  } else {
    makeDisplayBooks(subjectSelect.value, gradeSelect.value, sortOrderSelect.value, solvedFilterSelect.value);
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
  loadingOverlay = document.getElementById("loading-overlay");

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
        profileText: userData.profileText || ""
      });
      meIsAdmin = userData.isAdmin || false;
      drawerUsername.textContent = userData.name;
      if (meIsAdmin) drawerUsername.classList.add("admin");
      drawerUserListButton.classList.toggle("hidden", !meIsAdmin);

      myUid = userData.uid;

      //displayVocabularyBooks();
      await loadProblemBooks();
      await loadCardDecks();

      if (getParmFromUrl("type") === "cards") {
        contentTypeSelect.value = "cards";
        makeDisplayCards("all", "all", "created", "all");
      } else {
        makeDisplayBooks("all", "all", "created", "all");
      }
      openSettingModalFromHash();
      loadingOverlay.classList.add("hidden");
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

const handleLogout = async () => {
  const isConfirmed = confirm("ログアウトしますか？");
  if (isConfirmed) {
    try {
      await auth.signOut(auth);
      console.log("ログアウトしました！");
      alert("ログアウトしました。");
      window.location.href = "./index.html";
    } catch (error) {
      console.error("ログアウトエラー:", error);
      alert("ログアウトに失敗しました。");
    }
  }
};

async function loadProblemBooks() {
  try {
    const querySnapshot = await db
      .collection("ProblemPosting")
      .doc("books")
      .collection("data")
      .orderBy("createdAt", "desc")
      .get();

    for (const doc of querySnapshot.docs) {
      const data = doc.data();
      const bookId = doc.id;
      const title = data.title || "タイトルがありません";
      const description = data.description || "説明文がありません";
      let subjectId = data.subjectId || 0;
      if (9 < subjectId) subjectId = 0;
      let gradeId = data.gradeId || 0;
      if (4 < gradeId) gradeId = 0;
      const problemCount = data.problemCount || 0;
      const makerUserId = data.madeBy || "";
      const solvedBy = data.solvedBy || [];
      const shuffleProblems = !!data.shuffleProblems;
      const isPrivate = !!data.isPrivate;
      const isRecruiting = !!data.isRecruiting;
      const recruitComment = data.recruitComment || "";
      const recruitParticipants = data.recruitParticipants || [];
      const createdAtMillis = data.createdAt && data.createdAt.toMillis ? data.createdAt.toMillis() : 0;
      const updatedAtMillis = data.updatedAt && data.updatedAt.toMillis ? data.updatedAt.toMillis() : createdAtMillis;

      // ★ 非公開の問題集は作成者本人と管理者にのみ表示する。ただし「みんなで解く」募集中は誰でも表示する
      if (isPrivate && !isRecruiting && makerUserId !== myUserId && !meIsAdmin) continue;

      bookCache[bookId] = [
        title,
        description,
        subjectId,
        gradeId,
        problemCount,
        makerUserId,
        solvedBy,
        createdAtMillis,
        updatedAtMillis,
        shuffleProblems,
        isPrivate,
        isRecruiting,
        recruitComment,
        recruitParticipants
      ];

      await ensureUserCached(makerUserId);
      for (const solverId of solvedBy) {
        await ensureUserCached(solverId);
      }
    }
  } catch (error) {
    console.log(error);
    alert(error);
  }
}

async function loadCardDecks() {
  try {
    const querySnapshot = await db
      .collection("ProblemPosting")
      .doc("cards")
      .collection("data")
      .orderBy("createdAt", "desc")
      .get();

    for (const doc of querySnapshot.docs) {
      const data = doc.data();
      const deckId = doc.id;
      const title = data.title || "タイトルがありません";
      const description = data.description || "説明文がありません";
      let subjectId = data.subjectId || 0;
      if (9 < subjectId) subjectId = 0;
      let gradeId = data.gradeId || 0;
      if (4 < gradeId) gradeId = 0;
      const cardCount = data.cardCount || 0;
      const makerUserId = data.madeBy || "";
      const allowFlip = !!data.allowFlip;
      const isPrivate = !!data.isPrivate;
      const solvedBy = data.solvedBy || [];
      const createdAtMillis = data.createdAt && data.createdAt.toMillis ? data.createdAt.toMillis() : 0;
      const updatedAtMillis = data.updatedAt && data.updatedAt.toMillis ? data.updatedAt.toMillis() : createdAtMillis;

      // ★ 非公開の暗記カードは作成者本人と管理者にのみ表示する
      if (isPrivate && makerUserId !== myUserId && !meIsAdmin) continue;

      deckCache[deckId] = [
        title,
        description,
        subjectId,
        gradeId,
        cardCount,
        makerUserId,
        solvedBy,
        createdAtMillis,
        updatedAtMillis,
        allowFlip,
        isPrivate
      ];

      await ensureUserCached(makerUserId);
      for (const solverId of solvedBy) {
        await ensureUserCached(solverId);
      }
    }
  } catch (error) {
    console.log(error);
    alert(error);
  }
}

function makeDisplayBooks(subjectFilter, gradeFilter, sortOrder, solvedFilter) {
  const listElement = document.getElementById("card-area");
  const loadingText = document.getElementById("loading-text");

  listElement.innerHTML = "";
  const fragment = document.createDocumentFragment();

  const sortIndex = sortOrder === "updated" ? 8 : 7;
  const sortedEntries = Object.entries(bookCache).sort(([, bookA], [, bookB]) => {
    const recruitingDiff = (bookB[11] ? 1 : 0) - (bookA[11] ? 1 : 0);
    if (recruitingDiff !== 0) return recruitingDiff;
    return (bookB[sortIndex] || 0) - (bookA[sortIndex] || 0);
  });

  sortedEntries.forEach(([bookId, book]) => {
    
    const card = document.createElement("div");
    card.classList.add("card");

    const isPrivate = !!book[10];
    const isRecruiting = !!book[11];
    if (isPrivate) {
      const privateBadge = document.createElement("span");
      privateBadge.classList.add("private-badge");
      if (isRecruiting) privateBadge.classList.add("recruiting-badge");
      privateBadge.textContent = isRecruiting ? "募集中" : "非公開";
      card.appendChild(privateBadge);
    }
      
    const cardTop = document.createElement("div");
    cardTop.classList.add("card-top");
    const subjectBadge = document.createElement("span");
    subjectBadge.classList.add("badge");
    subjectBadge.classList.add(`t${book[2]}`);
    subjectBadge.textContent = subjectIdList[book[2]];
    const gradeBadge = document.createElement("span");
    gradeBadge.classList.add("badge");
    gradeBadge.classList.add(`t${book[2]}`);
    gradeBadge.textContent = gradeIdList[book[3]];
    const wordCountBadge = document.createElement("span");
    wordCountBadge.classList.add("badge");
    wordCountBadge.classList.add(`t${book[2]}`);
    wordCountBadge.innerHTML = `${STACK_ICON_SVG}${book[4]}問`;
    cardTop.appendChild(subjectBadge);
    cardTop.appendChild(gradeBadge);
    cardTop.appendChild(wordCountBadge);
      
    const cardTitle = document.createElement("p");
    cardTitle.classList.add("card-title");
    cardTitle.textContent = book[0];
      
    const cardDescription = document.createElement("p");
    cardDescription.classList.add("card-description");
    cardDescription.textContent = book[1];
      
    const cardMadeBy = document.createElement("span");
    cardMadeBy.classList.add("card-madeBy");
      
    const makerCached = getUserCache(book[5]) || {};
    const nameSpan = document.createElement("span");
    nameSpan.textContent = makerCached.name;
    nameSpan.classList.add("clickable-user");
    if (makerCached.isAdmin) nameSpan.classList.add("admin");
    nameSpan.addEventListener("click", (e) => {
      e.stopPropagation();
      openProfileModal(book[5]);
    });
    const madeByTextContent = document.createTextNode('作成者: ');
    cardMadeBy.appendChild(madeByTextContent);
    cardMadeBy.appendChild(nameSpan);
      
    const solvedBy = book[6] || [];
    const solvedByArea = document.createElement("div");
    solvedByArea.classList.add("solved-by-area");

    const solvedByLabel = document.createElement("span");
    solvedByLabel.classList.add("solved-by-label");
    solvedByLabel.textContent = "解いた人:";
    solvedByArea.appendChild(solvedByLabel);

    if (solvedBy.length > 0) {
      const stack = document.createElement("div");
      stack.classList.add("solved-by-stack");

      const MAX_SHOWN = 4;
      solvedBy.slice(0, MAX_SHOWN).forEach(userId => {
        const cached = getUserCache(userId) || {};
        const avatar = createAvatar(cached.name, "small", cached.imageUrl);
        avatar.classList.add("solved-by-avatar");
        stack.appendChild(avatar);
      });
      if (solvedBy.length > MAX_SHOWN) {
        const overflow = document.createElement("div");
        overflow.classList.add("avatar-circle", "small", "solved-by-avatar", "solved-by-overflow");
        overflow.textContent = "…";
        stack.appendChild(overflow);
      }

      solvedByArea.appendChild(stack);
      solvedByArea.addEventListener("click", (e) => {
        e.stopPropagation();
        openSolvedModal(bookId);
      });
    } else {
      const emptyText = document.createElement("span");
      emptyText.classList.add("solved-by-empty-text");
      emptyText.textContent = "解いた人はまだいません";
      solvedByArea.appendChild(emptyText);
    }
      
      
    card.addEventListener("click", () => {
      openSettingModal(bookId);
    });
      
      
    card.appendChild(cardTop);
    card.appendChild(cardTitle);
    card.appendChild(cardDescription);
    card.appendChild(cardMadeBy);
    if (solvedByArea) card.appendChild(solvedByArea);
    
    const subjectMatches = subjectFilter === "all" || book[2] === Number(subjectFilter);
    const gradeMatches = gradeFilter === "all" || book[3] === Number(gradeFilter);
    const hasSolved = (book[6] || []).includes(myUserId);
    const solvedMatches =
      !solvedFilter ||
      solvedFilter === "all" ||
      (solvedFilter === "solved" && hasSolved) ||
      (solvedFilter === "unsolved" && !hasSolved);
    if (subjectMatches && gradeMatches && solvedMatches) {
      fragment.appendChild(card);
    }
  });
  
  const makeBookButton = document.createElement("button");
    makeBookButton.classList.add("card");
    makeBookButton.classList.add("make-card");
    makeBookButton.innerHTML = `
    <svg xmlns="http://w3.org" viewBox="0 0 24 24" width="24" height="24">
      <circle cx="12" cy="12" r="10" fill="currentColor"/>
      <path d="M 12,8 L 12,16 M 8,12 L 16,12" 
        fill="none" 
        stroke="white" 
        stroke-width="2" 
        stroke-linecap="round"/>
    </svg>
    <p class="card-title">問題集を作成</p>`;
    makeBookButton.addEventListener("click", () => {
      window.location.href = "./make.html";
    });
  
    loadingText.classList.add("hidden");
    listElement.classList.remove("hidden");
    listElement.appendChild(makeBookButton);
    listElement.appendChild(fragment);
}

function makeDisplayCards(subjectFilter, gradeFilter, sortOrder, solvedFilter) {
  const listElement = document.getElementById("card-area");
  const loadingText = document.getElementById("loading-text");

  listElement.innerHTML = "";
  const fragment = document.createDocumentFragment();

  const sortIndex = sortOrder === "updated" ? 8 : 7;
  const sortedEntries = Object.entries(deckCache).sort(
    ([, deckA], [, deckB]) => (deckB[sortIndex] || 0) - (deckA[sortIndex] || 0)
  );

  sortedEntries.forEach(([deckId, deck]) => {
    const card = document.createElement("div");
    card.classList.add("card");

    const isPrivate = !!deck[10];
    if (isPrivate) {
      const privateBadge = document.createElement("span");
      privateBadge.classList.add("private-badge");
      privateBadge.textContent = "非公開";
      card.appendChild(privateBadge);
    }

    const cardTop = document.createElement("div");
    cardTop.classList.add("card-top");
    const subjectBadge = document.createElement("span");
    subjectBadge.classList.add("badge");
    subjectBadge.classList.add(`t${deck[2]}`);
    subjectBadge.textContent = subjectIdList[deck[2]];
    const gradeBadge = document.createElement("span");
    gradeBadge.classList.add("badge");
    gradeBadge.classList.add(`t${deck[2]}`);
    gradeBadge.textContent = gradeIdList[deck[3]];
    const cardCountBadge = document.createElement("span");
    cardCountBadge.classList.add("badge");
    cardCountBadge.classList.add(`t${deck[2]}`);
    cardCountBadge.innerHTML = `${STACK_ICON_SVG}${deck[4]}枚`;
    cardTop.appendChild(subjectBadge);
    cardTop.appendChild(gradeBadge);
    cardTop.appendChild(cardCountBadge);

    const cardTitle = document.createElement("p");
    cardTitle.classList.add("card-title");
    cardTitle.textContent = deck[0];

    const cardDescription = document.createElement("p");
    cardDescription.classList.add("card-description");
    cardDescription.textContent = deck[1];

    const cardMadeBy = document.createElement("span");
    cardMadeBy.classList.add("card-madeBy");

    const makerCached = getUserCache(deck[5]) || {};
    const nameSpan = document.createElement("span");
    nameSpan.textContent = makerCached.name;
    nameSpan.classList.add("clickable-user");
    if (makerCached.isAdmin) nameSpan.classList.add("admin");
    nameSpan.addEventListener("click", (e) => {
      e.stopPropagation();
      openProfileModal(deck[5]);
    });
    const madeByTextContent = document.createTextNode('作成者: ');
    cardMadeBy.appendChild(madeByTextContent);
    cardMadeBy.appendChild(nameSpan);

    const solvedBy = deck[6] || [];
    const solvedByArea = document.createElement("div");
    solvedByArea.classList.add("solved-by-area");

    const solvedByLabel = document.createElement("span");
    solvedByLabel.classList.add("solved-by-label");
    solvedByLabel.textContent = "解いた人:";
    solvedByArea.appendChild(solvedByLabel);

    if (solvedBy.length > 0) {
      const stack = document.createElement("div");
      stack.classList.add("solved-by-stack");

      const MAX_SHOWN = 4;
      solvedBy.slice(0, MAX_SHOWN).forEach(userId => {
        const cached = getUserCache(userId) || {};
        const avatar = createAvatar(cached.name, "small", cached.imageUrl);
        avatar.classList.add("solved-by-avatar");
        stack.appendChild(avatar);
      });
      if (solvedBy.length > MAX_SHOWN) {
        const overflow = document.createElement("div");
        overflow.classList.add("avatar-circle", "small", "solved-by-avatar", "solved-by-overflow");
        overflow.textContent = "…";
        stack.appendChild(overflow);
      }

      solvedByArea.appendChild(stack);
      solvedByArea.addEventListener("click", (e) => {
        e.stopPropagation();
        openSolvedModal(deckId, "card");
      });
    } else {
      const emptyText = document.createElement("span");
      emptyText.classList.add("solved-by-empty-text");
      emptyText.textContent = "解いた人はまだいません";
      solvedByArea.appendChild(emptyText);
    }

    card.addEventListener("click", () => {
      openCardSettingModal(deckId);
    });

    card.appendChild(cardTop);
    card.appendChild(cardTitle);
    card.appendChild(cardDescription);
    card.appendChild(cardMadeBy);
    card.appendChild(solvedByArea);

    const subjectMatches = subjectFilter === "all" || deck[2] === Number(subjectFilter);
    const gradeMatches = gradeFilter === "all" || deck[3] === Number(gradeFilter);
    const hasSolved = solvedBy.includes(myUserId);
    const solvedMatches =
      !solvedFilter ||
      solvedFilter === "all" ||
      (solvedFilter === "solved" && hasSolved) ||
      (solvedFilter === "unsolved" && !hasSolved);
    if (subjectMatches && gradeMatches && solvedMatches) {
      fragment.appendChild(card);
    }
  });

  const makeCardDeckButton = document.createElement("button");
  makeCardDeckButton.classList.add("card");
  makeCardDeckButton.classList.add("make-card");
  makeCardDeckButton.innerHTML = `
  <svg xmlns="http://w3.org" viewBox="0 0 24 24" width="24" height="24">
    <circle cx="12" cy="12" r="10" fill="currentColor"/>
    <path d="M 12,8 L 12,16 M 8,12 L 16,12" 
      fill="none" 
      stroke="white" 
      stroke-width="2" 
      stroke-linecap="round"/>
  </svg>
  <p class="card-title">暗記カードを作成</p>`;
  makeCardDeckButton.addEventListener("click", () => {
    window.location.href = "./makeCard.html";
  });

  loadingText.classList.add("hidden");
  listElement.classList.remove("hidden");
  listElement.appendChild(makeCardDeckButton);
  listElement.appendChild(fragment);
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

let settingModal;
let settingModalClose;
let settingModalBookId;
let settingModalSubject,
  settingModalGrade,
  settingModalCount,
  settingModalCountText;
let settingModalTitle, settingModalDescription, settingModalMadeByName;
let settingModalEditButton, settingModalStartButton, viewImpressionsButton;
let shuffleProblemsToggle;
let shuffleToggleRow, flipToggleRow, flipCardsToggle;
let settingModalType = "book";
let recruitCommentArea, recruitCommentText, recruitStartOpenButton, joinButton, joinDisabledText;
let recruitStartModal, recruitStartModalClose, recruitCommentInput, recruitStartConfirmButton;
document.addEventListener("DOMContentLoaded", () => {
  settingModal = document.getElementById("setting-modal");
  settingModalClose = document.getElementById("setting-modal-close");
  settingModalSubject = document.getElementById("setting-subject");
  settingModalGrade = document.getElementById("setting-grade");
  settingModalCount = document.getElementById("setting-count");
  settingModalCountText = document.getElementById("setting-count-text");
  settingModalTitle = document.getElementById("setting-title");
  settingModalDescription = document.getElementById("setting-description");
  settingModalMadeByName = document.getElementById("setting-madeBy-name");
  settingModalStartButton = document.getElementById("start-button");
  settingModalEditButton = document.getElementById("edit-button");
  viewImpressionsButton = document.getElementById("view-impressions-button");
  shuffleProblemsToggle = document.getElementById("shuffle-problems-toggle");
  shuffleToggleRow = document.getElementById("shuffle-toggle-row");
  flipToggleRow = document.getElementById("flip-toggle-row");
  flipCardsToggle = document.getElementById("flip-cards-toggle");
  recruitCommentArea = document.getElementById("recruit-comment-area");
  recruitCommentText = document.getElementById("recruit-comment-text");
  recruitStartOpenButton = document.getElementById("recruit-start-open-button");
  joinButton = document.getElementById("join-button");
  joinDisabledText = document.getElementById("join-disabled-text");
  recruitStartModal = document.getElementById("recruit-start-modal");
  recruitStartModalClose = document.getElementById("recruit-start-modal-close");
  recruitCommentInput = document.getElementById("recruit-comment-input");
  recruitStartConfirmButton = document.getElementById("recruit-start-confirm-button");

  settingModalClose.addEventListener("click", () => {
    settingModal.classList.add("hidden");
    clearBookHash();
    settingModalSubject.textContent = "不明";
    settingModalGrade.textContent = "不明";
    settingModalCountText.textContent = "--問";
    for (let i = 0; i < 9; i++) {
      settingModalSubject.classList.remove(`t${i + 1}`);
      settingModalGrade.classList.remove(`t${i + 1}`);
      settingModalCount.classList.remove(`t${i + 1}`);
    }
    settingModalSubject.classList.add("t0");
    settingModalGrade.classList.add("t0");
    settingModalCount.classList.add("t0");

    settingModalTitle.textContent = "loading...";
    settingModalDescription.textContent = "loading...";
    settingModalMadeByName.textContent = "loading...";
    settingModalMadeByName.classList.remove("admin");

    settingModalEditButton.classList.add("hidden");
    flipCardsToggle.checked = false;

    recruitCommentArea.classList.add("hidden");
    recruitStartOpenButton.classList.add("hidden");
    joinButton.classList.add("hidden");
    joinButton.classList.remove("leave-mode");
    joinDisabledText.classList.add("hidden");
    settingModalStartButton.classList.remove("hidden");
    settingModalStartButton.classList.remove("full-width-button");
    settingModalStartButton.textContent = "スタート";
    shuffleToggleRow.classList.remove("hidden");
  });

  recruitStartOpenButton.addEventListener("click", () => {
    recruitCommentInput.value = "";
    recruitStartModal.classList.remove("hidden");
  });
  recruitStartModalClose.addEventListener("click", () => {
    recruitStartModal.classList.add("hidden");
  });
  recruitStartConfirmButton.addEventListener("click", async () => {
    const bookId = settingModalBookId;
    if (!bookId || !bookCache[bookId]) return;
    const comment = recruitCommentInput.value.trim();
    const timeLimitSeconds = DEFAULT_RECRUIT_TIME_LIMIT_SECONDS; // ★ 待機画面(liveHost.html)側で主催者が変更可能
    recruitStartConfirmButton.disabled = true;
    try {
      await db
        .collection("ProblemPosting")
        .doc("books")
        .collection("data")
        .doc(bookId)
        .update({
          isRecruiting: true,
          recruitComment: comment,
          recruitParticipants: [],
          recruitTimeLimitSeconds: timeLimitSeconds
        });
      await rtdb.ref(`liveSessions/${bookId}`).set({
        hostUserId: myUserId,
        status: "waiting",
        timeLimitSeconds,
        totalQuestions: bookCache[bookId][4] || 0,
        recruitComment: comment,
        currentQuestionIndex: -1,
        currentQuestion: null,
        currentAnswerKey: null,
        locked: false,
        participants: {},
        answers: {},
        totalScores: {},
        createdAt: firebase.database.ServerValue.TIMESTAMP
      });
      bookCache[bookId][11] = true;
      bookCache[bookId][12] = comment;
      bookCache[bookId][13] = [];
      recruitStartModal.classList.add("hidden");
      openSettingModal(bookId);
      handleFilterChange();
    } catch (error) {
      console.error(error);
      alert("募集の開始に失敗しました。");
    } finally {
      recruitStartConfirmButton.disabled = false;
    }
  });

  joinButton.addEventListener("click", async () => {
    const bookId = settingModalBookId;
    if (!bookId || !bookCache[bookId]) return;
    const participants = bookCache[bookId][13] || [];
    const alreadyJoined = participants.includes(myUserId);

    if (alreadyJoined) {
      // ★ 既に参加済みの場合はそのまま待機画面(解答画面)へ移動するだけ
      window.location.href = `./liveAnswer.html?id=${bookId}`;
      return;
    }

    joinButton.disabled = true;
    try {
      const statusSnap = await rtdb.ref(`liveSessions/${bookId}/status`).get();
      const status = statusSnap.exists() ? statusSnap.val() : "waiting";
      if (status !== "waiting") {
        joinButton.classList.add("hidden");
        joinDisabledText.classList.remove("hidden");
        return;
      }

      const bookRef = db
        .collection("ProblemPosting")
        .doc("books")
        .collection("data")
        .doc(bookId);
      await bookRef.update({
        recruitParticipants: firebase.firestore.FieldValue.arrayUnion(myUserId)
      });
      const myCached = getUserCache(myUserId) || {};
      await rtdb.ref(`liveSessions/${bookId}/participants/${myUserId}`).set({
        name: myCached.name || myUserId,
        joinedAt: firebase.database.ServerValue.TIMESTAMP
      });
      window.location.href = `./liveAnswer.html?id=${bookId}`;
    } catch (error) {
      console.error(error);
      alert("参加処理に失敗しました。");
      joinButton.disabled = false;
    }
  });
  settingModalStartButton.addEventListener("click", () => {
    if (settingModalType === "card") {
      const flipParam = flipCardsToggle.checked && !flipCardsToggle.disabled ? "&flip=1" : "";
      window.location.href = `./answerCard.html?id=${settingModalBookId}${flipParam}`;
    } else if (bookCache[settingModalBookId] && bookCache[settingModalBookId][11]) {
      // ★ 募集中の問題集は、主催者用のライブ進行画面へ
      window.location.href = `./liveHost.html?id=${settingModalBookId}`;
    } else {
      const shuffleParam = shuffleProblemsToggle.checked && !shuffleProblemsToggle.disabled ? "&shuffle=1" : "";
      window.location.href = `./answer.html?id=${settingModalBookId}${shuffleParam}`;
    }
  });
  settingModalEditButton.addEventListener("click", () => {
    const editPage = settingModalType === "card" ? "editCard.html" : "edit.html";
    window.location.href = `./${editPage}?id=${settingModalBookId}`;
  });
  settingModalMadeByName.addEventListener("click", () => {
    const cache = settingModalType === "card" ? deckCache : bookCache;
    openProfileModal(cache[settingModalBookId][5]);
  });
  viewImpressionsButton.addEventListener("click", () => {
    openImpressionsModal(settingModalBookId, settingModalType);
  });
});

// ★ 出題設定モーダルの表示内容を「問題集」「暗記カード」で切り替える
function setSettingModalMode(mode) {
  settingModalType = mode;
  const isCard = mode === "card";

  shuffleToggleRow.classList.toggle("hidden", isCard);
  flipToggleRow.classList.toggle("hidden", !isCard);

  settingModalEditButton.classList.add("hidden");
  viewImpressionsButton.classList.remove("hidden");
  settingModalShareButton.classList.remove("hidden");

  recruitCommentArea.classList.add("hidden");
  recruitStartOpenButton.classList.add("hidden");
  joinButton.classList.add("hidden");
  joinButton.classList.remove("leave-mode");
  joinDisabledText.classList.add("hidden");
  settingModalStartButton.classList.remove("hidden");
  settingModalStartButton.classList.remove("full-width-button");
  settingModalStartButton.textContent = "スタート";
}

function openSettingModal(id) {
  setSettingModalMode("book");
  settingModalBookId = id;
  settingModal.classList.remove("hidden");
  setBookHash(id);
  settingModalTitle.textContent = bookCache[id][0];
  settingModalDescription.textContent = bookCache[id][1];
  settingModalSubject.classList.remove("t0");
  settingModalGrade.classList.remove("t0");
  settingModalCount.classList.remove("t0");
  settingModalSubject.classList.add(`t${bookCache[id][2]}`);
  settingModalGrade.classList.add(`t${bookCache[id][2]}`);
  settingModalCount.classList.add(`t${bookCache[id][2]}`);
  settingModalSubject.textContent = subjectIdList[bookCache[id][2]];
  settingModalGrade.textContent = gradeIdList[bookCache[id][3]];
  settingModalCountText.textContent = `${bookCache[id][4]}問`;
  const makerCached = getUserCache(bookCache[id][5]) || {};
  settingModalMadeByName.textContent = makerCached.name;
  settingModalMadeByName.classList.toggle("admin", !!makerCached.isAdmin);

  if (bookCache[id][5] === myUserId || meIsAdmin) settingModalEditButton.classList.remove("hidden");

  const allowShuffle = !!bookCache[id][9];
  shuffleProblemsToggle.checked = false;
  shuffleProblemsToggle.disabled = !allowShuffle;

  applyRecruitModeToSettingModal(id);
}

// ★ 「みんなで解く」募集中かどうかで出題設定モーダルの表示を切り替える（問題集のみ対象）
async function applyRecruitModeToSettingModal(id) {
  const book = bookCache[id];
  const isMaker = book[5] === myUserId;
  const isPrivate = !!book[10];
  const isRecruiting = !!book[11];
  const recruitComment = book[12] || "";

  recruitCommentArea.classList.add("hidden");
  recruitStartOpenButton.classList.add("hidden");
  joinButton.classList.add("hidden");
  joinButton.classList.remove("leave-mode");
  joinDisabledText.classList.add("hidden");
  settingModalStartButton.classList.remove("hidden");
  settingModalStartButton.classList.remove("full-width-button");
  settingModalStartButton.textContent = "スタート";
  shuffleToggleRow.classList.remove("hidden");

  if (isRecruiting) {
    // 募集中は編集・感想・シャッフル設定を隠す。シェアは残す
    settingModalEditButton.classList.add("hidden");
    viewImpressionsButton.classList.add("hidden");
    shuffleToggleRow.classList.add("hidden");

    recruitCommentArea.classList.remove("hidden");
    recruitCommentText.textContent = recruitComment || "(コメントはありません)";

    if (isMaker) {
      // 主催者: 待機画面(進行管理)へ
      settingModalStartButton.classList.remove("hidden");
      settingModalStartButton.classList.add("full-width-button");
      settingModalStartButton.textContent = "待機画面へ";
      joinButton.classList.add("hidden");
    } else {
      // 参加者: 参加する/待機画面へ のみ。既に開始済みなら参加不可
      settingModalStartButton.classList.add("hidden");

      const participants = book[13] || [];
      if (participants.includes(myUserId)) {
        joinButton.classList.remove("hidden");
        joinButton.disabled = false;
        updateJoinButtonState(id);
      } else {
        joinButton.classList.remove("hidden");
        joinButton.disabled = true;
        joinButton.textContent = "確認中...";
        try {
          const statusSnap = await rtdb.ref(`liveSessions/${id}/status`).get();
          if (settingModalBookId !== id) return; // その間にモーダルが閉じられていたら何もしない
          const status = statusSnap.exists() ? statusSnap.val() : "waiting";
          if (status === "waiting") {
            joinButton.textContent = "参加する";
            joinButton.disabled = false;
          } else {
            joinButton.classList.add("hidden");
            joinDisabledText.classList.remove("hidden");
          }
        } catch (error) {
          console.error(error);
          joinButton.textContent = "参加する";
          joinButton.disabled = false;
        }
      }
    }
  } else {
    viewImpressionsButton.classList.remove("hidden");
    if (isPrivate && isMaker) {
      recruitStartOpenButton.classList.remove("hidden");
    }
  }
}

function updateJoinButtonState(id) {
  const participants = bookCache[id][13] || [];
  const joined = participants.includes(myUserId);
  joinButton.textContent = joined ? "待機画面へ" : "参加する";
  joinButton.classList.toggle("leave-mode", false);
}

function openCardSettingModal(id) {
  setSettingModalMode("card");
  settingModalBookId = id;
  settingModal.classList.remove("hidden");
  setBookHash(id);
  settingModalTitle.textContent = deckCache[id][0];
  settingModalDescription.textContent = deckCache[id][1];
  settingModalSubject.classList.remove("t0");
  settingModalGrade.classList.remove("t0");
  settingModalCount.classList.remove("t0");
  settingModalSubject.classList.add(`t${deckCache[id][2]}`);
  settingModalGrade.classList.add(`t${deckCache[id][2]}`);
  settingModalCount.classList.add(`t${deckCache[id][2]}`);
  settingModalSubject.textContent = subjectIdList[deckCache[id][2]];
  settingModalGrade.textContent = gradeIdList[deckCache[id][3]];
  settingModalCountText.textContent = `${deckCache[id][4]}枚`;
  const makerCached = getUserCache(deckCache[id][5]) || {};
  settingModalMadeByName.textContent = makerCached.name;
  settingModalMadeByName.classList.toggle("admin", !!makerCached.isAdmin);

  if (deckCache[id][5] === myUserId || meIsAdmin) settingModalEditButton.classList.remove("hidden");

  const allowFlip = !!deckCache[id][9];
  flipCardsToggle.checked = false;
  flipCardsToggle.disabled = !allowFlip;
}

// ★ URLのハッシュ(#問題集ID)を使った出題設定モーダルの直リンク対応
function setBookHash(bookId) {
  if (window.location.hash === `#${bookId}`) return;
  const newUrl = `${window.location.pathname}${window.location.search}#${bookId}`;
  history.pushState(null, "", newUrl);
}
function clearBookHash() {
  if (!window.location.hash) return;
  const newUrl = `${window.location.pathname}${window.location.search}`;
  history.replaceState(null, "", newUrl);
}
function openSettingModalFromHash() {
  const id = window.location.hash.replace("#", "");
  if (!id) return;
  if (bookCache[id]) {
    contentTypeSelect.value = "books";
    handleFilterChange();
    openSettingModal(id);
  } else if (deckCache[id]) {
    contentTypeSelect.value = "cards";
    handleFilterChange();
    openCardSettingModal(id);
  }
}

let bookShareModal;
let bookShareModalClose;
let bookShareQr;
let bookShareUrl;
let settingModalShareButton;
document.addEventListener("DOMContentLoaded", () => {
  bookShareModal = document.getElementById("book-share-modal");
  bookShareModalClose = document.getElementById("book-share-modal-close");
  bookShareQr = document.getElementById("book-share-qr");
  bookShareUrl = document.getElementById("book-share-url");
  settingModalShareButton = document.getElementById("setting-modal-share-button");

  bookShareModalClose.addEventListener("click", () => {
    bookShareModal.classList.add("hidden");
  });
  settingModalShareButton.addEventListener("click", () => {
    openBookShareModal(settingModalBookId);
  });
});

function openBookShareModal(bookId) {
  const targetUrl = new URL(`app.html#${bookId}`, window.location.href).href;
  bookShareUrl.textContent = targetUrl;
  bookShareQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(targetUrl)}`;
  bookShareModal.classList.remove("hidden");
}

let solvedModal;
let solvedModalClose;
let solvedArea;
document.addEventListener("DOMContentLoaded", () => {
  solvedModal = document.getElementById("solved-modal");
  solvedModalClose = document.getElementById("solved-modal-close");
  solvedArea = document.getElementById("solved-area");

  solvedModalClose.addEventListener("click", () => {
    solvedModal.classList.add("hidden");
  });
});

function openSolvedModal(id, type) {
  const cache = type === "card" ? deckCache : bookCache;
  const solvedBy = (cache[id] && cache[id][6]) || [];
  solvedArea.innerHTML = "";

  if (solvedBy.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.textContent = "まだ誰も解いていません";
    solvedArea.appendChild(emptyMessage);
  } else {
    solvedBy.forEach(userId => {
      const item = document.createElement("div");
      item.classList.add("member-item");

      const left = document.createElement("div");
      left.classList.add("member-left");

      const cached = getUserCache(userId) || {};
      const avatar = createAvatar(cached.name, "small", cached.imageUrl);
      left.appendChild(avatar);

      const nameSpan = document.createElement("span");
      nameSpan.classList.add("member-name");
      nameSpan.textContent = cached.name || "不明なユーザー";
      if (cached.isAdmin) nameSpan.classList.add("admin");
      left.appendChild(nameSpan);

      item.appendChild(left);
      item.addEventListener("click", () => {
        openProfileModal(userId);
      });
      solvedArea.appendChild(item);
    });
  }

  solvedModal.classList.remove("hidden");
}

// ★ 日時を「yyyy/mm/dd hh:mm」形式の文字列に整形するヘルパー
function formatDateTime(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}

let userListModal;
let userListModalClose;
let userListArea;
document.addEventListener("DOMContentLoaded", () => {
  userListModal = document.getElementById("user-list-modal");
  userListModalClose = document.getElementById("user-list-modal-close");
  userListArea = document.getElementById("user-list-area");

  userListModalClose.addEventListener("click", () => {
    userListModal.classList.add("hidden");
  });
});

// ★ 管理者向け：全ユーザーをno順に一覧表示し、右端に最終確認日時を表示する
async function openUserListModal() {
  userListArea.innerHTML = "";
  const loadingMessage = document.createElement("p");
  loadingMessage.textContent = "読み込み中...";
  userListArea.appendChild(loadingMessage);
  userListModal.classList.remove("hidden");

  try {
    const usersSnap = await db.collection("users_random").orderBy("no").get();
    userListArea.innerHTML = "";

    if (usersSnap.empty) {
      const emptyMessage = document.createElement("p");
      emptyMessage.textContent = "ユーザーが見つかりません";
      userListArea.appendChild(emptyMessage);
      return;
    }

    usersSnap.forEach(doc => {
      const userId = doc.id;
      const userData = doc.data();
      const name = userData.name || "名前未設定";
      const isAdmin = !!userData.isAdmin;
      const imageUrl = userData.imageUrl || "";

      // 他の画面のキャッシュとも整合するよう更新しておく
      setUserCache(userId, {
        name,
        isAdmin,
        imageUrl,
        profileText: userData.profileText || ""
      });

      const item = document.createElement("div");
      item.classList.add("member-item");

      const left = document.createElement("div");
      left.classList.add("member-left");

      const avatar = createAvatar(name, "small", imageUrl);
      left.appendChild(avatar);

      const nameSpan = document.createElement("span");
      nameSpan.classList.add("member-name");
      nameSpan.textContent = name;
      if (isAdmin) nameSpan.classList.add("admin");
      left.appendChild(nameSpan);

      item.appendChild(left);

      const lastCheckedSpan = document.createElement("span");
      lastCheckedSpan.classList.add("member-last-checked");
      lastCheckedSpan.textContent = userData.lastOpenedAt
        ? formatDateTime(userData.lastOpenedAt.toDate())
        : "未確認";
      item.appendChild(lastCheckedSpan);

      item.addEventListener("click", () => {
        openProfileModal(userId);
      });

      userListArea.appendChild(item);
    });
  } catch (error) {
    console.error("ユーザー一覧の取得エラー:", error);
    userListArea.innerHTML = "";
    const errorMessage = document.createElement("p");
    errorMessage.textContent = "ユーザー一覧の取得に失敗しました。\n" + error;
    userListArea.appendChild(errorMessage);
  }
}

let profileModal;
let profileModalClose;
let profileAvatarWrap;
let profileAvatarHolder;
let profileAvatarInput;
let profileAvatarRemoveButton;
let profileName;
let profileNameInput;
let profileText;
let profileTextEdit;
let profileEditButton;
let profileCancelButton;
let isProfileEditing = false;
let currentProfileUserId = "";
let canEditCurrentProfile = false;
let profileAvatarCurrentUrl = "";
let profileAvatarFile = null;
let profileAvatarRemoved = false;

document.addEventListener("DOMContentLoaded", () => {
  profileModal = document.getElementById("profile-modal");
  profileModalClose = document.getElementById("profile-modal-close");
  profileAvatarWrap = document.querySelector(".profile-avatar-wrap");
  profileAvatarHolder = document.getElementById("profile-avatar-holder");
  profileAvatarInput = document.getElementById("profile-avatar-input");
  profileAvatarRemoveButton = document.getElementById("profile-avatar-remove-button");
  profileName = document.getElementById("profile-name");
  profileNameInput = document.getElementById("profile-name-input");
  profileText = document.getElementById("profile-text");
  profileTextEdit = document.getElementById("profile-text-edit");
  profileEditButton = document.getElementById("profile-edit-button");
  profileCancelButton = document.getElementById("profile-cancel-button");

  profileModalClose.addEventListener("click", () => {
    profileModal.classList.add("hidden");
    resetProfileEditMode();
  });

  profileEditButton.addEventListener("click", handleProfileEditOrSave);
  profileCancelButton.addEventListener("click", () => {
    resetProfileEditMode();
  });

  // アイコンをタップ（編集モード中のみ有効）→ ファイル選択を開く
  profileAvatarHolder.addEventListener("click", () => {
    if (!isProfileEditing || !canEditCurrentProfile) return;
    profileAvatarInput.click();
  });

  // ファイルが選択されたらプレビューに反映（アップロードは保存時にまとめて行う）
  profileAvatarInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    profileAvatarFile = file;
    profileAvatarRemoved = false;

    const reader = new FileReader();
    reader.onload = (event) => {
      profileAvatarHolder.innerHTML = "";
      const img = document.createElement("img");
      img.classList.add("avatar-circle", "large");
      img.src = event.target.result;
      profileAvatarHolder.appendChild(img);
      profileAvatarRemoveButton.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
  });

  // 「画像を削除」→ プレビューを頭文字アバターに戻し、保存時に画像を消去
  profileAvatarRemoveButton.addEventListener("click", () => {
    profileAvatarFile = null;
    profileAvatarRemoved = true;
    profileAvatarInput.value = "";

    profileAvatarHolder.innerHTML = "";
    const nameForInitial = isProfileEditing ? profileNameInput.value : profileName.textContent;
    profileAvatarHolder.appendChild(createAvatar(nameForInitial, "large"));
    profileAvatarRemoveButton.classList.add("hidden");
  });
});

// 編集モードをリセットする関数
function resetProfileEditMode() {
  isProfileEditing = false;
  if (profileEditButton) {
    profileEditButton.textContent = "プロフィールを編集";
    profileEditButton.disabled = false;
  }
  if (profileCancelButton) profileCancelButton.classList.add("hidden");
  if (profileName) profileName.classList.remove("hidden");
  if (profileNameInput) profileNameInput.classList.add("hidden");
  if (profileText) profileText.classList.remove("hidden");
  if (profileTextEdit) profileTextEdit.classList.add("hidden");

  if (profileAvatarWrap) profileAvatarWrap.classList.remove("editable");
  if (profileAvatarRemoveButton) profileAvatarRemoveButton.classList.add("hidden");
  profileAvatarFile = null;
  profileAvatarRemoved = false;
  if (profileAvatarHolder && profileName) {
    profileAvatarHolder.innerHTML = "";
    profileAvatarHolder.appendChild(createAvatar(profileName.textContent, "large", profileAvatarCurrentUrl));
  }
}

// 編集ボタン・保存ボタンが押された時の処理
async function handleProfileEditOrSave() {
  if (!isProfileEditing) {
    isProfileEditing = true;
    profileEditButton.textContent = "プロフィールを保存";
    if (profileCancelButton) profileCancelButton.classList.toggle("hidden", !canEditCurrentProfile);

    const cached = getUserCache(currentProfileUserId) || {};
    const currentName = cached.name || "";
    const currentText = cached.profileText || "";

    profileName.classList.add("hidden");
    profileNameInput.classList.remove("hidden");
    profileNameInput.value = currentName;

    profileText.classList.add("hidden");
    profileTextEdit.classList.remove("hidden");
    profileTextEdit.value = currentText;

    // アイコンをタップして変更できるようにする（自分／管理者のみ）
    if (canEditCurrentProfile) {
      profileAvatarWrap.classList.add("editable");
      if (profileAvatarCurrentUrl) {
        profileAvatarRemoveButton.classList.remove("hidden");
      }
    }

  } else {
    const newName = profileNameInput.value.trim();
    const newProfileText = profileTextEdit.value.trim();

    if (!newName) {
      alert("ユーザーネームを入力してください。");
      return;
    }

    profileEditButton.disabled = true;
    profileEditButton.textContent = "保存中...";

    try {
      let finalImageUrl = profileAvatarCurrentUrl;
      if (profileAvatarFile) {
        profileEditButton.textContent = "画像をアップロード中...";
        finalImageUrl = await uploadImageToImgbb(profileAvatarFile);
      } else if (profileAvatarRemoved) {
        finalImageUrl = "";
      }

      profileEditButton.textContent = "保存中...";

      await db.collection("users_random").doc(currentProfileUserId).set(
        {
          name: newName,
          profileText: newProfileText,
          imageUrl: finalImageUrl
        },
        { merge: true }
      );

      const previousCache = getUserCache(currentProfileUserId) || {};
      const updated = setUserCache(currentProfileUserId, {
        name: newName,
        isAdmin: previousCache.isAdmin || false,
        imageUrl: finalImageUrl,
        profileText: newProfileText
      });

      if (currentProfileUserId === myUserId) {
        drawerUsername.textContent = newName;
      }

      profileName.textContent = newName;
      profileText.textContent = newProfileText || "ステータスメッセージはありません。";

      profileAvatarCurrentUrl = finalImageUrl;
      profileAvatarFile = null;
      profileAvatarRemoved = false;
      profileAvatarHolder.innerHTML = "";
      profileAvatarHolder.appendChild(createAvatar(newName, "large", updated.imageUrl));

      profileName.classList.toggle("admin", !!updated.isAdmin);

      resetProfileEditMode();
      alert("プロフィールを保存しました。");
    } catch (error) {
      console.error("プロフィール保存エラー:", error);
      alert("プロフィールの保存に失敗しました: " + error.message);
      profileEditButton.disabled = false;
      profileEditButton.textContent = "プロフィールを保存";
    }
  }
}

// プロフィールモーダルを開く関数。キャッシュにステータスメッセージまで揃っていれば再取得しない
async function openProfileModal(userId, startEditMode = false) {
  currentProfileUserId = userId;
  canEditCurrentProfile = meIsAdmin || userId === myUserId;
  resetProfileEditMode();

  const cached = getUserCache(userId);
  const hasCachedProfileText = !!cached && cached.profileText !== undefined;
  profileName.textContent = (cached && cached.name) || "取得中...";
  profileName.classList.toggle("admin", !!(cached && cached.isAdmin));
  profileText.textContent = hasCachedProfileText
    ? (cached.profileText || "ステータスメッセージはありません。")
    : "取得中...";
  profileAvatarCurrentUrl = (cached && cached.imageUrl) || "";

  profileAvatarHolder.innerHTML = "";
  profileAvatarHolder.appendChild(createAvatar(profileName.textContent, "large", profileAvatarCurrentUrl));

  profileEditButton.classList.toggle("hidden", !canEditCurrentProfile);
  profileModal.classList.remove("hidden");

  // すでにステータスメッセージまでキャッシュ済みなら、Firestoreへは再取得しに行かない
  if (hasCachedProfileText) {
    if (canEditCurrentProfile && startEditMode) handleProfileEditOrSave();
    return;
  }

  try {
    const userSnapshot = await db.collection("users_random").doc(userId).get();
    if (userSnapshot.exists) {
      const userData = userSnapshot.data();
      const updated = setUserCache(userId, {
        name: userData.name || "名前未設定",
        isAdmin: userData.isAdmin || false,
        imageUrl: userData.imageUrl || "",
        profileText: userData.profileText || ""
      });

      profileName.textContent = updated.name;
      profileName.classList.toggle("admin", !!updated.isAdmin);
      profileText.textContent = updated.profileText || "ステータスメッセージはありません。";
      profileAvatarCurrentUrl = updated.imageUrl || "";

      profileAvatarHolder.innerHTML = "";
      profileAvatarHolder.appendChild(createAvatar(profileName.textContent, "large", profileAvatarCurrentUrl));

      if (canEditCurrentProfile && startEditMode) handleProfileEditOrSave();
    } else {
      profileName.textContent = "不明なユーザー";
      profileText.textContent = "";
    }
  } catch (error) {
    console.error("プロフィール取得エラー:", error);
    profileName.textContent = "エラー";
    profileText.textContent = "プロフィールの取得に失敗しました。";
  }
}

let impressionsModal;
let impressionsModalClose;
let impressionsArea;
document.addEventListener("DOMContentLoaded", () => {
  impressionsModal = document.getElementById("impressions-modal");
  impressionsModalClose = document.getElementById("impressions-modal-close");
  impressionsArea = document.getElementById("impressions-area");

  impressionsModalClose.addEventListener("click", () => {
    impressionsModal.classList.add("hidden");
  });
});

function getContentDocRef(id, type) {
  const topDoc = type === "card" ? "cards" : "books";
  return db.collection("ProblemPosting").doc(topDoc).collection("data").doc(id);
}

async function openImpressionsModal(bookId, type) {
  impressionsArea.innerHTML = "<p>読み込み中...</p>";
  impressionsModal.classList.remove("hidden");

  try {
    const bookSnap = await getContentDocRef(bookId, type).get();
    const impressions = (bookSnap.exists && bookSnap.data().impressions) || {};
    const entries = Object.entries(impressions).filter(([, text]) => text && text.trim() !== "");

    impressionsArea.innerHTML = "";

    if (entries.length === 0) {
      const emptyMessage = document.createElement("p");
      emptyMessage.textContent = "まだ感想はありません";
      impressionsArea.appendChild(emptyMessage);
      return;
    }

    for (const [userId] of entries) {
      await ensureUserCached(userId);
    }

    entries.forEach(([userId, text]) => {
      const cached = getUserCache(userId) || {};

      const card = document.createElement("div");
      card.classList.add("impression-card");

      const header = document.createElement("div");
      header.classList.add("impression-card-header");

      const avatar = createAvatar(cached.name, "small", cached.imageUrl);
      header.appendChild(avatar);

      const nameSpan = document.createElement("span");
      nameSpan.classList.add("impression-card-name", "clickable-user");
      nameSpan.textContent = cached.name || "不明なユーザー";
      if (cached.isAdmin) nameSpan.classList.add("admin");
      nameSpan.addEventListener("click", () => {
        openProfileModal(userId);
      });
      header.appendChild(nameSpan);

      if (userId === myUserId || meIsAdmin) {
        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.classList.add("impression-card-edit-button");
        editButton.textContent = "編集";
        editButton.addEventListener("click", () => {
          openImpressionEditModal(bookId, type, userId, text);
        });
        header.appendChild(editButton);
      }

      const textP = document.createElement("p");
      textP.classList.add("impression-card-text");
      textP.textContent = text;

      card.appendChild(header);
      card.appendChild(textP);
      impressionsArea.appendChild(card);
    });
  } catch (error) {
    console.error("感想の取得エラー:", error);
    impressionsArea.innerHTML = "<p>感想の取得に失敗しました。</p>";
  }
}

let impressionEditModal;
let impressionEditModalClose;
let impressionEditInput;
let impressionEditSaveButton;
let impressionEditBookId = "";
let impressionEditType = "book";
let impressionEditTargetUserId = "";
document.addEventListener("DOMContentLoaded", () => {
  impressionEditModal = document.getElementById("impression-edit-modal");
  impressionEditModalClose = document.getElementById("impression-edit-modal-close");
  impressionEditInput = document.getElementById("impression-edit-input");
  impressionEditSaveButton = document.getElementById("impression-edit-save-button");

  impressionEditModalClose.addEventListener("click", () => {
    impressionEditModal.classList.add("hidden");
  });
  impressionEditSaveButton.addEventListener("click", saveImpressionEdit);
});

function openImpressionEditModal(bookId, type, userId, existingText) {
  impressionEditBookId = bookId;
  impressionEditType = type;
  impressionEditTargetUserId = userId;
  impressionEditInput.value = existingText || "";
  impressionEditModal.classList.remove("hidden");
}

async function saveImpressionEdit() {
  const text = impressionEditInput.value.trim();

  impressionEditSaveButton.disabled = true;
  impressionEditSaveButton.textContent = "保存中...";

  try {
    await getContentDocRef(impressionEditBookId, impressionEditType).update({
      [`impressions.${impressionEditTargetUserId}`]: text
    });

    impressionEditModal.classList.add("hidden");
    await openImpressionsModal(impressionEditBookId, impressionEditType);
  } catch (error) {
    console.error("感想の保存エラー:", error);
    alert("感想の保存に失敗しました。\n" + error);
  } finally {
    impressionEditSaveButton.disabled = false;
    impressionEditSaveButton.textContent = "保存する";
  }
}
