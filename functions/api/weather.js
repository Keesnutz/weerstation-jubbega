/** Cloudflare Pages Function for station IJUBBE7.
 * Routes:
 * /api/weather?scope=current
 * /api/weather?scope=day&date=YYYY-MM-DD
 * /api/weather?scope=week
 * Set WU_API_KEY as a production secret in Cloudflare Pages.
 */
export async function onRequestGet({ request, env }) {
  const json = (body, status = 200, cache = 'no-store') => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache }
  });
  if (!env.WU_API_KEY) return json({ error: 'WU_API_KEY is not configured yet' }, 503);

  const params = new URL(request.url).searchParams;
  const scope = params.get('scope') || 'current';
  if (!['current', 'day', 'week'].includes(scope)) return json({ error: 'Invalid scope' }, 400);

  const date = params.get('date');
  if (scope === 'day') {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        Number.isNaN(Date.parse(date + 'T00:00:00Z')) ||
        new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) {
      return json({ error: 'Invalid date' }, 400);
    }
  }

  const endpoints = {
    current: 'https://api.weather.com/v2/pws/observations/current',
    day: 'https://api.weather.com/v2/pws/history/all',
    week: 'https://api.weather.com/v2/pws/observations/hourly/7day'
  };
  const url = new URL(endpoints[scope]);
  url.searchParams.set('stationId', 'IJUBBE7');
  url.searchParams.set('format', 'json');
  url.searchParams.set('units', 'm');
  url.searchParams.set('numericPrecision', 'decimal');
  if (scope === 'day') url.searchParams.set('date', date.replaceAll('-', ''));
  url.searchParams.set('apiKey', env.WU_API_KEY);

  try {
    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!response.ok) return json({ error: 'Weather Underground returned ' + response.status }, 502);
    const data = await response.json();
    const observations = Array.isArray(data.observations) ? data.observations : [];
    return json({ station: 'IJUBBE7', observations }, 200, scope === 'current' ? 'no-store' : 'public, max-age=300');
  } catch (error) {
    return json({ error: 'Weather provider currently unavailable' }, 502);
  }
}
