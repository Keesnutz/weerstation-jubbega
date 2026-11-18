# Weerstation Jubbega versie 11 — update

Dit pakket bouwt door op versie 10.

## Wat is veranderd?

- Het blok **Weerbeeld in Jubbega** bevat nu drie aparte, automatisch geschreven alinea's: vandaag, morgen en dag 3–5. Deze eigen weersamenvatting gebruikt de voorspelde gegevens van ECMWF en GFS (en actuele IJUBBE7-metingen) en haalt geen tekst van een andere weerwebsite over.
- De tekstgenerator draait zelfstandig in index.html. Daarmee is het weerbeeld niet langer afhankelijk van een goed geladen nieuw exemplaar van extras.js. De bestanden gebruiken `?v=11` om de browsercache te omzeilen.
- De sneeuwindicatie bij **ieder model per dag** is **groen bij ‘Geen sneeuwsignaal’**, **blauw bij ‘Sneeuw mogelijk/voorspeld’** en **neutraal wanneer de sneeuwdata ontbreken**. Er wordt geen sneeuwkanspercentage verzonnen.
- De oorspronkelijke live metingen, alle 14 dagen (in twee weken), moon, sun, windroos en historische grafieken blijven behouden.

## Bijwerken op GitHub

Upload uit het updatepakket alleen `index.html`, `extras.js` en `forecast.js` naar de hoofdmap en kies **Commit changes**. Het Cloudflare Functions-bestand `functions/api/weather.js` en de externe weermodellen-koppeling hoeven niet aangepast te worden.

Na publicatie in Chrome: toets `Ctrl + Shift + R` om te testen. In de broncode van de homepage staan de scriptversies `extras.js?v=11` en `forecast.js?v=11`.

Opmerking: de voorspelling is een eigen samenvatting *van modelresultaten*, geen eigen numeriek weermodel of onafhankelijke weersverwachtingsdienst.
