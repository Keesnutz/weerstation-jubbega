# Weerstation Jubbega v7

Cloudflare Pages-website voor Weather Underground PWS-station `IJUBBE7`.

## Bestaande functies uit versie 6

- Seizoenthema's (winter dec-feb, lente mrt-jun, zomer jul-sep, herfst okt-nov) met zachte geanimeerde seizoenselementen en een handmatige keuze.
- Automatisch licht dagthema en donker nachtthema, op basis van lokale zonsopkomst en zonsondergang, inclusief handmatig kiezen van dag/nacht.
- Eigen vectorlogo (`logo.svg`), favicon per seizoen en app-icoon voor snelkoppelingen.
- Regionaal weerbeeld/weericoon via Open-Meteo (`weather_code`) — dit is een **modelindicatie** voor Jubbega, geen meting van IJUBBE7.
- Zonsopkomst/-ondergang voor Jubbega via Open-Meteo; ingebouwde astronomische fallback.
- Maanfase en geschatte verlichtingsgraad (astronomische benadering).
- Knoppen naar Buienradar en regionale regenradar.
- Windroos, regen vandaag, historische neerslag per dag of 7 dagen. De API levert dagelijkse cumulatieve neerslag; in het weekoverzicht worden de dagtotalen opgeteld.

## Nieuw in versie 7: 5-daagse weersverwachting ECMWF vs GFS

- Modelpunt Jubbega (53,005° N, 6,130° O), als indicatie voor Noordoost-Nederland.
- Twee expliciete modellen: ECMWF IFS 0,25° (`ecmwf_ifs025`) en NOAA GFS 0,25° (`gfs025`), geleverd via Open-Meteo.
- Verwachting voor 5 dagen, met maximum- en minimumtemperatuur, mm neerslag, windsnelheid, windstoten en weersymbolen.
- Schakel tussen beide modellen, ECMWF alleen en GFS alleen. Bekijk grafieken met temperatuur en neerslag en het verschil tussen de modellen.
- De serverfunctie `functions/api/forecast.js` haalt de voorspellingen op en cachet de gecombineerde gegevens 30 minuten, zonder een extra API-sleutel.
- PWS-metingen en historie blijven apart en onveranderd via `functions/api/weather.js`.
- Weermodel- en locatiegegevens zijn prognoses, geen exacte lokale meting. Toont een waarschuwing als een van de modellen uitvalt.
- Open-Meteo vereist bronvermelding en biedt gratis API-gebruik alleen voor **niet-commerciële toepassingen**; bij advertenties of commerciële exploitatie is een passend API-plan nodig (zie https://open-meteo.com/en/terms).

## Cloudflare Pages publiceren

De repository-root is de build-outputdirectory (`.`), build command leeg, framework `None`.
De functie `functions/api/weather.js` wordt door Cloudflare Pages als serverfunctie uitgerold.

Upload of wijzig deze bestanden op GitHub in de repository-root:

- `index.html`
- `forecast.js`
- `functions/api/forecast.js` (nieuw; deze kan bij uploads als nieuwe map/file worden toegevoegd)
- `extras.js`
- `logo.svg`
- `favicon.svg`
- `favicon.ico` (extra browserfallback)
- `favicon-winter.svg`
- `favicon-spring.svg`
- `favicon-summer.svg`
- `favicon-autumn.svg`
- `icon-180.png`

**Laat `functions/api/weather.js` staan**, tenzij je die doelbewust wilt wijzigen. De API-sleutel is al geconfigureerd in Cloudflare.

Na een GitHub-commit publiceert Cloudflare Pages normaal automatisch opnieuw.

## Gebruikte gegevens en bronnen

- Eigen station: via Cloudflare Pages Function `/api/weather`, met de geheime variabele `WU_API_KEY` in Cloudflare.
- Regionale weericonen: Open-Meteo Forecast API, niet van het eigen station. Deze vraagt geen extra sleutel bij niet-commercieel gebruik; bronvermelding in het dashboard.
- Zonsopkomst en zonsondergang: Open-Meteo / astronomische fallback.
- Maanfase: eenvoudige astronomische benadering (indicatief).
- Radar: alleen een externe link, geen ingesloten kaart of overgenomen radarbeelden.

### Bij problemen

Als temperatuur / historie niet laden, controleer `/api/weather?scope=current` en je Cloudflare Pages Function.
Als het regionale weerbeeld niet laadt, blijft de eigen Weather Underground-data apart beschikbaar.

> Upload geen Weather Underground API-key naar GitHub of in `index.html`/`extras.js`.

## Modelkoppeling testen

- Open `https://www.weerstationjubbega.nl/api/forecast` voor de JSON-response met velden `models.ecmwf.days` en `models.gfs.days`.
- Controleer dat het dashboard 5 dagkaarten toont en dat de drie modelkeuzes werken.
- Als een model een storing heeft, toont de site de andere voorspelling en een waarschuwing.
- Test op mobiel of de dagkaarten horizontaal te scrollen zijn.

Let op: de voorspelling wordt extern aangeleverd. Bij het ontwikkelen is getest met representatieve JSON-responses, niet met een echte live productierun.
