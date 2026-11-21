# Silverium Archive // Silver Palace Database

Database statico e bilingue (IT/EN) di **Silver Palace**, costruito sui contenuti del vault Obsidian
[`Bocelli/SPVault`](https://github.com/Bocelli/SPVault) e pubblicato su GitHub Pages:
<https://bocelli.github.io/SilverPalaceArchive/>.

Progetto personale, non il sito ufficiale di CatalystOnline (`silveriumdb.cc` è il loro dominio).

## Come funziona

```
SPVault (Obsidian, git)  →  node sync_spvault.js  →  index.html + status.html + data/*.json  →  push manuale
```

Il **vault è l'unica fonte di verità**. Il sito non scrive mai contenuti: nessun editor, nessuna
password, nessun salvataggio dal browser. I dati vengono rigenerati dal vault.

| File | Ruolo |
|---|---|
| `index.html` | applicazione completa: 5 viste, scheda personaggio, timeline, glossario, archivio media |
| `status.html` | diagnostica: cosa c'è nel vault e non ha ancora una UI (**drift**) + prompt da copiare |
| `sync_spvault.js` | estrae il vault, valida, genera dati e pagine |
| `data/archive.json` `data/drift.json` | dati generati, leggibili e diffabili |
| `_multimedia/` | asset originali (55 MB) |
| `_thumbs/` | versioni leggere per le card (420 px, q74) |
| `tools/thumbs.py` | rigenera le thumb con Pillow |
| `docs/` | architettura e contratto dati |

## Uso

```powershell
# 1. sincronizza dal vault (genera dati, pagine, thumb, commit locale)
.\sync.bat

# 2. pubblica (manuale, di proposito)
git push origin main
git push origin main:gh-pages

# anteprima locale
python -m http.server 3000
# → http://localhost:3000
```

Il sync non fa push: controlli il risultato su `http://localhost:3000` e pubblichi quando sei convinto.

## Cosa c'è nel sito

- **Personaggi** — 19 dossier con card 1:2, ricerca live, filtro per fazione, scheda a 5 tab
  (lore bilingue, pagine segrete, galleria, trailer, note).
- **Timeline** — 21 dispatch con data reale (dal commit git del file), raggruppati per mese.
- **Fazioni** — 10 fazioni, incluse quelle presenti nel vault solo tramite tag.
- **Glossario** — termini, luoghi, distretti.
- **Multimedia** — 75 asset indicizzati per categoria, con lightbox e player YouTube.
- **Deep link** — ogni vista e ogni scheda hanno un indirizzo: `#/personaggi/case_alf`, `#/fazioni`, `#/multimedia`.
- **Bilingue** — IT/EN salvo in `localStorage`, `<html lang>` aggiornato, chrome tradotta.

## Quando il vault cambia

Apri `status.html`: se compare qualcosa lì, il content creator ha aggiunto un file, una sezione o un
tag che il sito non mostra ancora. Il bottone **Copia prompt** produce il testo pronto da incollare in
chat per far mappare la UI; poi si rilancia il sync e il contatore scende.

Le regole di mappatura stanno in `docs/DATA-CONTRACT.md`.
