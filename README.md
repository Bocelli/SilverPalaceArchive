# Silverium Archive // Silver Palace Database & Detective Dossier

Prototipo operativo e architettura per il database di **Silver Palace**, concepito per **CatalystOnline** e per il dominio [silveriumdb.cc](https://silveriumdb.cc/).

---

## 🔍 Cosa risolve questo progetto
1. **Facile Scrittura per il Creator**:
   - Elimina la necessità di editare file YAML e Markdown a mano.
   - Fornisce un pannello grafico con pulsanti, menu a tendina per le fazioni, selettori di rarità, box di traduzione affiancati e preview live.
   - Sotto il cofano genera file Markdown standard con frontmatter pronti per GitHub.
2. **Facile Lettura per la Community**:
   - Design tematico **Vittoriano Steampunk / Gothic Noir / Silverium** (nessun template generico o "AI slop").
   - Schede personaggio unificate a schede (*Dossier*, *Galleria*, *Media/Audio*, *Combattimento*, *Note del Detective*).
   - Filtri istantanei per Fazione, Rarità e barra di ricerca live.
   - Selettore lingua `[ IT | EN ]` per alternare con un clic tra l'inglese originale e la traduzione italiana di Catalyst.
3. **Area Admin Protetta da Password**:
   - Pagina protetta da password configurata con la chiave: `catascemo`.
   - Accesso con feedback di errore (animazione a scossa se la password è errata) e salvataggio della sessione.

---

## 🚀 Come testare il prototipo in locale

Puoi aprire direttamente il file nel browser:
```powershell
# Apri direttamente in Edge o Chrome
Start-Process "C:\Users\Irvine\.gemini\antigravity\scratch\silveriumdb-archive\index.html"
```

Oppure avviando un web server locale rapido con Python:
```powershell
cd "C:\Users\Irvine\.gemini\antigravity\scratch\silveriumdb-archive"
python -m http.server 3000
```
E aprendo `http://localhost:3000` nel browser.

---

## 🔐 Sicurezza della Password: Dal Prototipo alla Produzione

### Nel Prototipo Locale
* La chiave `catascemo` è gestita via JavaScript/SessionStorage per permettere a te e al creator di testare subito il flusso grafico senza dover configurare server o token esterni.

### Per la Messa Online Ufficiale su `silveriumdb.cc`
Dato che il sito è ospitato su GitHub Pages con Cloudflare:
1. **Opzione Cloudflare Access / Zero Trust (Consigliata)**:
   - Dato che `silveriumdb.cc` passa già attraverso Cloudflare, si può attivare una regola gratuita che protegge l'URL `/admin` chiedendo la password prima ancora che la richiesta arrivi al browser. Nessun visitatore o bot può bypassarla.
2. **Opzione GitHub OAuth (Keystatic)**:
   - Solo l'account GitHub di CatalystOnline può salvare e pubblicare le modifiche. Chiunque altro non vedrà il pulsante di salvataggio.
