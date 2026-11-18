/** Cloudflare Pages Function: /api/weather?date=YYYY-MM-DD&scope=day|week
 * Add WU_API_KEY as a SECRET in Cloudflare Pages project settings.
 * No API key ever reaches the browser.
 */
export async function onRequestGet({request,env}) {
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=300'};
  if (!env.WU_API_KEY) return new Response(JSON.stringify({error:'WU_API_KEY is not configured yet'}),{status:503,headers});
  const params=new URL(request.url).searchParams;
  const date=params.get('date');
  const scope=params.get('scope')==='week'?'week':'day';
  if(!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date+'T00:00:00Z'))) return new Response(JSON.stringify({error:'Invalid date'}),{status:400,headers});
  const yyyyMMdd=date.replaceAll('-','');
  const endpoint=scope==='week'?'https://api.weather.com/v2/pws/observations/hourly/7day':'https://api.weather.com/v2/pws/history/all';
  const url=new URL(endpoint);
  url.searchParams.set('stationId','IJUBBE7');url.searchParams.set('format','json');url.searchParams.set('units','m');url.searchParams.set('numericPrecision','decimal');
  if(scope==='day')url.searchParams.set('date',yyyyMMdd);
  url.searchParams.set('apiKey',env.WU_API_KEY);
  try{
    const response=await fetch(url.toString(),{headers:{'Accept':'application/json'}});
    if(!response.ok) return new Response(JSON.stringify({error:'Weather Underground returned '+response.status}),{status:502,headers:{...headers,'Cache-Control':'no-store'}});
    const data=await response.json();
    let observations=Array.isArray(data.observations)?data.observations:[];
    if(scope==='week'){
      // Limit recent history to selected end-date, if needed.
      const end=date+'T23:59:59';
      observations=observations.filter(o=>String(o.obsTimeLocal||'').replace(' ','T')<=end);
    }
    return new Response(JSON.stringify({station:'IJUBBE7',observations}),{headers});
  }catch(e){return new Response(JSON.stringify({error:'Weather provider currently unavailable'}),{status:502,headers:{...headers,'Cache-Control':'no-store'}})}
}
