// ★ 外部音源ファイルを使わず、Web Audio APIで効果音・BGMをその場で合成するモジュール。
//   liveHost.html / liveAnswer.html の両方から <script> で読み込み、グローバルの LiveAudio として使う。
const LiveAudio = (() => {
  let ctx = null;
  let masterGain = null;
  let bgmGain = null;
  let sfxGain = null;
  let bgmTimer = null;
  let bgmStep = 0;
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
      bgmGain.gain.value = 0.14;
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
  }

  function playCountdownTick(isFinal) {
    ensureContext();
    playTone(isFinal ? 880 : 660, isFinal ? 0.35 : 0.15, "square", 0, isFinal ? 0.45 : 0.28);
  }
  function playQuestionStart() {
    ensureContext();
    playTone(520, 0.12, "triangle", 0, 0.3);
    playTone(780, 0.18, "triangle", 0.08, 0.25);
  }
  function playLock() {
    ensureContext();
    playTone(300, 0.25, "sawtooth", 0, 0.22);
  }
  function playReveal() {
    ensureContext();
    playTone(440, 0.15, "sine", 0, 0.25);
    playTone(660, 0.2, "sine", 0.1, 0.25);
  }
  function playCorrect() {
    ensureContext();
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => playTone(f, 0.18, "sine", i * 0.09, 0.3));
  }
  function playIncorrect() {
    ensureContext();
    playTone(220, 0.25, "sawtooth", 0, 0.22);
    playTone(180, 0.35, "sawtooth", 0.12, 0.22);
  }
  function playFanfare() {
    ensureContext();
    [523.25, 523.25, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      playTone(f, 0.22, "triangle", i * 0.13, 0.32)
    );
  }

  // ---- BGM: 生成音だけで作る、シンプルなアルペジオ・ループ ----
  const bgmPattern = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63]; // C major
  function startBgm() {
    ensureContext();
    if (bgmTimer || !ctx) return;
    bgmStep = 0;
    const stepTime = 0.42;
    const scheduleNext = () => {
      const freq = bgmPattern[bgmStep % bgmPattern.length];
      playTone(freq, stepTime * 0.9, "sine", 0, 0.16, bgmGain);
      playTone(freq / 2, stepTime * 0.9, "sine", 0, 0.09, bgmGain);
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
    isMuted
  };
})();
