// ── 3. 생성: 선수 카드 랜덤 생성기, 드래프트, 노화, 성장 선택지
(function (root) {
  'use strict';
  var AB = root.AB || (root.AB = {});
  var C = AB.C, rng = AB.rng;
  var G = {};

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function round(v) { return Math.round(v); }

  G.randomName = function () { return rng.pick(C.NAMES.last) + rng.pick(C.NAMES.first); };
  G.hasTag = function (p, tag) { return !!p && p.tags.indexOf(tag) >= 0; };
  G.overall = function (p) { return (p.power + p.contact + p.speed + p.defense) / 4; };
  G.salaryFor = function (p) { return Math.max(C.CARD.salaryMin, round((G.overall(p) - C.CARD.salaryBase) * C.CARD.salaryPerPoint)); };

  function pickTags(n) {
    var pool = C.TAGS.slice(), out = [];
    while (out.length < n) { out.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]); }
    return out;
  }
  function ageForTags(tags) {
    var r = G.hasTag({ tags: tags }, '신예') ? C.CARD.rookieAge : G.hasTag({ tags: tags }, '베테랑') ? C.CARD.veteranAge : C.CARD.normalAge;
    return rng.int(r[0], r[1]);
  }

  // 3.1 선수 카드 — 명성이 높을수록 품질 상승
  G.makeCard = function (fame, id, opts) {
    opts = opts || {};
    var K = C.CARD;
    var q = clamp(K.baseQuality + fame * K.qualityPerFame + rng.gauss() * K.qualitySd, K.qualityMin, K.qualityMax);
    var tags = opts.tags || pickTags(2);
    var p = { id: id, name: opts.name || G.randomName(), age: 0, position: opts.position || rng.pick(C.POSITIONS), tags: tags, isPlayer: false };
    C.STATS.forEach(function (s) { p[s] = q + rng.gauss() * K.statSd; });
    tags.forEach(function (t) {
      var m = C.TAG_MAIN_STAT[t];
      if (m === 'all') C.STATS.forEach(function (s) { p[s] += K.tagStatBonus * 0.4; });
      else if (m !== 'growth') p[m] += K.tagStatBonus;
    });
    C.STATS.forEach(function (s) { p[s] = clamp(round(p[s]), K.statMin, K.statMax); });
    p.age = opts.age || ageForTags(tags);
    p.salary = G.salaryFor(p);
    return p;
  };

  // 5.1 드래프트 — 총 200점을 4스탯에 분배, 선택 태그에 가중
  G.draftStats = function (tags) {
    var w = { power: 1, contact: 1, speed: 1, defense: 1 };
    tags.forEach(function (t) {
      var m = C.TAG_MAIN_STAT[t];
      if (m === 'all') C.STATS.forEach(function (s) { w[s] += C.DRAFT.tagWeight * 0.25; });
      else if (m !== 'growth') w[m] += C.DRAFT.tagWeight;
    });
    var sum = C.STATS.reduce(function (a, s) { return a + w[s]; }, 0);
    var stats = {}, used = 0;
    C.STATS.forEach(function (s, i) {
      var v = C.DRAFT.totalPoints * w[s] / sum + (i < 3 ? rng.int(-3, 3) : 0);
      v = round(v);
      if (i === 3) v = C.DRAFT.totalPoints - used;
      stats[s] = v; used += v;
    });
    return stats;
  };
  G.draftAge = function (tags) {
    if (tags.indexOf('신예') >= 0) return C.DRAFT.rookieAge;
    if (tags.indexOf('베테랑') >= 0) return C.DRAFT.veteranAge;
    return C.DRAFT.startAge;
  };
  G.makePlayerCard = function (id, name, position, tags) {
    var stats = G.draftStats(tags);
    var p = { id: id, name: name || C.DEFAULT_PLAYER_NAME, age: G.draftAge(tags), position: position, tags: tags.slice(), isPlayer: true, salary: 0 };
    C.STATS.forEach(function (s) { p[s] = stats[s]; });
    return p;
  };
  // 1~5라운드 랜덤 지명. 낮은 라운드일수록 예산·명성 높음
  G.draftRound = function () { return C.DRAFT.rounds[rng.weighted(C.DRAFT.roundWeights)]; };

  // 5.2 상점 카드 5장
  G.shopCards = function (state) {
    var cards = [];
    for (var i = 0; i < C.SHOP.cards; i++) cards.push(G.makeCard(state.fame, 'c' + state.nextId++));
    return cards;
  };

  // 5.5 노화 — 전 선수 나이 +1. 27세 피크, 이후 하락. 젊으면 자연 성장
  G.ageOne = function (p) {
    p.age += 1;
    var delta = 0;
    C.AGING.decline.forEach(function (r) { if (p.age >= r.from && p.age <= r.to) delta = -r.drop; });
    if (delta === 0) C.AGING.growth.forEach(function (r) { if (delta === 0 && p.age <= r.maxAge) delta = r.gain; });
    C.STATS.forEach(function (s) { p[s] = clamp(p[s] + delta, C.AGING.floor, C.CARD.statMax); });
    if (!p.isPlayer) p.salary = G.salaryFor(p);
    return delta;
  };

  // 5.5 내 선수 성장 — 3지선다. growthMul: 시너지(신예 런/세트, 사수와 후임) 반영
  G.growthOptions = function (player, season, growthMul) {
    var mul = 1 + (growthMul || 0);
    var main = [];
    player.tags.forEach(function (t) { var m = C.TAG_MAIN_STAT[t]; if (m !== 'all' && m !== 'growth' && main.indexOf(m) < 0) main.push(m); });
    var s1 = main.length ? rng.pick(main) : rng.pick(C.STATS);
    var others = C.STATS.filter(function (s) { return s !== s1; });
    var s2 = rng.pick(others), s3 = rng.pick(others.filter(function (s) { return s !== s2; }));
    var opts = [
      { type: 'stat', gains: [{ stat: s1, value: round(C.GROWTH.single * mul) }] },
      { type: 'stat', gains: [{ stat: s2, value: round(C.GROWTH.dualA * mul) }, { stat: s3, value: round(C.GROWTH.dualB * mul) }] }
    ];
    var candidates = C.TAGS.filter(function (t) { return player.tags.indexOf(t) < 0; });
    if (season <= C.GROWTH.tagSwapUntilSeason && candidates.length && rng.chance(0.6)) {
      opts.push({ type: 'tag', add: rng.pick(candidates), remove: rng.pick(player.tags) });
    } else {
      opts.push({ type: 'stat', gains: C.STATS.map(function (s) { return { stat: s, value: round(C.GROWTH.all * mul) }; }) });
    }
    opts.forEach(function (o) { o.label = G.growthLabel(o); });
    return opts;
  };
  G.growthLabel = function (o) {
    if (o.type === 'tag') return "새 태그 '" + o.add + "' 획득 ('" + o.remove + "' 대체)";
    return o.gains.map(function (g) { return C.STAT_LABEL[g.stat] + ' +' + g.value; }).join(', ');
  };
  G.applyGrowth = function (player, o) {
    if (o.type === 'tag') {
      var idx = player.tags.indexOf(o.remove);
      if (idx >= 0) player.tags[idx] = o.add; else player.tags[1] = o.add;
    } else {
      o.gains.forEach(function (g) { var v = player[g.stat] >= C.GROWTH.softCap ? Math.ceil(g.value / 2) : g.value; player[g.stat] = clamp(player[g.stat] + v, C.AGING.floor, C.CARD.statMax); });
    }
    return player;
  };

  AB.gen = G;
  if (typeof module !== 'undefined' && module.exports) module.exports = AB;
})(typeof window !== 'undefined' ? window : globalThis);
