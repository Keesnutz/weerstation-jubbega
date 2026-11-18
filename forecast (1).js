/**
 * Five-day, two-model forecast for Noordoost-Nederland (Jubbega).
 * Source: Open-Meteo, ECMWF IFS 0.25° and NOAA GFS 0.25°.
 * No private credentials needed. Does NOT modify the PWS API.
 * GET /api/forecast
 * Attribution required: https://open-meteo.com/
 */
const LAT = '53.005';
const LON = '6.130';
const TIMEZONE = 'Europe/Amsterdam';
const DAILY = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max';
const MODELS = { ecmwf: 'ecmwf_ifs025', gfs: 'gfs025' };
const responseHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=900, s-maxage=1800',
  'X-Content-Type-Options': 'nosniff'
};
const numeric = (v) => typeof v === 'number' && Number.isFinite(v) ? v : null;

function normalize(payload, key) {
  if (!payload || !payload.daily || !Array.isArray(payload.daily.time)) {
    throw new Error('Geen geldige dagelijkse modelgegevens');
  }
  const d = payload.daily;
  const items = d.time.slice(0, 5).map((date, i) => ({
    date,
    weatherCode: numeric(d.weather_code?.[i]),
    high: numeric(d.temperature_2m_max?.[i]),
    low: numeric(d.temperature_2m_min?.[i]),
    precipitation: numeric(d.precipitation_sum?.[i]),
    wind: numeric(d.wind_speed_10m_max?.[i]),
    gust: numeric(d.wind_gusts_10m_max?.[i])
  }));
  if (items.length !== 5 || items.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d.date))) {
    throw new Error('Onvolledige verwachting');
  }
  return {model: MODELS[key], days: items};
}

async function getModel(key) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', LAT);
  url.searchParams.set('longitude', LON);
  url.searchParams.set('daily', DAILY);
  url.searchParams.set('timezone', TIMEZONE);
  url.searchParams.set('forecast_days', '5');
  url.searchParams.set('models', MODELS[key]);
  url.searchParams.set('temperature_unit', 'celsius');
  url.searchParams.set('wind_speed_unit', 'kmh');
  url.searchParams.set('precipitation_unit', 'mm');
  const response = await fetch(url, {headers: {Accept: 'application/json'}, signal: AbortSignal.timeout(13000)});
  if (!response.ok) throw new Error(`Bronstatus HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error('Weermodel tijdelijk niet beschikbaar');
  return normalize(payload, key);
}

export async function onRequestGet({request, context}) {
  const asJson = (value, code=200) => new Response(JSON.stringify(value), {
    status:code,
    headers: code === 200 ? responseHeaders : {...responseHeaders, 'Cache-Control':'no-store'}
  });
  // Cache public forecasts per Cloudflare location for 30 minutes.
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(new URL('/api/forecast', request.url).toString(), {method:'GET'});
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
  }
  const keys = Object.keys(MODELS);
  const results = await Promise.allSettled(keys.map(key => getModel(key)));
  const models = {};
  const warnings = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') models[keys[i]] = result.value;
    else warnings.push(`${keys[i].toUpperCase()} tijdelijk niet beschikbaar`);
  });
  if (!Object.keys(models).length) return asJson({error:'Beide weermodellen zijn tijdelijk niet beschikbaar.',warnings}, 502);
  const response = asJson({
    location:'Jubbega · Noordoost-Nederland',
    latitude:53.005,
    longitude:6.13,
    timezone: TIMEZONE,
    source:'Open-Meteo',
    updatedAt:new Date().toISOString(),
    models,
    warnings
  });
  if (cache && context?.waitUntil) context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
