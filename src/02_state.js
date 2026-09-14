// ── 2. 상태: RNG, state 객체, save/load
(function (root) {
  'use strict';
  var AB = root.AB || (root.AB = {});
  var C = AB.C;

  // ── 시드 가능한 난수 (mulberry32). 테스트/밸런스 시뮬 재현용
  var rng = (function () {
    var s = (Date.now() >>> 0) || 1;
    function next() {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      seed: function (n) { s = (n >>> 0) || 1; },
      state: function () { return s; },
      next: next,
      chance: function (p) { return next() < p; },
      int: function (a, b) { return a + Math.floor(next() * (b - a + 1)); },       // [a, b]
      range: function (a, b) { return a + next() * (b - a); },
      pick: function (arr) { return arr[Math.floor(next() * arr.length)]; },
      // 근사 정규분포 (평균 0, 표준편차 1)
      gauss: function () { var u = 0, v = 0; while (u === 0) u = next(); while (v === 0) v = next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); },
      shuffle: function (arr) { for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(next() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; },
      weighted: function (weights) { var r = next() * weights.reduce(function (a, b) { return a + b; }, 0); for (var i = 0; i < weights.length; i++) { r -= weights[i]; if (r < 0) return i; } return weights.length - 1; }
    };
  })();
  AB.rng = rng;

  // ── 저장소: localStorage 가 없으면(테스트/파일 프로토콜 예외) 메모리로 대체
  var memory = {};
  var memoryStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(memory, k) ? memory[k] : null; },
    setItem: function (k, v) { memory[k] = String(v); },
    removeItem: function (k) { delete memory[k]; }
  };
  function defaultStorage() {
    try { if (typeof localStorage !== 'undefined' && localStorage) { localStorage.getItem('__t'); return localStorage; } } catch (e) { /* 접근 불가 */ }
    return memoryStorage;
  }

  var S = { storage: defaultStorage(), memoryStorage: memoryStorage };

  // 3.3 게임 상태 (프롬프트 모델에 저장용 필드를 더한 형태)
  S.create = function (seed) {
    if (seed !== undefined) rng.seed(seed);
    return {
      version: C.VERSION,
      seed: seed === undefined ? null : seed,
      rngState: rng.state(),
      season: 1,                 // 1-8
      phase: 'draft',            // draft|shop|lineup|game|result|retired
      playerId: null,            // 내 선수 id
      players: {},               // id → 선수 카드 (라인업/벤치/내 선수 전부)
      lineup: [null, null, null, null, null, null, null, null, null], // 9칸, 선수 id 또는 null
      bench: [],                 // 영입했지만 안 쓰는 선수 id
      budget: 0,                 // 연봉 총액 상한
      fame: 0,                   // 명성 — 상점 카드 등급에 영향
      rerolls: 0,
      draftRound: 0,
      nextId: 1,
      shop: [],                  // 현재 상점 카드 (아직 영입 안 된 선수 객체)
      gameResult: null,          // 관전 경기 결과 {log, score, ...}
      seasonResult: null,        // 시즌 정산 결과
      growthOptions: null,       // 3지선다
      career: { games: 0, hits: 0, hr: 0, rbi: 0, sb: 0, ab: 0, avg: 0, titles: 0, champs: 0, seasons: [] },
      hof: null                  // 은퇴 후 채워짐
    };
  };

  S.getPlayer = function (state, id) { return id == null ? null : (state.players[id] || null); };
  S.lineupPlayers = function (state) { return state.lineup.map(function (id) { return S.getPlayer(state, id); }); };
  S.benchPlayers = function (state) { return state.bench.map(function (id) { return S.getPlayer(state, id); }); };
  S.rosterIds = function (state) { return state.lineup.filter(function (id) { return id != null; }).concat(state.bench); };
  S.payroll = function (state) {
    return S.rosterIds(state).reduce(function (sum, id) { var p = state.players[id]; return sum + (p && !p.isPlayer ? p.salary : 0); }, 0);
  };
  S.lineupFull = function (state) { return state.lineup.every(function (id) { return id != null; }); };

  S.save = function (state, storage) {
    var st = storage || S.storage;
    state.rngState = rng.state();
    try { st.setItem(C.STORAGE_KEY, JSON.stringify(state)); return true; } catch (e) { return false; }
  };
  S.load = function (storage) {
    var st = storage || S.storage;
    try {
      var raw = st.getItem(C.STORAGE_KEY);
      if (!raw) return null;
      var state = JSON.parse(raw);
      if (!state || state.version !== C.VERSION) return null;
      if (state.rngState) rng.seed(state.rngState);
      return state;
    } catch (e) { return null; }
  };
  S.clear = function (storage) { try { (storage || S.storage).removeItem(C.STORAGE_KEY); } catch (e) { /* noop */ } };

  S.loadRanking = function (storage) {
    try { var raw = (storage || S.storage).getItem(C.RANKING_KEY); return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
  };
  S.saveRanking = function (list, storage) {
    try { (storage || S.storage).setItem(C.RANKING_KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
  };
  // 랭킹 등재. 상위 rankingSize 개만 유지. 반환: 등재된 순위(1-based) 또는 0
  S.addRanking = function (entry, storage) {
    var list = S.loadRanking(storage);
    list.push(entry);
    list.sort(function (a, b) { return b.score - a.score || (a.date || '').localeCompare(b.date || ''); });
    list = list.slice(0, C.HOF.rankingSize);
    S.saveRanking(list, storage);
    var idx = list.indexOf(entry);
    return idx < 0 ? 0 : idx + 1;
  };

  AB.state = S;
  if (typeof module !== 'undefined' && module.exports) module.exports = AB;
})(typeof window !== 'undefined' ? window : globalThis);
