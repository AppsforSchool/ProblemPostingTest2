// ★ 外部音源ファイルを使わず、Web Audio APIで効果音・BGMをその場で合成するモジュール。
//   liveHost.html / liveAnswer.html の両方から <script> で読み込み、グローバルの LiveAudio として使う。
const LiveAudio = (() => {
  let ctx = null;
  let masterGain = null;
  let bgmGain = null;
  let sfxGain = null;
  let bgmTimer = null;
  let bgmStep = 0;
  let noiseBuffer = null;
  let muted = localStorage.getItem("liveAudioMuted") === "1";

  function ensureContext() {
    if (!ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      ctx = new AudioContextClass();

      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : 1;
      masterGain.connect(ctx.destination);

      bgmGain = ctx.createGain();
      bgmGain.gain.value = 0.13;
      bgmGain.connect(masterGain);

      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.35;
      sfxGain.connect(masterGain);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // ★ ブラウザの自動再生制限対策。ページ内の最初のタップ/クリックで音声を解禁する
  function unlock() {
    ensureContext();
  }
  ["click", "touchstart"].forEach(evt => {
    document.addEventListener(evt, unlock, { once: true, passive: true });
  });

  // ---- 基本パーツ ----
  function playTone(freq, duration, type, delay, gainValue, destination) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(gainValue || 0.3, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(destination || sfxGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
    return osc;
  }

  // ★ 音程を滑らかに変化させる(トロンボーン風の「ワウン」やお祝いの「タラーン」に使う)
  function playSlide(freqFrom, freqTo, duration, type, delay, gainValue, destination) {
    if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || "sawtooth";
    osc.frequency.setValueAtTime(freqFrom, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(freqTo, 1), t0 + duration);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(gainValue || 0.3, t0 + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(destination || sfxGain);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  function ensureNoiseBuffer() {
    if (noiseBuffer || !ctx) return noiseBuffer;
    const length = ctx.sampleRate * 0.2;
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
  }

  // ★ シャカッという打楽器風の短いノイズ音(BGMのリズム用)
  function playNoiseTick(delay, gainValue, destination) {
    if (!ctx) return;
    const buffer = ensureNoiseBuffer();
    if (!buffer) return;
    const t0 = ctx.currentTime + (delay || 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 4000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue || 0.15, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination || bgmGain);
    source.start(t0);
    source.stop(t0 + 0.08);
  }

  // ---- 効果音 ----
  function playCountdownTick(isFinal) {
    ensureContext();
    if (isFinal) {
      // 最後の1つ手前は上ずったダブルブリップで期待感を演出
      playTone(880, 0.12, "square", 0, 0.4);
      playTone(1175, 0.28, "square", 0.1, 0.45);
    } else {
      playTone(660, 0.14, "square", 0, 0.28);
    }
  }

  function playQuestionStart() {
    ensureContext();
    // 軽快な上昇3連符で「はじまるよ!」感を出す
    [523.25, 659.25, 987.77].forEach((f, i) => playTone(f, 0.14, "triangle", i * 0.07, 0.28));
  }

  function playLock() {
    ensureContext();
    playSlide(420, 160, 0.35, "sawtooth", 0, 0.22);
  }

  function playReveal() {
    ensureContext();
    playTone(660, 0.1, "sine", 0, 0.22);
    playTone(880, 0.18, "sine", 0.09, 0.24);
  }

  function playCorrect() {
    ensureContext();
    // ピコピコ上昇アルペジオ + キラッと1音add
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => playTone(f, 0.16, "square", i * 0.075, 0.26));
    playTone(1568, 0.35, "sine", 0.32, 0.18);
  }

  function playIncorrect() {
    ensureContext();
    // コミカルな「ワウ〜ン」下降スライド(悲しいトロンボーン風)
    playSlide(330, 110, 0.55, "sawtooth", 0, 0.22);
    playSlide(220, 90, 0.5, "sawtooth", 0.08, 0.12);
  }

  function playFanfare() {
    ensureContext();
    const melody = [523.25, 523.25, 523.25, 659.25, 783.99, 659.25, 783.99, 1046.5];
    const timing = [0, 0.14, 0.28, 0.42, 0.56, 0.7, 0.84, 1.0];
    melody.forEach((f, i) => {
      playTone(f, 0.3, "triangle", timing[i], 0.32);
      playTone(f / 2, 0.3, "square", timing[i], 0.12);
    });
    // 締めのキラキラ
    [1568, 1975.5, 2093].forEach((f, i) => playTone(f, 0.5, "sine", 1.15 + i * 0.09, 0.16));
  }

  // ---- BGM: リズミカルなアルペジオ・ループ(生成音のみ、外部音源不要) ----
  const bgmChordA = [261.63, 329.63, 392.0, 523.25]; // C major
  const bgmChordB = [293.66, 349.23, 440.0, 587.33]; // D minor風
  function startBgm() {
    ensureContext();
    if (bgmTimer || !ctx) return;
    ensureNoiseBuffer();
    bgmStep = 0;
    const stepTime = 0.24;
    const scheduleNext = () => {
      const barStep = bgmStep % 8;
      const chord = bgmStep % 16 < 8 ? bgmChordA : bgmChordB;
      const freq = chord[barStep % chord.length];

      playTone(freq, stepTime * 1.6, "triangle", 0, 0.15, bgmGain);
      playTone(freq / 2, stepTime * 1.6, "sine", 0, 0.07, bgmGain);

      // 裏拍で軽いノイズパーカッションを入れてリズムに弾みをつける
      if (barStep % 2 === 1) playNoiseTick(0, 0.06, bgmGain);

      bgmStep += 1;
    };
    scheduleNext();
    bgmTimer = setInterval(scheduleNext, stepTime * 1000);
  }
  function stopBgm() {
    if (bgmTimer) {
      clearInterval(bgmTimer);
      bgmTimer = null;
    }
  }

  function setMuted(value) {
    muted = value;
    localStorage.setItem("liveAudioMuted", muted ? "1" : "0");
    if (masterGain) masterGain.gain.value = muted ? 0 : 1;
  }
  function toggleMuted() {
    setMuted(!muted);
    return muted;
  }
  function isMuted() {
    return muted;
  }

  // ---- アイコン(絵文字ではなく独自SVG) ----
  function iconMarkup(isMutedIcon) {
    if (isMutedIcon) {
      return (
        '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M4 9.5V14.5H8L13 19V5L8 9.5H4Z" fill="currentColor"/>' +
        '<path d="M16.5 8.5L21 13M21 8.5L16.5 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
        "</svg>"
      );
    }
    return (
      '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M4 9.5V14.5H8L13 19V5L8 9.5H4Z" fill="currentColor"/>' +
      '<path d="M16.2 8.8C17.3 9.9 17.3 14.1 16.2 15.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '<path d="M18.6 6.4C21 8.8 21 15.2 18.6 17.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity="0.7"/>' +
      "</svg>"
    );
  }

  return {
    unlock,
    playCountdownTick,
    playQuestionStart,
    playLock,
    playReveal,
    playCorrect,
    playIncorrect,
    playFanfare,
    startBgm,
    stopBgm,
    toggleMuted,
    isMuted,
    iconMarkup
  };
})();
