/* Weerstation Jubbega v15 — ECMWF/GFS 14 days, min/max + seasonal signals.
 * Fetches normalized public data from /api/forecast; never uses the secret PWS key.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  if (!$('forecastCards')) return;
  const COLORS = {ecmwf:'#69c7ff',gfs:'#ffcb84'};
  const LABELS = {ecmwf:'ECMWF',gfs:'GFS'};
  const DAYS = 14;
  const CHOICE_KEY = 'weerstation-forecast-model';
  let payload = null;
  let selected = sessionStorage.getItem(CHOICE_KEY) || 'both';
  let metric = 'temp';

  const format = (v, d=0) => Number.isFinite(v)
    ? v.toLocaleString('nl-NL',{minimumFractionDigits:d,maximumFractionDigits:d}) : '—';
  const toDay = date => new Intl.DateTimeFormat('nl-NL', {weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`));
  const maxOf = values => values.length ? Math.max(...values) : null;
  const finite = list => list.filter(Number.isFinite);
  const sum = list => {
    const valid = finite(list);
    return valid.length ? valid.reduce((a,b) => a + b,0) : null;
  };
  const isAvailable = key => !!payload?.models?.[key]?.days?.length;
  const visibleKeys = () => selected === 'both' ? ['ecmwf','gfs'].filter(isAvailable) : [selected].filter(isAvailable);

  function description(code) {
    if (code === 0) return {icon:'☀️',name:'Helder'};
    if (code === 1) return {icon:'🌤️',name:'Vrijwel helder'};
    if (code === 2) return {icon:'⛅',name:'Half bewolkt'};
    if (code === 3) return {icon:'☁️',name:'Bewolkt'};
    if ([45,48].includes(code)) return {icon:'🌫️',name:'Mist'};
    if ([51,53,55,56,57].includes(code)) return {icon:'🌦️',name:'Motregen'};
    if ([61,63,65,66,67].includes(code)) return {icon:'🌧️',name:'Regen'};
    if ([71,73,75,77,85,86].includes(code)) return {icon:'🌨️',name:'Sneeuw'};
    if ([80,81,82].includes(code)) return {icon:'🌦️',name:'Buien'};
    if ([95,96,99].includes(code)) return {icon:'⛈️',name:'Onweer'};
    return {icon:'🌥️',name:'Wisselend weer'};
  }

  function summaryValue(v, unit) {
    return Number.isFinite(v) ? `${format(v,1)} ${unit}` : '—';
  }

  // Follow the active *display theme* for the entire 14-day forecast.
  // In November an autumn display should not switch its last days to a
  // snow signal just because the forecast crosses into December.
  function winterView(){
    return document.documentElement.getAttribute('data-theme') === 'winter';
  }
  function snowStatusHtml(day) {
    const signal=String(day.snowSignal || '').trim();
    const modelSnow=Number.isFinite(day.snowfall) && day.snowfall>0.05;
    const snowCode=[71,73,75,77,85,86].includes(day.weatherCode);
    const alert=modelSnow || snowCode || /sneeuw mogelijk|sneeuw voorspeld/i.test(signal);
    const unknown=!alert && (!signal || /niet beschikbaar/i.test(signal));
    const state=alert?'snowAlert':unknown?'snowUnknown':'snowClear';
    const label=alert?'Sneeuwsignaal: ja':unknown?'Sneeuwsignaal: onbekend':'Sneeuwsignaal: nee';
    const icon=alert?'❄️':unknown?'○':'✅';
    const amount=Number.isFinite(day.snowfall)?` · ${format(day.snowfall,1)} cm voorspeld`:'';
    return `<div class="forecastSnow ${state}">${icon} <strong>${label}</strong>${amount}</div>`;
  }
  function thunderStatusHtml(key,day) {
    if(key==='ecmwf') return '<div class="forecastSnow snowUnknown">○ <strong>Onweer niet te beoordelen</strong><small>ECMWF biedt hier geen betrouwbare onweersindicatie.</small></div>';
    const code=day.weatherCode;
    if(!Number.isFinite(code)) return '<div class="forecastSnow snowUnknown">○ <strong>Onweergegevens ontbreken</strong></div>';
    if([95,96,99].includes(code)) return '<div class="forecastSnow snowAlert">⛈️ <strong>Onweersignaal</strong><small>GFS berekent onweersweer. Dit is geen kanspercentage.</small></div>';
    return '<div class="forecastSnow snowClear">✅ <strong>Geen onweersignaal in GFS</strong><small>Dit sluit lokale onweersbuien niet uit.</small></div>';
  }
  function seasonSignalHtml(key,day) {
    return winterView() ? snowStatusHtml(day) : thunderStatusHtml(key,day);
  }

  function createModelBlock(key, day) {
    return `<div class="forecastModel">
      <div class="forecastModelHead"><span class="forecastModelTag ${key}">● ${LABELS[key]}</span><span>max / min</span></div>
      <div class="forecastModelTemp">${format(day.high)}° <small>/ ${format(day.low)}°C</small></div>
      <div class="forecastMeta">💧 Regen/neerslag: ${summaryValue(day.precipitation,'mm')}</div>
      <div class="forecastMeta">💨 Wind: ${summaryValue(day.wind,'km/u')} · stoten ${summaryValue(day.gust,'km/u')}</div>
      <div class="forecastMeta">🌫️ Gem. dauwpunt: ${summaryValue(day.dewPoint,'°C')}</div>
      ${seasonSignalHtml(key,day)}
    </div>`;
  }

  function renderCards() {
    if (!payload) return;
    const keys = visibleKeys();
    if (!keys.length) return;
    const days = payload.models[keys[0]]?.days.slice(0, DAYS) || [];
    function makeCard(one, i) {
      const first = payload.models.ecmwf?.days?.[i];
      const second = payload.models.gfs?.days?.[i];
      const ref = selected === 'gfs' ? (second || first) : (first || second);
      const w = description(ref?.weatherCode);
      let diff = '';
      if (selected === 'both' && first && second) {
        const tempDiff = Number.isFinite(first.high) && Number.isFinite(second.high) ? Math.abs(first.high-second.high) : null;
        const rainDiff = Number.isFinite(first.precipitation) && Number.isFinite(second.precipitation) ? Math.abs(first.precipitation-second.precipitation) : null;
        if (Number.isFinite(tempDiff) || Number.isFinite(rainDiff)) diff = `<div class="forecastDifference">Modelverschil: ${Number.isFinite(tempDiff)?format(tempDiff,1)+'°C':'—'} max · ${Number.isFinite(rainDiff)?format(rainDiff,1)+' mm':'—'} regen</div>`;
      }
      return `<article class="forecastDay">
        <div class="forecastDayHeader"><div><div class="forecastDayTitle">${i===0?'Vandaag':toDay(one.date)}</div><div class="forecastDate">${one.date.split('-').reverse().join('-')}</div></div><div class="forecastIcon" aria-hidden="true">${w.icon}</div></div>
        <div class="forecastCondition">${w.name}${selected === 'both' ? ' · ECMWF-indicatie' : ''}</div>
        ${keys.map(k=>createModelBlock(k,payload.models[k].days[i] || {})).join('')}
        ${diff}
      </article>`;
    }
    $('forecastCards').innerHTML = days.slice(0,7).map((day,i)=>makeCard(day,i)).join('');
    $('forecastCardsNext').innerHTML = days.slice(7,14).map((day,i)=>makeCard(day,i+7)).join('');
  }

  // The temperature graph deliberately shows two curves per model:
  // solid = daily maximum and dashed = daily minimum.
  // Snowfall (centimetres) is offered as a separate graph only in winter view.
  function drawChart() {
    if (!payload) return;
    const svg = $('forecastChart');
    const ns='http://www.w3.org/2000/svg';
    svg.replaceChildren();
    const keys = visibleKeys();
    if (!keys.length) return;
    const daily = payload.models[keys[0]].days.slice(0, DAYS);
    const fields = metric==='temp' ? ['high','low'] : [({rain:'precipitation',wind:'wind',dew:'dewPoint',snow:'snowfall'})[metric]||'high'];
    const units = metric==='rain'?'mm':metric==='wind'?'km/u':metric==='snow'?'cm':'°C';
    const metricTitles = {rain:'Neerslag per model',wind:'Maximale windsnelheid per model',dew:'Gemiddeld dauwpunt per model',temp:'Maximum- en minimumtemperatuur per model',snow:'Voorspelde sneeuwval per model'};
    const allValues = finite(keys.flatMap(key => payload.models[key].days.flatMap(d=>fields.map(field=>d[field]))));
    $('forecastChartTitle').textContent=metricTitles[metric]||metricTitles.temp;
    if (!allValues.length) {
      const msg=document.createElementNS(ns,'text');
      msg.setAttribute('x','20');msg.setAttribute('y','110');
      msg.setAttribute('fill','currentColor');
      msg.textContent='Geen voorspelde waarden beschikbaar voor deze grafiek.';
      svg.appendChild(msg);
      $('forecastLegend').innerHTML='';
      return;
    }
    const startZero = ['rain','wind','snow'].includes(metric);
    const lo = startZero ? 0 : Math.floor((Math.min(...allValues)-2)/2)*2;
    const hi = startZero ? Math.max(metric==='snow'?0.5:2,Math.ceil((Math.max(...allValues)+.4)*2)/2) : Math.ceil((Math.max(...allValues)+2)/2)*2;
    const [left,right,top,bottom]=[54,20,22,43];
    const width=1040,height=250,plotW=width-left-right,plotH=height-top-bottom;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const xp = i=>left+i*plotW/Math.max(daily.length-1,1);
    const yp = v=> top+(hi-v)/(hi-lo)*plotH;
    const make=(name,attrs={},txt)=>{
      const el=document.createElementNS(ns,name);
      for(const [key,value] of Object.entries(attrs))el.setAttribute(key,String(value));
      if(txt!==undefined)el.textContent=txt;
      svg.appendChild(el);
      return el;
    };
    for(let i=0;i<=4;i++){
      const value=hi-(hi-lo)*i/4;
      const y=top+i*plotH/4;
      make('line',{x1:left,y1:y,x2:width-right,y2:y,stroke:'currentColor','stroke-opacity':.12,'stroke-dasharray':'3 5'});
      make('text',{x:left-9,y:y+4,'text-anchor':'end',fill:'currentColor','fill-opacity':.64,'font-size':12},format(value,['rain','snow'].includes(metric)?1:0));
    }
    daily.forEach((day,i)=>make('text',{x:xp(i),y:height-15,'text-anchor':'middle',fill:'currentColor','fill-opacity':.7,'font-size':12},toDay(day.date).split(' ').slice(0,2).join(' ')));
    keys.forEach(key=>{
      fields.forEach(field=>{
        const isMinimum=field==='low';
        const valid=payload.models[key].days.slice(0,DAYS).map((day,i)=>({i,v:day[field]})).filter(d=>Number.isFinite(d.v));
        if(!valid.length)return;
        const points=valid.map(d=>`${xp(d.i)},${yp(d.v)}`).join(' ');
        if(valid.length>1)make('polyline',{points,fill:'none',stroke:COLORS[key],
          'stroke-width':isMinimum?2.3:3,'stroke-dasharray':isMinimum?'7 5':'none','stroke-linecap':'round','stroke-linejoin':'round'});
        valid.forEach(d=>{
          const circle=make('circle',{cx:xp(d.i),cy:yp(d.v),r:isMinimum?3.5:4.5,fill:isMinimum?'var(--panel)':COLORS[key],stroke:COLORS[key],'stroke-width':2});
          const tip=document.createElementNS(ns,'title');
          tip.textContent=`${LABELS[key]} ${daily[d.i].date} ${isMinimum?'min.':field==='high'?'max.':''}: ${format(d.v,1)} ${units}`;
          circle.appendChild(tip);
          // Temperature graphs already have 4 curves: avoid 56 overlapping labels.
          // Snow graphs show small amounts precisely via labels and hover titles.
          if(metric==='temp')return;
          const label=make('text',{x:xp(d.i),y:yp(d.v)-12,'text-anchor':'middle',fill:COLORS[key],'font-size':12,'font-weight':700},`${format(d.v,['rain','snow'].includes(metric)?1:0)}${metric==='rain'||metric==='snow'||metric==='wind'?'':'°'}`);
          const labelTip=document.createElementNS(ns,'title');labelTip.textContent=tip.textContent;label.appendChild(labelTip);
        });
      });
    });
    $('forecastLegend').innerHTML = keys.flatMap(key => metric==='temp' ? [
      `<span><b style="background:${COLORS[key]}"></b>${LABELS[key]} maximum (doorgetrokken)</span>`,
      `<span><b style="background:transparent;border-top:2px dashed ${COLORS[key]};height:0"></b>${LABELS[key]} minimum (streepjes)</span>`
    ] : [`<span><b style="background:${COLORS[key]}"></b>${LABELS[key]}</span>`]).join('');
  }

  function renderSummary(){
    const keys=visibleKeys();
    $('forecastSummary').innerHTML=keys.map(key=>{
      const days=payload.models[key].days.slice(0,DAYS);
      const sumRain=sum(days.map(d=>d.precipitation));
      const peakWind=maxOf(finite(days.map(d=>d.gust)));
      const minima=finite(days.map(d=>d.low));
      const minTemp=minima.length?Math.min(...minima):null;
      const snow= sum(days.map(d=>d.snowfall));
      const snowText=winterView()?`<div class="forecastSummaryLabel">❄️ Voorspelde sneeuw: ${summaryValue(snow,'cm')}</div>`:'';
      return `<div class="forecastSummaryUnit"><div class="forecastSummaryLabel">${LABELS[key]} · komende ${DAYS} dagen</div><div class="forecastSummaryValue">${summaryValue(sumRain,'mm')} neerslag</div><div class="forecastSummaryLabel">Laagste minimum: ${summaryValue(minTemp,'°C')}</div>${snowText}<div class="forecastSummaryLabel">Max. windstoot: ${summaryValue(peakWind,'km/u')}</div></div>`;
    }).join('');
  }

  function render(){
    if(!payload) return;
    const available = ['ecmwf','gfs'].filter(isAvailable);
    if (selected!=='both' && !isAvailable(selected)) selected = available[0];
    $('forecastBoth').setAttribute('aria-pressed',String(selected==='both'));
    $('forecastECMWF').setAttribute('aria-pressed',String(selected==='ecmwf'));
    $('forecastGFS').setAttribute('aria-pressed',String(selected==='gfs'));
    $('forecastECMWF').disabled=!isAvailable('ecmwf');
    $('forecastGFS').disabled=!isAvailable('gfs');
    $('forecastBoth').disabled=available.length<2;
    // Only show snow forecasts and the snowfall graph in the winter theme.
    // Other themes show thunderstorms as requested by the site owner.
    const snowOption=$('snowMetricOption');
    if(snowOption)snowOption.hidden=!winterView();
    if(!winterView() && metric==='snow')metric='temp';
    $('forecastMetric').value=metric;
    renderCards();drawChart();renderSummary();
    $('forecastDetails').hidden=false;
    const last=new Date(payload.updatedAt);
    const stamp=Number.isNaN(last.getTime())?'':new Intl.DateTimeFormat('nl-NL',{hour:'2-digit',minute:'2-digit',day:'numeric',month:'short',timeZone:'Europe/Amsterdam'}).format(last);
    const message=payload.warnings?.length?` · ${payload.warnings.join(', ')}`:'';
    $('forecastStatus').textContent=`Modelverwachting voor Jubbega · ${available.map(k=>LABELS[k]).join(' + ')}${message}`;
    const fetchInfo=$('forecastModelTimes');
    if(fetchInfo){
      const dutch=iso=>{
        if(!iso)return null;
        const date=new Date(iso);
        return Number.isNaN(date.getTime())?null:new Intl.DateTimeFormat('nl-NL',{
          timeZone:'Europe/Amsterdam',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'
        }).format(date);
      };
      const utcRun=iso=>{
        if(!iso)return null;
        const date=new Date(iso);
        if(Number.isNaN(date.getTime()))return null;
        return new Intl.DateTimeFormat('nl-NL',{
          timeZone:'UTC',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
        }).format(date)+' UTC';
      };
      fetchInfo.innerHTML=available.map(k=>{
        const run=payload.models[k].run;
        const init=utcRun(run?.initialisedAt);
        const processing=dutch(run?.processedAt);
        const availability=dutch(run?.availableAt);
        if(!init)return `<span class="modelFetchTag"><strong>${LABELS[k]}</strong> · rungegevens tijdelijk niet beschikbaar</span>`;
        return `<span class="modelFetchTag"><strong>${LABELS[k]}</strong> · run ${init}${processing?' · verwerking klaar '+processing:''}${availability?' · beschikbaar '+availability:''}</span>`;
      }).join('')+'<span class="modelFetchNote">Run = referentietijd (UTC); verwerking klaar = Open-Meteo klaar met downloaden/verwerken; beschikbaar = gegevens gepubliceerd. Geen van deze tijden is het ophaalmoment van deze website.</span>';
    }

    $('forecastError').hidden=true;
  }

  async function loadForecast(){
    $('forecastRefresh').disabled=true;
    $('forecastStatus').textContent='De ECMWF- en GFS-verwachting wordt opgehaald…';
    if($('forecastModelTimes'))$('forecastModelTimes').textContent='Laatste ECMWF- en GFS-modelruns controleren…';
    try {
      const r=await fetch('/api/forecast',{cache:'no-store'});
      const data=await r.json();
      if(!r.ok)throw new Error(data.error||'Voorspelling tijdelijk niet beschikbaar');
      if(!data.models || !Object.keys(data.models).length)throw new Error('Geen weermodelgegevens ontvangen');
      payload=data;
      window.weerstationForecast=data;
      document.dispatchEvent(new CustomEvent('weerstation-forecast',{detail:data}));
      render();
    }catch(e){
      $('forecastStatus').textContent='Voorspelling niet beschikbaar';
      $('forecastError').hidden=false;
      $('forecastError').textContent=`De 14-daagse verwachting kon niet worden geladen: ${e.message}. Je actuele PWS-metingen en historie blijven wel werken.`;
    }finally { $('forecastRefresh').disabled=false; }
  }

  for(const [id,value] of [['forecastBoth','both'],['forecastECMWF','ecmwf'],['forecastGFS','gfs']]){
    $(id).addEventListener('click',()=>{selected=value;sessionStorage.setItem(CHOICE_KEY,value);render();});
  }
  // Both weeks are visible on the page, one below the other.
  for (const [buttonId, sectionId] of [['forecastFirstWeek','forecastWeekOne'],['forecastSecondWeek','forecastWeekTwo']]) {
    $(buttonId)?.addEventListener('click',()=>{
      $(sectionId)?.scrollIntoView({behavior:'smooth',block:'start'});
    });
  }
  $('forecastMetric').addEventListener('change',e=>{metric=e.target.value;drawChart()});
  $('forecastRefresh').addEventListener('click',loadForecast);
  document.addEventListener('weerstation-theme',()=>{if(payload)render()});
  loadForecast();
  // Updates on page revisit as model runs become available; server caches for 30 min.
  window.setInterval(()=>{if(!document.hidden)loadForecast()},60*60*1000);
})();
