// ★ app.htmlの「プロフィールを編集」「ユーザー一覧」機能を、他のページ(answer.html/answerCard.html等)でも
//   同じ見た目・同じ挙動で使えるようにした共通モジュール。
//   このファイルを読み込むページは、あらかじめ以下のグローバルが用意されている前提で動く：
//   - db (firebase.firestore())
//   - myUserId, meIsAdmin
//   - drawerUsername (要素。無ければ自分の名前欄への反映はスキップされる)
//   - AppDialog (alert/confirm用の共通ダイアログ)
//   - HTML側に #profile-modal / #user-list-modal / #drawer-edit-profile-button / #drawer-user-list-button
//     が app.html と同じ構造で用意されていること

let imgbbApiKeyCache = null;

// ★ ImgBBへの画像アップロード（system_keys/imgbb からAPIキーを取得してアップロードし、URLを保存する）
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

// ★ ユーザー情報のキャッシュ（name/isAdmin/imageUrl/profileText/prizeExpiresAt）
let userDataCache = {};
function getUserCache(userId) {
  return userDataCache[userId] || null;
}
function setUserCache(userId, data) {
  userDataCache[userId] = Object.assign({}, userDataCache[userId] || {}, data);
  return userDataCache[userId];
}

// ★ Firestoreのタイムスタンプ(またはミリ秒数値)を、比較に使いやすいミリ秒数値へ揃える
function toMillisOrNull(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value === "number") return value;
  return null;
}

// ★ スペシャルライブ優勝の景品(名前が光る)が、現在も有効期限内かどうか
function hasActivePrize(cached) {
  const expiresAt = cached && cached.prizeExpiresAt;
  return typeof expiresAt === "number" && expiresAt > Date.now();
}

// ★ 指定したユーザーの情報（name/isAdmin/imageUrl/profileText/prizeExpiresAt）がキャッシュになければ取得する
async function ensureUserCached(userId) {
  if (getUserCache(userId)) return;

  const userSnapshot = await db.collection("users_random").doc(userId).get();
  if (userSnapshot.exists) {
    const userData = userSnapshot.data();
    setUserCache(userId, {
      name: userData.name || "名前未設定",
      isAdmin: userData.isAdmin || false,
      imageUrl: userData.imageUrl || "",
      profileText: userData.profileText || "",
      prizeExpiresAt: toMillisOrNull(userData.prizeExpiresAt)
    });
  } else {
    setUserCache(userId, { name: "不明なユーザー", isAdmin: false, imageUrl: "", profileText: "", prizeExpiresAt: null });
  }
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

// ---- ユーザー一覧モーダル ----
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
        profileText: userData.profileText || "",
        prizeExpiresAt: toMillisOrNull(userData.prizeExpiresAt)
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
      if (isAdmin) {
        nameSpan.classList.add("admin");
      } else if (hasActivePrize(getUserCache(userId))) {
        nameSpan.classList.add("prize");
      }
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

// ---- プロフィールモーダル ----
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
      await AppDialog.alert("ユーザーネームを入力してください。");
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
        profileText: newProfileText,
        prizeExpiresAt: previousCache.prizeExpiresAt || null
      });

      if (currentProfileUserId === myUserId && typeof drawerUsername !== "undefined" && drawerUsername) {
        drawerUsername.textContent = newName;
        drawerUsername.classList.toggle("admin", !!updated.isAdmin);
        drawerUsername.classList.toggle("prize", !updated.isAdmin && hasActivePrize(updated));
      }

      profileName.textContent = newName;
      profileText.textContent = newProfileText || "ステータスメッセージはありません。";

      profileAvatarCurrentUrl = finalImageUrl;
      profileAvatarFile = null;
      profileAvatarRemoved = false;
      profileAvatarHolder.innerHTML = "";
      profileAvatarHolder.appendChild(createAvatar(newName, "large", updated.imageUrl));

      profileName.classList.toggle("admin", !!updated.isAdmin);
      profileName.classList.toggle("prize", !updated.isAdmin && hasActivePrize(updated));

      resetProfileEditMode();
      await AppDialog.alert("プロフィールを保存しました。");
    } catch (error) {
      console.error("プロフィール保存エラー:", error);
      await AppDialog.alert("プロフィールの保存に失敗しました: " + error.message);
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
  profileName.classList.toggle("prize", !!cached && !cached.isAdmin && hasActivePrize(cached));
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
        profileText: userData.profileText || "",
        prizeExpiresAt: toMillisOrNull(userData.prizeExpiresAt)
      });

      profileName.textContent = updated.name;
      profileName.classList.toggle("admin", !!updated.isAdmin);
      profileName.classList.toggle("prize", !updated.isAdmin && hasActivePrize(updated));
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
