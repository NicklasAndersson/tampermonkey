# Tampermonkey-skript

Samling av egna Tampermonkey-userscripts.

## Struktur

Ett skript per fil i repo-roten (`*.js`). Varje fil är ett komplett
Tampermonkey-userscript med sin egen `==UserScript==`-header — inga delade
moduler eller byggsteg.

## Installera ett skript

1. Installera [Tampermonkey](https://www.tampermonkey.net/) i webbläsaren.
2. Öppna den råa filen på GitHub (raw.githubusercontent.com/...) eller
   dra .js-filen till Tampermonkey-dashboarden.
3. Tampermonkey läser `@match`/`@grant` m.m. ur headern automatiskt.

## Autouppdatering

Varje skript ska ha `@downloadURL` och `@updateURL` pekande på sin
`raw.githubusercontent.com`-URL på `main`. Tampermonkey jämför periodiskt
`@version` i den URL:en mot den installerade versionen och uppdaterar vid
skillnad.

**Checklista för att autoupdate ska fungera:**

- `@downloadURL` / `@updateURL` satta och pekar på rätt fil på `main`.
- `@version` höjs vid varje ändring som ska nå användare (Tampermonkey
  uppdaterar inte om versionen är oförändrad).
- Filen måste vara pushad till `main` — Tampermonkey hämtar den publicerade
  branchen, inte lokala okommittade ändringar.

## Konventioner för nya skript

- En fil per skript, namnge efter target-sajten (t.ex. `vinbetyget.js`).
- Håll `@grant` till minsta möjliga uppsättning (undvik `@grant none`
  tillsammans med `unsafeWindow` om det går att undvika).
- Lista alla domäner skriptet faktiskt anropar under `@connect` — annars
  blockerar Tampermonkey requesten.
- Skriv koden så att den tål att sajten skriptet körs mot ändrar sin HTML/API
  utan förvarning — extern data (API-svar, DOM-sökningar) ska alltid
  null-checkas.

## Skript i repot

| Fil             | Beskrivning                                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `vinbetyget.js` | Visar Systembolagets lagerstatus i din valda butik direkt på vinbetyget.se:s topplistor. Se kommentarer i filen för kända fallgropar i Systembolagets externa API. |
