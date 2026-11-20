const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const VAULT_REPO = 'C:/Users/Irvine/.gemini/antigravity/scratch/spvault_repo';
const SITE_DIR = 'C:/Users/Irvine/.gemini/antigravity/scratch/silveriumdb-archive';
const INDEX_HTML = path.join(SITE_DIR, 'index.html');
const LOG_FILE = path.join(SITE_DIR, 'sync.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
}

log('=== INIZIO ROUTINE AUTO-AGGIORNAMENTO SPVAULT ===');

// 1. Git pull
let gitOutput = '';
try {
  gitOutput = execSync(`git -C "${VAULT_REPO}" pull`, { encoding: 'utf8' }).trim();
  log(`Git pull output: ${gitOutput}`);
} catch (e) {
  log(`ERRORE Git pull: ${e.message}`);
}

// 2. Sync multimedia assets
log('Sincronizzazione asset multimediali...');
const multimediaSrc = path.join(VAULT_REPO, 'content/_Multimedia');
const multimediaDest = path.join(SITE_DIR, '_multimedia');

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  fs.readdirSync(src).forEach(item => {
    const s = path.join(src, item);
    const d = path.join(dest, item);
    if (fs.statSync(s).isDirectory()) {
      copyRecursive(s, d);
    } else {
      if (!fs.existsSync(d) || fs.statSync(s).size !== fs.statSync(d).size) {
        fs.copyFileSync(s, d);
      }
    }
  });
}
copyRecursive(multimediaSrc, multimediaDest);

// 3. Extract vault data
log('Parsing dei dati del vault...');

function cleanObsidianProse(text) {
  if (!text) return '';
  let t = text.replace(/######\s*(?:Post|Video|Immagini|Immagine|Tags|Tag|Fonti|Dettagli)[\s\S]*$/gi, '');
  t = t.replace(/!\[.*?\]\(.*?\)/g, '');
  t = t.replace(/!\[\[.*?\]\]/g, '');
  t = t.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1');
  t = t.replace(/==(.*?)==/g, '$1');
  t = t.replace(/\*\*(.*?)\*\*/g, '$1');
  t = t.replace(/\*(.*?)\*/g, '$1');
  t = t.replace(/#[a-zA-Z0-9_\-]+/g, '');
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  return t;
}

function extractQuote(text) {
  if (!text) return '';
  const m = text.match(/--\s*["«]([\s\S]*?)["»]\s*--/) || text.match(/["«]([\s\S]*?)["»]/);
  return m ? cleanObsidianProse(m[1].replace(/\n/g, ' ')) : '';
}

const repoContent = path.join(VAULT_REPO, 'content');

// Personaggi
const charBase = path.join(repoContent, 'Personaggi');
const charFolders = fs.readdirSync(charBase).filter(f => fs.statSync(path.join(charBase, f)).isDirectory());
const cases = [];

charFolders.forEach(name => {
  const cDir = path.join(charBase, name);
  const files = fs.readdirSync(cDir);
  
  const dripFile = files.find(f => f.toLowerCase().includes('drip') && f.endsWith('.md'));
  const hiddenFile = files.find(f => f.toLowerCase().includes('hidden') && f.endsWith('.md'));

  const dripRaw = dripFile ? fs.readFileSync(path.join(cDir, dripFile), 'utf8') : '';
  const hiddenRaw = hiddenFile ? fs.readFileSync(path.join(cDir, hiddenFile), 'utf8') : '';

  let dripEn = '';
  let dripIt = '';
  if (dripRaw.includes('###### Traduzione') || dripRaw.includes('###### Traduzioni')) {
    const parts = dripRaw.split(/###### Traduzion[ie]/i);
    dripEn = parts[0].trim();
    const after = parts[1] || '';
    dripIt = after.split(/###### (?:Immagini|Immagine|Tags|Tag|Fonti)/i)[0].trim();
  } else {
    dripEn = dripRaw.trim();
  }

  const enLines = dripEn.split('\n').map(l => l.trim()).filter(Boolean);
  const itLines = dripIt.split('\n').map(l => l.trim()).filter(Boolean);
  let titleEn = enLines[0] || name;
  let titleIt = itLines[0] || name;

  let quoteEn = extractQuote(dripEn);
  let quoteIt = extractQuote(dripIt);

  let hiddenTitleEn = '';
  let hiddenTitleIt = '';
  let hiddenBodyEn = '';
  let hiddenBodyIt = '';

  if (hiddenRaw) {
    let hEn = '';
    let hIt = '';
    if (hiddenRaw.includes('###### Traduzione') || hiddenRaw.includes('###### Traduzioni')) {
      const hParts = hiddenRaw.split(/###### Traduzion[ie]/i);
      hEn = hParts[0].trim();
      const hAfter = hParts[1] || '';
      hIt = hAfter.split(/###### (?:Immagini|Immagine|Tags|Tag|Fonti)/i)[0].trim();
    } else {
      hEn = hiddenRaw.trim();
    }
    const hEnLines = hEn.split('\n').map(l => l.trim()).filter(Boolean);
    const hItLines = hIt.split('\n').map(l => l.trim()).filter(Boolean);
    hiddenTitleEn = cleanObsidianProse(hEnLines[0] || 'The Mystery');
    hiddenTitleIt = cleanObsidianProse(hItLines[0] || 'Il Mistero');
    hiddenBodyEn = cleanObsidianProse(hEn);
    hiddenBodyIt = cleanObsidianProse(hIt);
  }

  const tags = [];
  const tagRegex = /#[a-zA-Z0-9_\-]+/g;
  let tm;
  while ((tm = tagRegex.exec(dripRaw + '\n' + hiddenRaw)) !== null) {
    const t = tm[0].replace('#', '').toLowerCase();
    if (!tags.includes(t)) tags.push(t);
  }

  let faction = 'Indipendente';
  if (tags.includes('miss')) faction = 'MISS';
  else if (tags.includes('riverconstabulary')) faction = 'River Constabulary';
  else if (tags.includes('stats')) faction = 'S.T.A.T.S.';
  else if (tags.includes('umi')) faction = 'UMI';
  else if (tags.includes('houseluna') || tags.includes('queen') || tags.includes('royaltyandaristocracy')) {
    if (tags.includes('houseluna')) faction = 'House Luna';
    else faction = 'Casa Reale & Nobiltà';
  }
  else if (tags.includes('cragedgers') || tags.includes('middensea')) faction = 'Crag Edgers';
  else if (tags.includes('ozschoolofmetallurgy')) faction = 'Oz School of Metallurgy';
  else if (tags.includes('fableborn')) faction = 'Fableborn';
  else if (tags.includes('ivorytower')) faction = 'Ivory Tower';

  // Dynamic image extraction from Obsidian embeds ![[FileName.ext]] with disk check
  const dripEmbedMatch = dripRaw.match(/!\[\[([^|\]]*?Drip Marketing[^|\]]*?\.[a-zA-Z0-9]+)(?:\|.*?)?\]\]/i);
  const profileEmbedMatch = (dripRaw + '\n' + hiddenRaw).match(/!\[\[([^|\]]*?Profile Art[^|\]]*?\.[a-zA-Z0-9]+)(?:\|.*?)?\]\]/i);

  let dripImg = dripEmbedMatch ? `_multimedia/Personaggi/Drip Marketing/${dripEmbedMatch[1].trim()}` : `_multimedia/Personaggi/Drip Marketing/${name} Drip Marketing.jpg`;
  let profileImg = profileEmbedMatch ? `_multimedia/Personaggi/Profile Art/${profileEmbedMatch[1].trim()}` : `_multimedia/Personaggi/Profile Art/${name} Profile Art.jpg`;

  // Fallback: if character has no separate drip image (e.g. Red Rose), use profile art
  if (!fs.existsSync(path.join(SITE_DIR, dripImg)) && fs.existsSync(path.join(SITE_DIR, profileImg))) {
    dripImg = profileImg;
  }

  const links = [];
  const linkRegex = /https?:\/\/[^\s\)\"\'>]+/g;
  let lm;
  while ((lm = linkRegex.exec(dripRaw + '\n' + hiddenRaw)) !== null) {
    if (!links.includes(lm[0])) links.push(lm[0]);
  }
  const ytLink = links.find(l => l.includes('youtube.com') || l.includes('youtu.be')) || '';
  const xLink = links.find(l => l.includes('x.com') || l.includes('twitter.com')) || '';

  let cleanTitleIt = cleanObsidianProse(titleIt).replace(/^[—–-]+\s*/, '').replace(/\s*[—–-]+.*$/, '').trim();
  let cleanTitleEn = cleanObsidianProse(titleEn).replace(/^[—–-]+\s*/, '').replace(/\s*[—–-]+.*$/, '').trim();
  let roleIt = cleanTitleIt;
  const roleMatch = cleanTitleIt.match(/\((.*?)\)/);
  if (roleMatch) roleIt = roleMatch[1].trim();

  cases.push({
    id: 'case_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
    name: name,
    faction: faction,
    role: roleIt,
    title_it: cleanTitleIt,
    title_en: cleanTitleEn,
    quote_it: quoteIt,
    quote_en: quoteEn,
    bio_it: cleanObsidianProse(dripIt),
    bio_en: cleanObsidianProse(dripEn),
    has_hidden: !!hiddenRaw,
    hidden_title_it: hiddenTitleIt,
    hidden_title_en: hiddenTitleEn,
    hidden_bio_it: hiddenBodyIt,
    hidden_bio_en: hiddenBodyEn,
    hidden_story_it: hiddenBodyIt,
    hidden_story_en: hiddenBodyEn,
    drip_img: dripImg,
    profile_img: profileImg,
    trailer_url: ytLink,
    x_url: xLink,
    x_post_url: xLink,
    tags: tags
  });
});

// Fazioni (Scansione dinamica delle cartelle in Fazioni/ + Fazioni canoniche da tag)
const factionsBase = path.join(repoContent, 'Fazioni');
const factionFolders = fs.existsSync(factionsBase)
  ? fs.readdirSync(factionsBase).filter(f => fs.statSync(path.join(factionsBase, f)).isDirectory())
  : [];
const factions = [];

factionFolders.forEach(fDirName => {
  const fPath = path.join(factionsBase, fDirName);
  const files = fs.readdirSync(fPath).filter(f => f.endsWith('.md'));
  if (files.length === 0) return;
  const mainFile = files.find(f => f.startsWith('ATOTS')) || files[0];
  const raw = fs.readFileSync(path.join(fPath, mainFile), 'utf8');
  let en = '';
  let it = '';
  if (raw.includes('###### Traduzione') || raw.includes('###### Traduzioni')) {
    const parts = raw.split(/###### Traduzion[ie]/i);
    en = parts[0].trim();
    it = (parts[1] || '').split(/###### (?:Immagini|Tags|Fonti)/i)[0].trim();
  } else {
    en = raw.trim();
    it = raw.trim();
  }

  let banner = '';
  const bannerFiles = [
    `_multimedia/Art Per Fazioni/${fDirName} Faction Art.jpg`,
    `_multimedia/Art Per Fazioni/${fDirName} Art.jpg`,
    `_multimedia/Art Per Fazioni/${fDirName.charAt(0).toUpperCase() + fDirName.slice(1).toLowerCase()} Art.jpg`
  ];
  for (const bf of bannerFiles) {
    if (fs.existsSync(path.join(SITE_DIR, bf))) {
      banner = bf;
      break;
    }
  }

  const tag = fDirName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const displayName = fDirName === 'RIVER CONSTABULARY' ? 'River Constabulary' : (fDirName === 'STATS' ? 'S.T.A.T.S.' : fDirName);
  const alias = fDirName === 'MISS' ? 'Maid Institute Society and Services'
              : (fDirName === 'UMI' ? 'United Mining Industry'
              : (fDirName === 'STATS' ? 'Surveillance, Tracking and Troubleshooting Services'
              : (fDirName === 'RIVER CONSTABULARY' ? 'Polizia Fluviale di Silvernia' : fDirName)));

  factions.push({
    name: displayName,
    alias: alias,
    desc_it: cleanObsidianProse(it),
    desc_en: cleanObsidianProse(en),
    banner: banner,
    tags: [tag]
  });
});

// Fazioni secondarie o derivate da tag/dizionario non ancora dotate di cartella dedicata
const virtualFactions = [
  {
    name: 'House Luna',
    alias: 'La Casata Reale di Silvernia',
    desc_it: 'Casata nobiliare e dinastia reale di Silvernia citata negli atti di Cynthia II e della Regina.',
    desc_en: 'Royal house of Silvernia referenced in Cynthia II and Queen lore.',
    banner: '',
    tags: ['houseluna', 'queen', 'royaltyandaristocracy']
  },
  {
    name: 'Crag Edgers',
    alias: 'Fazione Portuale di Middensea',
    desc_it: 'Organizzazione operante nel distretto di Middensea associata a Skink.',
    desc_en: 'Organization operating in Middensea harbor district associated with Skink.',
    banner: '',
    tags: ['cragedgers', 'middensea']
  },
  {
    name: 'Oz School of Metallurgy',
    alias: 'Accademia di Metallurgia',
    desc_it: (() => {
      const metPath = path.join(repoContent, 'Dizionario/Metallurgy.md');
      if (fs.existsSync(metPath)) {
        const raw = fs.readFileSync(metPath, 'utf8');
        const parts = raw.split(/###### Traduzion[ie]/i);
        if (parts[1]) return cleanObsidianProse(parts[1]);
      }
      return 'Accademia di Metallurgia citata negli atti di Tinsley e Cordelia.';
    })(),
    desc_en: 'Academy of Metallurgy referenced in Tinsley and Cordelia records.',
    banner: '',
    tags: ['ozschoolofmetallurgy']
  }
];

virtualFactions.forEach(vf => {
  if (!factions.find(f => f.name.toLowerCase() === vf.name.toLowerCase())) {
    factions.push(vf);
  }
});

// Dizionario
const lexicon = [];
const dizFiles = fs.readdirSync(path.join(repoContent, 'Dizionario'));
dizFiles.forEach(f => {
  const termName = f.replace('.md', '');
  const raw = fs.readFileSync(path.join(repoContent, 'Dizionario', f), 'utf8');
  let en = '';
  let it = '';
  if (raw.includes('###### Traduzione') || raw.includes('###### Traduzioni')) {
    const parts = raw.split(/###### Traduzion[ie]/i);
    en = parts[0].trim();
    it = parts[1].split(/######|\*Data/i)[0].trim();
  } else {
    en = raw.trim();
  }
  lexicon.push({
    term: termName,
    category: 'Terminologia & Concetti',
    def_it: cleanObsidianProse(it),
    def_en: cleanObsidianProse(en),
    source_file: 'Dizionario/' + f
  });
});

const mapsFootnotes = path.join(repoContent, 'Mappe/Footnotes');
fs.readdirSync(mapsFootnotes).forEach(f => {
  const termName = f.replace('.md', '');
  const raw = fs.readFileSync(path.join(mapsFootnotes, f), 'utf8');
  let en = '';
  let it = '';
  let img = '';
  const imgMatch = raw.match(/!\[\[(.*?)\]\]/);
  if (imgMatch) img = '_multimedia/Art Per Mappe/' + imgMatch[1];
  if (raw.includes('###### Traduzione') || raw.includes('###### Traduzioni')) {
    const parts = raw.split(/###### Traduzion[ie]/i);
    en = parts[0].trim();
    it = parts[1].split(/###### (?:Immagini|Tags)/i)[0].trim();
  } else {
    en = raw.trim();
  }
  lexicon.push({
    term: termName,
    category: 'Mappe & Ambientazione',
    def_it: cleanObsidianProse(it),
    def_en: cleanObsidianProse(en),
    image: img,
    source_file: 'Mappe/Footnotes/' + f
  });
});

const distrettiDir = path.join(repoContent, 'Mappe/Distretti ed Aree Menzionate');
fs.readdirSync(distrettiDir).forEach(f => {
  const termName = f.replace('.md', '');
  const raw = fs.readFileSync(path.join(distrettiDir, f), 'utf8');
  lexicon.push({
    term: termName,
    category: 'Distretti & Aree Notabili',
    def_it: cleanObsidianProse(raw) || 'Distretto censito negli atti ufficiali del database.',
    def_en: cleanObsidianProse(raw) || 'District registered in official database records.',
    source_file: 'Mappe/Distretti ed Aree Menzionate/' + f
  });
});

// Post Ufficiali
const dispatches = [];
let dispId = 1;
function parsePost(fullPath, relCategory) {
  const fileName = path.basename(fullPath, '.md');
  const raw = fs.readFileSync(fullPath, 'utf8');
  let en = '';
  let it = '';
  if (raw.includes('###### Traduzione') || raw.includes('###### Traduzioni')) {
    const parts = raw.split(/###### Traduzion[ie]/i);
    en = parts[0].trim();
    it = (parts[1] || '').split(/###### (?:Immagini|Immagine|Tags|Tag|Fonti)/i)[0].trim();
  } else {
    en = raw.trim();
  }
  let img = '';
  const imgMatch = raw.match(/!\[\[(.*?)\]\]/);
  if (imgMatch) {
    const imgName = imgMatch[1];
    if (fs.existsSync(path.join(SITE_DIR, '_multimedia/Art Per Eventi', imgName))) {
      img = '_multimedia/Art Per Eventi/' + imgName;
    } else if (fs.existsSync(path.join(SITE_DIR, '_multimedia/Art Per Festività', imgName))) {
      img = '_multimedia/Art Per Festività/' + imgName;
    } else if (fs.existsSync(path.join(SITE_DIR, '_multimedia/Personaggi/Official Art', imgName))) {
      img = '_multimedia/Personaggi/Official Art/' + imgName;
    }
  }
  const linkMatches = raw.match(/https?:\/\/[^\s\)\"\'>]+/g) || [];
  const yt = linkMatches.find(l => l.includes('youtube.com') || l.includes('youtu.be')) || '';
  const tags = [];
  const tagRegex = /#[a-zA-Z0-9_\-]+/g;
  let tm;
  while ((tm = tagRegex.exec(raw)) !== null) {
    const t = tm[0].replace('#', '').toLowerCase();
    if (!tags.includes(t)) tags.push(t);
  }
  dispatches.push({
    id: 'disp_' + (dispId++),
    title: fileName,
    type: relCategory,
    date: '2026',
    desc_en: cleanObsidianProse(en),
    desc_it: cleanObsidianProse(it),
    cover_img: img,
    link: yt || (linkMatches[0] || ''),
    tags: tags
  });
}

// Scansione ricorsiva di tutti i post/notizie/eventi in Post Ufficiali/
function scanPostsRecursively(dir, inheritedCategory = '') {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(item => {
    const fullPath = path.join(dir, item);
    if (fs.statSync(fullPath).isDirectory()) {
      let cat = item;
      if (item === 'Presentazione Gioco') cat = 'Trailer Ufficiale';
      else if (item === 'Annunci') cat = 'Annuncio Ufficiale';
      else if (item === 'Live Events') cat = 'Live Event Internazionale';
      else if (item === 'Characters Extra Stories') cat = 'Extra Lore Story';
      else if (item === 'Festività') cat = 'Evento Festività';
      scanPostsRecursively(fullPath, cat);
    } else if (item.endsWith('.md')) {
      parsePost(fullPath, inheritedCategory || 'Post Ufficiale');
    }
  });
}
scanPostsRecursively(path.join(repoContent, 'Post Ufficiali'));

// Scansione dinamica di tutti i trailer presenti nelle sottocartelle dei personaggi
charFolders.forEach(cName => {
  const cDir = path.join(charBase, cName);
  fs.readdirSync(cDir).forEach(sub => {
    const subPath = path.join(cDir, sub);
    if (fs.statSync(subPath).isDirectory() && sub.toLowerCase().includes('trailer')) {
      fs.readdirSync(subPath).forEach(f => {
        if (f.endsWith('.md')) parsePost(path.join(subPath, f), 'Character Trailer');
      });
    }
  });
});

// 3.5. Rilevamento contenuti non mappati (Alerts automatici per Catalyst)
log('Rilevamento file e sezioni non ancora mappate nel Vault...');
const alerts = [];

charFolders.forEach(name => {
  const cDir = path.join(charBase, name);
  const files = fs.readdirSync(cDir);
  const extraFiles = files.filter(f => {
    if (!f.endsWith('.md')) return false;
    const lower = f.toLowerCase();
    return !lower.includes('drip') && !lower.includes('hidden') && !lower.includes('trailer');
  });
  extraFiles.forEach(ef => {
    const rawContent = fs.readFileSync(path.join(cDir, ef), 'utf8');
    alerts.push({
      type: 'CHAR_EXTRA_DOC',
      title: `${name}: Nuovo file "${ef}"`,
      location: `Personaggi/${name}/${ef}`,
      character: name,
      file: ef,
      preview: cleanObsidianProse(rawContent).slice(0, 180) + '...'
    });
  });

  const dripFile = files.find(f => f.toLowerCase().includes('drip') && f.endsWith('.md'));
  const hiddenFile = files.find(f => f.toLowerCase().includes('hidden') && f.endsWith('.md'));
  [dripFile, hiddenFile].forEach(f => {
    if (!f) return;
    const raw = fs.readFileSync(path.join(cDir, f), 'utf8');
    const skillMatch = raw.match(/######\s*(?:Skill|Abilità|Kit|Combat|Arma|Armi|Talenti|Passive)[^\n]*/i);
    if (skillMatch) {
      alerts.push({
        type: 'CHAR_NEW_SECTION',
        title: `${name}: Nuova sezione "${skillMatch[0].replace('######', '').trim()}" in ${f}`,
        location: `Personaggi/${name}/${f}`,
        character: name,
        file: f,
        preview: `Rilevata intestazione "${skillMatch[0].trim()}" nel fascicolo del personaggio.`
      });
    }
  });
});

const knownRoots = ['Personaggi', 'Fazioni', 'Dizionario', 'Mappe', 'Post Ufficiali', '_Multimedia', '_multimedia', '!Indici', 'Template'];
const actualRoots = fs.readdirSync(repoContent).filter(f => fs.statSync(path.join(repoContent, f)).isDirectory());
actualRoots.forEach(rf => {
  if (!knownRoots.includes(rf)) {
    alerts.push({
      type: 'NEW_VAULT_SECTION',
      title: `Nuova cartella nel Vault: "${rf}"`,
      location: rf,
      preview: `La cartella "${rf}" è stata aggiunta alla radice di content/ nel Vault ma non ha ancora un layout dedicato sul sito.`
    });
  }
});

if (alerts.length > 0) {
  log(`[ATTENZIONE] Rilevati ${alerts.length} nuovi elementi non ancora mappati nel Vault:`);
  alerts.forEach(a => log(` - ${a.title} (${a.location})`));
  try {
    const notifyMsg = `Trovati ${alerts.length} nuovi file o sezioni non mappate (es: ${alerts[0].title}). Apri il sito per i dettagli!`;
    execSync(`powershell -ExecutionPolicy Bypass -File "${path.join(SITE_DIR, 'notify.ps1')}" -Title "Silverium DB - Nuovo Contenuto Vault" -Message "${notifyMsg}"`);
  } catch (err) {
    log(`Errore notifica Windows: ${err.message}`);
  }
} else {
  log('Nessun file o sezione non mappata. Struttura 100% allineata.');
}

// 4. Update index.html
log('Aggiornamento index.html...');
let html = fs.readFileSync(INDEX_HTML, 'utf8');

const casesStart = html.indexOf('const DEFAULT_CASES = [');
const sdbVersionStart = html.indexOf('// Auto-sync with SPVault DB Version');

if (casesStart !== -1 && sdbVersionStart !== -1) {
  const beforeCases = html.slice(0, casesStart);
  const afterLexicon = html.slice(sdbVersionStart);

  const newCasesBlock = 'const DEFAULT_CASES = ' + JSON.stringify(cases, null, 2) + ';\n\n    ';
  const newDispatchesBlock = 'const DEFAULT_DISPATCHES = ' + JSON.stringify(dispatches, null, 2) + ';\n\n    ';
  const newFactionsBlock = 'const DEFAULT_FACTIONS = ' + JSON.stringify(factions, null, 2) + ';\n\n    ';
  const newLexiconBlock = 'const DEFAULT_LEXICON = ' + JSON.stringify(lexicon, null, 2) + ';\n\n    ';
  const newAlertsBlock = '// Auto-sync with SPVault DB Alerts\n    const VAULT_ALERTS = ' + JSON.stringify(alerts, null, 2) + ';\n\n    ';

  const newTimestamp = Date.now();
  html = beforeCases + newCasesBlock + newDispatchesBlock + newFactionsBlock + newLexiconBlock + newAlertsBlock + afterLexicon;
  html = html.replace(/const SDB_VERSION = "[^"]+";/, `const SDB_VERSION = "spvault_sync_${newTimestamp}";`);
  fs.writeFileSync(INDEX_HTML, html, 'utf8');
  log(`index.html aggiornato con successo a versione spvault_sync_${newTimestamp}!`);
} else {
  log('ERRORE: marker non trovati in index.html');
}

// 5. Push automatico su GitHub Pages (se disponibile)
try {
  const remotes = execSync(`git -C "${SITE_DIR}" remote`, { encoding: 'utf8' }).trim();
  if (remotes.includes('origin')) {
    log('Controllo modifiche per GitHub Pages...');
    execSync(`git -C "${SITE_DIR}" add index.html _multimedia`, { encoding: 'utf8' });
    const diff = execSync(`git -C "${SITE_DIR}" status --porcelain`, { encoding: 'utf8' }).trim();
    if (diff) {
      log('Spinta aggiornamenti su GitHub Pages...');
      execSync(`git -C "${SITE_DIR}" commit -m "Auto-sync vault update [${new Date().toISOString()}]"`, { encoding: 'utf8' });
      execSync(`git -C "${SITE_DIR}" push origin main`, { encoding: 'utf8' });
      log('GitHub Pages aggiornato con successo!');
    } else {
      log('Nessuna modifica da caricare su GitHub (già allineato).');
    }
  }
} catch (e) {
  log(`Nota push GitHub: ${e.message}`);
}

log(`Riepilogo: ${cases.length} personaggi, ${factions.length} fazioni, ${lexicon.length} termini dizionario, ${dispatches.length} post.`);
log('=== COMPLETATO CON SUCCESSO ===');
