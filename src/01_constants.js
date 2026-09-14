// ── 1. 상수: 태그, 포지션, 시너지 테이블, 이름 풀
// 밸런스 수치는 전부 이 파일에 모여 있다. (README "밸런스 수치 수정 위치" 참고)
(function (root) {
  'use strict';
  var AB = root.AB || (root.AB = {});
  var C = {};

  C.VERSION = 1;
  C.STORAGE_KEY = 'season_record_v1';      // localStorage 키 (눈에 안 띄는 이름)
  C.RANKING_KEY = 'season_record_rank_v1';

  C.SEASONS = 8;
  C.LINEUP_SIZE = 9;

  // 3.2 태그 — 정확히 8종. 늘리지 말 것.
  C.TAGS = ['교타자', '거포', '발야구', '수비형', '베테랑', '신예', '클러치', '출루형'];
  C.POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
  C.STATS = ['power', 'contact', 'speed', 'defense'];
  C.STAT_LABEL = { power: '장타력', contact: '정확도', speed: '주력', defense: '수비' };

  // 태그별 주 능력치. 'all' = 전체 소폭, 'growth' = 성장률
  C.TAG_MAIN_STAT = {
    '교타자': 'contact', '거포': 'power', '발야구': 'speed', '수비형': 'defense',
    '출루형': 'contact', '클러치': 'power', '베테랑': 'all', '신예': 'growth'
  };
  C.VETERAN_ALL_FACTOR = 0.4; // 베테랑 '전체 소폭' = 보너스의 40%를 4스탯 전부에

  // 4.1 런 — 연속 칸. 길이 5 이상은 5 항목 사용
  C.RUN = {
    3: { name: '소규모 런', bonus: 0.18 },
    4: { name: '중규모 런', bonus: 0.28 },
    5: { name: '대규모 런', bonus: 0.40, morale: 1 }
  };
  // 4.2 세트 — 같은 태그, 서로 다른 포지션. 타순 무관
  C.SET = [
    { count: 3, bonus: 0.10 },
    { count: 5, bonus: 0.20 },
    { count: 7, bonus: 0.32 }
  ];
  // 4.3 인접 조합 — from 이 바로 앞, to 가 바로 뒤
  C.ADJACENT = [
    { from: '출루형', to: '거포', name: '밥상과 해결사', effect: 'rbi', value: 0.40, desc: '뒤 선수 타점 +40%' },
    { from: '발야구', to: '교타자', name: '히트앤런', effect: 'steal', value: 0.35, desc: '앞 선수 도루 성공률 +35%' },
    { from: '거포', to: '거포', name: '연속 대포', effect: 'cannon', xbh: 0.15, k: 0.10, desc: '둘 다 장타 +15%, 삼진 +10%' },
    { from: '베테랑', to: '신예', name: '사수와 후임', effect: 'growth', value: 0.25, desc: '뒤 선수 성장률 +25%' }
  ];
  C.CLUTCH_SLOT = { slot: 3, tag: '클러치', name: '해결사', value: 0.30, desc: '득점권 상황 보정 +30%' };
  // 4.4 클린업 트리오 — 3·4·5번 (index 2,3,4) 기본 power 합
  C.CLEANUP = { slots: [2, 3, 4], threshold: 200, name: '클린업 트리오', bonus: 0.15, desc: '팀 득점 +15%' };
  C.MORALE_BONUS = 0.02; // 팀 사기 1당 안타 확률 +2%

  // 5.5 노화. 27세 피크
  C.AGING = {
    peak: 27,
    growth: [{ maxAge: 23, gain: 2 }, { maxAge: 26, gain: 1 }],   // 젊은 선수 자연 성장
    decline: [{ from: 28, to: 30, drop: 2 }, { from: 31, to: 33, drop: 4 }, { from: 34, to: 99, drop: 7 }],
    floor: 20
  };

  // 5.1 드래프트
  C.DRAFT = {
    totalPoints: 200,
    tagWeight: 0.6,        // 선택 태그 주 능력치 가중
    startAge: 21, rookieAge: 19, veteranAge: 25,
    roundWeights: [0.15, 0.2, 0.3, 0.2, 0.15],
    rounds: [
      { round: 1, budget: 52, fame: 50 },
      { round: 2, budget: 49, fame: 40 },
      { round: 3, budget: 46, fame: 30 },
      { round: 4, budget: 44, fame: 22 },
      { round: 5, budget: 42, fame: 15 }
    ]
  };

  // 5.2 영입
  C.SHOP = { cards: 5, rerolls: 2, extraRerollCost: 3, releaseRefund: 0.5, budgetPerFame: 1 / 6 };

  // 카드 생성 — 명성 → 카드 품질
  C.CARD = {
    baseQuality: 43, qualityPerFame: 0.12, qualitySd: 7, qualityMin: 32, qualityMax: 84,
    statSd: 11, tagStatBonus: 10, statMin: 20, statMax: 99,
    salaryPerPoint: 0.4, salaryBase: 38, salaryMin: 1,
    rookieAge: [20, 24], veteranAge: [31, 36], normalAge: [23, 31]
  };

  // 5.4 시즌 / 리그
  C.SEASON = {
    games: 144, teams: 10,
    leagueGrowth: 0.01,         // 시즌당 상대 전력 상승
    fameStrength: 0.0006,       // 명성 1당 상대 전력 +0.08% (유명해질수록 상대도 강해진다)
    otherTeamSd: 0.075,         // 다른 9팀 승률 편차
    oppRunsBase: 3.1,           // 상대 평균 득점 (수비 55 기준)
    defenseFactor: 0.006,       // 수비 1점당 상대 득점 -0.6%
    simSamples: 60,             // 시즌 추정에 쓰는 빠른 시뮬 횟수
    showcaseWeight: 0.05,       // 관전 경기 결과 반영 비율
    noise: 0.07,                // 시즌 성적 난수 폭
    leader: { avgContact: [106, 5, 0.6], hr: [42, 6], rbi: [120, 12], sb: [50, 8] } // avgContact: [기준 정확도, 편차, 시즌당 상승]
  };
  C.FAME = { champion: 25, top3: 8, perTitle: 8, perRank: 2 };  // perRank × (10 - 순위)

  // 5.5 성장 선택
  C.GROWTH = { single: 8, dualA: 6, dualB: 4, all: 3, tagSwapUntilSeason: 6, softCap: 90 }; // softCap 이상은 성장치 절반

  // 5.6 명예의 전당
  C.HOF = {
    weights: { hits: 1, hr: 4, rbi: 2, titles: 150, champs: 300 },
    grades: [
      { min: 6000, name: '만장일치 입성' },
      { min: 4500, name: '입성' },
      { min: 3200, name: '후보' },
      { min: 0, name: '미달' }
    ],
    rankingSize: 10
  };

  // 경기 시뮬 확률 모델 (5.4)
  C.SIM = {
    paPerGame: [4.7, 4.6, 4.5, 4.4, 4.3, 4.2, 4.1, 4.0, 3.9],
    walkBase: 0.045, walkPerContact: 0.0009, walkMin: 0.03, walkMax: 0.14, obpTagWalk: 0.035,
    kBase: 0.30, kPerContact: 0.0025, kMin: 0.07, kMax: 0.32,
    hitBase: 0.12, hitCurve: 0.26, hitExp: 1.5, hitMax: 0.40, hitCap: 0.42, // hitCap: 상황 보정까지 합친 상한   // hit = base + (contact/100)^exp × curve
    hrBase: 0.015, hrPerPower: 0.0023, hrMax: 0.40,
    dbBase: 0.14, dbPerPower: 0.0012,
    trPerSpeed: 0.0004, trMax: 0.06,
    stealAttemptDiv: 200, stealAttemptMax: 0.5, stealBase: 0.45, stealPerSpeed: 0.0045, stealMax: 0.95,
    kHitPenalty: 0.5,      // 삼진 +10% → 안타 -5%
    rbiHitFactor: 0.5,     // 타점 +40% → 주자 있을 때 안타 +20%
    dpChance: 0.12, sacFlyChance: 0.30,
    logMax: 30, logMin: 18
  };

  // 이름 풀
  C.NAMES = {
    last: ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '홍', '전', '고', '문', '양', '손', '배', '백', '허', '유', '남'],
    first: ['도현', '민준', '서준', '예준', '시우', '하준', '주원', '지호', '지훈', '준서', '건우', '현우', '우진', '선우', '서진', '민재', '현준', '연우', '유준', '정우',
      '승우', '승현', '시윤', '준혁', '은우', '지환', '승민', '지우', '유찬', '윤우', '민성', '준영', '시후', '진우', '지원', '수현', '재윤', '태윤', '한결', '동현',
      '성민', '재원', '영호', '상현', '태현', '경민', '진호', '용준', '창민', '기현', '대성', '병호', '광현', '형준', '원석', '희수', '정훈', '성훈', '재호', '명수']
  };
  C.DEFAULT_PLAYER_NAME = '김도현';

  AB.C = C;
  if (typeof module !== 'undefined' && module.exports) module.exports = AB;
})(typeof window !== 'undefined' ? window : globalThis);
