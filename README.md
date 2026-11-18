# Weerstation Jubbega — versie 3

De website voor station IJUBBE7 draait op Cloudflare Pages, met server-side toegang tot Weather Underground.

## Wat werkt
- Actuele meetgegevens via `/api/weather?scope=current` (automatische update elke 5 minuten).
- Historie van een geselecteerde dag via `/api/weather?scope=day&date=2026-11-17`.
- Recente 7 dagen via `/api/weather?scope=week` (uurlijkse samenvattingen; géén vrij gekozen oudere week).
- Grafieken per categorie met selecteerbare lijnen, muisaanwijzing en een dagoverzicht.
- Geen fictieve metingen: wanneer de API geen gegevens levert, verschijnt een duidelijke melding en `—`.
- De actuele tegels blijven actueel, ook als je in de historie bladert.

## Zo vervang je de bestaande website
1. Download de ZIP en pak uit.
2. Open je GitHub repository `weerstation-jubbega`.
3. Vervang `index.html` door de nieuwe versie (uploaden of in GitHub bewerken).
4. Open `functions/api/weather.js` en vervang ook deze inhoud door de nieuwe versie.
5. Sla op via **Commit changes**. Cloudflare Pages publiceert daarna automatisch.
6. De bestaande Cloudflare secret `WU_API_KEY` blijft behouden en hoeft niet opnieuw te worden toegevoegd.

## Controle
- `https://weerstation-jubbega.pages.dev/api/weather?scope=current`
- `https://weerstation-jubbega.pages.dev/api/weather?scope=day&date=2026-11-17`
- `https://weerstation-jubbega.pages.dev/`

## Let op
- Werking met de echte API-sleutel moet na deployment worden gecontroleerd; de sleutel is niet meegeleverd.
- Historische metingen van de huidige dag kunnen achterlopen. Actuele metingen komen daarom van een apart endpoint.
- De 7-dagenperiode toont **recent** beschikbare uurlijkse metingen. Oude data haal je per afzonderlijke datum op.
- Voor een volledige archiefdatabase en vergelijkingen tussen jaren is aanvullende opslag of periodieke import nodig.
- Het oude Cloudflare redirectrecord naar Weather Underground moet worden verwijderd vóór je het eigen domein als Pages Custom Domain gebruikt.
