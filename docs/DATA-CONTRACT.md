# Contratto dati — vault → sito

Il parser legge `content/` del repo `Bocelli/SPVault`. Tutto ciò che non rispetta questo contratto
finisce in `data/drift.json` e viene mostrato in `status.html`.

## File del vault

| Percorso | Ruolo | Regola |
|---|---|---|
| `content/Personaggi/<Nome>/<Nome> Drip Marketing.md` | scheda pubblica | obbligatorio; contiene testo EN, `###### Traduzione` (IT), `###### Tags` |
| `content/Personaggi/<Nome>/<Nome> Hidden Page.md` | lore segreta | opzionale |
| `content/Fazioni/<NOME>/*.md` | fazione | primo file o file che inizia con `ATOTS` |
| `content/Dizionario/*.md` | termine | un termine per file, nome file = termine |
| `content/Mappe/Footnotes/*.md` | luogo | embed `![[immagine]]` per la mappa |
| `content/Mappe/Distretti ed Aree Menzionate/*.md` | distretto | testo semplice |
| `content/Post Ufficiali/**/*.md` | dispatch | la cartella padre determina il tipo |
| `content/_Multimedia/**` | immagini | copiate in `_multimedia/`, indicizzate per cartella |

## Struttura di un file bilingue

```
Nome (Ruolo)                     <- titolo, prima riga
—— Sottotitolo ——
-- "Citazione" -- Descrizione…

###### Traduzione                  <- separatore: da qui in poi è italiano
Nome (Ruolo)
...

###### Immagini
![[Nome Drip Marketing.jpg]]

###### Tags
#alf #miss #maid
```

Il parser **scarta**: titolo, sottotitolo `—— … ——`, citazione, ripetizione del nome in coda,
sezione `###### Immagini` (equivalenti: `###### Immagine`, `###### Immagini e Link`), `###### Tags`, link markdown, `==evidenziazioni==`, `**grassetti**`.
Le date non sono nel markdown: vengono prese dal commit git del file.

L'estrazione delle immagini **non dipende dal titolo della sezione**: si cercano i pattern di nome file
(`*Drip Marketing*` → `drip_img`, `*Profile Art*` → `profile_img`) in tutto il documento. Un titolo
`###### Immagini e Link` non aggiunge né toglie nulla alla scheda, quindi non serve una UI dedicata:
il drift detector lo accetta come equivalente di `###### Immagini`.

## Schema `data/archive.json`

### cases[]
| Campo | Tipo | Obbligatorio | Note |
|---|---|---|---|
| `id` | string | sì | `case_<nome_normalizzato>` |
| `name` | string | sì | |
| `faction` | string | sì | derivata dai tag (sotto); default `Indipendente` |
| `role` | string | sì | dal titolo tra parentesi |
| `title_it` / `title_en` | string | sì | |
| `quote_it` / `quote_en` | string | no | |
| `bio_it` / `bio_en` | string | sì | senza titolo/citazione |
| `has_hidden` | bool | sì | |
| `hidden_title_*`, `hidden_bio_*` | string | se `has_hidden` | |
| `profile_img`, `drip_img`, `hidden_imgs[]`, `intel_imgs[]`, `official_art` | path | no | relativi alla root del sito; `intel_imgs[]` = art delle pagine Acquaintance Intel |
| `thumb`, `thumb_hidden`, `thumb_official` | path | no | generati in `_thumbs/` |
| `trailer_url`, `x_url` | url | no | |
| `date` | `YYYY-MM-DD` | no | dal commit del file |
| `tags[]` | string | sì | |

### factions[]
`name`, `alias`, `desc_it`, `desc_en`, `banner`, `tags`.
Le fazioni senza cartella nel vault ma presenti nei tag dei personaggi esistono solo come
**fazione derivata**: la UI mostra comunque la pillola e la card (descrizione vuota).

### dispatches[]
`id`, `title`, `type`, `date` (`YYYY-MM-DD`), `desc_it`, `desc_en`, `cover_img`, `link`, `tags[]`.
`link` può essere vuoto: in quel caso la UI non mostra un bottone cliccabile.

### lexicon[] / multimedia[]
Invariati rispetto al prototipo; `multimedia[].thumb` punta a `_thumbs/`.

## Derivazione fazione dai tag

Ordine di priorità (primo match vince): `miss` → MISS, `riverconstabulary` → River Constabulary,
`stats` → S.T.A.T.S., `umi` → UMI, `houseluna` → House Luna, `queen`/`royaltyandaristocracy` →
Casa Reale & Nobiltà, `cragedgers`/`middensea` → Crag Edgers, `ozschoolofmetallurgy`,
`fableborn`, `ivorytower`. Nessun match → `Indipendente`.

Aggiungere una fazione = aggiungere una riga a `FACTION_TAGS` in `sync_spvault.js`
(altrimenti il tag finisce in drift).
