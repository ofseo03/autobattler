// 테스트 러너 — 의존성 없음. node tests/run.js
'use strict';
var AB = require('../scripts/load.js');
var ai = require('../scripts/ai.js');
var C = AB.C, S = AB.state, G = AB.gen, SY = AB.synergy, SIM = AB.sim, A = AB.game, rng = AB.rng;
var passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ok   ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); }
function ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); }
function P(over) { var p = { id: over.id || 'p', name: over.name || 'x', age: 25, position: 'DH', tags: ['교타자', '거포'], power: 60, contact: 60, speed: 60, defense: 60, salary: 5, isPlayer: false }; for (var k in over) p[k] = over[k]; return p; }
function mem() { var m = {}; return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; } }; }

console.log('상수');
test('태그 8종, 포지션 9종, 주 능력치 매핑 완비', function () {
  eq(C.TAGS.length, 8); eq(C.POSITIONS.length, 9);
  C.TAGS.forEach(function (t) { ok(C.TAG_MAIN_STAT[t], t); });
});

console.log('시너지 — 런');
test('연속 3칸 같은 태그 → 소규모 런, 주 능력치 +18%', function () {
  var l = [P({ tags: ['교타자', '거포'], position: 'C' }), P({ tags: ['교타자', '발야구'], position: '1B' }), P({ tags: ['교타자', '수비형'], position: 'C' }), null, null, null, null, null, null];
  var r = SY.evaluate(l);
  var run = r.synergies.filter(function (s) { return s.type === 'run'; });
  eq(run.length, 1); eq(run[0].tag, '교타자'); eq(run[0].level, 3); eq(run[0].slots.join(','), '0,1,2');
  eq(r.effective[0].contact, Math.round(60 * 1.18));
  eq(r.effective[0].power, 60, '주 능력치 아닌 스탯은 그대로');
});
test('연속 2칸은 런이 아니다', function () {
  var l = [P({ tags: ['거포', '교타자'] }), P({ tags: ['거포', '발야구'] }), P({ tags: ['발야구', '수비형'] }), null, null, null, null, null, null];
  eq(SY.evaluate(l).synergies.filter(function (s) { return s.type === 'run'; }).length, 0);
});
test('빈 칸이 끼면 런이 끊긴다', function () {
  var l = [P({ tags: ['거포', '교타자'] }), P({ tags: ['거포', '발야구'] }), null, P({ tags: ['거포', '수비형'] }), null, null, null, null, null];
  eq(SY.evaluate(l).synergies.filter(function (s) { return s.type === 'run'; }).length, 0);
});
test('5연속 이상 → 대규모 런 + 팀 사기, 6연속도 5 단계 적용, 세트와 합산', function () {
  var second = ['교타자', '거포', '수비형', '베테랑', '신예', '클러치'];
  var l = []; for (var i = 0; i < 9; i++) l.push(i < 6 ? P({ tags: ['발야구', second[i]], position: C.POSITIONS[i] }) : null);
  var r = SY.evaluate(l);
  var run = r.synergies.filter(function (s) { return s.type === 'run' && s.tag === '발야구'; })[0];
  ok(run); eq(run.level, 5); eq(run.slots.length, 6); eq(r.team.morale, 1);
  var set = r.synergies.filter(function (s) { return s.type === 'set' && s.tag === '발야구'; })[0];
  eq(set.level, 5, '6명 서로 다른 포지션 → 5인 세트');
  eq(r.effective[0].speed, Math.round(60 * (1 + 0.40 + 0.20)), '런 + 세트 합산');
});
test('베테랑 런은 전체 능력치 소폭, 신예 런은 성장률', function () {
  var l = [P({ tags: ['베테랑', '거포'] }), P({ tags: ['베테랑', '교타자'] }), P({ tags: ['베테랑', '발야구'] }), null, null, null, null, null, null];
  var r = SY.evaluate(l);
  eq(r.effective[0].defense, Math.round(60 * (1 + 0.18 * C.VETERAN_ALL_FACTOR)));
  var l2 = [P({ tags: ['신예', '거포'] }), P({ tags: ['신예', '교타자'] }), P({ tags: ['신예', '발야구'] }), null, null, null, null, null, null];
  var r2 = SY.evaluate(l2);
  ok(r2.mods.growth[1] > 0.17 && r2.mods.growth[1] < 0.19);
  eq(r2.effective[1].contact, 60);
});

console.log('시너지 — 세트');
test('같은 태그 3명, 서로 다른 포지션 → 세트, 팀 전체 +10%', function () {
  var l = [P({ tags: ['거포', '교타자'], position: 'C' }), null, null, P({ tags: ['거포', '발야구'], position: '1B' }), null, null, P({ tags: ['거포', '수비형'], position: 'SS' }), P({ tags: ['교타자', '발야구'], position: 'LF' }), null];
  var r = SY.evaluate(l);
  var set = r.synergies.filter(function (s) { return s.type === 'set'; });
  eq(set.length, 1); eq(set[0].tag, '거포'); eq(set[0].level, 3);
  eq(r.effective[7].power, Math.round(60 * 1.10), '태그 없는 선수도 팀 전체 보너스');
});
test('같은 포지션이 겹치면 세트 인원으로 안 센다', function () {
  var l = [P({ tags: ['거포', '교타자'], position: 'C' }), P({ tags: ['거포', '발야구'], position: 'C' }), P({ tags: ['거포', '수비형'], position: 'C' }), null, null, null, null, null, null];
  eq(SY.evaluate(l).synergies.filter(function (s) { return s.type === 'set'; }).length, 0);
});
test('5명 → 2단계 세트', function () {
  var l = C.POSITIONS.slice(0, 5).map(function (pos, i) { return P({ tags: ['수비형', C.TAGS[i]], position: pos }); }).concat([null, null, null, null]);
  var set = SY.evaluate(l).synergies.filter(function (s) { return s.type === 'set' && s.tag === '수비형'; })[0];
  eq(set.level, 5); eq(set.bonus, 0.20);
});

console.log('시너지 — 인접 / 클린업');
test('출루형 → 거포: 뒤 선수 타점 +40%', function () {
  var l = [P({ tags: ['출루형', '수비형'] }), P({ tags: ['거포', '수비형'] }), null, null, null, null, null, null, null];
  var r = SY.evaluate(l);
  ok(r.synergies.some(function (s) { return s.name === '밥상과 해결사'; }));
  eq(r.mods.rbi[1], 0.4); eq(r.mods.rbi[0], 0);
});
test('발야구 → 교타자: 앞 선수 도루 +35%', function () {
  var l = [null, P({ tags: ['발야구', '수비형'] }), P({ tags: ['교타자', '수비형'] }), null, null, null, null, null, null];
  var r = SY.evaluate(l);
  ok(r.synergies.some(function (s) { return s.name === '히트앤런'; })); eq(r.mods.steal[1], 0.35);
});
test('거포 → 거포: 둘 다 장타 +15%, 삼진 +10%', function () {
  var l = [P({ tags: ['거포', '수비형'] }), P({ tags: ['거포', '베테랑'] }), null, null, null, null, null, null, null];
  var r = SY.evaluate(l);
  eq(r.mods.xbh[0], 0.15); eq(r.mods.xbh[1], 0.15); eq(r.mods.k[0], 0.10);
});
test('베테랑 → 신예: 뒤 선수 성장률 +25%', function () {
  var l = [P({ tags: ['베테랑', '수비형'] }), P({ tags: ['신예', '거포'] }), null, null, null, null, null, null, null];
  eq(SY.evaluate(l).mods.growth[1], 0.25);
});
test('순서가 반대면 인접 조합 없음', function () {
  var l = [P({ tags: ['거포', '수비형'] }), P({ tags: ['출루형', '수비형'] }), null, null, null, null, null, null, null];
  eq(SY.evaluate(l).synergies.filter(function (s) { return s.type === 'adj'; }).length, 0);
});
test('클러치가 4번 타순이면 해결사', function () {
  var l = [null, null, null, P({ tags: ['클러치', '거포'] }), null, null, null, null, null];
  var r = SY.evaluate(l);
  ok(r.synergies.some(function (s) { return s.name === '해결사'; })); eq(r.mods.clutch[3], 0.30);
  var l2 = [null, null, P({ tags: ['클러치', '거포'] }), null, null, null, null, null, null];
  eq(SY.evaluate(l2).synergies.length, 0);
});
test('3·4·5번 장타력 합 ' + C.CLEANUP.threshold + ' 이상 → 클린업 트리오', function () {
  var l = [null, null, P({ power: 70, tags: ['거포', '수비형'] }), P({ power: 70, tags: ['교타자', '수비형'] }), P({ power: 60, tags: ['발야구', '베테랑'] }), null, null, null, null];
  var r = SY.evaluate(l);
  eq(r.cleanupPower, 200); eq(r.cleanupActive, true); eq(r.team.score, 0.15);
  l[4].power = 59;
  var r2 = SY.evaluate(l);
  eq(r2.cleanupPower, 199); eq(r2.cleanupActive, false);
  eq(SY.evaluate([null, null, P({ power: 99 }), P({ power: 99 }), null, null, null, null, null]).cleanupActive, false, '빈 칸이 있으면 미발동');
});
test('순수 함수: 입력을 변형하지 않고 같은 입력에 같은 출력', function () {
  var l = [P({ tags: ['교타자', '거포'], position: 'C' }), P({ tags: ['교타자', '발야구'], position: '1B' }), P({ tags: ['교타자', '수비형'], position: '2B' }), null, null, null, null, null, null];
  var before = JSON.stringify(l);
  var a = JSON.stringify(SY.evaluate(l)), b = JSON.stringify(SY.evaluate(l));
  eq(a, b); eq(JSON.stringify(l), before);
});

console.log('시너지 — 미리보기 diff');
test('스왑으로 런이 생기면 added, 깨지면 removed', function () {
  var run3 = [P({ id: 'a', tags: ['교타자', '거포'], position: 'C' }), P({ id: 'b', tags: ['교타자', '수비형'], position: '1B' }), P({ id: 'c', tags: ['교타자', '베테랑'], position: '2B' }), P({ id: 'd', tags: ['수비형', '베테랑'], position: 'SS' }), null, null, null, null, null];
  eq(SY.evaluate(run3).synergies.length, 2, '런 + 세트');
  var d = SY.preview(run3, SY.swapped(run3, 2, 3));
  eq(d.removed.length, 1); eq(d.removed[0].type, 'run'); eq(d.added.length, 0); eq(d.kept.length, 1, '세트는 유지');
  var d2 = SY.preview(SY.swapped(run3, 2, 3), run3);
  eq(d2.added.length, 1); eq(d2.added[0].type, 'run');
});
test('런 확장은 upgraded, 축소는 downgraded', function () {
  var l = [P({ tags: ['교타자', '거포'], position: 'C' }), P({ tags: ['교타자', '수비형'], position: '1B' }), P({ tags: ['교타자', '베테랑'], position: '2B' }), null, null, null, null, null, null];
  var l2 = SY.placed(l, 3, P({ tags: ['교타자', '신예'], position: '3B' }));
  var d = SY.preview(l, l2);
  eq(d.upgraded.length, 1); eq(d.upgraded[0].from.level, 3); eq(d.upgraded[0].to.level, 4);
  eq(d.added.length, 1, '베테랑→신예 인접이 새로 생김'); eq(d.added[0].name, '사수와 후임');
  var back = SY.preview(l2, l);
  eq(back.downgraded.length, 1);
});
test('변화 없으면 전부 kept', function () {
  var l = [P({ tags: ['출루형', '수비형'] }), P({ tags: ['거포', '수비형'] }), null, null, null, null, null, null, null];
  var d = SY.preview(l, l.slice());
  eq(d.added.length + d.removed.length, 0); eq(d.kept.length, 1);
});

console.log('생성');
test('드래프트 스탯 총합 200, 태그 주 능력치 가중', function () {
  rng.seed(1);
  for (var i = 0; i < 50; i++) {
    var st = G.draftStats(['교타자', '출루형']);
    eq(st.power + st.contact + st.speed + st.defense, 200);
    ok(st.contact > st.power && st.contact > st.speed, '정확도가 가장 높아야 함');
  }
});
test('상점 카드: 태그 정확히 2개, 범위 내 스탯, 연봉 ≥ 1, 명성 높을수록 품질 상승', function () {
  rng.seed(2);
  var lo = 0, hi = 0;
  for (var i = 0; i < 300; i++) {
    var a = G.makeCard(10, 'a' + i), b = G.makeCard(200, 'b' + i);
    [a, b].forEach(function (p) {
      eq(p.tags.length, 2); ok(p.tags[0] !== p.tags[1]);
      ok(C.POSITIONS.indexOf(p.position) >= 0);
      C.STATS.forEach(function (s) { ok(p[s] >= C.CARD.statMin && p[s] <= C.CARD.statMax, s); });
      ok(p.salary >= 1); ok(p.age >= 19 && p.age <= 36);
    });
    lo += G.overall(a); hi += G.overall(b);
  }
  ok(hi > lo * 1.2, '명성 200 카드가 확실히 좋아야 함');
});
test('노화: 27세 이하 유지/성장, 28~30 -2, 31~33 -4, 34+ -7, 하한 20', function () {
  var p = P({ age: 27 }); G.ageOne(p); eq(p.age, 28); eq(p.power, 58);
  p.age = 30; G.ageOne(p); eq(p.power, 54);
  p.age = 33; G.ageOne(p); eq(p.power, 47);
  var q = P({ age: 22, power: 21 }); G.ageOne(q); eq(q.power, 23);
  var r = P({ age: 40, power: 22 }); G.ageOne(r); eq(r.power, 20);
});
test('성장 선택지 3개, 태그 교체는 태그 수 2 유지, 90 이상은 절반', function () {
  rng.seed(3);
  var me = G.makePlayerCard('me', '나', 'SS', ['교타자', '발야구']);
  for (var i = 0; i < 30; i++) {
    var opts = G.growthOptions(me, 2, 0);
    eq(opts.length, 3);
    opts.forEach(function (o) { ok(o.label.length > 0); });
    var tagOpt = opts.filter(function (o) { return o.type === 'tag'; })[0];
    if (tagOpt) { var copy = JSON.parse(JSON.stringify(me)); G.applyGrowth(copy, tagOpt); eq(copy.tags.length, 2); ok(copy.tags.indexOf(tagOpt.add) >= 0); }
  }
  var p = P({ contact: 92 }); G.applyGrowth(p, { type: 'stat', gains: [{ stat: 'contact', value: 8 }] }); eq(p.contact, 96);
  var opts2 = G.growthOptions(me, 2, 0.25);
  ok(opts2[0].gains[0].value === Math.round(8 * 1.25), '성장률 보정 반영');
});

console.log('시뮬');
test('경기 로그 18~30줄, 마지막 줄은 경기 종료, 시너지 발동 줄 포함', function () {
  rng.seed(4);
  var l = [];
  for (var i = 0; i < 9; i++) l.push(P({ id: 'p' + i, name: '선수' + i, tags: ['교타자', i % 2 ? '거포' : '출루형'], position: C.POSITIONS[i], contact: 75, power: 70 }));
  l[3].isPlayer = true;
  var syn = SY.evaluate(l);
  ok(syn.synergies.length > 0);
  var sawSyn = false;
  for (var g = 0; g < 30; g++) {
    var r = SIM.playGame(l, syn, 1, { log: true });
    ok(r.log.length >= 10 && r.log.length <= C.SIM.logMax, '로그 ' + r.log.length + '줄');
    ok(/경기 종료/.test(r.log[r.log.length - 1]));
    ok(r.win === (r.my > r.opp));
    if (r.log.some(function (x) { return x.indexOf('시너지 [') >= 0; })) sawSyn = true;
  }
  ok(sawSyn, '시너지 발동 로그가 나와야 함');
});
test('능력치가 높을수록 타율·득점이 높다 (단조성)', function () {
  rng.seed(5);
  function team(c, pw) { var l = []; for (var i = 0; i < 9; i++) l.push(P({ id: 'p' + i, tags: [C.TAGS[i % 8], C.TAGS[(i + 3) % 8]], position: C.POSITIONS[i], contact: c, power: pw })); return l; }
  function runs(l) { var syn = SY.none(l); var s = SIM.season(l, syn, 1, { my: 0, opp: 0, stats: l.map(function () { return { pa: 0, ab: 0, h: 0, db: 0, tr: 0, hr: 0, rbi: 0, bb: 0, k: 0, sb: 0, cs: 0, r: 0 }; }) }, { samples: 80 }); return s; }
  var weak = runs(team(45, 45)), strong = runs(team(80, 80));
  ok(strong.runsFor > weak.runsFor * 1.5, 'runs ' + weak.runsFor.toFixed(2) + ' vs ' + strong.runsFor.toFixed(2));
  ok(strong.players[0].avg > weak.players[0].avg);
  ok(strong.players[0].hr > weak.players[0].hr);
  ok(weak.players[0].avg > 0.15 && strong.players[0].avg < 0.45);
});
test('시너지가 붙은 팀은 같은 로스터 시너지 없음보다 득점이 높다', function () {
  rng.seed(6);
  var l = []; for (var i = 0; i < 9; i++) l.push(P({ id: 'p' + i, tags: ['교타자', i < 5 ? '거포' : '발야구'], position: C.POSITIONS[i], contact: 65, power: 65 }));
  var dummy = { my: 0, opp: 0, stats: l.map(function () { return { pa: 0, ab: 0, h: 0, db: 0, tr: 0, hr: 0, rbi: 0, bb: 0, k: 0, sb: 0, cs: 0, r: 0 }; }) };
  var withSyn = SIM.season(l, SY.evaluate(l), 1, dummy, { samples: 80 }), noSyn = SIM.season(l, SY.none(l), 1, dummy, { samples: 80 });
  ok(withSyn.runsFor > noSyn.runsFor * 1.3, withSyn.runsFor.toFixed(2) + ' vs ' + noSyn.runsFor.toFixed(2));
});
test('명예의 전당 점수 공식과 등급', function () {
  eq(SIM.hofScore({ hits: 100, hr: 10, rbi: 50, titles: 1, champs: 1 }), 100 + 40 + 100 + 150 + 300);
  eq(SIM.hofGrade(0), '미달'); eq(SIM.hofGrade(C.HOF.grades[0].min), '만장일치 입성');
});

console.log('게임 흐름');
test('드래프트 검증: 태그 2개, 포지션 필수', function () {
  S.storage = mem();
  var st = A.newGame(11);
  ok(!A.draft(st, { name: 'x', position: 'SS', tags: ['교타자'] }).ok);
  ok(!A.draft(st, { name: 'x', position: 'XX', tags: ['교타자', '거포'] }).ok);
  var r = A.draft(st, { name: '', position: 'SS', tags: ['교타자', '거포', '교타자'] });
  ok(r.ok); eq(st.players.me.name, C.DEFAULT_PLAYER_NAME); eq(st.phase, 'shop'); eq(st.shop.length, 5); eq(st.rerolls, 2);
  ok(st.budget >= 42 && st.budget <= 52); eq(st.lineup[3], 'me');
});
test('영입: 예산 초과 불가, 리롤 2회 후 예산 3 소모, 방출 50% 회수', function () {
  S.storage = mem();
  var st = A.newGame(12); A.draft(st, { name: 'x', position: 'C', tags: ['거포', '클러치'] });
  st.budget = 5;
  st.shop[0].salary = 6;
  ok(!A.buy(st, 0).ok, '예산 초과');
  st.shop[0].salary = 4;
  ok(A.buy(st, 0).ok); eq(st.bench.length, 1); eq(S.payroll(st), 4);
  st.shop[0].salary = 2; ok(!A.buy(st, 0).ok, '누적 초과');
  ok(A.reroll(st).ok); ok(A.reroll(st).ok); eq(st.rerolls, 0);
  ok(!A.reroll(st).ok, '남은 예산 1 < 3');
  st.budget = 10; ok(A.reroll(st).ok); eq(st.budget, 7);
  var id = st.bench[0];
  var rel = A.release(st, id); ok(rel.ok); eq(rel.refund, 2); eq(st.budget, 9); eq(st.bench.length, 0); ok(!st.players[id]);
  ok(!A.release(st, 'me').ok, '내 선수 방출 불가');
});
test('배치: 스왑/벤치 교체/경기 시작 조건', function () {
  S.storage = mem();
  var st = A.newGame(13); A.draft(st, { name: 'x', position: 'C', tags: ['거포', '클러치'] });
  st.budget = 999;
  for (var i = 0; i < 8; i++) { if (!st.shop.length) A.reroll(st); A.buy(st, 0); }
  ok(!A.canStart(st));
  A.openLineup(st); eq(st.phase, 'lineup');
  ok(!A.canStart(st), '9칸 미충족');
  var bench = st.bench.slice();
  bench.forEach(function (id, i) { var slot = i < 3 ? i : i + 1; ok(A.benchToSlot(st, id, slot).ok); });
  ok(A.canStart(st)); eq(st.bench.length, 0);
  ok(A.swapSlots(st, 0, 3).ok); eq(st.lineup[0], 'me');
  ok(!A.slotToBench(st, 0).ok, '내 선수는 벤치로 못 감');
  ok(A.slotToBench(st, 1).ok); eq(st.bench.length, 1); ok(!A.canStart(st));
  var d = A.previewPlace(st, st.bench[0], 1); ok(d && Array.isArray(d.added));
  ok(A.benchToSlot(st, st.bench[0], 1).ok);
  var r = A.startGame(st); ok(r.ok); eq(st.phase, 'game'); ok(st.gameResult.log.length > 0);
});
test('8시즌 완주 → 은퇴, 통산 성적·랭킹 등재, 나이 +8', function () {
  S.storage = mem();
  var r = ai.playCareer(21, 'smart', { name: '완주', position: '2B', tags: ['출루형', '신예'] });
  var st = r.state;
  eq(st.phase, 'retired'); eq(st.career.seasons.length, 8); eq(st.career.games, 8 * 144);
  ok(st.career.hits > 0); ok(st.hof.score > 0); ok(st.hof.grade);
  eq(st.players.me.age, 19 + 8);
  var rank = S.loadRanking(); eq(rank.length, 1); eq(rank[0].name, '완주');
  eq(r.seasons.length, 8);
  r.seasons.forEach(function (s) { ok(s.rank >= 1 && s.rank <= 10); ok(s.mine.avg >= 0 && s.mine.avg <= 0.5, 'avg ' + s.mine.avg); ok(s.mine.hr >= 0); });
});
test('랭킹은 점수순 상위 10개만', function () {
  S.storage = mem();
  for (var i = 0; i < 15; i++) S.addRanking({ name: 'n' + i, score: i * 100, date: '2026-01-01' });
  var list = S.loadRanking(); eq(list.length, 10); eq(list[0].score, 1400); eq(list[9].score, 500);
});
test('save/load 왕복: 저장 후 불러오면 동일 상태, 버전 불일치는 null', function () {
  var store = mem(); S.storage = store;
  var st = A.newGame(14); A.draft(st, { name: '저장', position: 'RF', tags: ['발야구', '교타자'] });
  A.buy(st, 0);
  var loaded = S.load(store);
  eq(JSON.stringify(loaded), JSON.stringify(st));
  store.setItem(C.STORAGE_KEY, JSON.stringify({ version: -1 }));
  eq(S.load(store), null);
  store.setItem(C.STORAGE_KEY, '{broken');
  eq(S.load(store), null);
});
test('저장소 예외가 나도 죽지 않는다', function () {
  var bad = { getItem: function () { throw new Error('x'); }, setItem: function () { throw new Error('x'); }, removeItem: function () { throw new Error('x'); } };
  eq(S.save({ version: 1 }, bad), false); eq(S.load(bad), null); eq(S.loadRanking(bad).length, 0);
});
test('시드가 같으면 커리어 결과가 같다 (재현성)', function () {
  S.storage = mem();
  var a = ai.playCareer(31, 'smart').state, b = ai.playCareer(31, 'smart').state;
  eq(a.hof.score, b.hof.score); eq(JSON.stringify(a.career.seasons.map(function (s) { return s.wins; })), JSON.stringify(b.career.seasons.map(function (s) { return s.wins; })));
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
