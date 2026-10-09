// Озвучка: спершу запис носія мови з Wikimedia Commons, якщо його немає —
// вбудований синтез мовлення (на iPhone — німецький голос iOS).
import { settings } from './store.js';

const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
const CACHE_NAME = 'audio-v1';
const player = new Audio();
player.preload = 'auto';

let voices = [];
const voiceListeners = new Set();
function loadVoices() {
  if (!synth) return;
  voices = synth.getVoices().filter(v => /^de([-_]|$)/i.test(v.lang));
}
if (synth) {
  loadVoices();
  synth.onvoiceschanged = () => { loadVoices(); voiceListeners.forEach(fn => fn()); };
}
export function onVoicesChanged(fn) { voiceListeners.add(fn); return () => voiceListeners.delete(fn); }

function voiceScore(v) {
  const id = (v.voiceURI + ' ' + v.name).toLowerCase();
  let s = 0;
  if (/premium/.test(id)) s += 50;
  else if (/enhanced|erweitert|verbessert/.test(id)) s += 40;
  if (/^de[-_]de/i.test(v.lang)) s += 10;
  if (/google|natural|neural/.test(id)) s += 8;
  if (/anna|helena|petra|markus|yannick|martin|katja|conrad|amala|hedda|stefan/.test(id)) s += 5;
  if (/eloquence|bells|bubbles|cellos|organ|trinoids|whisper|zarvox|jester|superstar|wobble|boing|bahh|albert|bad news|good news|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley/.test(id)) s -= 100;
  return s;
}
export function germanVoices() {
  loadVoices();
  return voices.slice().sort((a, b) => voiceScore(b) - voiceScore(a));
}
function pickVoice() {
  loadVoices();
  if (settings.voice) { const v = voices.find(x => x.voiceURI === settings.voice); if (v) return v; }
  return germanVoices()[0] || null;
}
export const hasTTS = () => !!synth;

export function speak(text, rate = settings.rate) {
  if (!synth) return false;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE';
  u.rate = rate;
  const v = pickVoice();
  if (v) { u.voice = v; u.lang = v.lang; }
  synth.speak(u);
  return true;
}

// ---------- Записи ----------
const objUrls = new Map();
const failed = new Map();
const recentlyFailed = url => failed.has(url) && Date.now() - failed.get(url) < 60000;

async function cacheOpen() {
  try { return 'caches' in window ? await caches.open(CACHE_NAME) : null; } catch { return null; }
}
async function fetchAudio(url) {
  const c = await cacheOpen();
  let res = c ? await c.match(url) : null;
  if (!res) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    try { res = await fetch(url, { mode: 'cors', signal: ctrl.signal }); } finally { clearTimeout(t); }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    if (c) { try { await c.put(url, res.clone()); } catch { /* кеш переповнений */ } }
  }
  return res;
}
async function srcFor(url) {
  if (objUrls.has(url)) return objUrls.get(url);
  const blob = await (await fetchAudio(url)).blob();
  const o = URL.createObjectURL(blob);
  objUrls.set(url, o);
  return o;
}

export function prefetch(e) {
  if (!e || !e.audio || !settings.recordings || objUrls.has(e.audio) || recentlyFailed(e.audio)) return;
  srcFor(e.audio).catch(() => failed.set(e.audio, Date.now()));
}

let token = 0;
function halt() {
  try { player.pause(); } catch { /* */ }
  if (synth) synth.cancel();
}
export function stop() { token++; halt(); }

// e — запис словника; tts: true — завжди синтез (напр., щоб почути артикль).
export async function play(e, { slow = false, tts = false } = {}) {
  halt();
  const my = ++token;
  if (!tts && e.audio && settings.recordings && !recentlyFailed(e.audio)) {
    let src = null;
    try { src = await srcFor(e.audio); } catch { failed.set(e.audio, Date.now()); }
    if (my !== token) return;
    if (src) {
      try {
        player.src = src;
        player.defaultPlaybackRate = player.playbackRate = slow ? 0.7 : 1;
        await player.play();
        return;
      } catch { if (my !== token) return; }
    }
  }
  speak(e.de, slow ? Math.max(0.4, settings.rate * 0.65) : settings.rate);
}

// iOS дозволяє звук лише після дотику — «розблоковуємо» при першому дотику.
let unlocked = false;
function silentWav() {
  const n = 800, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true); v.setUint32(28, 32000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
export function unlock() {
  if (unlocked) return;
  unlocked = true;
  try { if (synth) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } } catch { /* */ }
  try { if (!player.src) { player.src = silentWav(); player.play().catch(() => {}); } } catch { /* */ }
}

// ---------- Офлайн-кеш ----------
export async function downloadAll(list, onProgress, signal) {
  const urls = [...new Set(list.map(e => e.audio).filter(Boolean))];
  const c = await cacheOpen();
  if (!c) throw new Error('Кеш браузера недоступний');
  let done = 0, bad = 0;
  const queue = urls.slice();
  async function worker() {
    while (queue.length && !(signal && signal.aborted)) {
      const u = queue.shift();
      try {
        if (!(await c.match(u))) {
          const r = await fetch(u, { mode: 'cors' });
          if (r.ok) await c.put(u, r); else bad++;
        }
      } catch { bad++; }
      done++;
      onProgress && onProgress(done, urls.length);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  return { total: urls.length, failed: bad };
}
export async function cachedCount() {
  const c = await cacheOpen();
  return c ? (await c.keys()).length : 0;
}
export async function clearCache() {
  try { if ('caches' in window) await caches.delete(CACHE_NAME); } catch { /* */ }
  objUrls.forEach(u => URL.revokeObjectURL(u));
  objUrls.clear();
}
