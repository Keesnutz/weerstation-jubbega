# Weerstation Jubbega — Dashboard

Een mobielvriendelijk Nederlandstalig weerstationdashboard voor station `IJUBBE7`.

## Al klaar
- Actuele meetwaardetegels, dagoverzicht, vijf grafiekcategorieën
- Verschillende grafieklijnen aan/uit zetten
- Datumkiezer, vorige/volgende dag, vandaag/gisteren
- 7-dagenweergave
- Demo werkt ook zonder API-sleutel; alle demogegevens zijn fictief en als zodanig gemarkeerd.
- Cloudflare Pages Function in `functions/api/weather.js` voor veilige server-side API-toegang.

## Lokaal bekijken
Open `index.html` in een browser. Omdat de lokale HTML geen API-endpoint heeft, wordt demodata getoond.

## Publiceren via Cloudflare Pages
**Let op:** uploaden via Drag & Drop van alleen `index.html` publiceert enkel de demo. Pages Functions vereisen een geschikte Git- of Wrangler-deployment.

1. Zet de map in een GitHub-repository.
2. Maak in Cloudflare > Workers & Pages > Create > Pages een project aan met Git-integratie.
3. Gebruik als build command: `exit 0`, en als outputdirectory: `.`.
4. De map `functions/api/weather.js` moet in de repositoryroot blijven. Bij een standaard Pages-project is `/api/weather` dan de route.
5. Ga in de instellingen van dat Pages-project naar Variables and Secrets en voeg **WU_API_KEY** als geheim toe. Plak daar je eigen Weather Underground API-sleutel. Niet in HTML of op GitHub plaatsen.
6. Deploy opnieuw en controleer `/api/weather?date=2026-11-17&scope=day`.
7. Voeg `weerstationjubbega.nl` en eventueel `www.weerstationjubbega.nl` toe bij Custom domains.
8. Verwijder/vermijd een oude Redirect Rule die de domeinnaam nog naar Weather Underground doorstuurt.

## Belangrijke beperkingen
- Er is nog geen echte Weather Underground sleutel getest. Toegang, datavelden, limieten en historische beschikbaarheid moeten met jouw sleutel worden gecontroleerd.
- De 7-dagen API gebruikt recente uurhistorie en is niet geschikt voor willekeurige oudere weken. Voor volledige archiefhistorie en datumbereik is een uitgebreidere backend of eigen opslag nodig.
- Sommige sensoren leveren een ander veld of geen veld aan; niet-beschikbare waarden worden als — getoond.
- De neerslaggrafiek toont neerslagintensiteit, geen totale neerslag. Voor betrouwbare dagtotalen moeten we de juiste cumulatieve neerslagvelden of dagelijkse samenvattingen toevoegen.
- Voor veelvuldig publiek gebruik is caching en mogelijk een eigen database verstandig om API-limieten te respecteren.
