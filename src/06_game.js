// ── 6. 액션: 화면이 호출하는 상태 전이. 모든 액션은 state 를 변경하고 저장한 뒤 반환한다.
// 실패 시 { ok:false, error:'...' } 를 반환하고 state 는 그대로 둔다.
(function (root) {
  'use strict';
  var AB = root.AB || (root.AB = {});
  var C = AB.C, S = AB.state, G = AB.gen, SY = AB.synergy, SIM = AB.sim, rng = AB.rng;
  var A = {};

  function fail(msg) { return { ok: false, error: msg }; }
  function ok(state, extra) { S.save(state); var r = { ok: true, state: state }; if (extra) for (var k in extra) r[k] = extra[k]; return r; }

  A.newGame = function (seed) { var st = S.create(seed); S.save(st); return st; };
  A.resume = function () { return S.load(); };

  // 5.1 드래프트 → 시즌 1 영입 화면
  A.draft = function (state, input) {
    if (state.phase !== 'draft') return fail('드래프트 단계가 아닙니다');
    var name = (input.name || '').trim() || C.DEFAULT_PLAYER_NAME;
    if (C.POSITIONS.indexOf(input.position) < 0) return fail('포지션을 선택하세요');
    var tags = (input.tags || []).filter(function (t, i, a) { return C.TAGS.indexOf(t) >= 0 && a.indexOf(t) === i; });
    if (tags.length !== 2) return fail('태그를 정확히 2개 선택하세요');
    var id = 'me';
    var me = G.makePlayerCard(id, name.slice(0, 12), input.position, tags);
    state.players[id] = me;
    state.playerId = id;
    var round = G.draftRound();
    state.draftRound = round.round;
    state.fame = round.fame;
    state.budget = round.budget;
    state.lineup[3] = id;   // 기본 4번 타순. 이후 자유롭게 이동
    return ok(state, { round: round, player: me, next: A.openShop(state) });
  };

  A.currentBudget = function (state) { return state.budget; };
  A.payroll = function (state) { return S.payroll(state); };

  // 5.2 영입 화면 진입 — 카드 5장, 리롤 2회 초기화
  A.openShop = function (state) {
    state.phase = 'shop';
    state.rerolls = C.SHOP.rerolls;
    state.shop = G.shopCards(state);
    state.gameResult = null;
    S.save(state);
    return state;
  };
  A.reroll = function (state) {
    if (state.phase !== 'shop') return fail('영입 단계가 아닙니다');
    if (state.rerolls > 0) state.rerolls--;
    else {
      if (state.budget - S.payroll(state) < C.SHOP.extraRerollCost) return fail('예산이 부족합니다 (추가 리롤 ' + C.SHOP.extraRerollCost + ')');
      state.budget -= C.SHOP.extraRerollCost;
    }
    state.shop = G.shopCards(state);
    return ok(state);
  };
  // 카드 영입 → 벤치. 예산 초과 불가
  A.buy = function (state, index) {
    if (state.phase !== 'shop') return fail('영입 단계가 아닙니다');
    var card = state.shop[index];
    if (!card) return fail('카드가 없습니다');
    if (S.payroll(state) + card.salary > state.budget) return fail('예산 초과 — 연봉 ' + card.salary + ' 영입 불가');
    state.shop.splice(index, 1);
    state.players[card.id] = card;
    state.bench.push(card.id);
    return ok(state, { player: card });
  };
  // 방출 — 벤치/라인업 선수. 연봉 50% 회수(회수분은 예산 상한에 더한다)
  A.release = function (state, id) {
    if (state.phase !== 'shop' && state.phase !== 'lineup') return fail('지금은 방출할 수 없습니다');
    var p = state.players[id];
    if (!p) return fail('선수가 없습니다');
    if (p.isPlayer) return fail('내 선수는 방출할 수 없습니다');
    var li = state.lineup.indexOf(id); if (li >= 0) state.lineup[li] = null;
    var bi = state.bench.indexOf(id); if (bi >= 0) state.bench.splice(bi, 1);
    delete state.players[id];
    var refund = Math.floor(p.salary * C.SHOP.releaseRefund);
    state.budget += refund;
    return ok(state, { refund: refund });
  };

  // 5.3 배치
  A.openLineup = function (state) {
    if (state.phase !== 'shop' && state.phase !== 'lineup') return fail('배치 단계로 갈 수 없습니다');
    state.phase = 'lineup';
    state.shop = [];
    return ok(state);
  };
  A.backToShop = function (state) {
    if (state.phase !== 'lineup') return fail('배치 단계가 아닙니다');
    state.phase = 'shop';
    if (!state.shop.length) state.shop = G.shopCards(state);
    return ok(state);
  };
  // 두 칸 스왑 (빈 칸 포함)
  A.swapSlots = function (state, i, j) {
    if (state.phase !== 'lineup') return fail('배치 단계가 아닙니다');
    if (i < 0 || j < 0 || i >= C.LINEUP_SIZE || j >= C.LINEUP_SIZE) return fail('잘못된 칸');
    var t = state.lineup[i]; state.lineup[i] = state.lineup[j]; state.lineup[j] = t;
    return ok(state);
  };
  // 벤치 선수를 칸에 넣기 — 칸에 있던 선수는 벤치로
  A.benchToSlot = function (state, id, slot) {
    if (state.phase !== 'lineup') return fail('배치 단계가 아닙니다');
    var bi = state.bench.indexOf(id);
    if (bi < 0) return fail('벤치에 없는 선수');
    if (slot < 0 || slot >= C.LINEUP_SIZE) return fail('잘못된 칸');
    var prev = state.lineup[slot];
    state.bench.splice(bi, 1);
    state.lineup[slot] = id;
    if (prev != null) state.bench.push(prev);
    return ok(state);
  };
  // 칸의 선수를 벤치로. 내 선수는 불가
  A.slotToBench = function (state, slot) {
    if (state.phase !== 'lineup') return fail('배치 단계가 아닙니다');
    var id = state.lineup[slot];
    if (id == null) return fail('빈 칸');
    if (state.players[id].isPlayer) return fail('내 선수는 라인업에서 뺄 수 없습니다');
    state.lineup[slot] = null;
    state.bench.push(id);
    return ok(state);
  };
  A.setLineup = function (state, ids) {
    if (state.phase !== 'lineup') return fail('배치 단계가 아닙니다');
    if (ids.length !== C.LINEUP_SIZE) return fail('9칸이어야 합니다');
    var roster = S.rosterIds(state);
    var seen = {};
    for (var i = 0; i < ids.length; i++) {
      if (ids[i] == null) continue;
      if (roster.indexOf(ids[i]) < 0 || seen[ids[i]]) return fail('잘못된 선수 id');
      seen[ids[i]] = true;
    }
    state.lineup = ids.slice();
    state.bench = roster.filter(function (id) { return !seen[id]; });
    return ok(state);
  };
  // 현재 라인업 평가 / 미리보기 (렌더에서 직접 호출)
  A.evaluate = function (state) { return SY.evaluate(S.lineupPlayers(state)); };
  A.previewSwap = function (state, i, j) { var l = S.lineupPlayers(state); return SY.preview(l, SY.swapped(l, i, j)); };
  A.previewPlace = function (state, id, slot) { var l = S.lineupPlayers(state); return SY.preview(l, SY.placed(l, slot, state.players[id])); };
  A.canStart = function (state) { return state.phase === 'lineup' && S.lineupFull(state) && state.lineup.indexOf(state.playerId) >= 0; };

  // 5.4 경기 시작 — 관전 경기 시뮬. 로그는 gameResult.log
  A.startGame = function (state) {
    if (!A.canStart(state)) return fail('9칸을 모두 채우고 내 선수를 포함해야 합니다');
    var lineup = S.lineupPlayers(state);
    var syn = SY.evaluate(lineup);
    var game = SIM.playGame(lineup, syn, state.season, { log: true, fame: state.fame });
    state.phase = 'game';
    state.gameResult = { log: game.log, win: game.win, my: game.my, opp: game.opp, stats: game.stats, triggers: game.triggers, synergies: syn.synergies.map(function (s) { return s.name; }) };
    state._showcase = { my: game.my, opp: game.opp, stats: game.stats };
    return ok(state, { game: game, synergy: syn });
  };

  // 5.5 결과 — 시즌 정산, 타이틀, 명성, 성장 선택지
  A.finishGame = function (state) {
    if (state.phase !== 'game') return fail('경기 단계가 아닙니다');
    var lineup = S.lineupPlayers(state);
    var syn = SY.evaluate(lineup);
    var showcase = state._showcase || { my: state.gameResult.my, opp: state.gameResult.opp, stats: state.gameResult.stats };
    var season = SIM.season(lineup, syn, state.season, showcase, { fame: state.fame });
    var mySlot = state.lineup.indexOf(state.playerId);
    var mine = season.players[mySlot];
    var titles = SIM.titles(mine, state.season);
    var fameGain = C.FAME.perRank * (C.SEASON.teams - season.rank) + titles.won.length * C.FAME.perTitle + (season.champion ? C.FAME.champion : season.rank <= 3 ? C.FAME.top3 : 0);
    state.fame += fameGain;
    var c = state.career;
    c.games += mine.games; c.hits += mine.h; c.hr += mine.hr; c.rbi += mine.rbi; c.sb += mine.sb; c.ab += mine.ab;
    c.avg = c.ab ? c.hits / c.ab : 0;
    c.titles += titles.won.length; c.champs += season.champion ? 1 : 0;
    var lineupSnapshot = lineup.map(function (p) { return JSON.parse(JSON.stringify(p)); }); // 그 시즌 라인업 카드 사본 (은퇴 화면용)
    c.seasons.push({ season: state.season, age: state.players[state.playerId].age, rank: season.rank, wins: season.teamWins, losses: season.teamLosses, champion: season.champion, avg: mine.avg, h: mine.h, hr: mine.hr, rbi: mine.rbi, sb: mine.sb, titles: titles.won.slice(), lineup: lineupSnapshot, synergies: syn.synergies.length });
    state.seasonResult = { season: state.season, rank: season.rank, wins: season.teamWins, losses: season.teamLosses, champion: season.champion, mine: mine, titles: titles.won, leaders: titles.leaders, fameGain: fameGain, team: season.players, runsFor: season.runsFor, runsAgainst: season.runsAgainst };
    state.growthOptions = G.growthOptions(state.players[state.playerId], state.season, syn.mods.growth[mySlot]);
    state.phase = 'result';
    delete state._showcase;
    return ok(state, { result: state.seasonResult, growthOptions: state.growthOptions });
  };

  // 성장 선택 → 노화 → 다음 시즌 영입 또는 은퇴
  A.chooseGrowth = function (state, index) {
    if (state.phase !== 'result') return fail('결과 단계가 아닙니다');
    var opt = state.growthOptions && state.growthOptions[index];
    if (!opt) return fail('선택지가 없습니다');
    var me = state.players[state.playerId];
    G.applyGrowth(me, opt);
    state.growthOptions = null;
    var aging = [];
    Object.keys(state.players).forEach(function (id) { var p = state.players[id]; aging.push({ id: id, name: p.name, age: p.age + 1, delta: G.ageOne(p) }); });
    state.seasonResult = null;
    if (state.season >= C.SEASONS) return ok(state, { retired: A.retire(state), aging: aging });
    state.season += 1;
    state.budget = C.DRAFT.rounds[state.draftRound - 1].budget + Math.floor(state.fame * C.SHOP.budgetPerFame);
    A.openShop(state);
    return ok(state, { aging: aging });
  };

  // 5.6 은퇴 — 통산 성적, 명예의 전당 점수, 로컬 랭킹 등재
  A.retire = function (state) {
    var me = state.players[state.playerId];
    var score = SIM.hofScore(state.career);
    var entry = { name: me.name, position: me.position, tags: me.tags.slice(), score: score, grade: SIM.hofGrade(score), hits: state.career.hits, hr: state.career.hr, rbi: state.career.rbi, titles: state.career.titles, champs: state.career.champs, date: new Date().toISOString().slice(0, 10) };
    var rank = S.addRanking(entry);
    state.hof = { score: score, grade: entry.grade, rankingPosition: rank, entry: entry };
    state.phase = 'retired';
    S.save(state);
    return state.hof;
  };
  A.ranking = function () { return S.loadRanking(); };

  AB.game = A;
  if (typeof module !== 'undefined' && module.exports) module.exports = AB;
})(typeof window !== 'undefined' ? window : globalThis);
