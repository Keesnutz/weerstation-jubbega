/** Publieke, veilige status van eigen weerarchief (zonder secrets). */
export async function onRequestGet({env}){
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
    'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'
  }});
  if(!env.WEATHER_DB)return reply({enabled:false,reason:'D1 is nog niet gekoppeld.'});
  try{
    const oldest=await env.WEATHER_DB.prepare(
      'SELECT local_date,observed_epoch FROM weather_observations WHERE station_id=? ORDER BY observed_epoch ASC LIMIT 1'
    ).bind('IJUBBE7').first();
    const newest=await env.WEATHER_DB.prepare(
      'SELECT local_date,observed_epoch FROM weather_observations WHERE station_id=? ORDER BY observed_epoch DESC LIMIT 1'
    ).bind('IJUBBE7').first();
    return reply({enabled:true,hasData:!!newest,oldest:oldest?.local_date||null,
      newest:newest?.local_date||null,lastObservationEpoch:newest?.observed_epoch||null});
  }catch{
    return reply({enabled:false,reason:'D1-tabel niet beschikbaar; voer schema.sql uit.'},503);
  }
}
