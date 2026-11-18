# Weerstation Jubbega v8

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

## Nieuw in versie 8: 14-daagse weersverwachting ECMWF vs GFS

- Voorspelling voor **14 dagen inclusief vandaag**, dus vandaag + 13 dagen.
- Regionaal modelpunt Jubbega (53,005° N; 6,130° O) voor een **indicatie** voor Noordoost-Nederland.
- ECMWF IFS 0,25° (`ecmwf_ifs025`, via de ECMWF-modelroute) en NOAA GFS Global (`gfs_global`, via de GFS-modelroute), beide expliciet gekozen.
- Vergelijk maximumtemperatuur, minimumtemperatuur, regen per dag, wind en windstoten.
- Kijk naar zowel de dagkaarten als de grafieken en gebruik **Dag 1–7** / **Dag 8–14** om te springen.
- De bronkoppeling `functions/api/forecast.js` probeert bij een fout de alternatieve Open-Meteo-modelroute en toont waarschuwingen als een model tijdelijk niet beschikbaar is.
- De Cloudflare-cache bewaart uitsluitend volledige antwoorden met beide modellen, maximaal 15 minuten. Oude versie-7-cache wordt omzeild.
- Dagen 8–14 zijn duidelijk minder betrouwbaar dan de korte termijn; modelspreiding is **geen** onzekerheidspercentage.
- De bestaande API voor eigen metingen (`functions/api/weather.js`) blijft **ongewijzigd**.
- Open-Meteo vereist bronvermelding; gratis API-gebruik is voor niet-commerciële toepassingen (zie https://open-meteo.com/en/terms).

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
- Controleer dat het dashboard 14 dagkaarten toont en dat de drie modelkeuzes werken.
- Als een model een storing heeft, toont de site de andere voorspelling en een waarschuwing.
- Test op mobiel of de dagkaarten horizontaal te scrollen zijn.

Let op: de voorspelling wordt extern aangeleverd. Bij het ontwikkelen is getest met representatieve JSON-responses, niet met een echte live productierun.

## Versie 8 update (alleen 3 bestanden)

Update de bestaande installatie met `index.html`, `forecast.js`, `functions/api/forecast.js`. Laat `extras.js`, `logo.svg`, `functions/api/weather.js` en alle favicon-bestanden staan. Op de API-test `/api/forecast` moet `forecastDays: 14` te zien zijn en, bij volledige bronbeschikbaarheid, 14 dagen onder beide modellen.


## Versie 9 – compact menu, zon/maan, Beaufort en sneeuwindicaties

- **Weergave:** rechtsboven via ⚙️ Weergave; seizoen en dag/nacht zijn onthouden in deze browser.
- **Zon en maan:** zonsondergang/zonsopkomst, maanopkomst/maanondergang, astronomische boven/onder-horizonstatus in Jubbega; maanberekening is een benadering en zegt niets over bewolking.
- **Windroos:** windkracht nu, daggemiddelde uit beschikbare historische PWS-meetpunten, en gemiddelde windkracht; Beaufort is een omzetting van windsnelheid en geen aparte meting.
- **Dagoverzicht:** gemiddelde en hoogste windkracht van de geselecteerde historische periode.
- **14-daagse verwachting:** naast temperatuur, wind, windstoten en neerslag ook gemiddeld dauwpunt, voorspelde sneeuwhoeveelheid en een kwalitatief sneeuwsignaal. Aangezien deze twee deterministische modellen geen officiële gekalibreerde sneeuwkans in procenten opleveren, geven we geen fictieve sneeuwkans. Waar aanwezig staat de model-neerslagkans tijdens mogelijke sneeuwuren apart en duidelijk aangeduid.
- **Forecast-API:** `hourly` neerslag/temperatuur/dauwpunt/sneeuw en extra `daily.snowfall_sum` van Open-Meteo, cache key v9. De Weather Underground `WU_API_KEY` blijft ongewijzigd.

### Installatie bij v8

Vervang `index.html`, `extras.js`, `forecast.js` en `functions/api/forecast.js` op GitHub (zelfde paden). Laat de overige bestanden staan. Controleer Cloudflare Pages Success en daarna `/api/forecast`. Bij `models.ecmwf.days[0]` en `models.gfs.days[0]` horen ook `dewPoint`, `snowfall` en `snowSignal` te staan.

### Opmerking over sneeuw

Dauwpunt lager dan -5 °C is **geen** voldoende voorwaarde voor sneeuw: er moet ook neerslag zijn, en het temperatuurprofiel moet sneeuw ondersteunen. Het sneeuwsignaal gebruikt model-sneeuwval en thermische randvoorwaarden. Een door Open-Meteo aangeleverde neerslagkans tijdens een mogelijk sneeuwuur is niet gelijk aan de sneeuwkans.
