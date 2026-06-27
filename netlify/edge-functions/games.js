/**
 * Netlify Edge Function: /api/games
 * ─────────────────────────────────────────────────────
 * 데이터 출처: Supabase(worldcup.raw_games). psynet API를 직접 호출하지 않는다.
 *   · psynet API는 해외(Netlify/엣지) IP에서 접속이 막혀 타임아웃 발생 →
 *     한국에서 실행되는 매시간 중계 작업이 psynet→Supabase 적재.
 *   · 이 엣지 함수는 Supabase에서 읽기만 하므로 전 세계 어디서든 안정적으로 동작.
 * anon 키는 공개용(RLS: raw_games SELECT만 허용)이라 코드에 포함해도 안전.
 */
const SUPABASE_URL  = 'https://ppcexnpqvqprupyonhtz.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwY2V4bnBxdnFwcnVweW9uaHR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MjY2ODksImV4cCI6MjA4OTMwMjY4OX0.-gzk-AiAZML-SlYMUwZHQRwylGnXKMuReJIbEfB3pkY';
const LEAGUE_ID = 'OT272';

// 실제 3위 순위 (수동 스냅샷, 구글/공식 기준). 미정 조(done:false)는 최종전 후 갱신 필요.
const FIXED_THIRDS_DATA = [
  { group:'F', name:'스웨덴',            pts:4, gd: 0, gf:7, done:true  },
  { group:'E', name:'에콰도르',           pts:4, gd: 0, gf:2, done:true  },
  { group:'B', name:'보스니아헤르체고비나', pts:4, gd:-1, gf:5, done:true  },
  { group:'D', name:'파라과이',           pts:4, gd:-2, gf:2, done:true  },
  { group:'I', name:'세네갈',            pts:3, gd:+2, gf:8, done:true  },
  { group:'L', name:'크로아티아',          pts:3, gd:-1, gf:3, done:false },
  { group:'A', name:'대한민국',           pts:3, gd:-1, gf:2, done:true  },
  { group:'J', name:'알제리',            pts:3, gd:-2, gf:2, done:false },
  { group:'C', name:'스코틀랜드',         pts:3, gd:-3, gf:1, done:true  },
  { group:'H', name:'카보베르데',         pts:2, gd: 0, gf:2, done:false },
  { group:'G', name:'벨기에',            pts:2, gd: 0, gf:1, done:false },
  { group:'K', name:'콩고민주공화국',      pts:1, gd:-1, gf:1, done:false },
];

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
    G: { '이집트':{pts:3,gf:3,ga:1}, '벨기에':{pts:1,gf:0,ga:0}, '이란':{pts:1,gf:0,ga:0}, '뉴질랜드':{pts:0,gf:1,ga:4} },
    H: { '스페인':{pts:3,gf:4,ga:0}, '우루과이':{pts:1,gf:2,ga:2}, '카보베르데':{pts:1,gf:2,ga:2}, '사우디':{pts:0,gf:0,ga:4} },
    K: { '콜롬비아':{pts:3,gf:3,ga:1}, '포르투갈':{pts:1,gf:1,ga:1}, 'DR콩고':{pts:1,gf:1,ga:1}, '우즈베키스탄':{pts:0,gf:1,ga:3} },
    L: { '잉글랜드':{pts:3,gf:4,ga:2}, '가나':{pts:3,gf:1,ga:0}, '파나마':{pts:0,gf:0,ga:1}, '크로아티아':{pts:0,gf:2,ga:4} },
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
    if (hs>as) { grp[info.homeTeam].pts+=3; }
    else if (hs===as) { grp[info.homeTeam].pts+=1; grp[info.awayTeam].pts+=1; }
    else { grp[info.awayTeam].pts+=3; }
  }
  for (const [grpId, teams] of Object.entries(BASE)) {
    const sorted = Object.entries(teams).sort(([,a],[,b]) => b.pts-a.pts || (b.gf-b.ga)-(a.gf-a.ga) || b.gf-a.gf);
    const [name, stat] = sorted[2];
    const idx = thirds.findIndex(t => t.group === grpId);
    if (idx >= 0) thirds[idx] = { group:grpId, name, pts:stat.pts, gd:stat.gf-stat.ga, gf:stat.gf, done:false };
  }
  return thirds;
}

export default async () => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
  };
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/raw_games?id=eq.1&select=games`, {
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
        'Accept-Profile': 'worldcup',
      },
    });
    if (!res.ok) throw new Error(`Supabase HTTP ${res.status}`);
    const rows = await res.json();
    const todayGames = ((rows && rows[0] && rows[0].games) || []).filter(g => g.LEAGUE_ID === LEAGUE_ID);

    const thirds = [...FIXED_THIRDS_DATA];
    const thirds_sorted = thirds.sort((a,b) => b.pts-a.pts || b.gd-a.gd || b.gf-a.gf);
    const games = todayGames.map(g => ({
      gameId: g.GAME_ID, matchDate: g.MATCH_DATE, matchTime: g.MATCH_TIME,
      homeTeam: g.HOME_TEAM_SHORT_NAME||g.HOME_TEAM_NAME,
      awayTeam: g.AWAY_TEAM_SHORT_NAME||g.AWAY_TEAM_NAME,
      homeTeamId: g.HOME_TEAM_ID, awayTeamId: g.AWAY_TEAM_ID,
      homeScore: g.HOME_SCORE, awayScore: g.AWAY_SCORE, state: g.STATE_TXT_CODE,
    }));

    return new Response(JSON.stringify({
      updatedAt: new Date().toISOString(), source: 'supabase', games, thirds: thirds_sorted,
    }), { headers: CORS });
  } catch (err) {
    // 실패 시 502 → 페이지가 fallback(고정 데이터)으로 표시
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502, headers: { ...CORS, 'Cache-Control': 'no-store' },
    });
  }
};

export const config = { path: '/api/games' };
