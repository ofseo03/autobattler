// ── 4. 시너지: 런/세트/인접/클린업 판정 엔진 ← 순수 함수
// 입력: lineup (길이 9, 선수 객체 또는 null). 상태·난수 접근 없음.
// 출력: 발동 시너지 목록 + 칸별 능력치 보정 + 팀 보정.
// 드래그 미리보기는 evaluate()를 가상 배치로 한 번 더 호출해 diff()로 비교한다.
(function (root) {
  'use strict';
  var AB = root.AB || (root.AB = {});
  var C = AB.C;
  var SY = {};

  function has(p, tag) { return !!p && p.tags.indexOf(tag) >= 0; }
  function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }
  function slotLabel(slots) {
    if (slots.length === 1) return (slots[0] + 1) + '번';
    var consecutive = slots.every(function (s, i) { return i === 0 || s === slots[i - 1] + 1; });
    if (consecutive) return (slots[0] + 1) + '~' + (slots[slots.length - 1] + 1) + '번';
    return slots.map(function (s) { return (s + 1) + '번'; }).join('·');
  }
  function pct(v) { return (v > 0 ? '+' : '') + Math.round(v * 100) + '%'; }
  function mainStatLabel(tag) {
    var m = C.TAG_MAIN_STAT[tag];
    return m === 'all' ? '전체 능력치' : m === 'growth' ? '성장률' : C.STAT_LABEL[m];
  }

  SY.evaluate = function (lineup) {
    var n = lineup.length;
    var syn = [];
    var bonus = lineup.map(function () { return { power: 0, contact: 0, speed: 0, defense: 0 }; });
    var mods = { growth: zeros(n), rbi: zeros(n), steal: zeros(n), xbh: zeros(n), k: zeros(n), clutch: zeros(n) };
    var team = { morale: 0, score: 0 };

    function addStat(i, statKey, v) {
      if (statKey === 'all') C.STATS.forEach(function (s) { bonus[i][s] += v * C.VETERAN_ALL_FACTOR; });
      else if (statKey === 'growth') mods.growth[i] += v;
      else bonus[i][statKey] += v;
    }

    // 4.1 런 — 연속 칸 3개 이상 같은 태그
    C.TAGS.forEach(function (tag) {
      var i = 0;
      while (i < n) {
        if (!has(lineup[i], tag)) { i++; continue; }
        var j = i;
        while (j + 1 < n && has(lineup[j + 1], tag)) j++;
        var len = j - i + 1;
        if (len >= 3) {
          var tier = C.RUN[Math.min(len, 5)];
          var slots = [];
          for (var s = i; s <= j; s++) slots.push(s);
          syn.push({
            type: 'run', key: 'run:' + tag + ':' + i, tag: tag, slots: slots, level: Math.min(len, 5), bonus: tier.bonus,
            name: tier.name + ' [' + tag + ']',
            desc: slotLabel(slots) + ' ' + mainStatLabel(tag) + ' ' + pct(tier.bonus) + (tier.morale ? ', 팀 사기 +' + tier.morale : '')
          });
          slots.forEach(function (s) { addStat(s, C.TAG_MAIN_STAT[tag], tier.bonus); });
          if (tier.morale) team.morale += tier.morale;
        }
        i = j + 1;
      }
    });

    // 4.2 세트 — 같은 태그, 서로 다른 포지션 3명 이상 (타순 무관)
    C.TAGS.forEach(function (tag) {
      var seen = {}, slots = [];
      lineup.forEach(function (p, i) {
        if (has(p, tag) && !seen[p.position]) { seen[p.position] = true; slots.push(i); }
      });
      var tier = null;
      C.SET.forEach(function (t) { if (slots.length >= t.count) tier = t; });
      if (tier) {
        syn.push({
          type: 'set', key: 'set:' + tag, tag: tag, slots: slots, level: tier.count, bonus: tier.bonus,
          name: '세트 [' + tag + ' ×' + tier.count + ']',
          desc: '팀 전체 ' + mainStatLabel(tag) + ' ' + pct(tier.bonus)
        });
        for (var i = 0; i < n; i++) if (lineup[i]) addStat(i, C.TAG_MAIN_STAT[tag], tier.bonus);
      }
    });

    // 4.3 인접 조합
    for (var i = 0; i + 1 < n; i++) {
      var a = lineup[i], b = lineup[i + 1];
      if (!a || !b) continue;
      C.ADJACENT.forEach(function (r) {
        if (!has(a, r.from) || !has(b, r.to)) return;
        syn.push({ type: 'adj', key: 'adj:' + r.name + ':' + i, tag: r.from + '→' + r.to, slots: [i, i + 1], level: 1, name: r.name, desc: slotLabel([i, i + 1]) + ' ' + r.desc });
        if (r.effect === 'rbi') mods.rbi[i + 1] += r.value;
        else if (r.effect === 'steal') mods.steal[i] += r.value;
        else if (r.effect === 'growth') mods.growth[i + 1] += r.value;
        else if (r.effect === 'cannon') { mods.xbh[i] += r.xbh; mods.xbh[i + 1] += r.xbh; mods.k[i] += r.k; mods.k[i + 1] += r.k; }
      });
    }
    var cs = C.CLUTCH_SLOT;
    if (has(lineup[cs.slot], cs.tag)) {
      syn.push({ type: 'adj', key: 'adj:' + cs.name, tag: cs.tag, slots: [cs.slot], level: 1, name: cs.name, desc: (cs.slot + 1) + '번 ' + cs.desc });
      mods.clutch[cs.slot] += cs.value;
    }

    // 4.4 클린업 트리오 — 3·4·5번 기본 power 합 (배치 화면에 상시 표시)
    var cleanupPower = 0, cleanupFull = true;
    C.CLEANUP.slots.forEach(function (s) { if (lineup[s]) cleanupPower += lineup[s].power; else cleanupFull = false; });
    var cleanupActive = cleanupFull && cleanupPower >= C.CLEANUP.threshold;
    if (cleanupActive) {
      syn.push({ type: 'cleanup', key: 'cleanup', tag: null, slots: C.CLEANUP.slots.slice(), level: 1, name: C.CLEANUP.name, desc: '3·4·5번 장타력 합 ' + cleanupPower + ' — ' + C.CLEANUP.desc });
      team.score += C.CLEANUP.bonus;
    }

    // 최종 능력치 = 기본 × (1 + 런 + 세트). 99 를 넘을 수 있다 (시뮬에서 확률로 흡수)
    var effective = lineup.map(function (p, i) {
      if (!p) return null;
      var e = {};
      C.STATS.forEach(function (s) { e[s] = Math.round(p[s] * (1 + bonus[i][s])); });
      return e;
    });

    return { synergies: syn, bonus: bonus, mods: mods, team: team, effective: effective, cleanupPower: cleanupPower, cleanupActive: cleanupActive };
  };

  // 시너지가 하나도 없는 것으로 간주한 평가 결과 (비교·밸런스용)
  SY.none = function (lineup) {
    var n = lineup.length;
    return {
      synergies: [], bonus: lineup.map(function () { return { power: 0, contact: 0, speed: 0, defense: 0 }; }),
      mods: { growth: zeros(n), rbi: zeros(n), steal: zeros(n), xbh: zeros(n), k: zeros(n), clutch: zeros(n) },
      team: { morale: 0, score: 0 },
      effective: lineup.map(function (p) { if (!p) return null; var e = {}; C.STATS.forEach(function (s) { e[s] = p[s]; }); return e; }),
      cleanupPower: 0, cleanupActive: false
    };
  };

  // 두 평가 결과 비교 — 미리보기용. 런은 같은 태그·겹치는 칸이면 같은 런으로 본다.
  SY.diff = function (before, after) {
    var out = { added: [], removed: [], upgraded: [], downgraded: [], kept: [] };
    var used = {};
    function overlap(a, b) { return a.slots.some(function (s) { return b.slots.indexOf(s) >= 0; }); }
    before.synergies.forEach(function (b) {
      var match = null;
      for (var i = 0; i < after.synergies.length; i++) {
        var a = after.synergies[i];
        if (used[i] || a.type !== b.type) continue;
        if (b.type === 'run' ? (a.tag === b.tag && overlap(a, b)) : a.key === b.key) { match = i; break; }
      }
      if (match === null) { out.removed.push(b); return; }
      used[match] = true;
      var a2 = after.synergies[match];
      if (a2.level > b.level) out.upgraded.push({ from: b, to: a2 });
      else if (a2.level < b.level) out.downgraded.push({ from: b, to: a2 });
      else out.kept.push(a2);
    });
    after.synergies.forEach(function (a, i) { if (!used[i]) out.added.push(a); });
    return out;
  };

  // 가상 배치 헬퍼 — 원본을 건드리지 않고 두 칸을 바꾼 배열 반환
  SY.swapped = function (lineup, i, j) { var l = lineup.slice(); var t = l[i]; l[i] = l[j]; l[j] = t; return l; };
  SY.placed = function (lineup, i, player) { var l = lineup.slice(); l[i] = player; return l; };
  // 미리보기: 현재 lineup 에서 가상 lineup 으로 바뀔 때의 diff
  SY.preview = function (lineup, virtualLineup) { return SY.diff(SY.evaluate(lineup), SY.evaluate(virtualLineup)); };

  // 단순 점수 — 배치 비교/AI 용. 발동 시너지 가치의 합
  SY.score = function (result) {
    var s = 0;
    result.effective.forEach(function (e) { if (e) s += e.power * 0.55 + e.contact * 0.9 + e.speed * 0.25 + e.defense * 0.35; });
    result.synergies.forEach(function (x) {
      if (x.type === 'adj') s += 12;
      if (x.type === 'cleanup') s += 30;
    });
    s += result.team.morale * 10;
    return s;
  };

  AB.synergy = SY;
  if (typeof module !== 'undefined' && module.exports) module.exports = AB;
})(typeof window !== 'undefined' ? window : globalThis);
