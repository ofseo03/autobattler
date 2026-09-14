// ── 5. 시뮬: 경기 시뮬레이션 (텍스트 로그), 시즌 정산, 타이틀, 명예의 전당
(function (root) {
  'use strict';
  var AB = root.AB || (root.AB = {});
  var C = AB.C, rng = AB.rng, SY = AB.synergy;
  var K = C.SIM;
  var SIM = {};

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function has(p, tag) { return !!p && p.tags.indexOf(tag) >= 0; }

  // 정확도 → 타율 곡선 (볼록: 높은 정확도일수록 1점의 가치가 크다)
  SIM.hitProb = function (contact) { return Math.min(K.hitMax, K.hitBase + Math.pow(Math.max(0, contact) / 100, K.hitExp) * K.hitCurve); };

  // 타자별 확률 프로필 — 최종 능력치(런/세트 반영) + 인접 보정으로 계산
  SIM.profile = function (p, eff, mods, i) {
    var c = eff.contact, pw = eff.power, sp = eff.speed;
    return {
      walk: clamp(K.walkBase + (c - 50) * K.walkPerContact, K.walkMin, K.walkMax) + (has(p, '출루형') ? K.obpTagWalk : 0),
      k: clamp(K.kBase - c * K.kPerContact, K.kMin, K.kMax) * (1 + mods.k[i]),
      hit: SIM.hitProb(c) * (1 - mods.k[i] * K.kHitPenalty),
      hr: clamp(K.hrBase + pw * K.hrPerPower, 0, K.hrMax) * (1 + mods.xbh[i]),
      db: (K.dbBase + pw * K.dbPerPower) * (1 + mods.xbh[i]),
      tr: clamp(sp * K.trPerSpeed, 0, K.trMax),
      stealAttempt: clamp((sp - 55) / K.stealAttemptDiv, 0, K.stealAttemptMax),
      stealSucc: clamp(K.stealBase + sp * K.stealPerSpeed, 0.3, K.stealMax) * (1 + mods.steal[i]),
      speed: sp,
      rbi: mods.rbi[i], clutch: mods.clutch[i]
    };
  };

  // 상대 팀 기대 득점/경기 — 내 수비와 시즌 진행(리그 성장)으로 결정
  SIM.opponentRuns = function (effective, season, strength, fame) {
    var defs = effective.filter(Boolean).map(function (e) { return e.defense; });
    var avgDef = defs.length ? defs.reduce(function (a, b) { return a + b; }, 0) / defs.length : 50;
    var league = 1 + (season - 1) * C.SEASON.leagueGrowth + (fame || 0) * C.SEASON.fameStrength;
    return C.SEASON.oppRunsBase * league * (strength || 1) * (1 - (avgDef - 55) * C.SEASON.defenseFactor);
  };
  function poisson(lambda) {
    var L = Math.exp(-lambda), k = 0, p = 1;
    do { k++; p *= rng.next(); } while (p > L);
    return k - 1;
  }

  function emptyStat() { return { pa: 0, ab: 0, h: 0, db: 0, tr: 0, hr: 0, rbi: 0, bb: 0, k: 0, sb: 0, cs: 0, r: 0 }; }
  var HIT_SPOTS = ['좌전', '중전', '우전', '좌중간', '우중간', '3유간', '1·2루간'];
  var HR_SPOTS = ['좌측 담장을 넘기는', '우측 담장을 넘기는', '중앙 담장을 넘기는', '비거리 125m'];

  // 한 경기 시뮬. lineup: 선수 9명(전부 채워져 있어야 함). syn: SY.evaluate(lineup)
  // opts.log=false 면 로그 없이 통계만 (시즌 추정용 빠른 시뮬)
  SIM.playGame = function (lineup, syn, season, opts) {
    opts = opts || {};
    var withLog = opts.log !== false;
    var prof = lineup.map(function (p, i) { return SIM.profile(p, syn.effective[i], syn.mods, i); });
    var stats = lineup.map(emptyStat);
    var oppLambda = SIM.opponentRuns(syn.effective, season, opts.strength, opts.fame) / 9;
    var log = [], my = 0, opp = 0, batter = 0, triggers = {};
    var morale = 1 + syn.team.morale * C.MORALE_BONUS;
    var slotName = function (i) { return lineup[i].name + '(' + (i + 1) + '번)'; };

    function push(inning, half, text, pri) { if (withLog) log.push({ inning: inning, half: half, text: inning + '회' + half + ' ' + text, pri: pri || 1 }); }
    function trigger(inning, name, text) {
      triggers[name] = (triggers[name] || 0) + 1;
      push(inning, '말', '시너지 [' + name + '] 발동 — ' + text, 3);
    }

    for (var inning = 1; inning <= 9; inning++) {
      // 초: 상대 공격
      var oppRuns = poisson(oppLambda);
      if (oppRuns > 0) { opp += oppRuns; push(inning, '초', '상대 팀 ' + oppRuns + '득점', 2); }

      // 말: 내 팀 공격 (9회초 종료 시 앞서 있으면 9회말 없음)
      if (inning === 9 && my > opp) break;
      var outs = 0, bases = [-1, -1, -1], scored = 0, events = 0;
      while (outs < 3) {
        var i = batter, pr = prof[i], st = stats[i], p = lineup[i];
        var runnersOn = bases[0] >= 0 || bases[1] >= 0 || bases[2] >= 0;
        var risp = bases[1] >= 0 || bases[2] >= 0;
        st.pa++;
        var hitP = pr.hit * morale;
        var situ = [];
        if (syn.team.score) { hitP *= 1 + syn.team.score; if (runnersOn) situ.push(C.CLEANUP.name); }
        if (runnersOn && pr.rbi) { hitP *= 1 + pr.rbi * K.rbiHitFactor; situ.push('밥상과 해결사'); }
        if (risp && pr.clutch) { hitP *= 1 + pr.clutch; situ.push(C.CLUTCH_SLOT.name); }
        if (hitP > K.hitCap) hitP = K.hitCap;

        if (rng.chance(pr.walk)) {
          // 볼넷: 밀어내기
          st.bb++;
          var runs = 0;
          if (bases[0] >= 0) { if (bases[1] >= 0) { if (bases[2] >= 0) { runs++; stats[bases[2]].r++; } bases[2] = bases[1]; } bases[1] = bases[0]; }
          bases[0] = i;
          if (runs) { st.rbi += runs; scored += runs; push(inning, '말', slotName(i) + ' — 밀어내기 볼넷, 1타점', 2); events++; }
          else if (p.isPlayer) { push(inning, '말', slotName(i) + ' — 볼넷 출루', 1); }
        } else {
          st.ab++;
          if (rng.chance(hitP)) {
            st.h++;
            var r = rng.next(), kind, runs2 = 0;
            if (r < pr.hr) kind = 'hr'; else if (r < pr.hr + pr.tr) kind = 'tr'; else if (r < pr.hr + pr.tr + pr.db) kind = 'db'; else kind = '1b';
            var desc;
            if (kind === 'hr') {
              st.hr++; runs2 = 1;
              for (var b = 0; b < 3; b++) if (bases[b] >= 0) { runs2++; stats[bases[b]].r++; }
              bases = [-1, -1, -1]; st.r++;
              desc = rng.pick(HR_SPOTS) + ' ' + (runs2 === 4 ? '만루 홈런' : runs2 === 1 ? '솔로 홈런' : runs2 + '점 홈런');
            } else if (kind === 'tr') {
              st.tr++;
              for (var b2 = 0; b2 < 3; b2++) if (bases[b2] >= 0) { runs2++; stats[bases[b2]].r++; }
              bases = [-1, -1, i];
              desc = rng.pick(['우중간', '좌중간']) + ' 3루타' + (runs2 ? ', ' + runs2 + '타점' : '');
            } else if (kind === 'db') {
              st.db++;
              if (bases[2] >= 0) { runs2++; stats[bases[2]].r++; }
              if (bases[1] >= 0) { runs2++; stats[bases[1]].r++; }
              var nb = [-1, i, -1];
              if (bases[0] >= 0) { if (rng.chance(0.4 + prof[bases[0]].speed * 0.004)) { runs2++; stats[bases[0]].r++; } else nb[2] = bases[0]; }
              bases = nb;
              desc = rng.pick(['좌중간', '우중간', '좌측 선상', '우측 선상']) + ' 2루타' + (runs2 ? ', ' + runs2 + '타점' : '');
            } else {
              var nb1 = [i, -1, -1];
              if (bases[2] >= 0) { runs2++; stats[bases[2]].r++; }
              if (bases[1] >= 0) { if (rng.chance(0.5 + prof[bases[1]].speed * 0.003)) { runs2++; stats[bases[1]].r++; } else nb1[2] = bases[1]; }
              if (bases[0] >= 0) { if (nb1[2] < 0 && rng.chance(prof[bases[0]].speed * 0.002)) nb1[2] = bases[0]; else nb1[1] = bases[0]; }
              bases = nb1;
              desc = rng.pick(HIT_SPOTS) + ' 안타' + (runs2 ? ', ' + runs2 + '타점' : '');
            }
            st.rbi += runs2; scored += runs2;
            push(inning, '말', slotName(i) + ' — ' + desc, runs2 || kind === 'hr' || p.isPlayer ? 3 : 1);
            if (runs2 && situ.length) situ.forEach(function (s) { trigger(inning, s, slotName(i) + ' ' + runs2 + '타점'); });
            events++;
          } else {
            // 아웃
            if (rng.chance(pr.k)) { st.k++; if (p.isPlayer) push(inning, '말', slotName(i) + ' — 삼진', 1); }
            else {
              if (bases[2] >= 0 && outs < 2 && rng.chance(K.sacFlyChance)) {
                stats[bases[2]].r++; bases[2] = -1; st.rbi++; scored++;
                push(inning, '말', slotName(i) + ' — 희생플라이, 1타점', 2); events++;
              } else if (bases[0] >= 0 && outs < 2 && rng.chance(K.dpChance)) {
                outs++; bases[0] = -1;
                if (p.isPlayer) push(inning, '말', slotName(i) + ' — 병살타', 1);
              } else if (p.isPlayer) push(inning, '말', slotName(i) + ' — 범타', 1);
            }
            outs++;
          }
        }
        // 도루 시도: 1루 주자, 2루 비어 있음, 2아웃 이하
        if (outs < 3 && bases[0] >= 0 && bases[1] < 0) {
          var rr = bases[0], rp = prof[rr];
          if (rng.chance(rp.stealAttempt)) {
            if (rng.chance(rp.stealSucc)) {
              bases[1] = rr; bases[0] = -1; stats[rr].sb++;
              if (syn.mods.steal[rr]) trigger(inning, '히트앤런', slotName(rr) + ' 도루 성공');
              else if (lineup[rr].isPlayer) push(inning, '말', slotName(rr) + ' — 2루 도루 성공', 2);
            } else { bases[0] = -1; stats[rr].cs++; outs++; if (lineup[rr].isPlayer) push(inning, '말', slotName(rr) + ' — 도루 실패', 1); }
          }
        }
        batter = (batter + 1) % lineup.length;
      }
      my += scored;
      if (withLog && events === 0) push(inning, '말', '삼자범퇴', 0);
    }
    // 동점이면 연장 한 번으로 결정
    var extra = false;
    if (my === opp) {
      extra = true;
      if (rng.chance(0.5)) { my++; var hero = rng.int(0, lineup.length - 1); stats[hero].rbi++; stats[hero].h++; stats[hero].ab++; stats[hero].pa++; push(10, '말', slotName(hero) + ' — 끝내기 안타', 3); }
      else { opp++; push(10, '초', '상대 팀 1득점', 2); }
    }
    var win = my > opp;
    if (withLog) {
      log.push({ inning: 0, half: '', text: '── 경기 종료 ' + my + ':' + opp + ' ' + (win ? '승리' : '패배') + (extra ? ' (연장)' : ''), pri: 9 });
      log = SIM.compactLog(log);
    }
    return { win: win, my: my, opp: opp, stats: stats, triggers: triggers, log: log.map(function (l) { return l.text; }) };
  };

  // 로그를 18~30줄로 압축. 우선순위 낮은 줄(평범한 안타·삼자범퇴)부터 제거
  SIM.compactLog = function (log) {
    var out = log.slice();
    var order = [0, 1, 2];
    for (var oi = 0; oi < order.length && out.length > K.logMax; oi++) {
      for (var i = out.length - 1; i >= 0 && out.length > K.logMax; i--) if (out[i].pri === order[oi]) out.splice(i, 1);
    }
    if (out.length > K.logMax) out = out.slice(0, K.logMax - 1).concat([out[out.length - 1]]);
    return out;
  };

  // 시즌 추정: 빠른 시뮬 N회 평균과 관전 경기 결과를 섞어 144경기로 확장
  SIM.season = function (lineup, syn, season, showcase, opts) {
    opts = opts || {};
    var N = opts.samples || C.SEASON.simSamples;
    var sum = lineup.map(emptyStat), runsFor = 0, runsAgainst = 0, wins = 0;
    for (var g = 0; g < N; g++) {
      var r = SIM.playGame(lineup, syn, season, { log: false, strength: opts.strength, fame: opts.fame });
      runsFor += r.my; runsAgainst += r.opp; wins += r.win ? 1 : 0;
      r.stats.forEach(function (s, i) { for (var k in s) sum[i][k] += s[k]; });
    }
    var w = C.SEASON.showcaseWeight, noise = C.SEASON.noise, G = C.SEASON.games;
    var players = lineup.map(function (p, i) {
      var o = {}, luck = 1 + rng.gauss() * noise;   // 선수별 시즌 운
      for (var k in sum[i]) {
        var perGame = (1 - w) * sum[i][k] / N + w * showcase.stats[i][k];
        var f = (k === 'pa' || k === 'ab') ? 1 : luck * (1 + rng.gauss() * noise * 0.4);
        o[k] = Math.round(perGame * G * f);
        if (o[k] < 0) o[k] = 0;
      }
      if (o.h > o.ab) o.h = o.ab;
      o.avg = o.ab ? o.h / o.ab : 0;
      o.games = G;
      return o;
    });
    var rs = ((1 - w) * runsFor / N + w * showcase.my), ra = ((1 - w) * runsAgainst / N + w * showcase.opp);
    var pyth = Math.pow(rs, 1.83) / (Math.pow(rs, 1.83) + Math.pow(ra, 1.83));
    var teamWins = clamp(Math.round(G * (pyth + rng.gauss() * 0.035)), 20, G - 10);
    // 다른 9팀 승수 — 승률 .5 근처, 편차. 합계 보정은 하지 않는다(단순화)
    var others = [];
    for (var t = 1; t < C.SEASON.teams; t++) others.push(clamp(Math.round(G * (0.5 + rng.gauss() * C.SEASON.otherTeamSd)), 30, G - 20));
    var rank = 1 + others.filter(function (x) { return x > teamWins; }).length;
    return { players: players, teamWins: teamWins, teamLosses: G - teamWins, rank: rank, champion: rank === 1, runsFor: rs, runsAgainst: ra, winPct: pyth };
  };

  // 개인 타이틀 판정 — 리그 선두 수치를 난수로 만들고 내 선수와 비교
  SIM.titles = function (mine, season) {
    var L = C.SEASON.leader, league = 1 + (season - 1) * C.SEASON.leagueGrowth * 0.5;
    var leaders = {
      avg: clamp(SIM.hitProb(L.avgContact[0] + rng.gauss() * L.avgContact[1] + (season - 1) * L.avgContact[2]), 0.310, 0.420),
      hr: Math.round((L.hr[0] + rng.gauss() * L.hr[1]) * league),
      rbi: Math.round((L.rbi[0] + rng.gauss() * L.rbi[1]) * league),
      sb: Math.round(L.sb[0] + rng.gauss() * L.sb[1])
    };
    var won = [];
    if (mine.ab >= 400 && mine.avg >= leaders.avg) won.push('타격왕');
    if (mine.hr >= leaders.hr) won.push('홈런왕');
    if (mine.rbi >= leaders.rbi) won.push('타점왕');
    if (mine.sb >= leaders.sb) won.push('도루왕');
    return { won: won, leaders: leaders };
  };

  SIM.hofScore = function (career) {
    var w = C.HOF.weights;
    return career.hits * w.hits + career.hr * w.hr + career.rbi * w.rbi + career.titles * w.titles + career.champs * w.champs;
  };
  SIM.hofGrade = function (score) {
    for (var i = 0; i < C.HOF.grades.length; i++) if (score >= C.HOF.grades[i].min) return C.HOF.grades[i].name;
    return C.HOF.grades[C.HOF.grades.length - 1].name;
  };

  AB.sim = SIM;
  if (typeof module !== 'undefined' && module.exports) module.exports = AB;
})(typeof window !== 'undefined' ? window : globalThis);
