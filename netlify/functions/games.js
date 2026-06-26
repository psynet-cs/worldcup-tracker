var https = require('https');

var AUTH_KEY = process.env.PSYNET_API_KEY || '';
var LEAGUE_ID = 'OT272';

// 캐시
var _cache = null;
var _cacheTs = 0;
var CACHE_MS = 55 * 60 * 1000; // 55분

// 고정 3위팀 데이터 (API 실패해도 이건 항상 반환)
var THIRDS = [
  {group:'F',name:'\uc2a4\uc6e8\ub374',pts:4,gd:0,gf:7,done:true},
  {group:'E',name:'\uc5d0\ucfe0\uc544\ub3c4\ub974',pts:4,gd:0,gf:2,done:true},
  {group:'D',name:'\ubbf8\uad6d',pts:3,gd:1,gf:4,done:true},
  {group:'B',name:'\ubcf4\uc2a4\ub2c8\uc544\ud5e4\ub974\uccb4\uace0\ube44\ub098',pts:3,gd:-1,gf:4,done:true},
  {group:'A',name:'\ub300\ud55c\ubbfc\uad6d',pts:3,gd:-1,gf:2,done:true},
  {group:'J',name:'\uc54c\uc81c\ub9ac',pts:3,gd:-2,gf:2,done:true},
  {group:'C',name:'\uc2a4\ucf54\ud2c0\ub79c\ub4dc',pts:3,gd:-3,gf:1,done:true},
  {group:'I',name:'\uc138\ub124\uac08',pts:0,gd:-3,gf:3,done:true},
  {group:'G',name:'\uc774\ub780',pts:1,gd:0,gf:0,done:false},
  {group:'H',name:'\uce74\ubcf4\ubca0\ub974\ub370',pts:1,gd:0,gf:2,done:false},
  {group:'K',name:'DR\ucf69\uace0',pts:1,gd:0,gf:1,done:false},
  {group:'L',name:'\ud30c\ub098\ub9c8',pts:0,gd:-1,gf:0,done:false}
];

function pad(n) { return (n < 10 ? '0' : '') + n; }

function koreaDateStr(plusDays) {
  var ms = Date.now() + (9 + (plusDays || 0) * 24) * 3600000;
  var d = new Date(ms);
  return '' + d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
}

function fetchURL(url) {
  return new Promise(function(resolve, reject) {
    var req = https.get(url, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        var body = Buffer.concat(chunks).toString('utf8');
        try {
          resolve(JSON.parse(body));
        } catch(e) {
          reject(new Error('JSON parse failed: ' + body.slice(0, 200)));
        }
      });
    });
    req.on('error', function(e) { reject(e); });
    req.setTimeout(8000, function() { req.destroy(); reject(new Error('timeout')); });
  });
}

exports.handler = function(event, context, callback) {
  var CORS = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=60',
    'Netlify-CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=60'
  };
  var NO_CACHE = Object.assign({}, CORS, {'Cache-Control': 'no-store', 'Netlify-CDN-Cache-Control': 'no-store'});

  // API 키 없으면 thirds만 반환 (경기 없이도 순위표는 보임)
  if (!AUTH_KEY) {
    return callback(null, {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({updatedAt: new Date().toISOString(), games: [], thirds: THIRDS, source: 'no-key'})
    });
  }

  // 캐시 히트
  var now = Date.now();
  if (_cache && (now - _cacheTs) < CACHE_MS) {
    return callback(null, {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({updatedAt: new Date(_cacheTs).toISOString(), games: _cache, thirds: THIRDS, source: 'cache'})
    });
  }

  // API 호출
  var d0 = koreaDateStr(0);
  var d1 = koreaDateStr(1);
  var base = 'https://data.psynet.co.kr/data3V1/livescore/gameList?auth_key=' + AUTH_KEY + '&compe=soccer&search_date=';

  Promise.all([fetchURL(base + d0), fetchURL(base + d1)])
    .then(function(results) {
      var list0 = (results[0] && results[0].Data && results[0].Data.list) || [];
      var list1 = (results[1] && results[1].Data && results[1].Data.list) || [];
      var games = list0.concat(list1)
        .filter(function(g) { return g.LEAGUE_ID === LEAGUE_ID; })
        .map(function(g) {
          return {
            gameId: g.GAME_ID,
            matchDate: g.MATCH_DATE,
            matchTime: g.MATCH_TIME,
            homeTeam: g.HOME_TEAM_SHORT_NAME || g.HOME_TEAM_NAME,
            awayTeam: g.AWAY_TEAM_SHORT_NAME || g.AWAY_TEAM_NAME,
            homeScore: g.HOME_SCORE,
            awayScore: g.AWAY_SCORE,
            state: g.STATE_TXT_CODE
          };
        });

      _cache = games;
      _cacheTs = now;

      callback(null, {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({updatedAt: new Date().toISOString(), games: games, thirds: THIRDS, source: 'api'})
      });
    })
    .catch(function(err) {
      // API 실패해도 thirds는 반환 → 순위표는 항상 보임
      callback(null, {
        statusCode: 200,
        headers: NO_CACHE,
        body: JSON.stringify({updatedAt: new Date().toISOString(), games: [], thirds: THIRDS, source: 'api-error', error: err.message})
      });
    });
};
