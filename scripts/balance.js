// 밸런스 확인 (프롬프트 11절): node scripts/balance.js [판수]
// 1) 시너지 안 맞춘 팀(random) vs 맞춘 팀(smart) 득점 차이 1.5~2배
// 2) 시즌당 라인업 변경 2~3칸
// 3) 8시즌 중 우승 1~3회
'use strict';
var AB = require('./load.js');
var ai = require('./ai.js');
var N = parseInt(process.argv[2] || '30', 10);
var titleKinds = {};

function avg(a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; }
function run(mode) {
  var rs = [], wins = [], champs = [], changes = [], hof = [], ranks = [], titles = [], syn = [], avgs = [], hrs = [], traj = [];
  for (var i = 0; i < N; i++) {
    var r = ai.playCareer(1000 + i, mode);
    r.seasons.forEach(function (s, si) { rs.push(s.runsFor); wins.push(s.wins); ranks.push(s.rank); avgs.push(s.mine.avg); hrs.push(s.mine.hr); traj[si] = (traj[si] || 0) + s.wins / N; });
    champs.push(r.state.career.champs); titles.push(r.state.career.titles); r.state.career.seasons.forEach(function (s) { s.titles.forEach(function (t) { titleKinds[t] = (titleKinds[t] || 0) + 1; }); });
    changes = changes.concat(r.lineupChanges);
    hof.push(r.state.hof.score);
    r.state.career.seasons.forEach(function (s) { syn.push(s.synergies); });
  }
  return { traj: traj, runs: avg(rs), wins: avg(wins), rank: avg(ranks), champs: avg(champs), titles: avg(titles), changes: avg(changes), hof: avg(hof), syn: avg(syn), avg: avg(avgs), hr: avg(hrs),
    champDist: [0, 1, 2, 3, 4].map(function (k) { return champs.filter(function (c) { return (k === 4 ? c >= 4 : c === k); }).length; }) };
}
// 배치만 분리 측정: smart 로스터를 그대로 두고 라인업만 무작위로 섞었을 때의 득점
function placementRatio() {
  var S = AB.state, SY = AB.synergy, SIM = AB.sim, rng = AB.rng;
  var good = 0, bad = 0, none = 0, n = 0;
  for (var i = 0; i < Math.min(N, 12); i++) {
    var r = ai.playCareer(5000 + i, 'smart');
    r.state.career.seasons.forEach(function (s, si) {
      var players = s.lineup;
      if (players.some(function (p) { return !p; })) return;
      var synG = SY.evaluate(players);
      var g = SIM.season(players, synG, si + 1, { my: 0, opp: 0, stats: players.map(function () { return { pa: 0, ab: 0, h: 0, db: 0, tr: 0, hr: 0, rbi: 0, bb: 0, k: 0, sb: 0, cs: 0, r: 0 }; }) }, { samples: 30 });
      var shuffled = rng.shuffle(players.slice());
      var synB = SY.evaluate(shuffled);
      var b = SIM.season(shuffled, synB, si + 1, { my: 0, opp: 0, stats: g.players.map(function () { return { pa: 0, ab: 0, h: 0, db: 0, tr: 0, hr: 0, rbi: 0, bb: 0, k: 0, sb: 0, cs: 0, r: 0 }; }) }, { samples: 30 });
      var z = SIM.season(players, SY.none(players), si + 1, { my: 0, opp: 0, stats: g.players.map(function () { return { pa: 0, ab: 0, h: 0, db: 0, tr: 0, hr: 0, rbi: 0, bb: 0, k: 0, sb: 0, cs: 0, r: 0 }; }) }, { samples: 30 });
      good += g.runsFor; bad += b.runsFor; none += z.runsFor; n++;
    });
  }
  return { placement: good / bad, none: good / none };
}
var smart = run('smart'), random = run('random');
var pr = placementRatio();
function line(label, s, r, f) { console.log(label.padEnd(18) + String(f(s)).padStart(10) + String(f(r)).padStart(10)); }
console.log('판수 ' + N + '                smart    random');
line('득점/경기', smart, random, function (x) { return x.runs.toFixed(2); });
line('시즌 승수', smart, random, function (x) { return x.wins.toFixed(1); });
line('평균 순위', smart, random, function (x) { return x.rank.toFixed(2); });
line('우승/커리어', smart, random, function (x) { return x.champs.toFixed(2); });
line('타이틀/커리어', smart, random, function (x) { return x.titles.toFixed(2); });
line('라인업 변경/시즌', smart, random, function (x) { return x.changes.toFixed(2); });
line('발동 시너지 수', smart, random, function (x) { return x.syn.toFixed(2); });
line('내 선수 타율', smart, random, function (x) { return x.avg.toFixed(3); });
line('내 선수 홈런', smart, random, function (x) { return x.hr.toFixed(1); });
line('HOF 점수', smart, random, function (x) { return x.hof.toFixed(0); });
console.log('시즌별 승수 smart: ' + smart.traj.map(function (w) { return w.toFixed(0); }).join(' ') + '   random: ' + random.traj.map(function (w) { return w.toFixed(0); }).join(' '));
console.log('득점 비율 smart/random = ' + (smart.runs / random.runs).toFixed(2) + '  (목표 1.5~2.0)');
console.log('같은 로스터, 최적 배치/무작위 배치 득점 비율 = ' + pr.placement.toFixed(2) + '   시너지 있음/시너지 전부 제거 = ' + pr.none.toFixed(2) + ' (목표 1.5~2.0)');
console.log('타이틀 종류 합계: ' + JSON.stringify(titleKinds));
console.log('우승 횟수 분포 (0,1,2,3,4+) smart: ' + smart.champDist.join('/') + '  random: ' + random.champDist.join('/'));
