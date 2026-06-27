/**
 * Netlify Edge Function: /api/games
 * ─────────────────────────────────────────────────────
 * Supabase(worldcup.raw_games)에서 games + thirds를 읽어 그대로 서빙한다.
 *  · 3위 순위(thirds)는 매시간 중계 작업이 전체 조별 결과로 자동 계산해 저장 → 이 함수는 계산하지 않는다.
 *  · psynet API는 해외 IP 차단이라 직접 호출하지 않는다.
 * anon 키는 공개용(RLS: SELECT만 허용)이라 코드에 포함해도 안전.
 */
const SUPABASE_URL  = 'https://ppcexnpqvqprupyonhtz.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwY2V4bnBxdnFwcnVweW9uaHR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MjY2ODksImV4cCI6MjA4OTMwMjY4OX0.-gzk-AiAZML-SlYMUwZHQRwylGnXKMuReJIbEfB3pkY';
const LEAGUE_ID = 'OT272';

export default async () => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=60',
  };
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/raw_games?id=eq.1&select=games,thirds,updated_at`, {
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
        'Accept-Profile': 'worldcup',
      },
    });
    if (!res.ok) throw new Error(`Supabase HTTP ${res.status}`);
    const rows = await res.json();
    const row = (rows && rows[0]) || {};
    const todayGames = (row.games || []).filter(g => g.LEAGUE_ID === LEAGUE_ID);
    const thirds = row.thirds || [];

    const games = todayGames.map(g => ({
      gameId: g.GAME_ID, matchDate: g.MATCH_DATE, matchTime: g.MATCH_TIME,
      homeTeam: g.HOME_TEAM_SHORT_NAME || g.HOME_TEAM_NAME,
      awayTeam: g.AWAY_TEAM_SHORT_NAME || g.AWAY_TEAM_NAME,
      homeTeamId: g.HOME_TEAM_ID, awayTeamId: g.AWAY_TEAM_ID,
      homeScore: g.HOME_SCORE, awayScore: g.AWAY_SCORE, state: g.STATE_TXT_CODE,
    }));

    return new Response(JSON.stringify({
      updatedAt: row.updated_at || new Date().toISOString(),
      source: 'supabase', games, thirds,
    }), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502, headers: { ...CORS, 'Cache-Control': 'no-store' },
    });
  }
};

export const config = { path: '/api/games' };
