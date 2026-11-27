# Changelog — Silverium Archive

Formato: [Keep a Changelog](https://keepachangelog.com/it/1.1.0/).

## [Non rilasciato]

### NPC & Menzionati + Concetti Chiave (2026-11-27)
**Aggiunto**
- `npcs[]` in `data/archive.json`: note di `content/NPC & Menzionati/` con bio bilingue e legami
  ricavati dai tag (personaggio o fazione). Nuova tab "NPC & Menzionati" nella vista Personaggi,
  con ricerca, filtro fazione sulle sole fazioni citate, conteggio risultati e contatore in header.
- Categoria `Concetti Chiave` nel Glossario (`content/Concetti Chiave/*.md`); una nota senza prosa
  resta `drift` `nota-vuota` invece di generare una card vuota.
- Le due cartelle non sono più drift "Nuova cartella": sono mappate in `knownRoots`.

### Audit iniziale (2026-11-21)
Revisione completa del prototipo: 19 personaggi, 21 dispatch, 7 fazioni, 7 termini, 75 asset.

**Corretto**
- `DOMContentLoaded` usava la variabile inesistente `lang`: `ReferenceError` che disattivava
  traduzione dell'header e il listener `Escape` (drawer e lightbox non si chiudevano da tastiera).
- `renderFactions` chiamava `selectCase()`, mai definita: il click su un membro di una fazione
  lanciava un errore e non apriva alcuna scheda.
- 13 dispatch su 21 avevano `link: ""`: il bottone "Fonte Ufficiale" era un `<a href="">` che
  ricaricava la pagina.
- 3 fazioni presenti nei personaggi (Fableborn, Casa Reale & Nobiltà, Ivory Tower) non avevano
  pillola né card: 4 personaggi erano raggiungibili solo da "Tutti".
- Rimossa la pagina di scrittura admin: salvava solo in `localStorage` (invisibile ai visitatori,
  cancellata al sync successivo) e conteneva la password in chiaro nel sorgente.
- Rimossi `localStorage` per i dati: il sito legge sempre i dati generati dal vault.

**Aggiunto**
- `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/DATA-CONTRACT.md`.
- `data/archive.json` e `data/drift.json` (dati generati, diffabili).
- `status.html`: diagnostica pubblica del drift del vault + prompt da copiare.
- `tools/thumbs.py`: thumbnail per le card.
- Deep link, accessibilità da tastiera, lingua persistita, escaping HTML dei dati del vault.
