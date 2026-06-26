export default async (request, context) => {
  const AUTH_KEY = Deno.env.get('PSYNET_API_KEY') || '';
  const BASE = 'https://data.psynet.co.kr/data3V1/livescore';
  const LEAGUE_ID = 'OT272';

  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=60',
  };

  const THIRDS = [
    {group:'F',name:'\uC2A4\uC6E8\uB374',pts:4,gd:0,gf:7,done:true},
    {group:'E',name:'\uC5D0\uCFE0\uC544\uB3C4\uB974',pts:4,gd:0,gf:2,done:true},
    {group:'D',name:'\uBBF8\uAD6D',pts:3,gd:1,gf:4,done:true},
    {group:'B',name:'\uBCF4\uC2A4\uB2C8\uC544\uD5E4\uB974\uCCB4\uACE0\uBE44\uB098',pts:3,gd:-1,gf:4,done:true},
    {group:'A',name:'\uB300\uD55C\uBBFC\uAD6D',pts:3,gd:-1,gf:2,done:true},
    {group:'J',name:'\uC54C\uC81C\uB9AC',pts:3,gd:-2,gf:2,done:true},
    {group:'C',name:'\uC2A4\uCF54\uD2C0\uB79C\uB4DC',pts:3,gd:-3,gf:1,done:true},
    {group:'I',name:'\uC138\uB124\uAC08',pts:0,gd:-3,gf:3,done:true},
    {group:'G',name:'\uC774\uB780',pts:1,gd:0,gf:0,done:false},
    {group:'H',name:'\uCE74\uBCF4\uBCA0\uB974\uB370',pts:1,gd:0,gf:2,done:false},
    {group:'K',name:'DR\uCF69\uACE0',pts:1,gd:0,gf:1,done:false},
    {group:'L',name:'\uD30C\uB098\uB9C8',pts:0,gd:-1,gf:0,done:false},
  ];

  function koreaDate(plus) {
    plus = plus || 0;
    const d = new Date(Date.now() + (9 + plus * 24) * 3600000);
    const p = n => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}`;
  }

  if (!AUTH_KEY) {
    return new Response(JSON.stringify({games:[], thirds:THIRDS, source:'no-key'}), {headers: CORS});
  }

  try {
    const [r0, r1] = await Promise.all([
      fetch(`${BASE}/gameList?auth_key=${AUTH_KEY}&search_date=${koreaDate(0)}&compe=soccer`),
      fetch(`${BASE}/gameList?auth_key=${AUTH_KEY}&search_date=${koreaDate(1)}&compe=soccer`),
    ]);
    const [j0, j1] = await Promise.all([r0.json(), r1.json()]);
    const all = [...(j0?.Data?.list||[]), ...(j1?.Data?.list||[])].filter(g => g.LEAGUE_ID === LEAGUE_ID);
    const games = all.map(g => ({
      gameId: g.GAME_ID, matchDate: g.MATCH_DATE, matchTime: g.MATCH_TIME,
      homeTeam: g.HOME_TEAM_SHORT_NAME||g.HOME_TEAM_NAME,
      awayTeam: g.AWAY_TEAM_SHORT_NAME||g.AWAY_TEAM_NAME,
      homeScore: g.HOME_SCORE, awayScore: g.AWAY_SCORE, state: g.STATE_TXT_CODE,
    }));
    return new Response(JSON.stringify({updatedAt: new Date().toISOString(), games, thirds: THIRDS, source:'api'}), {headers: CORS});
  } catch(err) {
    return new Response(JSON.stringify({games:[], thirds:THIRDS, source:'error', error: err.message}), {headers: CORS});
  }
};

export const config = { path: '/api/games' };
