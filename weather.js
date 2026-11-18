/** Cloudflare Pages Function for Weather Underground station IJUBBE7.
 * Production secret: WU_API_KEY. Never expose it to the browser.
 * GET /api/weather?scope=current
 * GET /api/weather?scope=day&date=YYYY-MM-DD
 * GET /api/weather?scope=week  (recent 7-day hourly history)
 */
export async function onRequestGet({request, env}) {
  const json = (value,status=200,ttl=0) => new Response(JSON.stringify(value), {
    status, headers:{'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':ttl?`public, max-age=${ttl}, s-maxage=${ttl}`:'no-store',
      'X-Content-Type-Options':'nosniff'}
  });
  if (!env.WU_API_KEY) return json({error:'API-sleutel ontbreekt in Cloudflare (WU_API_KEY).'},503);
  const params=new URL(request.url).searchParams;
  const scope=params.get('scope')||'day';
  const paths={current:'/v2/pws/observations/current',day:'/v2/pws/history/all',week:'/v2/pws/observations/hourly/7day'};
  if (!Object.hasOwn(paths,scope)) return json({error:'Ongeldige periode.'},400);
  const date=params.get('date');
  if (scope==='day') {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date) return json({error:'Datum moet YYYY-MM-DD zijn.'},400);
  }
  const url=new URL('https://api.weather.com'+paths[scope]);
  url.searchParams.set('stationId','IJUBBE7');
  url.searchParams.set('format','json');
  url.searchParams.set('units','m');
  url.searchParams.set('numericPrecision','decimal');
  if(scope==='day')url.searchParams.set('date',date.replaceAll('-',''));
  url.searchParams.set('apiKey',env.WU_API_KEY);
  try {
    const upstream=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
    if (!upstream.ok) return json({error:`Weather Underground geeft HTTP ${upstream.status}.`},502);
    const payload=await upstream.json();
    return json({station:'IJUBBE7',scope,observations:Array.isArray(payload.observations)?payload.observations:[]},200,scope==='current'?90:scope==='week'?900:3600);
  } catch {
    return json({error:'Weather Underground is tijdelijk niet bereikbaar.'},502);
  }
}
