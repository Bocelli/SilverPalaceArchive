# AGENTS.md — Silverium Archive

Database statico di Silver Palace (progetto personale di Bocelli, non il sito ufficiale di CatalystOnline).
Leggi `docs/ARCHITECTURE.md` e `docs/DATA-CONTRACT.md` prima di modificare dati o pipeline.

## Regola numero uno
Il **vault Obsidian `Bocelli/SPVault` è l'unica fonte di verità** dei contenuti.
Il sito non scrive mai nel vault: nessun editor, nessun salvataggio dal browser.
Se un contenuto non è nel vault, non deve stare nel sito. Se il sito non sa mostrarlo, si mappa qui.

## Comandi
| Cosa | Comando |
|---|---|
| Rigenerare dati + `index.html` + `status.html` | `sync.bat` (o `node sync_spvault.js`) |
| Anteprima locale | `python -m http.server 3000` → `http://localhost:3000` |
| Solo thumbs immagini | `python tools/thumbs.py` |
| Diagnostica drift | aprire `status.html` |

`sync.bat` non pubblica più: il push su GitHub Pages è **manuale** (`git push origin main` poi `main:gh-pages`).

## Dove stanno le cose
- `index.html` — applicazione completa (markup + CSS/JS inline). Dati iniettati tra i marker `const DEFAULT_*` e `// Auto-sync`.
- `status.html` — pagina pubblica di diagnostica: elenco drift del vault + prompt da copiare.
- `data/archive.json` — dati estratti (leggibile, diffabile). `data/drift.json` — elementi del vault non mappati.
- `sync_spvault.js` — estrattore vault → dati → HTML. Valida prima di scrivere.
- `_multimedia/` — asset originali. `_thumbs/` — versioni leggere per le card.
- `notify.ps1` — toast Windows, chiamato dal sync quando c'è drift.

## Convenzioni
- Due lingue sempre: `*_it` e `*_en`. Se manca una traduzione il sito ricade sull'altra (nessun testo vuoto).
- Tutte le stringhe del vault vanno escappate prima di finire in HTML (`esc()` / `escapeHtml()`).
- Niente dipendenze npm: solo Node standard library e Python per le immagini.
- Il design è Vittoriano/Steampunk noir: serif Playfair, Inter, canvas `#090B10`, oro `#D4AF37`. Non introdurre nuove palette.
- Commit convenzionali (`fix(ui): …`, `feat(sync): …`).

## Punti di ripristino
Qualsiasi modifica si annulla con `git checkout -- .` (HEAD al momento dell'audit: `d231fdd`).
