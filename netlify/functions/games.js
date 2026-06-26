const https = require('https');

const AUTH_KEY  = process.env.PSYNET_API_KEY;
const BASE_URL  = 'https://data.psynet.co.kr/data3V1/livescore';
const LEAGUE_ID = 'OT272';

// 1시간 캐시 (매시 XX:20 갱신)
let memCache = { data: null, ts: 0 };
const CACHE_TTL = 55 * 60 * 1000;

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch(e) { reject(new Error('parse error: ' + body.slice(0, 100))); }
      });
    }).on('error', reject);
  });
}

function koreaDate(offsetDays) {
  offsetDays = offsetDays || 0;
  var d = new Date(Date.now() + (9 + offsetDays * 24) * 3600000);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

async function fetchGames(date) {
  var url = BASE_URL + '/gameList?auth_key=' + AUTH_KEY + '&search_date=' + date + '&compe=soccer';
  var res = await httpGet(url);
  var list = (res && res.Data && res.Data.list) ? res.Data.list : [];
  return list.filter(function(g) { return g.LEAGUE_ID === LEAGUE_ID; });
}

// 확정된 3위팀 데이터
var FIXED = [
  { group:'A', name:'KOR', label:'\ub300\ud55c\ubbfc\uad6d', pts:3, gd:-1, gf:2, done:true },
  { group:'B', name:'BIH', label:'\ubcf4\uc2a4\ub2c8\uc544\ud5e4\ub974\uccb4\uace0\ube44\ub098', pts:3, gd:-1, gf:4, done:true },
  { group:'C', name:'SCO', label:'\uc2a4\ucf54\ud2c0\ub79c\ub4dc', pts:3, gd:-3, gf:1, done:true },
  { group:'D', name:'USA', label:'\ubbf8\uad6d', pts:3, gd:1, gf:4, done:true },
  { group:'E', name:'ECU', label:'\uc5d0\ucfe0\uc544\ub3c4\ub974', pts:4, gd:0, gf:2, done:true },
  { group:'F', name:'SWE', label:'\uc2a4\uc6e8\ub374', pts:4, gd:0, gf:7, done:true },
  { group:'I', name:'SEN', label:'\uc138\ub124\uac08', pts:0, gd:-3, gf:3, done:true },
  { group:'J', name:'ALG', label:'\uc54c\uc81c\ub9ac', pts:3, gd:-2, gf:2, done:true },
  { group:'G', name:'IRN', label:'\uc774\ub780', pts:1, gd:0, gf:0, done:false },
  { group:'H', name:'CPV', label:'\uce74\ubcf4\ubca0\ub974\ub370', pts:1, gd:0, gf:2, done:false },
  { group:'K', name:'COD', label:'DR\ucf69\uace0', pts:1, gd:0, gf:1, done:false },
  { group:'L', name:'PAN', label:'\ud30c\ub098\ub9c8', pts:0, gd:-1, gf:0, done:false },
];

// G/H/K/L 조 기준값
var BASE_STANDINGS = {
  G: { IRN:{pts:1,gf:0,ga:0}, EGY:{pts:3,gf:3,ga:1}, BEL:{pts:1,gf:0,ga:0}, NZL:{pts:0,gf:1,ga:4} },
  H: { ESP:{pts:3,gf:4,ga:0}, URU:{pts:1,gf:2,ga:2}, CPV:{pts:1,gf:2,ga:2}, KSA:{pts:0,gf:0,ga:4} },
  K: { COL:{pts:3,gf:3,ga:1}, POR:{pts:1,gf:1,ga:1}, COD:{pts:1,gf:1,ga:1}, UZB:{pts:0,gf:1,ga:3} },
  L: { ENG:{pts:3,gf:4,ga:2}, GHA:{pts:3,gf:1,ga:0}, PAN:{pts:0,gf:0,ga:1}, CRO:{pts:0,gf:2,ga:4} },
};

// game_id -> 조/홈팀key/어웨이팀key
var GAME_MAP = {
  'OT20262724868713': { grp:'G', h:'EGY', a:'IRN' },
  'OT20262724868712': { grp:'G', h:'NZL', a:'BEL' },
  'OT20262724868718': { grp:'H', h:'URU', a:'ESP' },
  'OT20262724868719': { grp:'H', h:'CPV', a:'KSA' },
  'OT20262724868744': { grp:'L', h:'CRO', a:'GHA' },
  'OT20262724868743': { grp:'L', h:'PAN', a:'ENG' },
  'OT20262724868738': { grp:'K', h:'COD', a:'UZB' },
  'OT20262724868737': { grp:'K', h:'COL', a:'POR' },
};

// 그룹 내 3위 추출
function getThird(standings) {
  var arr = Object.entries(standings).map(function(e) {
    return { key: e[0], pts: e[1].pts, gd: e[1].gf - e[1].ga, gf: e[1].gf };
  });
  arr.sort(function(a, b) {
    return b.pts - a.pts || b.gd - a.gd || b.gf - a.gf;
  });
  return arr[2];
}

function calcThirds(games) {
  // 각 조 standings 복사
  var S = JSON.parse(JSON.stringify(BASE_STANDINGS));

  games.forEach(function(g) {
    if (g.STATE_TXT_CODE !== 'S_GF') return;
    var info = GAME_MAP[g.GAME_ID];
    if (!info) return;
    var grp = S[info.grp];
    if (!grp) return;
    var hs = parseInt(g.HOME_SCORE) || 0;
    var as = parseInt(g.AWAY_SCORE) || 0;
    grp[info.h].gf += hs; grp[info.h].ga += as;
    grp[info.a].gf += as; grp[info.a].ga += hs;
    if (hs > as) grp[info.h].pts += 3;
    else if (hs === as) { grp[info.h].pts += 1; grp[info.a].pts += 1; }
    else grp[info.a].pts += 3;
  });

  // FIXED 복사 후 미완료 조 업데이트
  var thirds = FIXED.map(function(t) { return Object.assign({}, t); });

  ['G','H','K','L'].forEach(function(grpId) {
    var third = getThird(S[grpId]);
    var idx = thirds.findIndex(function(t) { return t.group === grpId; });
    // label 매핑
    var labelMap = {
      G: { IRN:'\uc774\ub780', EGY:'\uc774\uc9d1\ud2b8', BEL:'\ubca8\uae30\uc5d0', NZL:'\ub274\uc9c8\ub79c\ub4dc' },
      H: { ESP:'\uc2a4\ud398\uc778', URU:'\uc6b0\ub8e8\uacfc\uc774', CPV:'\uce74\ubcf4\ubca0\ub974\ub370', KSA:'\uc0ac\uc6b0\ub514' },
      K: { COL:'\ucf5c\ub86c\ube44\uc544', POR:'\ud3ec\ub974\ud22c\uac08', COD:'DR\ucf69\uace0', UZB:'\uc6b0\uc988\ubca0\ud0a4\uc2a4\ud0c4' },
      L: { ENG:'\uc78a\uae00\ub79c\ub4dc', GHA:'\uac00\ub098', PAN:'\ud30c\ub098\ub9c8', CRO:'\ud06c\ub85c\uc544\ud2f0\uc544' },
    };
    if (idx >= 0) {
      thirds[idx] = {
        group: grpId,
        name: third.key,
        label: (labelMap[grpId] && labelMap[grpId][third.key]) || third.key,
        pts: third.pts,
        gd: third.gd,
        gf: third.gf,
        done: false,
      };
    }
  });

  thirds.sort(function(a, b) { return b.pts - a.pts || b.gd - a.gd || b.gf - a.gf; });
  return thirds;
}

exports.handler = async function(event) {
  var headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=60',
    'Netlify-CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=60',
  };

  if (!AUTH_KEY) {
    return { statusCode: 500, headers: headers, body: JSON.stringify({ error: 'PSYNET_API_KEY not set' }) };
  }

  var now = Date.now();
  try {
    var games;
    if (memCache.data && (now - memCache.ts) < CACHE_TTL) {
      games = memCache.data;
    } else {
      var today = await fetchGames(koreaDate(0));
      var tomorrow = await fetchGames(koreaDate(1));
      games = today.concat(tomorrow);
      memCache = { data: games, ts: now };
    }

    var thirds = calcThirds(games);

    var gameList = games.map(function(g) {
      return {
        gameId: g.GAME_ID,
        matchDate: g.MATCH_DATE,
        matchTime: g.MATCH_TIME,
        homeTeam: g.HOME_TEAM_SHORT_NAME || g.HOME_TEAM_NAME,
        awayTeam: g.AWAY_TEAM_SHORT_NAME || g.AWAY_TEAM_NAME,
        homeTeamId: g.HOME_TEAM_ID,
        awayTeamId: g.AWAY_TEAM_ID,
        homeScore: g.HOME_SCORE,
        awayScore: g.AWAY_SCORE,
        state: g.STATE_TXT_CODE,
      };
    });

    return {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({ updatedAt: new Date().toISOString(), games: gameList, thirds: thirds }),
    };

  } catch(err) {
    return {
      statusCode: 502,
      headers: Object.assign({}, headers, { 'Cache-Control': 'no-store' }),
      body: JSON.stringify({ error: err.message }),
    };
  }
};
