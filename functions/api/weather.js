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
export async function onRequestGet({request,env}){
  if(!env.WU_API_KEY)return json({error:'API-sleutel ontbreekt in Cloudflare (WU_API_KEY).'},503);
  const params=new URL(request.url).searchParams;
  const scope=params.get('scope')||'day';
  if(!Object.hasOwn(routes,scope))return json({error:'Ongeldige periode.'},400);
  const day=params.get('date');
  if(scope==='day'&&!validISO(day))return json({error:'Datum moet YYYY-MM-DD zijn.'},400);
  const today=dateNL(new Date());
  const liveDay=scope==='today'||(scope==='day'&&day===today);

  async function fromWU(path,requestedDay){
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

  if(liveDay){
    try{
      // Rapid history covers the last 24h (often every ~5 min).
      // Keep ONLY today's observations; yesterday's evening must not appear.
      const recent=await fromWU(routes.today);
      const filtered=recent.filter(obs=>observationDate(obs)===today);
      if(filtered.length){
        return json({station:STATION,scope:'today',source:'recent-1day',observations:filtered},200,60);
      }
    }catch{/* Some PWS API plans may not permit the rapid endpoint. */}
    try{
      const archived=await fromWU(routes.day,today);
      const filtered=archived.filter(obs=>observationDate(obs)===today);
      return json({station:STATION,scope:'today',source:'history-fallback',observations:filtered,
        warning:'De recente metingen zijn tijdelijk niet beschikbaar; historische meetpunten kunnen achterlopen.'},200,60);
    }catch(e){
      return json({error:e.message||'Actuele daggegevens niet beschikbaar.'},502);
    }
  }

  try{
    const observations=await fromWU(routes[scope],scope==='day'?day:null);
    return json({station:STATION,scope,source:scope==='day'?'history':'observations',observations},
      200,scope==='current'?60:scope==='week'?900:3600);
  }catch(e){
    return json({error:e.message||'Weather Underground is tijdelijk niet bereikbaar.'},502);
  }
}
