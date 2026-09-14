// 헤드리스 플레이어 — 테스트·밸런스 시뮬용. 제품 코드에는 포함되지 않는다.
// smart: 태그 시너지를 노려 영입하고 배치를 국소 탐색으로 최적화
// random: 아무 카드나 사고 아무렇게나 배치 (시너지를 전혀 안 맞춘 기준선)
'use strict';
var AB = require('./load.js');
var C = AB.C, S = AB.state, SY = AB.synergy, A = AB.game, rng = AB.rng;

function rosterTagCounts(state) {
  var counts = {};
  S.rosterIds(state).forEach(function (id) { state.players[id].tags.forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
  return counts;
}
function cardValue(state, card, mode) {
  var base = card.contact * 0.8 + card.power * 0.7 + card.speed * 0.25 + card.defense * 0.35;
  if (mode === 'random') return rng.next();
  var counts = rosterTagCounts(state);
  var synergyPull = card.tags.reduce(function (s, t) { return s + (counts[t] || 0) * 8; }, 0);
  var agePenalty = card.age >= 30 ? (card.age - 29) * 6 : card.age <= 24 ? -3 : 0;
  return (base + synergyPull - agePenalty) / Math.max(2, card.salary);
}

function shopPhase(state, mode) {
  var guard = 0;
  while (state.phase === 'shop' && guard++ < 120) {
    var roster = S.rosterIds(state).length;
    var room = state.budget - S.payroll(state);
    // 노쇠 선수 방출 (smart)
    if (mode === 'smart') {
      S.rosterIds(state).forEach(function (id) {
        var p = state.players[id];
        if (!p.isPlayer && (p.age >= 33 || (p.age >= 31 && AB.gen.overall(p) < 50)) && roster > 9) { A.release(state, id); roster--; }
      });
    }
    var best = -1, bestV = -Infinity;
    state.shop.forEach(function (c, i) {
      if (c.salary > room) return;
      var v = cardValue(state, c, mode);
      if (v > bestV) { bestV = v; best = i; }
    });
    var needMore = roster < 9;
    var upgrade = false;
    if (!needMore && best >= 0 && mode === 'smart') {
      // 벤치 최약체보다 확실히 좋으면 교체 (방출 후 영입)
      var ids = S.rosterIds(state).filter(function (id) { return !state.players[id].isPlayer; });
      ids.sort(function (a, b) { return cardValue(state, state.players[a], 'smart') - cardValue(state, state.players[b], 'smart'); });
      var weakest = state.players[ids[0]];
      var card = state.shop[best];
      if (weakest && cardValue(state, card, 'smart') > cardValue(state, weakest, 'smart') * 1.12 && room + Math.floor(weakest.salary * C.SHOP.releaseRefund) >= card.salary) {
        A.release(state, weakest.id); upgrade = true;
        best = -1; bestV = -Infinity; room = state.budget - S.payroll(state);
        state.shop.forEach(function (c, i) { if (c.salary <= room) { var v = cardValue(state, c, mode); if (v > bestV) { bestV = v; best = i; } } });
      }
    }
    if (best >= 0 && (needMore || upgrade || (mode === 'random' && S.rosterIds(state).length < 10 && rng.chance(0.3)))) { A.buy(state, best); continue; }
    if (needMore && state.rerolls > 0) { A.reroll(state); continue; }
    if (needMore && room >= C.SHOP.extraRerollCost + 2) { A.reroll(state); continue; }
    if (needMore) {
      // 예산이 정말 없으면 가장 싼 카드
      var cheapest = -1;
      state.shop.forEach(function (c, i) { if (c.salary <= room && (cheapest < 0 || c.salary < state.shop[cheapest].salary)) cheapest = i; });
      if (cheapest >= 0) { A.buy(state, cheapest); continue; }
      // 최후: 가장 비싼 선수(내 선수 제외) 방출 → 예산 확보 후 계속
      var ids2 = S.rosterIds(state).filter(function (id) { return !state.players[id].isPlayer; }).sort(function (a, b) { return state.players[b].salary - state.players[a].salary; });
      if (ids2.length && state.players[ids2[0]].salary > 1) { A.release(state, ids2[0]); continue; }
      if (state.rerolls === 0 && room >= C.SHOP.extraRerollCost) { A.reroll(state); continue; }
      break;
    }
    break;
  }
  A.openLineup(state);
}

function lineupPhase(state, mode) {
  var ids = S.rosterIds(state);
  var me = state.playerId;
  var best = null, bestScore = -Infinity;
  var order = ids.slice();
  if (mode === 'random') {
    rng.shuffle(order);
    A.setLineup(state, order.slice(0, 9).indexOf(me) >= 0 ? order.slice(0, 9) : [me].concat(order.filter(function (i) { return i !== me; })).slice(0, 9));
    return;
  }
  var players = ids.map(function (id) { return state.players[id]; });
  function score(arr) { return SY.score(SY.evaluate(arr.map(function (id) { return state.players[id]; }))); }
  // 초기: 지난 시즌 라인업을 유지하고 빈 칸만 채운다 (사람이 하듯이)
  order.sort(function (a, b) { return cardValue(state, state.players[b], 'smart') * state.players[b].salary - cardValue(state, state.players[a], 'smart') * state.players[a].salary; });
  var cur = state.lineup.slice();
  var pool = order.filter(function (id) { return cur.indexOf(id) < 0; });
  for (var e = 0; e < 9; e++) if (cur[e] == null) cur[e] = pool.shift() || null;
  if (cur.indexOf(me) < 0) cur[8] = me;
  var rest = ids.filter(function (id) { return cur.indexOf(id) < 0; });
  var curScore = score(cur), improved = true, iter = 0;
  while (improved && iter++ < 60) {
    improved = false;
    for (var i = 0; i < 9; i++) {
      for (var j = i + 1; j < 9; j++) {
        var t = cur.slice(); var tmp = t[i]; t[i] = t[j]; t[j] = tmp;
        var s = score(t); if (s > curScore + 0.01) { cur = t; curScore = s; improved = true; }
      }
      for (var k = 0; k < rest.length; k++) {
        if (cur[i] === me) continue;
        var t2 = cur.slice(); var out = t2[i]; t2[i] = rest[k];
        var s2 = score(t2); if (s2 > curScore + 0.01) { rest[k] = out; cur = t2; curScore = s2; improved = true; }
      }
    }
  }
  A.setLineup(state, cur);
}

function playCareer(seed, mode, draftInput) {
  var state = A.newGame(seed);
  A.draft(state, draftInput || { name: 'AI', position: 'SS', tags: ['교타자', '발야구'] });
  var lineupChanges = [], prevLineup = null, seasons = [];
  var guard = 0;
  while (state.phase !== 'retired' && guard++ < 200) {
    if (state.phase === 'shop') shopPhase(state, mode);
    else if (state.phase === 'lineup') {
      lineupPhase(state, mode);
      if (prevLineup) lineupChanges.push(state.lineup.filter(function (id, i) { return id !== prevLineup[i]; }).length);
      prevLineup = state.lineup.slice();
      var r = A.startGame(state);
      if (!r.ok) throw new Error(r.error);
    } else if (state.phase === 'game') A.finishGame(state);
    else if (state.phase === 'result') {
      seasons.push(state.seasonResult);
      var opts = state.growthOptions;
      var pick = mode === 'random' ? rng.int(0, opts.length - 1) : 0;
      A.chooseGrowth(state, pick);
    }
  }
  return { state: state, seasons: seasons, lineupChanges: lineupChanges };
}

module.exports = { playCareer: playCareer, shopPhase: shopPhase, lineupPhase: lineupPhase };
