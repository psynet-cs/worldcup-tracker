var https = require('https');

var AUTH_KEY = process.env.PSYNET_API_KEY || '';
var BASE_URL = 'https://data.psynet.co.kr/data3V1/livescore';
var LEAGUE_ID = 'OT272';
var cache = null;
var cacheTime = 0;
var CACHE_MS = 55 * 60 * 1000;

function get(url) {
  return new Promise(function(resolve, reject) {
    https.get(url, function(res) {
      var data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function today(plus) {
  var d = new Date(Date.now() + (9 + (plus||0)*24)*3600000);
  return d.getUTCFullYear()+pad(d.getUTCMonth()+1)+pad(d.getUTCDate());
}

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
  {group:'L',name:'\ud30c\ub098\ub9c8',pts:0,gd:-1,gf:0,done:false},
];

exports.handler = function(event, context, callback) {
  var headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=60',
    'Netlify-CDN-Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=60'
  };

  if (!AUTH_KEY) {
    return callback(null, {
      statusCode: 500,
      headers: headers,
      body: JSON.stringify({error: 'PSYNET_API_KEY not set'})
    });
  }

  var now = Date.now();
  if (cache && (now - cacheTime) < CACHE_MS) {
    return callback(null, {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({updatedAt: new Date().toISOString(), games: cache, thirds: THIRDS, source:'cache'})
    });
  }

  var d0 = today(0);
  var d1 = today(1);
  var u0 = BASE_URL+'/gameList?auth_key='+AUTH_KEY+'&search_date='+d0+'&compe=soccer';
  var u1 = BASE_URL+'/gameList?auth_key='+AUTH_KEY+'&search_date='+d1+'&compe=soccer';

  Promise.all([get(u0), get(u1)]).then(function(results) {
    var list0 = (results[0]&&results[0].Data&&results[0].Data.list)||[];
    var list1 = (results[1]&&results[1].Data&&results[1].Data.list)||[];
    var all = list0.concat(list1).filter(function(g){ return g.LEAGUE_ID===LEAGUE_ID; });

    var games = all.map(function(g) {
      return {
        gameId: g.GAME_ID,
        matchDate: g.MATCH_DATE,
        matchTime: g.MATCH_TIME,
        homeTeam: g.HOME_TEAM_SHORT_NAME||g.HOME_TEAM_NAME,
        awayTeam: g.AWAY_TEAM_SHORT_NAME||g.AWAY_TEAM_NAME,
        homeTeamId: g.HOME_TEAM_ID,
        awayTeamId: g.AWAY_TEAM_ID,
        homeScore: g.HOME_SCORE,
        awayScore: g.AWAY_SCORE,
        state: g.STATE_TXT_CODE
      };
    });

    cache = games;
    cacheTime = now;

    callback(null, {
      statusCode: 200,
      headers: headers,
      body: JSON.stringify({updatedAt: new Date().toISOString(), games: games, thirds: THIRDS, source:'api'})
    });

  }).catch(function(err) {
    callback(null, {
      statusCode: 502,
      headers: Object.assign({}, headers, {'Cache-Control':'no-store'}),
      body: JSON.stringify({error: err.message})
    });
  });
};
