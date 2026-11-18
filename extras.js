/* Weerstation Jubbega v6
 * Extra presentatie: regionale conditie, zon, maan, dag/nacht, seizoenseffecten.
 * De Weather Underground API-sleutel wordt niet gebruikt in deze clientcode.
 */
(() => {
  'use strict';

  const LAT = 53.005;
  const LON = 6.130;
  const ZONE = 'Europe/Amsterdam';
  const $ = id => document.getElementById(id);
  const MODE_KEY = 'weerstation-day-night';
  const oneDayMs = 86400000;
  let stationObservation = window.pwsCurrentObservation || null;
  let lastLocalDate = '';
  let lastSeason = '';
  let cachedMoonDate = '';
  let cachedMoonTimes = null;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  });

  function todayNL() {
    const parts = formatter.formatToParts(new Date());
    const v = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return `${v.year}-${v.month}-${v.day}`;
  }

  function sunriseUtc(iso, isSunrise) {
    // NOAA simplified astronomical sunrise/sunset, intended as a fallback.
    const [year, month, day] = iso.split('-').map(Number);
    const base = Date.UTC(year, month - 1, day);
    const N = Math.floor((base - Date.UTC(year, 0, 0)) / oneDayMs);
    const lngHour = LON / 15;
    const t = N + ((isSunrise ? 6 : 18) - lngHour) / 24;
    const M = 0.9856 * t - 3.289;
    const rad = Math.PI / 180;
    const norm = degrees => ((degrees % 360) + 360) % 360;
    const L = norm(M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634);
    let RA = norm(Math.atan(0.91764 * Math.tan(L * rad)) / rad);
    RA = RA + (Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90);
    RA /= 15;
    const sinDec = 0.39782 * Math.sin(L * rad);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(LAT * rad)) / (cosDec * Math.cos(LAT * rad));
    if (cosH < -1 || cosH > 1) return null;
    const H = (isSunrise ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad) / 15;
    const T = H + RA - (0.06571 * t) - 6.622;
    const UT = ((T - lngHour) % 24 + 24) % 24;
    return new Date(base + UT * 3600000);
  }

  function fmtTime(date) {
    return date ? new Intl.DateTimeFormat('nl-NL', {
      timeZone: ZONE, hour: '2-digit', minute: '2-digit', hour12: false
    }).format(date) : '—';
  }

  function fmtLength(minutes) {
    if (!Number.isFinite(minutes) || minutes < 0) return 'Daglengte niet beschikbaar';
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `Daglicht: ${hours} uur en ${String(mins).padStart(2, '0')} minuten`;
  }

  function moonData(now) {
    // Known new moon close to 2000-01-06 18:14 UTC; approximate synodic month.
    const origin = Date.parse('2000-01-06T18:14:00Z');
    const synodicDays = 29.530588853;
    const days = (now.getTime() - origin) / oneDayMs;
    const fraction = ((days / synodicDays) % 1 + 1) % 1;
    const index = Math.round(fraction * 8) % 8;
    const symbols = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
    const names = ['Nieuwe maan', 'Wassende maansikkel', 'Eerste kwartier', 'Wassende maan',
      'Volle maan', 'Afnemende maan', 'Laatste kwartier', 'Afnemende maansikkel'];
    const illuminated = Math.round(50 * (1 - Math.cos(fraction * 2 * Math.PI)));
    return { symbol: symbols[index], name: names[index], illuminated };
  }


  // Moon ephemerides and horizon-crossing approximation using the SunCalc approach
  // (astronomical formulae; no external service or API key required).
  const RAD = Math.PI / 180;
  const ECLIPTIC = RAD * 23.4397;
  const moonDays = date => (date.getTime() - Date.UTC(2000,0,1,12)) / oneDayMs;
  const moonRightAscension = (l,b) => Math.atan2(Math.sin(l)*Math.cos(ECLIPTIC)-Math.tan(b)*Math.sin(ECLIPTIC),Math.cos(l));
  const moonDeclination = (l,b) => Math.asin(Math.sin(b)*Math.cos(ECLIPTIC)+Math.cos(b)*Math.sin(ECLIPTIC)*Math.sin(l));
  function moonAltitude(date) {
    const d = moonDays(date);
    const L = RAD * (218.316 + 13.176396*d);
    const M = RAD * (134.963 + 13.064993*d);
    const F = RAD * (93.272 + 13.229350*d);
    const longitude = L + RAD * 6.289 * Math.sin(M);
    const latitude = RAD * 5.128 * Math.sin(F);
    const ra = moonRightAscension(longitude, latitude);
    const dec = moonDeclination(longitude, latitude);
    const phi = LAT*RAD;
    const sidereal = RAD*(280.16 + 360.9856235*d) + LON*RAD;
    const h = Math.asin(Math.sin(phi)*Math.sin(dec)+Math.cos(phi)*Math.cos(dec)*Math.cos(sidereal-ra));
    const refraction = 0.0002967 / Math.tan(Math.max(h,0) + 0.00312536/(Math.max(h,0) + 0.08901179));
    // Lunar apparent altitude, includes approximate atmospheric refraction.
    return h + refraction;
  }
  const localDate = date => {
    const p = formatter.formatToParts(date).reduce((a,x)=>(a[x.type]=x.value,a),{});
    return `${p.year}-${p.month}-${p.day}`;
  };
  function moonHorizonTimes(dateISO) {
    // Scan the surrounding two UTC days. Retain only rise/set events falling
    // on the requested Europe/Amsterdam calendar date (including DST).
    const baseline = Date.parse(`${dateISO}T00:00:00Z`) - 5*3600000;
    const step = 15*60000;
    let rise = null, set = null;
    let t0 = baseline, a0 = moonAltitude(new Date(t0));
    for(let i=1;i<=140;i++) {
      const t1=baseline+i*step, a1=moonAltitude(new Date(t1));
      if ((a0<=0&&a1>0)||(a0>=0&&a1<0)) {
        const interpolated=t0+(t1-t0)*Math.abs(a0)/(Math.abs(a0)+Math.abs(a1));
        const event=new Date(interpolated);
        if (localDate(event)===dateISO) {
          if(a0<=0&&a1>0&&!rise)rise=event;
          if(a0>=0&&a1<0&&!set)set=event;
        }
      }
      t0=t1;a0=a1;
    }
    return {rise,set};
  }

  function timeTheme() {
    const chosen = localStorage.getItem(MODE_KEY) || 'auto';
    const date = todayNL();
    const rise = sunriseUtc(date, true);
    const set = sunriseUtc(date, false);
    const isDay = rise && set ? Date.now() >= rise.getTime() && Date.now() < set.getTime() : true;
    document.documentElement.dataset.time = chosen === 'auto' ? (isDay ? 'day' : 'night') : chosen;
    $('dayNightSelect').value = chosen;
    $('dayNightTag').textContent = isDay ? '☀️ Daglicht' : '🌙 Nacht';
    $('sunrise').textContent = fmtTime(rise);
    $('sunset').textContent = fmtTime(set);
    $('dayLength').textContent = rise && set ? fmtLength((set - rise) / 60000) : 'Daglengte niet beschikbaar';
    const moon = moonData(new Date());
    $('moonGlyph').textContent = moon.symbol;
    $('moonName').textContent = moon.name;
    $('moonIllumination').textContent = `Ongeveer ${moon.illuminated}% verlicht`;
    $('sunVisible').textContent = isDay ? '☀️ Zon staat boven de horizon' : '🌙 Zon staat onder de horizon';
    // These values are computed locally every new calendar date. No network request is needed.
    try {
      if (cachedMoonDate !== date || !cachedMoonTimes) {
        cachedMoonTimes = moonHorizonTimes(date);
        cachedMoonDate = date;
      }
      $('moonrise').textContent = cachedMoonTimes.rise ? fmtTime(cachedMoonTimes.rise) : 'Geen maanopkomst vandaag';
      $('moonset').textContent = cachedMoonTimes.set ? fmtTime(cachedMoonTimes.set) : 'Geen maanondergang vandaag';
      $('moonVisible').textContent = moonAltitude(new Date()) > 0 ?
        '🌙 Maan staat boven de horizon' : '🌘 Maan staat onder de horizon';
    } catch (error) {
      $('moonrise').textContent = 'Niet beschikbaar';
      $('moonset').textContent = 'Niet beschikbaar';
      $('moonVisible').textContent = 'Maanpositie tijdelijk niet beschikbaar';
    }

    if (chosen === 'day') $('metaThemeColor').setAttribute('content', '#eaf2f8');
    if (chosen === 'auto' && isDay) $('metaThemeColor').setAttribute('content', '#eaf2f8');
    if (chosen === 'night' || (chosen === 'auto' && !isDay)) {
      const dark = { winter: '#081320', spring: '#13271f', summer: '#0d2340', autumn: '#261710' };
      $('metaThemeColor').setAttribute('content', dark[document.documentElement.dataset.theme] || '#081320');
    }
    // Existing chart canvas follows the change from light to dark.
    window.dispatchEvent(new Event('resize'));
  }

  function particles() {
    const season = document.documentElement.dataset.theme || 'winter';
    if (season === lastSeason) return;
    lastSeason = season;
    const seasonal = {
      winter: ['❄', '❅', '✧'],
      spring: ['🌸', '✿', '❀'],
      summer: ['✦', '☀', '✧'],
      autumn: ['🍂', '🍁', '🍃']
    };
    const symbols = seasonal[season] || seasonal.winter;
    const count = 16;
    const wrap = $('seasonParticles');
    wrap.replaceChildren();
    for (let i = 0; i < count; i++) {
      const p = document.createElement('span');
      p.className = 'particle';
      p.textContent = symbols[i % symbols.length];
      p.style.setProperty('--left', `${4 + ((i * 37) % 93)}%`);
      p.style.setProperty('--size', `${11 + (i * 7) % 13}px`);
      p.style.setProperty('--opacity', String(.12 + (i % 4) * .08));
      p.style.setProperty('--duration', `${10 + (i * 3) % 13}s`);
      p.style.setProperty('--delay', `${-i * 1.35}s`);
      p.style.setProperty('--drift', `${(i % 2 ? -1 : 1) * (13 + (i * 11) % 35)}px`);
      wrap.appendChild(p);
    }
  }

  function regionalCondition(code, isDay) {
    const night = !isDay;
    if (code === 0) return { icon: night ? '🌙' : '☀️', label: night ? 'Heldere nacht' : 'Zonnig' };
    if (code === 1) return { icon: night ? '🌙' : '🌤️', label: 'Vrijwel helder' };
    if (code === 2) return { icon: night ? '☁️' : '⛅', label: 'Half bewolkt' };
    if (code === 3) return { icon: '☁️', label: 'Bewolkt' };
    if ([45,48].includes(code)) return { icon: '🌫️', label: 'Mist' };
    if ([51,53,55,56,57].includes(code)) return { icon: '🌦️', label: 'Motregen' };
    if ([61,63,65,66,67].includes(code)) return { icon: '🌧️', label: 'Regen' };
    if ([71,73,75,77,85,86].includes(code)) return { icon: '🌨️', label: 'Sneeuw' };
    if ([80,81,82].includes(code)) return { icon: '🌦️', label: 'Regenbuien' };
    if ([95,96,99].includes(code)) return { icon: '⛈️', label: 'Onweer' };
    return { icon: '🌤️', label: 'Wisselend weer' };
  }

  // Derive our own short forecast. No news-site text or third-party weather prose.
  // Daily fields are forecast model values; current observed values come only from IJUBBE7.
  let forecastData = window.weerstationForecast || null;
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const fmt = (x, digits = 0) => finite(x) ? x.toLocaleString('nl-NL', {
    maximumFractionDigits:digits, minimumFractionDigits:digits
  }) : '—';
  function rangeLabel(values, digits = 0, unit = '') {
    const numbers = values.filter(finite);
    if (!numbers.length) return '—';
    const low = Math.min(...numbers), high = Math.max(...numbers);
    return `${fmt(low,digits)}${Math.abs(high-low) > (digits ? .1 : .8) ? `–${fmt(high,digits)}` : ''}${unit}`;
  }
  function availableDays(index) {
    if (!forecastData?.models) return [];
    return ['ecmwf','gfs'].map(key=>forecastData.models[key]?.days?.[index]).filter(Boolean);
  }
  function conditionLabel(codes) {
    const c = codes.filter(finite);
    if (!c.length) return {icon:'🌦️',label:'Eigen weerbeeld'};
    const chosen = c.some(code => [95,96,99].includes(code)) ? 95 :
      c.some(code => [71,73,75,77,85,86].includes(code)) ? 71 :
      c.some(code => [61,63,65,66,67,80,81,82].includes(code)) ? 61 :
      c.some(code => [51,53,55,56,57].includes(code)) ? 51 :
      c.some(code => [45,48].includes(code)) ? 45 :
      c.some(code => code===3) ? 3 : c.some(code => code===2) ? 2 :
      c.some(code => code===1) ? 1 : 0;
    const variant = regionalCondition(chosen,document.documentElement.dataset.time!=='night');
    if (new Set(c).size > 1) {
      return {icon:variant.icon,label:variant.label==='Zonnig'?'Wisselend zonnig':variant.label};
    }
    return variant;
  }
  function renderOutlook() {
    const metric = stationObservation?.metric || {};
    const nowTemp = finite(metric.temp) ? metric.temp : null;
    const observedWind = Number.isFinite(metric.windSpeed) ? metric.windSpeed :
      Number.isFinite(metric.windspeed) ? metric.windspeed : null;
    const rainRate = finite(metric.precipRate) ? metric.precipRate : null;
    const today = availableDays(0);
    const tomorrow = availableDays(1);
    const condition = conditionLabel(today.map(d=>d.weatherCode));
    $('weatherGlyph').textContent = today.length ? condition.icon : (rainRate>0?'🌧️':'🌤️');
    $('conditionName').textContent = today.length ? condition.label : (rainRate>0?'Neerslag in Jubbega':'Actuele weersituatie');
    $('conditionDetail').textContent = today.length ?
      `Eigen verwachting op basis van ${today.length===2?'ECMWF en GFS':'het beschikbare weermodel'}` :
      'Lokale metingen IJUBBE7';
    $('outlookNow').textContent = finite(nowTemp) ? `${fmt(nowTemp,1)} °C` : '—';
    $('outlookMax').textContent = rangeLabel(today.map(d=>d.high),0,' °C');
    $('outlookRain').textContent = rangeLabel(today.map(d=>d.precipitation),1,' mm');
    $('outlookTomorrow').textContent = rangeLabel(tomorrow.map(d=>d.high),0,' °C');

    let lines = [];
    if (finite(nowTemp)) {
      let station = `IJUBBE7 meet momenteel ${fmt(nowTemp,1)} °C`;
      if (finite(observedWind)) station += ` en ${fmt(observedWind,0)} km/u wind`;
      if (finite(rainRate) && rainRate > 0.05) station += `, met ${fmt(rainRate,1)} mm/u neerslag`;
      lines.push(station + '.');
    }
    if (today.length) {
      const rain = today.map(x=>x.precipitation);
      const highs = today.map(x=>x.high);
      const winds = today.map(x=>x.wind);
      let line = `De modellen verwachten vandaag ${condition.label.toLowerCase()}`;
      if (highs.some(finite)) line += ` met een maximum van ${rangeLabel(highs,0,' °C')}`;
      if (rain.some(finite)) line += ` en ${rangeLabel(rain,1,' mm')} neerslag`;
      if (winds.some(finite)) line += `. De maximale wind ligt rond ${rangeLabel(winds,0,' km/u')}`;
      lines.push(line + '.');
      if (tomorrow.length) {
        const max = tomorrow.map(d=>d.high);
        const rainTomorrow = tomorrow.map(d=>d.precipitation);
        let t = 'Morgen';
        if (max.some(finite)) t += ` wordt het maximaal ${rangeLabel(max,0,' °C')}`;
        if (rainTomorrow.some(finite)) t += `, met ${rangeLabel(rainTomorrow,1,' mm')} neerslag volgens de modellen`;
        lines.push(t + '.');
      }
      const high = highs.filter(finite), rainAvailable=rain.filter(finite);
      if (today.length===2 && ((high.length===2 && Math.abs(high[0]-high[1])>=3) ||
          (rainAvailable.length===2 && Math.abs(rainAvailable[0]-rainAvailable[1])>=4))) {
        lines.push('ECMWF en GFS lopen uiteen; houd rekening met extra onzekerheid.');
      }
    } else {
      lines.push('De regionale modelverwachting is tijdelijk niet beschikbaar. De actuele metingen blijven zichtbaar.');
    }
    $('outlookNarrative').textContent = lines.join(' ');
  }
  function onCurrent(event) {
    stationObservation = event.detail;
    renderOutlook();
  }
  function onForecast(event) {
    forecastData = event.detail;
    renderOutlook();
  }

  function tick() {
    const today = todayNL();
    if (lastLocalDate !== today) {
      if (lastLocalDate) {
        // Recompute the automatically selected season when a month changes.
        if ($('themeSelect')?.value === 'auto') $('themeSelect').dispatchEvent(new Event('change'));
      }
      lastLocalDate = today;
    }
    timeTheme();
    particles();
  }

  document.addEventListener('weerstation-current', onCurrent);
  document.addEventListener('weerstation-forecast', onForecast);
  document.addEventListener('weerstation-theme', () => {
    particles();
    timeTheme();
  });
  $('dayNightSelect').addEventListener('change', event => {
    localStorage.setItem(MODE_KEY, event.target.value);
    timeTheme();
  });
  renderOutlook();
  tick();
  setInterval(tick, 60000);
})();
