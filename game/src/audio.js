// Synthesized sound: every effect is an oscillator or filtered noise burst built in
// WebAudio, so the game ships no audio files and works fully offline. The context is
// created on the first user gesture (browsers block audio before that) and every call
// is a no-op until then.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let musicTimer = null;
  let musicStep = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function tone({ type = 'sine', from = 440, to = null, dur = 0.15, vol = 0.2, when = 0 }) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise({ dur = 0.3, vol = 0.3, from = 1200, to = 120 }) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(from, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  /** A slow two-note bass pulse under the game; quiet enough to sit behind the effects. */
  function startMusic() {
    if (!ctx || musicTimer !== null) return;
    const notes = [55, 55, 65.41, 49];
    musicTimer = window.setInterval(() => {
      if (muted) return;
      const n = notes[musicStep % notes.length];
      musicStep += 1;
      tone({ type: 'triangle', from: n, dur: 0.9, vol: 0.07 });
      tone({ type: 'triangle', from: n * 2, dur: 0.5, vol: 0.03, when: 0.02 });
    }, 620);
  }

  return {
    /** Call from the first click/keypress; safe to call repeatedly. */
    unlock() {
      if (ensure()) startMusic();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    shoot() {
      tone({ type: 'square', from: 880, to: 220, dur: 0.08, vol: 0.08 });
    },
    enemyShoot() {
      tone({ type: 'sawtooth', from: 320, to: 160, dur: 0.12, vol: 0.05 });
    },
    boom(big) {
      noise({ dur: big ? 0.7 : 0.35, vol: big ? 0.5 : 0.3, from: big ? 900 : 1400, to: 90 });
      tone({ type: 'sine', from: big ? 120 : 160, to: 32, dur: big ? 0.6 : 0.3, vol: 0.35 });
    },
    hurt() {
      tone({ type: 'sawtooth', from: 220, to: 55, dur: 0.35, vol: 0.3 });
      noise({ dur: 0.25, vol: 0.2, from: 900, to: 150 });
    },
    pickup() {
      tone({ type: 'sine', from: 523, dur: 0.09, vol: 0.16 });
      tone({ type: 'sine', from: 659, dur: 0.09, vol: 0.16, when: 0.07 });
      tone({ type: 'sine', from: 784, dur: 0.14, vol: 0.18, when: 0.14 });
    },
    wave() {
      tone({ type: 'triangle', from: 196, to: 392, dur: 0.4, vol: 0.16 });
      tone({ type: 'triangle', from: 294, to: 587, dur: 0.4, vol: 0.12, when: 0.12 });
    },
    alarm() {
      tone({ type: 'sawtooth', from: 440, to: 440, dur: 0.18, vol: 0.14 });
      tone({ type: 'sawtooth', from: 440, to: 440, dur: 0.18, vol: 0.14, when: 0.24 });
      tone({ type: 'sawtooth', from: 587, to: 587, dur: 0.3, vol: 0.14, when: 0.48 });
    },
    nova() {
      noise({ dur: 0.8, vol: 0.45, from: 2400, to: 60 });
      tone({ type: 'sine', from: 220, to: 28, dur: 0.8, vol: 0.4 });
    },
    click() {
      tone({ type: 'sine', from: 660, dur: 0.06, vol: 0.12 });
    },
  };
}
