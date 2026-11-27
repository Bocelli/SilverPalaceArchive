# Architettura — Silverium Archive

## Flusso

```
Bocelli/SPVault  (Obsidian, git)            <- unica fonte di verità
        │
        │  git pull + copia content/_Multimedia -> _multimedia/
        ▼
sync_spvault.js  (Node, zero dipendenze)
        │  1. parse markdown bilingue + tag
        │  2. deriva fazioni, lessico, dispatch, multimedia
        │  3. rileva drift (contenuto che la UI non sa mostrare)
        │  4. valida lo schema (assert) — se fallisce NON scrive
        ▼
data/archive.json      data/drift.json
        │                     │
        ▼                     ▼
index.html  (dati iniettati)  status.html (drift iniettato)
        │
        ▼
git commit  →  push manuale  →  GitHub Pages (main + gh-pages)
```

`push` è manuale: il sync non pubblica più da solo.

## index.html

File unico, nessun bundler. Tre `<script>`: config Tailwind, CDN Tailwind, app.

| Blocco | Contenuto |
|---|---|
| `<head>` | font Playfair/Inter, meta, OG/Twitter, JSON-LD |
| header | brand centrato, utility (lingua + link `status.html`), nav |
| `main` | 5 viste: `characters` (tab roster + NPC), `timeline`, `factions`, `lexicon`, `multimedia` |
| drawer | scheda personaggio, 5 tab: bio, hidden, gallery, media, notes |
| lightbox | immagini e video YouTube |
| script | dati `DEFAULT_*` iniettati + rendering + router hash |

Routing: `#/personaggi`, `#/personaggi/npc`, `#/personaggi/<id>`, `#/timeline`, `#/fazioni`, `#/lessico`, `#/multimedia`.
Il back del browser funziona perché ogni vista e ogni scheda scrivono nell'hash.

## Funzioni del front-end

- `setView(v)` — cambia vista, aggiorna nav e hash.
- `renderRoster` / `filterRoster` / `setFactionFilter` — griglia, ricerca, pillole.
- `setRosterTab` / `renderNpcs` — tab Personaggi / NPC & Menzionati, card compatte senza drawer.
- `openCharacterDrawer(id)` / `closeCharacterDrawer()` — scheda, popola i 5 tab.
- `renderTimeline` / `renderFactions` / `renderLexicon` / `renderMultimedia` — viste dati.
- `setLanguage(l)` — IT/EN, persistito in `localStorage.sdb_lang`, aggiorna `<html lang>` e la chrome.
- `esc(v)` — escaping HTML di ogni stringa proveniente dal vault.

## Vincoli tecnici
- GitHub Pages: solo file statici, `.nojekyll` presente (necessario per `_multimedia/`).
- 55 MB di asset originali: le card usano le thumb in `_thumbs/` (600 px), il drawer/lightbox l'originale.
- Nessun backend: se in futuro serve scrittura da browser, serve un host con Worker/Node (Sites + D1 o Keystatic).
