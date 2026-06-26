/**
 * Netlify Function: /api/games
 * ─────────────────────────────────────────────────────
 * 1) 매시 20분 폴링 → s-maxage=1200 (20분 CDN 캐시)
 * 2) 복수 날짜 fetch → 전체 3위팀 순위 서버에서 계산
 * 3) API 키 서버 보호
 */
const https = require('https');

const AUTH_KEY  = process.env.PSYNET_API_KEY;
const BASE_URL  = 'https://data.psynet.co.kr/data3V1/livescore';
const LEAGUE_ID = 'OT272';

// ── In-memory 캐시 (콜드스타트 방지) ─────────────────────
let memCache = { data: null, date: null, expiresAt: 0 };
const MEM_TTL = 18 * 60 * 1000; // 18분

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch(e) { reject(new Error(`파싱실패(${res.statusCode}): ${body.slice(0,200)}`)); }
      });
    }).on('error', reject);
  });
}

function koreaDate(offset = 0) {
  const d = new Date(Date.now() + (9 + offset * 24) * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

async function fetchDate(date) {
  const url = `${BASE_URL}/gameList?auth_key=${AUTH_KEY}&search_date=${date}&compe=soccer`;
  const res = await httpGet(url);
  return (res?.Data?.list ?? []).filter(g => g.LEAGUE_ID === LEAGUE_ID);
}

// ── 3위팀 고정 완료 데이터 (1~3차전 모두 완료된 조) ────────
// 오늘(6/26) 기준으로 A/B/C/D/E/F/I/J 조 완료
const FIXED_THIRDS_DATA = [
  // 각 조 3위 (API에서 전체 계산 확인)
  { group:'A', name:'대한민국',          pts:3, gd:-1, gf:2,  done:true },
  { group:'B', name:'보스니아헤르체고비나', pts:3, gd:-1, gf:4,  done:true },
  { group:'C', name:'스코틀랜드',         pts:3, gd:-3, gf:1,  done:true },
  { group:'D', name:'미국',              pts:3, gd:+1, gf:4,  done:true },
  { group:'E', name:'에콰도르',           pts:4, gd: 0, gf:2,  done:true },
  { group:'F', name:'스웨덴',            pts:4, gd: 0, gf:7,  done:true },
  { group:'I', name:'세네갈',            pts:0, gd:-3, gf:3,  done:true },
  { group:'J', name:'알제리',            pts:3, gd:-2, gf:2,  done:true },
  // 미완료 조 (3차전 진행 예정)
  { group:'G', name:'이란',              pts:1, gd: 0, gf:0,  done:false },
  { group:'H', name:'카보베르데',         pts:1, gd: 0, gf:2,  done:false },
  { group:'K', name:'DR콩고',           pts:1, gd: 0, gf:1,  done:false },
  { group:'L', name:'파나마',            pts:0, gd:-1, gf:0,  done:false },
];

// ── 현재 날짜 경기 결과로 미완료 조 3위 업데이트 ───────────
function updateThirds(thirds, todayGames) {
  // 오늘 경기 GAME_ID → 조/팀 매핑 (6/27~28 경기)
  const UPCOMING = {
    'OT20262724868713': { group:'G', homeTeam:'이집트',    awayTeam:'이란'        },
    'OT20262724868712': { group:'G', homeTeam:'뉴질랜드',  awayTeam:'벨기에'      },
    'OT20262724868718': { group:'H', homeTeam:'우루과이',  awayTeam:'스페인'      },
    'OT20262724868719': { group:'H', homeTeam:'카보베르데','awayTeam':'사우디'    },
    'OT20262724868744': { group:'L', homeTeam:'크로아티아','awayTeam':'가나'      },
    'OT20262724868743': { group:'L', homeTeam:'파나마',    awayTeam:'잉글랜드'    },
    'OT20262724868738': { group:'K', homeTeam:'DR콩고',    awayTeam:'우즈베키스탄'},
    'OT20262724868737': { group:'K', homeTeam:'콜롬비아',  awayTeam:'포르투갈'   },
  };

  // G/H/K/L조 전체 점수 재집계 (1~2차전 기존값 + 3차전)
  const BASE = {
    G: {
      '이집트': {pts:3,gf:3,ga:1}, '벨기에': {pts:1,gf:0,ga:0},
      '이란':   {pts:1,gf:0,ga:0}, '뉴질랜드':{pts:0,gf:1,ga:4},
    },
    H: {
      '스페인':   {pts:3,gf:4,ga:0}, '우루과이':{pts:1,gf:2,ga:2},
      '카보베르데':{pts:1,gf:2,ga:2}, '사우디':  {pts:0,gf:0,ga:4},
    },
    K: {
      '콜롬비아':{pts:3,gf:3,ga:1}, '포르투갈':{pts:1,gf:1,ga:1},
      'DR콩고':  {pts:1,gf:1,ga:1}, '우즈베키스탄':{pts:0,gf:1,ga:3},
    },
    L: {
      '잉글랜드':{pts:3,gf:4,ga:2}, '가나':   {pts:3,gf:1,ga:0},
      '파나마':  {pts:0,gf:0,ga:1}, '크로아티아':{pts:0,gf:2,ga:4},
    },
  };

  // 오늘 완료된 경기 반영
  for (const g of todayGames) {
    if (g.STATE_TXT_CODE !== 'S_GF') continue;
    const info = UPCOMING[g.GAME_ID];
    if (!info) continue;
    const hs = parseInt(g.HOME_SCORE)||0, as = parseInt(g.AWAY_SCORE)||0;
    const grp = BASE[info.group];
    if (!grp) continue;
    grp[info.homeTeam].gf += hs; grp[info.homeTeam].ga += as;
    grp[info.awayTeam].gf += as; grp[info.awayTeam].ga += hs;
    if(hs>as){ grp[info.homeTeam].pts+=3; }
    else if(hs===as){ grp[info.homeTeam].pts+=1; grp[info.awayTeam].pts+=1; }
    else { grp[info.awayTeam].pts+=3; }
  }

  // 각 조 3위 추출 후 thirds 업데이트
  for (const [grpId, teams] of Object.entries(BASE)) {
    const sorted = Object.entries(teams).sort(([,a],[,b]) =>
      b.pts-a.pts || (b.gf-b.ga)-(a.gf-a.ga) || b.gf-a.gf
    );
    const [name, stat] = sorted[2];
    const idx = thirds.findIndex(t => t.group === grpId);
    if (idx >= 0) {
      thirds[idx] = { group:grpId, name, pts:stat.pts, gd:stat.gf-stat.ga, gf:stat.gf, done:false };
    }
  }

  return thirds;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
    // ★ 20분 캐시 (매시 XX:20에 갱신되도록 설계)
    'Cache-Control': 'public, s-maxage=1200, stale-while-revalidate=60',
    'Netlify-CDN-Cache-Control': 'public, s-maxage=1200, stale-while-revalidate=60',
  };

  if (!AUTH_KEY) return {
    statusCode:500, headers,
    body: JSON.stringify({ error: 'PSYNET_API_KEY 환경변수 미설정' })
  };

  const now = Date.now();
  const todayStr = koreaDate(0);

  try {
    let todayGames, source;

    if (memCache.data && memCache.date === todayStr && now < memCache.expiresAt) {
      todayGames = memCache.data;
      source = 'cache';
    } else {
      // 오늘 + 내일 날짜 함께 fetch
      const [today, tomorrow] = await Promise.all([
        fetchDate(todayStr),
        fetchDate(koreaDate(1)),
      ]);
      todayGames = [...today, ...tomorrow];
      memCache = { data: todayGames, date: todayStr, expiresAt: now + MEM_TTL };
      source = 'api';
    }

    // 3위팀 순위 계산
    const thirds = updateThirds([...FIXED_THIRDS_DATA], todayGames);
    const thirds_sorted = thirds.sort((a,b) => b.pts-a.pts || b.gd-a.gd || b.gf-a.gf);

    // 오늘 경기 응답 포맷
    const games = todayGames.map(g => ({
      gameId:       g.GAME_ID,
      matchDate:    g.MATCH_DATE,
      matchTime:    g.MATCH_TIME,
      homeTeam:     g.HOME_TEAM_SHORT_NAME || g.HOME_TEAM_NAME,
      awayTeam:     g.AWAY_TEAM_SHORT_NAME || g.AWAY_TEAM_NAME,
      homeTeamId:   g.HOME_TEAM_ID,
      awayTeamId:   g.AWAY_TEAM_ID,
      homeScore:    g.HOME_SCORE,
      awayScore:    g.AWAY_SCORE,
      state:        g.STATE_TXT_CODE,
    }));

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        updatedAt:  new Date().toISOString(),
        source,
        games,
        thirds: thirds_sorted,  // 3위팀 순위 포함
      }),
    };

  } catch(err) {
    return { statusCode:502, headers:{ ...headers,'Cache-Control':'no-store' },
      body: JSON.stringify({ error: err.message }) };
  }
};
