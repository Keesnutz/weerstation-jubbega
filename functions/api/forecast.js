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
const HOURLY_EXTENDED = HOURLY + ',weather_code,wind_speed_10m';
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
        precipProbability:numeric(h.precipitation_probability?.[i]),
        hour:Number(String(h.time[i]).slice(11,13)),
        weatherCode:numeric(h.weather_code?.[i]),
        wind:numeric(h.wind_speed_10m?.[i])
      });
    }
  }
  const avg = values => {const v=values.filter(Number.isFinite);return v.length?v.reduce((s,x)=>s+x,0)/v.length:null};
  const maximum = values => {const v=values.filter(Number.isFinite);return v.length?Math.max(...v):null};
  const minimum = values => {const v=values.filter(Number.isFinite);return v.length?Math.min(...v):null};
  const sum = values => {const v=values.filter(Number.isFinite);return v.length?v.reduce((a,b)=>a+b,0):null};
  const severity = code => ([95,96,99].includes(code)?8:[71,73,75,77,85,86].includes(code)?7:[80,81,82].includes(code)?6:[61,63,65,66,67].includes(code)?5:[51,53,55,56,57].includes(code)?4:[45,48].includes(code)?3:code===3?2:code===2?1:0);
  function dayparts(hours) {
    const periods={morning:[6,12],afternoon:[12,18],evening:[18,24]};
    const result={};
    for (const [key,[start,end]] of Object.entries(periods)) {
      const selected=hours.filter(h=>h.hour>=start && h.hour<end);
      const coded=selected.filter(h=>Number.isFinite(h.weatherCode)).sort((a,b)=>severity(b.weatherCode)-severity(a.weatherCode));
      result[key]={
        low:minimum(selected.map(h=>h.temp)), high:maximum(selected.map(h=>h.temp)),
        precipitation:sum(selected.map(h=>h.precip)), wind:maximum(selected.map(h=>h.wind)),
        weatherCode:coded.length?coded[0].weatherCode:null,
        hours: selected.filter(h=>Number.isFinite(h.temp)||Number.isFinite(h.precip)).length
      };
    }
    return result;
  }
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
      dayparts:dayparts(hours),
      ...snowIndicator(hours,snowfall,code)
    };
  });
  if (days.length !== DAYS || days.some(day => !/^\d{4}-\d{2}-\d{2}$/.test(day.date))) {
    throw new Error(`Geen volledige ${DAYS}-daagse periode ontvangen`);
  }
  return { model: MODELS[key].name, days };
}
function modelUrl(key, fallback = false, basic = false, extended = true) {
  const item = MODELS[key];
  // Fallback to generic forecast endpoint with the SAME explicit model selection.
  const url = new URL(`https://api.open-meteo.com${fallback ? '/v1/forecast' : item.endpoint}`);
  for (const [name,value] of Object.entries({
    latitude:LAT, longitude:LON, daily:basic?DAILY_BASIC:DAILY, ...(basic?{}:{hourly:extended?HOURLY_EXTENDED:HOURLY}), timezone:TIMEZONE,
    forecast_days:String(DAYS), models:item.name,
    temperature_unit:'celsius', wind_speed_unit:'kmh', precipitation_unit:'mm'
  })) url.searchParams.set(name, value);
  return url;
}
async function fetchModel(key, fallback = false, basic = false, extended = true) {
  const response = await fetch(modelUrl(key, fallback, basic, extended), {
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
  normalized.fetchedAt=new Date().toISOString();
  return normalized;
}
// The daily feed may succeed even if a large combined request has no hourly
// fields. Request only the two days needed for the three time-of-day cards.
function hourlyOnlyUrl(key, generic, limited) {
  const item=MODELS[key];
  const url=new URL(`https://api.open-meteo.com${generic?'/v1/forecast':item.endpoint}`);
  for(const [name,value] of Object.entries({
    latitude:LAT,longitude:LON,models:item.name,timezone:TIMEZONE,
    forecast_days:'2',hourly:limited?'temperature_2m,precipitation':'temperature_2m,precipitation,weather_code,wind_speed_10m',
    temperature_unit:'celsius',wind_speed_unit:'kmh',precipitation_unit:'mm'
  }))url.searchParams.set(name,value);
  return url;
}
async function addDaypartsFromHourly(key, model) {
  // Keep the original daily forecast intact; only fill missing dayparts.
  for(const [generic,limited] of [[true,false],[false,false],[true,true]]) {
    try {
      const response=await fetch(hourlyOnlyUrl(key,generic,limited),{
        headers:{Accept:'application/json'},signal:AbortSignal.timeout(9000)
      });
      if(!response.ok)continue;
      const payload=await response.json();
      if(!Array.isArray(payload?.hourly?.time))continue;
      const daily={
        time:model.days.map(d=>d.date),weather_code:model.days.map(d=>d.weatherCode),
        temperature_2m_max:model.days.map(d=>d.high),temperature_2m_min:model.days.map(d=>d.low),
        precipitation_sum:model.days.map(d=>d.precipitation),
        wind_speed_10m_max:model.days.map(d=>d.wind),wind_gusts_10m_max:model.days.map(d=>d.gust),
        snowfall_sum:model.days.map(d=>d.snowfall)
      };
      const hourly=normalize({daily,hourly:payload.hourly},key);
      let filled=0;
      for(let i=0;i<model.days.length;i++) {
        const source=hourly.days[i];
        if(!source)continue;
        if(Object.values(source.dayparts||{}).some(p=>p.hours>0)) {
          model.days[i].dayparts=source.dayparts;
          filled++;
        }
        if(Number.isFinite(source.dewPoint))model.days[i].dewPoint=source.dewPoint;
      }
      if(filled){model.daypartsSource='hourly-separate';return true;}
    } catch { /* Retry on the alternate endpoint or with fewer fields. */ }
  }
  return false;
}
// Metadata belongs to Open-Meteo's *published* model feed. It exposes the
// model run's UTC reference time and when that run became available, not when
// this website happened to fetch the JSON forecast.
async function fetchRunMetadata(key) {
  const model=key==='ecmwf'?'ecmwf_ifs025':'ncep_gfs013';
  try {
    const r=await fetch(`https://api.open-meteo.com/data/${model}/static/meta.json`,{
      headers:{Accept:'application/json'},signal:AbortSignal.timeout(5000)
    });
    if(!r.ok)return null;
    const m=await r.json();
    const parse=field=>{
      const v=m[field];
      if(typeof v!=='number'||!Number.isFinite(v)||v<1000000000)return null;
      const date=new Date(v*1000);
      return Number.isNaN(date.getTime())?null:date.toISOString();
    };
    const initialisedAt=parse('last_run_initialisation_time');
    const availableAt=parse('last_run_availability_time');
    return initialisedAt?{initialisedAt,availableAt,metadataModel:model}:null;
  } catch {return null;}
}
async function getModel(key) {
  const reasons=[];
  for (const [generic,basic,extended] of [[false,false,true],[true,false,true],[false,false,false],[true,false,false],[false,true,false],[true,true,false]]) {
    try {
      const forecast=await fetchModel(key,generic,basic,extended);
      // Never cache a daily-only result as a complete hourly forecast.
      const today=forecast.days?.[0];
      const hasDayparts=Object.values(today?.dayparts||{}).some(v=>v?.hours>0);
      if(!hasDayparts)await addDaypartsFromHourly(key,forecast);
      forecast.hasDayparts=Object.values(forecast.days?.[0]?.dayparts||{}).some(v=>v?.hours>0);
      forecast.enriched=forecast.enriched && forecast.hasDayparts;
      return forecast;
    } catch(e) {reasons.push(e.message);}
  }
  throw new Error(reasons.slice(-2).join(' / '));
}
export async function onRequestGet({ request, context }) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  // Versioned key bypasses any cached v7 response with only ECMWF.
  const cacheKey = new Request(new URL('/api/forecast?version=16', request.url).toString(), {method:'GET'});
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
  // Retrieve the official run metadata independently; it must never prevent
  // normal weather forecasts if metadata is temporarily unavailable.
  const runInfo=await Promise.allSettled(Object.keys(models).map(fetchRunMetadata));
  Object.keys(models).forEach((key,i)=>{
    const result=runInfo[i];
    models[key].run=result.status==='fulfilled'?result.value:null;
  });
  if(Object.values(models).some(model=>!model.hasDayparts))
    warnings.push('Uurlijkse dagdeelgegevens zijn tijdelijk niet voor alle modellen beschikbaar.');
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
