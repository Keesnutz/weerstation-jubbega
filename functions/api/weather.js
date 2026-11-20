/**
 * Weather Underground observations for IJUBBE7.
 * WU_API_KEY is an existing Cloudflare Pages secret; never send it to the browser.
 *
 * GET /api/weather?scope=current               latest live observation
 * GET /api/weather?scope=today                 current day's rapid observations
 * GET /api/weather?scope=day&date=YYYY-MM-DD   archived day (today also uses rapid)
 * GET /api/weather?scope=week                  past 7 days, hourly
 *
 * Today's rapid data is filtered to the Netherlands calendar day. If the
 * 1-day rapid endpoint is unavailable, fall back to the existing history API.
 */
const ZONE='Europe/Amsterdam';
const STATION='IJUBBE7';
const routes={
  current:'/v2/pws/observations/current',
  day:'/v2/pws/history/all',
  week:'/v2/pws/observations/hourly/7day',
  today:'/v2/pws/observations/all/1day'
};
function dateNL(value){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'})
    .formatToParts(value).reduce((out,part)=>(out[part.type]=part.value,out),{});
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function observationDate(obs){
  if(typeof obs.obsTimeLocal==='string' && /^\d{4}-\d{2}-\d{2}/.test(obs.obsTimeLocal))
    return obs.obsTimeLocal.slice(0,10);
  const epoch=Number(obs.epoch);
  const instant=Number.isFinite(epoch)&&epoch>0?new Date(epoch*1000):new Date(obs.obsTimeUtc || NaN);
  return Number.isNaN(instant.getTime())?'':dateNL(instant);
}
function json(value,status=200,ttl=0){
  return new Response(JSON.stringify(value),{
    status,
    headers:{
      'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':ttl?`public, max-age=${ttl}, s-maxage=${ttl}`:'no-store',
      'X-Content-Type-Options':'nosniff'
    }
  });
}
function validISO(s){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return false;
  const d=new Date(s+'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10)===s;
}

/** Read already saved observations; when D1 is not yet bound, stay WU-only. */
async function fromLocalArchive(env,scope,date,today){
  if(!env.WEATHER_DB)return [];
  let query;
  let args;
  if(scope==='current'){
    query='SELECT observation_json FROM weather_observations WHERE station_id=? ORDER BY observed_epoch DESC LIMIT 1';
    args=[STATION];
  }else if(scope==='week'){
    const since=Math.floor(Date.now()/1000)-7*86400;
    query='SELECT observation_json FROM weather_observations WHERE station_id=? AND observed_epoch>=? ORDER BY observed_epoch LIMIT 2500';
    args=[STATION,since];
  }else{
    const target=scope==='today'?today:date;
    query='SELECT observation_json FROM weather_observations WHERE station_id=? AND local_date=? ORDER BY observed_epoch LIMIT 450';
    args=[STATION,target];
  }
  try{
    const rows=await env.WEATHER_DB.prepare(query).bind(...args).all();
    return (rows.results||[]).map(row=>{
      try{return JSON.parse(row.observation_json)}catch{return null}
    }).filter(Boolean);
  }catch(e){
    console.warn('Eigen archief tijdelijk onbereikbaar:',e?.message||String(e));
    return [];
  }
}
/** The archive fills missing periods; when both have the same timestamp, WU wins. */
function mergeObservations(archived,wunderground){
  const rows=new Map();
  const stamp=o=>String(o.obsTimeUtc||o.epoch||o.obsTimeLocal||'');
  for(const observation of [...archived,...wunderground]){
    const key=stamp(observation);
    if(key)rows.set(key,observation);
  }
  return [...rows.values()].sort((a,b)=>{
    const va=Number(a.epoch),vb=Number(b.epoch);
    if(Number.isFinite(va)&&Number.isFinite(vb))return va-vb;
    return String(a.obsTimeLocal||a.obsTimeUtc||'').localeCompare(String(b.obsTimeLocal||b.obsTimeUtc||''));
  });
}

export async function onRequestGet({request,env}){
  if(!env.WU_API_KEY&&!env.WEATHER_DB)return json({error:'API-sleutel en eigen archief ontbreken in Cloudflare.'},503);
  const params=new URL(request.url).searchParams;
  const scope=params.get('scope')||'day';
  if(!Object.hasOwn(routes,scope))return json({error:'Ongeldige periode.'},400);
  const day=params.get('date');
  if(scope==='day'&&!validISO(day))return json({error:'Datum moet YYYY-MM-DD zijn.'},400);
  const today=dateNL(new Date());
  const liveDay=scope==='today'||(scope==='day'&&day===today);

  async function fromWU(path,requestedDay){
    if(!env.WU_API_KEY)throw new Error('WU_API_KEY is niet ingesteld.');
    const url=new URL('https://api.weather.com'+path);
    for(const [key,value] of Object.entries({
      stationId:STATION,format:'json',units:'m',numericPrecision:'decimal',apiKey:env.WU_API_KEY
    }))url.searchParams.set(key,value);
    if(requestedDay)url.searchParams.set('date',requestedDay.replaceAll('-',''));
    const upstream=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
    if(!upstream.ok)throw new Error(`Weather Underground geeft HTTP ${upstream.status}.`);
    const data=await upstream.json();
    if(!Array.isArray(data.observations))throw new Error('Onverwacht antwoord van Weather Underground.');
    return data.observations;
  }

  // Safe fallback: a missing D1 binding is not an error and does not affect the existing site.
  const archived=await fromLocalArchive(env,scope,day,today);
  if(liveDay){
    try{
      const recent=await fromWU(routes.today);
      const filtered=recent.filter(obs=>observationDate(obs)===today);
      if(filtered.length){
        return json({station:STATION,scope:'today',source:archived.length?'recent-1day+archive':'recent-1day',
          observations:mergeObservations(archived,filtered)},200,60);
      }
    }catch{/* Some PWS API plans may not permit the rapid endpoint. */}
    try{
      const fromHistory=await fromWU(routes.day,today);
      const filtered=fromHistory.filter(obs=>observationDate(obs)===today);
      const combined=mergeObservations(archived,filtered);
      if(combined.length){
        return json({station:STATION,scope:'today',
          source:archived.length?'history-fallback+archive':'history-fallback',observations:combined,
          warning:'Recente metingen van Weather Underground kunnen achterlopen.'},200,60);
      }
    }catch{/* When WU is offline, rely on the local archive below. */}
    if(archived.length)return json({station:STATION,scope:'today',source:'local-archive',observations:archived,
      warning:'Weather Underground niet beschikbaar. Laatst lokaal opgeslagen metingen worden getoond.'},200,0);
    return json({error:'Actuele daggegevens niet beschikbaar bij Weather Underground of in het eigen archief.'},502);
  }

  try{
    const wunderground=await fromWU(routes[scope],scope==='day'?day:null);
    const observations=mergeObservations(archived,wunderground);
    if(observations.length)return json({station:STATION,scope,
      source:archived.length?'weather-underground+archive':'weather-underground',observations},
      200,scope==='current'?60:scope==='week'?900:3600);
    if(archived.length)return json({station:STATION,scope,source:'local-archive',observations:archived},200,0);
    return json({station:STATION,scope,source:'weather-underground',observations:[]},200,0);
  }catch(e){
    if(archived.length)return json({station:STATION,scope,source:'local-archive',observations:archived,
      warning:'Weather Underground tijdelijk niet bereikbaar. Gegevens komen uit het eigen archief.'},200,0);
    return json({error:e.message||'Weather Underground is tijdelijk niet bereikbaar.'},502);
  }
}
