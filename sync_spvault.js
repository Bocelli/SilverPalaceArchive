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
  // Cut any trailing sections (Post, Video, Immagini, Tags, Fonti, Dettagli, Data di creazione)
  let t = text.replace(/(?:^|\n)(?:#{1,6}\s*)?(?:Post|Video|Immagin[ie].*|Media.*|Font[ie].*|Tag[s]?.*|Link[s]?.*|\*?Data di creazione:?.*)[\s\S]*$/gi, '');
  t = t.replace(/!\[.*?\]\(.*?\)/g, '');
  t = t.replace(/!\[\[.*?\]\]/g, '');
  t = t.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1');
  t = t.replace(/^#{1,6}\s+/gm, '');
  t = t.replace(/^#+\s*$/gm, '');
  t = t.replace(/==(.*?)==/g, '$1');
  t = t.replace(/\*\*(.*?)\*\*/g, '$1');
  t = t.replace(/\*(.*?)\*/g, '$1');
  t = t.replace(/#[a-zA-Z0-9_\-]+/g, '');
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  return t;
}

function parseBilingualMarkdown(raw) {
  if (!raw) return { en: '', it: '' };

  const splitRegex = /(?:^|\n)(?:#{1,6}\s*)?Traduzion[ie](?:\s+Italian[ae])?\s*(?:\n|$)/i;
  const match = raw.match(splitRegex);

  let en = '';
  let it = '';

  if (match) {
    en = raw.slice(0, match.index).trim();
    const after = raw.slice(match.index + match[0].length);
    const cutRegex = /(?:^|\n)(?:#{1,6}\s*)?(?:Post|Video|Immagin[ie].*|Media.*|Font[ie].*|Tag[s]?.*|Link[s]?.*|\*?Data di creazione:?.*)\s*(?:\n|$)/i;
    const cutMatch = after.match(cutRegex);
    if (cutMatch) {
      it = after.slice(0, cutMatch.index).trim();
    } else {
      it = after.trim();
    }
  } else {
    const cutRegex = /(?:^|\n)(?:#{1,6}\s*)?(?:Post|Video|Immagin[ie].*|Media.*|Font[ie].*|Tag[s]?.*|Link[s]?.*|\*?Data di creazione:?.*)\s*(?:\n|$)/i;
    const cutMatch = raw.match(cutRegex);
    if (cutMatch) {
      en = raw.slice(0, cutMatch.index).trim();
    } else {
      en = raw.trim();
    }
    it = '';
  }

  return {
    en: cleanObsidianProse(en),
    it: cleanObsidianProse(it)
  };
}

function extractQuote(text) {
  if (!text) return '';
  const m = text.match(/--\s*["«]([\s\S]*?)["»]\s*--/) || text.match(/["«]([\s\S]*?)["»]/);
  return m ? cleanObsidianProse(m[1].replace(/\n/g, ' ')) : '';
}

const ROLE_MAP = {
  'maid': 'Cameriera',
  'bartender': 'Barista',
  'secretary': 'Segretaria',
  'technician': 'Tecnico',
  'host': 'Host / Albergatrice',
  'doctor': 'Medico',
  'knight': 'Cavaliere',
  'journalist': 'Giornalista',
  'apprentice': 'Apprendista',
  'chief inspector': 'Ispettore Capo',
  'dancer': 'Ballerina',
  'superintendent': 'Sovrintendente',
  'messenger': 'Messaggera',
  'star student': 'Studentessa modello',
  'studentessa modello': 'Studentessa modello'
};

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

  const pDrip = parseBilingualMarkdown(dripRaw);
  const dripEn = pDrip.en;
  const dripIt = pDrip.it;

  const enLines = dripEn.split('\n').map(l => l.trim()).filter(Boolean);
  const itLines = dripIt.split('\n').map(l => l.trim()).filter(Boolean);
  let rawTitleEn = enLines[0] || name;
  let rawTitleIt = itLines[0] || name;

  let quoteEn = extractQuote(dripEn);
  let quoteIt = extractQuote(dripIt);

  let hiddenTitleEn = '';
  let hiddenTitleIt = '';
  let hiddenBodyEn = '';
  let hiddenBodyIt = '';

  if (hiddenRaw) {
    const pHidden = parseBilingualMarkdown(hiddenRaw);
    hiddenBodyEn = pHidden.en;
    hiddenBodyIt = pHidden.it;

    const hEnLines = hiddenBodyEn.split('\n').map(l => l.trim()).filter(Boolean);
    const hItLines = hiddenBodyIt.split('\n').map(l => l.trim()).filter(Boolean);
    hiddenTitleEn = cleanObsidianProse(hEnLines[0] || 'The Mystery').replace(/^#+\s*/, '');
    hiddenTitleIt = cleanObsidianProse(hItLines[0] || 'Il Mistero').replace(/^#+\s*/, '');
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

  // Extract hidden and official arts from disk
  const hiddenFilesDir = path.join(SITE_DIR, '_multimedia', 'Personaggi', 'Hidden Pages');
  const officialFilesDir = path.join(SITE_DIR, '_multimedia', 'Personaggi', 'Official Art');
  const cleanCharName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const baseCharName = cleanCharName.replace(/ii$/, '');

  const hiddenImgs = [];
  if (fs.existsSync(hiddenFilesDir)) {
    const hFiles = fs.readdirSync(hiddenFilesDir);
    hFiles.forEach(f => {
      const cf = f.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cf.includes(cleanCharName) || (baseCharName && cf.includes(baseCharName))) {
        hiddenImgs.push(`_multimedia/Personaggi/Hidden Pages/${f}`);
      }
    });
  }

  let officialArt = '';
  if (fs.existsSync(officialFilesDir)) {
    const oFiles = fs.readdirSync(officialFilesDir);
    const oMatch = oFiles.find(f => {
      const cf = f.toLowerCase().replace(/[^a-z0-9]/g, '');
      return cf.includes(cleanCharName) || (baseCharName && cf.includes(baseCharName));
    });
    if (oMatch) {
      officialArt = `_multimedia/Personaggi/Official Art/${oMatch}`;
    }
  }

  const links = [];
  const linkRegex = /https?:\/\/[^\s\)\">]+/g;
  let lm;
  while ((lm = linkRegex.exec(dripRaw + '\n' + hiddenRaw)) !== null) {
    if (!links.includes(lm[0])) links.push(lm[0]);
  }
  const ytLink = links.find(l => l.includes('youtube.com') || l.includes('youtu.be')) || '';
  const xLink = links.find(l => l.includes('x.com') || l.includes('twitter.com')) || '';

  // Determine role and clean titles
  let cleanTitleIt = cleanObsidianProse(rawTitleIt).replace(/^[—–-]+\s*/, '').replace(/\s*[—–-]+.*$/, '').trim();
  let cleanTitleEn = cleanObsidianProse(rawTitleEn).replace(/^[—–-]+\s*/, '').replace(/\s*[—–-]+.*$/, '').trim();

  const roleMatchIt = cleanTitleIt.match(/\((.*?)\)/);
  const roleMatchEn = cleanTitleEn.match(/\((.*?)\)/);

  let roleIt = '';
  if (roleMatchIt) {
    roleIt = roleMatchIt[1].trim();
  } else if (roleMatchEn) {
    const rawRole = roleMatchEn[1].trim().toLowerCase();
    roleIt = ROLE_MAP[rawRole] || roleMatchEn[1].trim();
  } else {
    roleIt = cleanTitleIt || name;
  }

  let title_it = cleanTitleIt;
  let title_en = cleanTitleEn;
  if (cleanTitleIt && !cleanTitleIt.includes(name) && !cleanTitleIt.includes(roleIt)) {
    title_it = `${name} (${roleIt})`;
  }

  cases.push({
    id: 'case_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
    name: name,
    faction: faction,
    role: roleIt,
    title_it: title_it,
    title_en: title_en,
    quote_it: quoteIt,
    quote_en: quoteEn,
    bio_it: dripIt,
    bio_en: dripEn,
    has_hidden: !!hiddenRaw,
    hidden_title_it: hiddenTitleIt,
    hidden_title_en: hiddenTitleEn,
    hidden_bio_it: hiddenBodyIt,
    hidden_bio_en: hiddenBodyEn,
    hidden_story_it: hiddenBodyIt,
    hidden_story_en: hiddenBodyEn,
    drip_img: dripImg,
    profile_img: profileImg,
    hidden_img: hiddenImgs[0] || '',
    hidden_imgs: hiddenImgs,
    official_art: officialArt,
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
  
  const pFac = parseBilingualMarkdown(raw);
  const en = pFac.en;
  const it = pFac.it || pFac.en;

  let banner = '';
  const artFazioniDir = path.join(SITE_DIR, '_multimedia', 'Art Per Fazioni');
  if (fs.existsSync(artFazioniDir)) {
    const diskFiles = fs.readdirSync(artFazioniDir);
    const cleanFName = fDirName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const match = diskFiles.find(file => {
      const lower = file.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
      return lower.includes(cleanFName);
    });
    if (match) {
      banner = `_multimedia/Art Per Fazioni/${match}`;
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
    desc_it: it,
    desc_en: en,
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
        const pMet = parseBilingualMarkdown(raw);
        if (pMet.it) return pMet.it;
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
  const pDiz = parseBilingualMarkdown(raw);
  lexicon.push({
    term: termName,
    category: 'Terminologia & Concetti',
    def_it: pDiz.it || pDiz.en,
    def_en: pDiz.en,
    source_file: 'Dizionario/' + f
  });
});

const mapsFootnotes = path.join(repoContent, 'Mappe/Footnotes');
fs.readdirSync(mapsFootnotes).forEach(f => {
  const termName = f.replace('.md', '');
  const raw = fs.readFileSync(path.join(mapsFootnotes, f), 'utf8');
  let img = '';
  const imgMatch = raw.match(/!\[\[(.*?)\]\]/);
  if (imgMatch) img = '_multimedia/Art Per Mappe/' + imgMatch[1];
  const pMap = parseBilingualMarkdown(raw);
  lexicon.push({
    term: termName,
    category: 'Mappe & Ambientazione',
    def_it: pMap.it || pMap.en,
    def_en: pMap.en,
    image: img,
    source_file: 'Mappe/Footnotes/' + f
  });
});

const distrettiDir = path.join(repoContent, 'Mappe/Distretti ed Aree Menzionate');
fs.readdirSync(distrettiDir).forEach(f => {
  const termName = f.replace('.md', '');
  const raw = fs.readFileSync(path.join(distrettiDir, f), 'utf8');
  const clean = cleanObsidianProse(raw);
  lexicon.push({
    term: termName,
    category: 'Distretti & Aree Notabili',
    def_it: clean || 'Distretto censito negli atti ufficiali del database.',
    def_en: clean || 'District registered in official database records.',
    source_file: 'Mappe/Distretti ed Aree Menzionate/' + f
  });
});

// Post Ufficiali
const dispatches = [];
let dispId = 1;
function parsePost(fullPath, relCategory) {
  const fileName = path.basename(fullPath, '.md');
  const raw = fs.readFileSync(fullPath, 'utf8');
  const pPost = parseBilingualMarkdown(raw);

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
  const linkMatches = raw.match(/https?:\/\/[^\s\)\">]+/g) || [];
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
    desc_en: pPost.en,
    desc_it: pPost.it || pPost.en,
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

// Scansione della cartella multimediale e trailer per Archivio Multimediale
function extractMultimedia(repoContent, siteDir) {
  const mmList = [];
  let idCounter = 1;
  const mmBase = path.join(siteDir, '_multimedia');

  function scanDir(dir, relCategory, labelIt, labelEn) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const f of files) {
      if (f.isDirectory()) continue;
      if (f.name === 'index.md' || f.name.startsWith('.')) continue;

      const ext = path.extname(f.name).toUpperCase().replace('.', '');
      const baseName = path.basename(f.name, path.extname(f.name));
      const relPath = path.relative(siteDir, path.join(dir, f.name)).replace(/\\/g, '/');

      const tags = [relCategory];
      baseName.toLowerCase().split(/[\s\-_]+/).forEach(w => {
        if (w.length > 2 && !tags.includes(w)) tags.push(w);
      });

      mmList.push({
        id: 'mm_' + (idCounter++),
        title: baseName,
        category: relCategory,
        category_label_it: labelIt,
        category_label_en: labelEn,
        type: 'image',
        src: relPath,
        format: ext,
        tags: tags
      });
    }
  }

  scanDir(path.join(mmBase, 'Art Per Eventi'), 'eventi', 'Art Eventi', 'Event Art');
  scanDir(path.join(mmBase, 'Art Per Festività'), 'festivita', 'Festività', 'Holiday Art');
  scanDir(path.join(mmBase, 'Art Per Fazioni'), 'fazioni_mappe', 'Fazioni & Mappe', 'Factions & Maps');
  scanDir(path.join(mmBase, 'Art Per Mappe'), 'fazioni_mappe', 'Fazioni & Mappe', 'Factions & Maps');
  scanDir(path.join(mmBase, 'Personaggi/Drip Marketing'), 'personaggi_drip', 'Drip Marketing', 'Drip Marketing');
  scanDir(path.join(mmBase, 'Personaggi/Profile Art'), 'personaggi_profile', 'Profile Art (Tarocchi)', 'Profile Art (Tarot)');
  scanDir(path.join(mmBase, 'Personaggi/Hidden Pages'), 'personaggi_hidden', 'Pagine Segrete', 'Hidden Pages Art');
  scanDir(path.join(mmBase, 'Personaggi/Official Art'), 'personaggi_official', 'Official Art Personaggi', 'Official Character Art');
  scanDir(path.join(mmBase, 'Web Event/Mystery Unveiled'), 'webevent', 'Web Event (Mystery Unveiled)', 'Web Event (Mystery Unveiled)');

  // Trailers da Post Ufficiali/Trailers/Presentazione Gioco
  const trailersDir = path.join(repoContent, 'Post Ufficiali/Trailers/Presentazione Gioco');
  if (fs.existsSync(trailersDir)) {
    const tFiles = fs.readdirSync(trailersDir);
    for (const tf of tFiles) {
      if (!tf.endsWith('.md')) continue;
      const raw = fs.readFileSync(path.join(trailersDir, tf), 'utf8');
      const baseName = path.basename(tf, '.md');
      const linkMatch = raw.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_\-]+)/);
      const ytId = linkMatch ? linkMatch[1] : '';
      const ytUrl = linkMatch ? linkMatch[0] : '';
      const tags = ['trailer', 'video', 'ufficiale'];

      mmList.push({
        id: 'mm_' + (idCounter++),
        title: baseName,
        category: 'trailers',
        category_label_it: 'Trailer & Video',
        category_label_en: 'Official Trailers',
        type: 'video',
        youtube_id: ytId,
        video_url: ytUrl,
        src: ytId ? `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg` : '',
        format: 'YouTube HD',
        tags: tags
      });
    }
  }

  return mmList;
}

const multimediaList = extractMultimedia(repoContent, SITE_DIR);
log(`Estratti ${multimediaList.length} asset multimediali.`);

// 4. Mappatura file o sezioni non ancora mappate (Alerts)
log('Rilevamento file e sezioni non ancora mappate nel Vault...');
const alerts = [];

charFolders.forEach(name => {
  const cDir = path.join(charBase, name);
  const files = fs.readdirSync(cDir);
  const extraFiles = files.filter(f => {
    if (!f.endsWith('.md')) return false;
    const lower = f.toLowerCase();
    return !lower.includes('drip') && !lower.includes('hidden');
  });

  extraFiles.forEach(ef => {
    const rawContent = fs.readFileSync(path.join(cDir, ef), 'utf8');
    alerts.push({
      type: 'Nuovo File Non Mappato',
      character: name,
      file: ef,
      title: `File non standard per ${name}: ${ef}`,
      desc: `Trovato file aggiuntivo '${ef}' nella cartella di ${name}. Verificare se integrarlo nel database.`,
      preview: rawContent.slice(0, 150).replace(/\n/g, ' ')
    });
  });

  const dripFile = files.find(f => f.toLowerCase().includes('drip') && f.endsWith('.md'));
  const hiddenFile = files.find(f => f.toLowerCase().includes('hidden') && f.endsWith('.md'));
  [dripFile, hiddenFile].filter(Boolean).forEach(f => {
    const raw = fs.readFileSync(path.join(cDir, f), 'utf8');
    const skillMatch = raw.match(/######\s*(?:Skill|Abilità|Kit|Combat|Arma|Armi|Talenti|Passive)[^\n]*/i);
    if (skillMatch) {
      alerts.push({
        type: 'Nuova Sezione Non Mappata',
        character: name,
        file: f,
        title: `Nuova sezione '${skillMatch[0].replace('######', '').trim()}' in ${f}`,
        desc: `Rilevata sezione di gioco/gameplay '${skillMatch[0]}' per ${name}. Richiede rework del template scheda.`,
        preview: skillMatch[0]
      });
    }
  });
});

const knownRoots = ['Personaggi', 'Fazioni', 'Dizionario', 'Mappe', 'Post Ufficiali', '_Multimedia', '_multimedia', '!Indici', 'Template'];
const actualRoots = fs.readdirSync(repoContent).filter(f => fs.statSync(path.join(repoContent, f)).isDirectory());
actualRoots.forEach(r => {
  if (!knownRoots.includes(r)) {
    alerts.push({
      type: 'Nuova Cartella Vault',
      character: 'Globale',
      file: r,
      title: `Nuova cartella principale nel Vault: ${r}`,
      desc: `La cartella '${r}' non fa parte delle cartelle canoniche censite. Richiede mappatura in sync_spvault.js.`,
      preview: `Cartella: content/${r}`
    });
  }
});

if (alerts.length > 0) {
  log(`RILEVATI ${alerts.length} ELEMENTI NON MAPPATI! Registrazione negli avvisi del sito...`);
} else {
  log('Nessun file o sezione non mappata. Struttura 100% allineata.');
}

// 5. Update index.html
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
  const newMultimediaBlock = 'const DEFAULT_MULTIMEDIA = ' + JSON.stringify(multimediaList, null, 2) + ';\n\n    ';
  const newAlertsBlock = '// Auto-sync with SPVault DB Alerts\n    const VAULT_ALERTS = ' + JSON.stringify(alerts, null, 2) + ';\n\n    ';

  const newTimestamp = Date.now();
  html = beforeCases + newCasesBlock + newDispatchesBlock + newFactionsBlock + newLexiconBlock + newMultimediaBlock + newAlertsBlock + afterLexicon;
  html = html.replace(/const SDB_VERSION = "[^"]+";/, `const SDB_VERSION = "spvault_sync_${newTimestamp}";`);
  fs.writeFileSync(INDEX_HTML, html, 'utf8');
  log(`index.html aggiornato con successo a versione spvault_sync_${newTimestamp}!`);
} else {
  log('ERRORE: marker non trovati in index.html');
}

// 6. Push automatico su GitHub Pages (se disponibile)
try {
  const remotes = execSync(`git -C "${SITE_DIR}" remote`, { encoding: 'utf8' }).trim();
  if (remotes.includes('origin')) {
    log('Controllo modifiche per GitHub Pages...');
    execSync(`git -C "${SITE_DIR}" add index.html _multimedia sync_spvault.js`, { encoding: 'utf8' });
    const diff = execSync(`git -C "${SITE_DIR}" status --porcelain`, { encoding: 'utf8' }).trim();
    if (diff) {
      log('Spinta aggiornamenti su GitHub Pages...');
      execSync(`git -C "${SITE_DIR}" commit -m "Auto-sync robust vault extraction [${new Date().toISOString()}]"`, { encoding: 'utf8' });
      execSync(`git -C "${SITE_DIR}" push origin main`, { encoding: 'utf8' });
      try {
        execSync(`git -C "${SITE_DIR}" push origin main:gh-pages`, { encoding: 'utf8' });
      } catch (eGh) {
        log(`Nota push gh-pages: ${eGh.message}`);
      }
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
