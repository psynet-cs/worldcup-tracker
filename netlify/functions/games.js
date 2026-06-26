/**
 * Netlify Function: /api/games
 * ─────────────────────────────────────────────────────
 * 데이터 출처: Supabase(worldcup.raw_games) — psynet API를 직접 호출하지 않음.
 *   · psynet API는 해외(Netlify) IP에서 접속이 막혀 타임아웃 발생 →
 *     한국에서 실행되는 매시간 중계 작업이 psynet→Supabase 적재.
 *   · 이 함수는 Supabase에서 읽기만 하므로 어디서든 안정적으로 동작.
 * anon 키는 공개용(RLS: raw_games SELECT만 허용)이라 코드에 포함해도 안전.
 */
const https = require('https');

const SUPABASE_URL  = 'https://ppcexnpqvqprupyonhtz.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwY2V4bnBxdnFwcnVweW9uaHR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MjY2ODksImV4cCI6MjA4OTMwMjY4OX0.-gzk-AiAZML-SlYMUwZHQRwylGnXKMuReJIbEfB3pkY';
const LEAGUE_ID = 'OT272';

// ── In-memory 캐시 (콜드스타트 방지) ─────────────────────
let memCache = { data: null, expiresAt: 0 };
const MEM_TTL = 60 * 1000; // 1분 (Supabase 읽기는 가벼움)

function httpGetJson(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error(`파싱실패(${res.statusCode}): ${body.slice(0, 200)}`)); }
      });
    }).on('error', reject);
  });
}

// Supabase worldcup.raw_games(id=1)에서 OT272 경기 목록 읽기
async function fetchGamesFromSupabase() {
  const url = `${SUPABASE_URL}/rest/v1/raw_games?id=eq.1&select=games`;
  const rows = await httpGetJson(url, {
    apikey: SUPABASE_ANON,
    Authorization: `Bearer ${SUPABASE_ANON}`,
    'Accept-Profile': 'worldcup',
  });
  const games = (rows && rows[0] && rows[0].games) || [];
  return games.filter(g => g.LEAGUE_ID === LEAGUE_ID);
}

// ── 3위팀 고정 완료 데이터 (1~3차전 모두 완료된 조) ────────
const FIXED_THIRDS_DATA = [
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
  const UPCOMING = {
    'OT20262724868713': { group:'G', homeTeam:'이집트',    awayTeam:'이란'        },
    'OT20262724868712': { group:'G', homeTeam:'뉴질랜드',  awayTeam:'벨기에'      },
    'OT20262724868718': { group:'H', homeTeam:'우루과이',  awayTeam:'스페인'      },
    'OT20262724868719': { group:'H', homeTeam:'카보베르데', awayTeam:'사우디'      },
    'OT20262724868744': { group:'L', homeTeam:'크로아티아', awayTeam:'가나'        },
    'OT20262724868743': { group:'L', homeTeam:'파나마',    awayTeam:'잉글랜드'    },
    'OT20262724868738': { group:'K', homeTeam:'DR콩고',    awayTeam:'우즈베키스탄'},
    'OT20262724868737': { group:'K', homeTeam:'콜롬비아',  awayTeam:'포르투갈'   },
  };

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

exports.handler = async () => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
    'Netlify-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
  };

  const now = Date.now();

  try {
    let todayGames, source;

    if (memCache.data && now < memCache.expiresAt) {
      todayGames = memCache.data;
      source = 'cache';
    } else {
      todayGames = await fetchGamesFromSupabase();
      memCache = { data: todayGames, expiresAt: now + MEM_TTL };
      source = 'supabase';
    }

    const thirds = updateThirds([...FIXED_THIRDS_DATA], todayGames);
    const thirds_sorted = thirds.sort((a,b) => b.pts-a.pts || b.gd-a.gd || b.gf-a.gf);

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
        updatedAt: new Date().toISOString(),
        source,
        games,
        thirds: thirds_sorted,
      }),
    };

  } catch (err) {
    return { statusCode:502, headers:{ ...headers, 'Cache-Control':'no-store' },
      body: JSON.stringify({ error: err.message }) };
  }
};
