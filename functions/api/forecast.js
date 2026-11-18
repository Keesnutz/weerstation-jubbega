/**
 * Fourteen-day ECMWF + NOAA GFS forecast for Jubbega / Noordoost-Nederland.
 * Open-Meteo; separate model endpoints and no PWS credentials.
 * GET /api/forecast
 * Uses Cloudflare's 15-minute edge cache only when BOTH models succeeded.
 */
const LAT = '53.005';
const LON = '6.130';
const DAYS = 14;
const TIMEZONE = 'Europe/Amsterdam';
const DAILY = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,snowfall_sum';
const HOURLY = 'temperature_2m,dew_point_2m,precipitation,snowfall,precipitation_probability';
const DAILY_BASIC = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max';
const MODELS = {
  // Keep the same ECMWF IFS 0.25° model as v7.
  ecmwf: { name: 'ecmwf_ifs025', endpoint: '/v1/ecmwf' },
  // NOAA GFS Global is selected explicitly instead of automatic best_match.
  gfs: { name: 'gfs_global', endpoint: '/v1/gfs' }
};
const numeric = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
const json = (value, status = 200, cacheable = false) => new Response(JSON.stringify(value), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': cacheable ? 'public, max-age=600, s-maxage=900' : 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});
function normalize(payload, key) {
  if (!payload || !payload.daily || !Array.isArray(payload.daily.time)) {
    throw new Error('Onjuist API-antwoord (geen dagelijkse voorspellingen)');
  }
  const d = payload.daily;
  const h = payload.hourly || {};
  const dailyHourly = new Map();
  if (Array.isArray(h.time)) {
    for(let i=0;i<h.time.length;i++) {
      const date = String(h.time[i]).slice(0,10);
      if(!dailyHourly.has(date))dailyHourly.set(date,[]);
      dailyHourly.get(date).push({
        dew:numeric(h.dew_point_2m?.[i]),temp:numeric(h.temperature_2m?.[i]),
        precip:numeric(h.precipitation?.[i]), snow:numeric(h.snowfall?.[i]),
        precipProbability:numeric(h.precipitation_probability?.[i])
      });
    }
  }
  const avg = values => {const v=values.filter(Number.isFinite);return v.length?v.reduce((s,x)=>s+x,0)/v.length:null};
  const maximum = values => {const v=values.filter(Number.isFinite);return v.length?Math.max(...v):null};
  function snowIndicator(hours,snowfall,weatherCode) {
    // Deterministic models do not give a calibrated probability of snow.
    // Flag predicted snow or temperature/dew-point conditions during precipitation.
    const snowHours=hours.filter(x=>Number.isFinite(x.snow)&&x.snow>0.02);
    const coldWetHours=hours.filter(x=>Number.isFinite(x.precip)&&x.precip>0.1&&
      Number.isFinite(x.temp)&&Number.isFinite(x.dew)&&x.temp<=2&&x.dew<=0);
    const predicted=Number.isFinite(snowfall)&&snowfall>0.05 || snowHours.length>0 || [71,73,75,77,85,86].includes(weatherCode);
    const possible=predicted || coldWetHours.length>0;
    if(!hours.length && snowfall===null && !predicted) return {
      snowSignal:'Sneeuwgegevens niet beschikbaar',snowPrecipChance:null
    };
    // If precipitation probability is present, show maximum probability of
    // precipitation during modelled snow hours, NOT a probability of snowfall.
    const relevant=snowHours.length?snowHours:coldWetHours;
    const precipitationChance=maximum(relevant.map(x=>x.precipProbability));
    return { snowSignal: predicted?'Sneeuw voorspeld':possible?'Sneeuw mogelijk':'Geen sneeuwsignaal',
      snowPrecipChance:possible?precipitationChance:null };
  }
  const days = d.time.slice(0, DAYS).map((date, i) => {
    const hours=dailyHourly.get(date)||[];
    const code=numeric(d.weather_code?.[i]);
    const snowfall=numeric(d.snowfall_sum?.[i]);
    return {
      date,
      weatherCode:code,
      high:numeric(d.temperature_2m_max?.[i]),
      low:numeric(d.temperature_2m_min?.[i]),
      precipitation:numeric(d.precipitation_sum?.[i]),
      wind:numeric(d.wind_speed_10m_max?.[i]),
      gust:numeric(d.wind_gusts_10m_max?.[i]),
      dewPoint:avg(hours.map(x=>x.dew)),
      snowfall,
      ...snowIndicator(hours,snowfall,code)
    };
  });
  if (days.length !== DAYS || days.some(day => !/^\d{4}-\d{2}-\d{2}$/.test(day.date))) {
    throw new Error(`Geen volledige ${DAYS}-daagse periode ontvangen`);
  }
  return { model: MODELS[key].name, days };
}
function modelUrl(key, fallback = false, basic = false) {
  const item = MODELS[key];
  // Fallback to generic forecast endpoint with the SAME explicit model selection.
  const url = new URL(`https://api.open-meteo.com${fallback ? '/v1/forecast' : item.endpoint}`);
  for (const [name,value] of Object.entries({
    latitude:LAT, longitude:LON, daily:basic?DAILY_BASIC:DAILY, ...(basic?{}:{hourly:HOURLY}), timezone:TIMEZONE,
    forecast_days:String(DAYS), models:item.name,
    temperature_unit:'celsius', wind_speed_unit:'kmh', precipitation_unit:'mm'
  })) url.searchParams.set(name, value);
  return url;
}
async function fetchModel(key, fallback = false, basic = false) {
  const response = await fetch(modelUrl(key, fallback, basic), {
    headers: { Accept:'application/json' },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = typeof body.reason === 'string' ? `: ${body.reason.slice(0,120)}` : '';
    } catch { /* upstream may return non-JSON */ }
    throw new Error(`HTTP ${response.status}${detail}`);
  }
  const payload = await response.json();
  if (payload.error) throw new Error(String(payload.reason || 'Model tijdelijk niet beschikbaar').slice(0,120));
  const normalized=normalize(payload, key);
  normalized.enriched=!basic;
  return normalized;
}
async function getModel(key) {
  const reasons=[];
  for (const [generic,basic] of [[false,false],[true,false],[false,true],[true,true]]) {
    try { return await fetchModel(key,generic,basic); }
    catch(e) { reasons.push(e.message); }
  }
  throw new Error(reasons.slice(-2).join(' / '));
}
export async function onRequestGet({ request, context }) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  // Versioned key bypasses any cached v7 response with only ECMWF.
  const cacheKey = new Request(new URL('/api/forecast?version=9', request.url).toString(), {method:'GET'});
  if (cache) {
    try { const hit = await cache.match(cacheKey); if (hit) return hit; }
    catch { /* Cache failure must not affect data delivery */ }
  }
  const entries = await Promise.allSettled(Object.keys(MODELS).map(getModel));
  const models = {};
  const warnings = [];
  Object.keys(MODELS).forEach((key,i) => {
    const result = entries[i];
    if (result.status === 'fulfilled') models[key] = result.value;
    else warnings.push(`${key.toUpperCase()} niet beschikbaar (${result.reason?.message || 'bronfout'})`);
  });
  if (!Object.keys(models).length) {
    return json({ error:'Beide weermodellen zijn tijdelijk niet beschikbaar.',warnings },502);
  }
  const allModelsPresent = Object.keys(MODELS).every(key => key in models);
  const fullyEnriched = allModelsPresent && Object.values(models).every(item=>item.enriched);
  if(allModelsPresent && !fullyEnriched)warnings.push('Extra dauwpunt/sneeuwgegevens tijdelijk niet beschikbaar voor een model.');
  const response = json({
    location:'Jubbega · Noordoost-Nederland', latitude:53.005, longitude:6.13,
    timezone:TIMEZONE, source:'Open-Meteo', forecastDays:DAYS,
    updatedAt:new Date().toISOString(), models, warnings
  },200,fullyEnriched);
  // Do not cache one-model answers: the missing model should be retried next request.
  if (fullyEnriched && cache && context?.waitUntil) {
    context.waitUntil(cache.put(cacheKey, response.clone()).catch(()=>{}));
  }
  return response;
}
