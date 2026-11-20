/** CSV export from Cloudflare D1 for a period of max 31 days. Public station data only. */
const STATION='IJUBBE7';
const DAY_MS=86400000;
function validDate(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return false;
  const d=new Date(date+'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10)===date;
}
function nlToday(){
  const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Amsterdam',day:'2-digit',month:'2-digit',year:'numeric'})
    .formatToParts(new Date()).reduce((a,v)=>(a[v.type]=v.value,a),{});
  return `${p.year}-${p.month}-${p.day}`;
}
function response(data,status){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}})}
function esc(value){const text=value===undefined||value===null?'':String(value);return `"${text.replaceAll('"','""')}"`}
export async function onRequestGet({request,env}){
  if(!env.WEATHER_DB)return response({error:'Eigen archief is nog niet gekoppeld.'},503);
  const input=new URL(request.url).searchParams;
  const end=input.get('to')||nlToday();
  const start=input.get('from')||new Date(Date.parse(end+'T00:00:00Z')-6*DAY_MS).toISOString().slice(0,10);
  if(!validDate(start)||!validDate(end)||start>end||
    (Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/DAY_MS>30){
    return response({error:'Gebruik from en to als YYYY-MM-DD; maximaal 31 dagen per export.'},400);
  }
  let rows;
  try{
    const query='SELECT observation_json,local_date FROM weather_observations WHERE station_id=? AND local_date>=? AND local_date<=? ORDER BY observed_epoch LIMIT 11000';
    rows=(await env.WEATHER_DB.prepare(query).bind(STATION,start,end).all()).results||[];
  }catch{return response({error:'Het eigen archief is tijdelijk niet bereikbaar.'},503)}
  const columns=['datum','lokale_tijd','tijd_utc','temperatuur_C','gevoels_C','dauwpunt_C','luchtvochtigheid_pct','wind_km_u','windstoot_km_u','windrichting_graden','luchtdruk_hPa','regenintensiteit_mm_u','regentotaal_mm'];
  const lines=[columns.map(esc).join(';')];
  for(const row of rows){
    let obs;
    try{obs=JSON.parse(row.observation_json)}catch{continue}
    const m=obs.metric||{};
    const values=[row.local_date,obs.obsTimeLocal,obs.obsTimeUtc,m.temp??m.tempAvg,m.windchill??m.windchillAvg??m.heatIndex,
      m.dewpt??m.dewptAvg,obs.humidity??obs.humidityAvg,m.windSpeed??m.windspeed??m.windspeedAvg,
      m.windGust??m.windgust??m.windgustHigh,obs.winddir??obs.winddirAvg,m.pressure??m.pressureMax,
      m.precipRate,m.precipTotal];
    lines.push(values.map(esc).join(';'));
  }
  return new Response('\uFEFF'+lines.join('\r\n')+'\r\n',{headers:{
    'Content-Type':'text/csv; charset=utf-8',
    'Content-Disposition':`attachment; filename="weerstation-jubbega-${start}-tot-${end}.csv"`,
    'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'
  }});
}
