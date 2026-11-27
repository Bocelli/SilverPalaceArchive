# TRAIL — dove mettere le mani

Mappa dei punti di contatto del progetto, pensata per non rileggere 5000 righe la volta dopo.
Flusso completo e schema dei dati: [`ARCHITECTURE.md`](ARCHITECTURE.md), [`DATA-CONTRACT.md`](DATA-CONTRACT.md).

**Uso**: prima di toccare qualcosa, trova la riga giusta qui sotto; a lavoro finito aggiungi una riga al
[registro](#7-registro). Le righe sono indicative (cambiano a ogni modifica): cerca il nome della funzione,
non il numero.

## 1. Catena dei dati

```
spvault_repo/content/  →  sync_spvault.js  →  data/archive.json + drift.json
                                            →  DEFAULT_* iniettati in index.html / status.html
                                            →  commit locale  →  push  →  Actions (sync.yml)  →  gh-pages
```

Il browser legge solo `data/*.json` e i `DEFAULT_*`: non scrive mai. Se un contenuto non arriva nel sito,
il problema è in `sync_spvault.js`, non nella UI.

## 2. `sync_spvault.js` (sezioni numerate)

| Sezione | Contenuto | Quando ci vai |
|---|---|---|
| `// 1.` | copia `_Multimedia` del vault | nuovi asset |
| `// 2.` | parse personaggi, `resolveLinks` | campi scheda, legami |
| `// 3.` | fazioni derivate dai tag | nuove fazioni |
| `// 4.` | lessico (Dizionario, Distretti, Terminologia) | nuove categorie di card |
| `// 4b.` | NPC & Menzionati | tab NPC |
| `// 4c.` | Concetti Chiave (solo con prosa) | nuova categoria glossario |
| `// 5.` | dispatch da `Post Ufficiali` | post, trailer, eventi |
| `// 6.` | scansione multimedia | gallerie, sticker |
| `// 7.` | `knownRoots` + drift strutturale | nuova cartella nel vault |
| `// 8.` | validazione bloccante (assert) | schema dati |
| `// 9.` | scrittura JSON + iniezione `DEFAULT_*` | output |
| `// 10.` | thumbs WebP | immagini pesanti |
| `// 11.` | commit locale | — |

Ancore utili: `FACTION_TAGS` (~L193), `slugify` (~L212), `resolveLinks` (~L219), `noteTags` (~L244),
`knownRoots` (~L847), `fingerprint` + `version` (~L916). La versione è `spvault_sync_<sha1(fingerprint)>`:
se i dati non cambiano, il bot non committa.

## 3. `index.html`

Due `<script>`: config Tailwind e app (quella lunga). Nell'app, in ordine:

| Blocco | Funzioni / id | Note |
|---|---|---|
| i18n | `I18N.it`, `I18N.en`, `t()`, `setLanguage` | ogni chiave va in **entrambe** le lingue |
| markup | `#roster-tabs`, `#char-search`, `#faction-filter`, `#tag-drawer`, `#lightbox`, `#char-drawer` | z-index: scheda 50, sommario tag 60, lightbox 70 |
| router | `setHash`, `route`, `consumeHistoryEntry` | `routeSilent` evita doppie voci; la chiusura consuma la voce solo se `history.state` è nostro |
| viste | `setView`, `renderRoster`, `renderTimeline`, `renderFactions`, `renderLexicon`, `renderMultimedia` | una vista = un `render*` |
| roster | `renderRosterTabs`, `setRosterTab`, `renderNpcs`, `populateFactionFilter`, `updateRosterCount` | la tendina fazioni è tab-aware |
| scheda | `_openCharacterDrawer`, `_closeCharacterDrawer`, `drawerCloseTimer` | annulla il timer di chiusura all'apertura |
| sommario tag | `tagIndex`, `openTagDrawer`, `closeTagDrawer`, `openLinked{Character,Faction,Npc}`, `openMediaFromTag` | hash `#/tag/<tag>` |
| media | `openLightbox`, `closeLightbox`, `openImageLightbox`, `openVideoLightbox` | hash `#/art/<src>` |

## 4. Ricette

- **Nuovo campo dal vault**: parse in sezione 2 → `validate` (8) → `DATA-CONTRACT.md` → render nello stesso blocco → indice di ricerca (`searchableText` / `npcSearchableText`).
- **Nuovo tipo di nota**: cartella in `knownRoots` (7) → sezione di parse (2–6) → `categoryLabel`/`LEXICON_CATEGORY` se è una card → render.
- **Nuova vista**: voce in nav → `SLUG_VIEW` → `setView` → `render*` → i18n.
- **Nuovo link a un'entità**: `slugifyClient` + `esc` nell'`onclick` → `openLinked*` → aggiungi la voce in `tagIndex` così compare anche nelle diramazioni.
- **Nuovo asset**: file in `_multimedia/` → `tools/thumbs.py` → sezione 6.

## 5. Trappole già pagate

1. **Storico**: un click = una voce. Indietro deve tornare al sommario, mai alla scheda sotto; il sommario resta aperto sotto il lightbox (z 60 < 70) per non far lampeggiare la pagina. La chiusura passa da `consumeHistoryEntry('tag'|'art', chiave)`: se lo stato non è nostro (link incollato, `history.state` nullo) sostituisce la voce con `#/personaggi` invece di fare `back()`, altrimenti si esce dal sito.
2. **Cache**: GitHub Pages e il browser tengono `index.html` vecchio. Verifica sempre con `?cb=<numero>`.
3. **CRLF**: i file hanno `\r\n`. Le patch Python devono tollerarlo (`-->\r\n`), e `write_file`/`str_replace` non scrivono sul path reale del progetto: si passa da script in `$TEMP`.
4. **`drawerCloseTimer`**: 320 ms; se riapri prima, va azzerato o la scheda si richiude da sola.
5. **Tag**: un tag non censito in `FACTION_TAGS` non è un legame: resta chip cliccabile. Non forzare la mappatura.
6. **Zero dipendenze**: niente npm nel sito; il sync usa solo la stdlib di Node.
7. **Esc e livelli**: il listener `Escape` chiude **un livello per volta** — lightbox, poi sommario tag, poi scheda. Non richiamare tutti i `close*` insieme: sopra una foto chiudeva anche la scheda sotto e lasciava una voce di storico in più (il Back riapriva l'immagine).

## 6. Verifiche minime

```bash
node sync_spvault.js --no-pull --no-commit --no-thumbs   # rigenera e validata i dati
node --check <estratto dell'ultimo <script> di index.html> # sintassi app
curl -s "https://bocelli.github.io/SilverPalaceArchive/?cb=$(date +%s)" | grep -c roster-tab-npcs
```

## 7. Registro

| Data | Commit | Punti toccati | Perché |
|---|---|---|---|
| 2026-11-26 | `d01e22b` | sync 2–9 | ordine di lettura stabile, niente gitlink del vault |
| 2026-11-27 | `78232b5` | sync 2/4b/4c/7/9, `index.html` (roster, sommario tag, router, drawer), `status.html`, docs | tab NPC, tag e legami cliccabili, storico proprio |
| 2026-11-27 | locale | `index.html` `renderRosterTabs`, listener `Escape`, `consumeHistoryEntry` | `aria-label` coerente con la tab; Esc un livello per volta; i link incollati non portano fuori dal sito |
