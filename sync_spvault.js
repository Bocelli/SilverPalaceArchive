/**
 * sync_spvault.js — SPVault (Obsidian) -> dati + index.html + status.html
 *
 * Regole:
 *  - il vault è l'unica fonte di verità: qui si legge e basta;
 *  - si valida prima di scrivere (se la validazione fallisce non si tocca nulla);
 *  - il push è manuale: questo script al massimo committa in locale;
 *  - tutto ciò che il sito non sa mostrare finisce in data/drift.json.
 *
 * Uso: node sync_spvault.js [--no-commit] [--no-pull] [--no-thumbs]
 */
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const SITE_DIR = __dirname;
const VAULT_REPO = process.env.SPVLT_VAULT || 'C:/Users/Irvine/.gemini/antigravity/scratch/spvault_repo';
const INDEX_HTML = path.join(SITE_DIR, 'index.html');
const STATUS_HTML = path.join(SITE_DIR, 'status.html');
const LOG_FILE = path.join(SITE_DIR, 'sync.log');
const DATA_DIR = path.join(SITE_DIR, 'data');

const ARGV = process.argv.slice(2);
const NO_COMMIT = ARGV.includes('--no-commit');
const NO_PULL = ARGV.includes('--no-pull');
const NO_THUMBS = ARGV.includes('--no-thumbs');

const MISSING = [];
const DRIFT = [];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n', 'utf8'); } catch (_) {}
}

function fail(msg) {
  log(`ERRORE: ${msg}`);
  log('=== INTERROTTO: nessun file è stato scritto ===');
  process.exit(1);
}

function drift(type, title, location, why, preview, extra) {
  DRIFT.push({ type, title, location: location || '', why: why || '', preview: (preview || '').slice(0, 240), ...(extra || {}) });
}

// ---------------------------------------------------------------- utils

/** JSON sicuro dentro <script>: niente </script> o commenti HTML che rompano il documento. */
function safeJson(value) {
  return JSON.stringify(value, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function frontmatterDate(raw) {
  const lines = String(raw || "").split(String.fromCharCode(10));
  if (lines[0].trim() !== "---") return "";
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "---") break;
    const lower = line.toLowerCase();
    for (const key of ["date:", "created:", "published:"]) {
      if (!lower.startsWith(key)) continue;
      const value = line.slice(key.length).trim().split(String.fromCharCode(39)).join("").split(String.fromCharCode(34)).join("");
      const iso = value.slice(0, 10);
      if (iso.length === 10 && iso[4] === "-" && iso[7] === "-" && !isNaN(Date.parse(iso))) return iso;
    }
  }
  return "";
}

function gitIsoDate(absPath) {
  const rel = path.relative(VAULT_REPO, absPath).replace(/\\/g, '/');
  try {
    const out = execSync(`git -C "${VAULT_REPO}" log -1 --format=%cs -- "${rel}"`, { encoding: 'utf8' }).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : '';
  } catch (_) {
    return '';
  }
}

function thumbPath(relSrc) {
  if (!relSrc) return '';
  const rel = relSrc.replace(/^_multimedia\//, '').replace(/\\/g, '/');
  return '_thumbs/' + rel.replace(/\.[^.]+$/, '.jpg');
}

function rel(p) {
  return path.relative(SITE_DIR, p).replace(/\\/g, '/');
}

// ---------------------------------------------------------------- markdown

const TRAILING_SECTION = /(?:^|\n)(?:#{1,6}\s*)?(?:Post|Video|Immagin[ie].*|Media.*|Font[ie].*|Tag[s]?.*|Link[s]?.*|\*?Data di creazione:?.*)\s*(?:\n|$)/i;

function cleanObsidianProse(text) {
  if (!text) return '';
  let t = text;
  t = t.replace(/!\[.*?\]\(.*?\)/g, '');
  t = t.replace(/!\[\[.*?\]\]/g, '');
  t = t.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1');
  t = t.replace(/^#{1,6}\s+/gm, '');
  t = t.replace(/^#+\s*$/gm, '');
  t = t.replace(/==(.*?)==/g, '$1');
  t = t.replace(/\*\*(.*?)\*\*/g, '$1');
  t = t.replace(/\*(.*?)\*/g, '$1');
  t = t.replace(/(^|\s)#[a-zA-Z0-9_-]+/g, '$1');
  t = t.replace(/[ \t]+$/gm, '');
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  return t;
}

function splitBilingual(raw) {
  if (!raw) return { en: '', it: '' };
  const split = raw.match(/(?:^|\n)(?:#{1,6}\s*)?Traduzion[ie](?:\s+Italian[ae])?\s*(?:\n|$)/i);
  let en = raw;
  let it = '';
  if (split) {
    en = raw.slice(0, split.index);
    const after = raw.slice(split.index + split[0].length);
    const cut = after.match(TRAILING_SECTION);
    it = cut ? after.slice(0, cut.index) : after;
  } else {
    const cut = en.match(TRAILING_SECTION);
    if (cut) en = en.slice(0, cut.index);
  }
  return { en: cleanObsidianProse(en), it: cleanObsidianProse(it) };
}

function extractQuote(text) {
  if (!text) return '';
  const m = text.match(/--\s*["«]([\s\S]*?)["»]\s*--/) || text.match(/["«]([\s\S]*?)["»]/);
  return m ? cleanObsidianProse(m[1].replace(/\n/g, ' ')) : '';
}

/** Toglie dal corpo titolo, sottotitolo, citazione già mostrata e nome ripetuto in coda. */
function cleanBio(text, title, name) {
  if (!text) return '';
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9à-ÿ]+/gi, ' ').trim();
  let lines = text.split('\n');
  const titleN = norm(title);
  const nameN = norm(name);

  while (lines.length && !lines[0].trim()) lines.shift();
  if (lines.length && titleN) {
    const first = norm(lines[0]);
    if (first === titleN || (nameN && first.startsWith(nameN) && first.length <= titleN.length + 6)) lines.shift();
  }

  // righe decorative tipo "—— Una storia tutta vostra ——"
  lines = lines.filter(l => !/^\s*[—–-]{2,}.*[—–-]{2,}\s*$/.test(l));

  // sottotitolo senza decorazioni ("Grandi aspettative", "L'Occhio di Argos")
  while (lines.length && !lines[0].trim()) lines.shift();
  const isSubtitle = (s) => {
    const v = s.trim();
    return v.length > 0 && v.length < 70 && !/[.!?:…]$/.test(v) && !/^["«'—–-]/.test(v);
  };
  if (lines.length > 1 && isSubtitle(lines[0])) {
    const rest = lines.slice(1).join('\n').trim();
    const words = lines[0].trim().split(/\s+/).length;
    if (/^(--|"|«|_)/.test(rest) || words <= 6) lines.shift();
  }

  let body = lines.join('\n').trim();
  // citazione già mostrata nel drawer: -- "…" --
  body = body.replace(/^(\s*)--\s*["«][\s\S]*?["»]\s*--\s*/i, '').trim();

  const tail = body.split('\n');
  while (tail.length > 1 && nameN && norm(tail[tail.length - 1]) === nameN) tail.pop();
  return tail.join('\n').trim();
}


// ---------------------------------------------------------------- mapping

const FACTION_TAGS = [
  ['miss', 'MISS'],
  ['riverconstabulary', 'River Constabulary'],
  ['stats', 'S.T.A.T.S.'],
  ['umi', 'UMI'],
  ['houseluna', 'House Luna'],
  ['queen', 'Casa Reale & Nobiltà'],
  ['royaltyandaristocracy', 'Casa Reale & Nobiltà'],
  ['cragedgers', 'Crag Edgers'],
  ['middensea', 'Crag Edgers'],
  ['huntersguild', "Hunter's Guild"],
  ['ozschoolofmetallurgy', 'Oz School of Metallurgy'],
  ['fableborn', 'Fableborn'],
  ['ivorytower', 'Ivory Tower']
];

const ROLE_MAP = {
  'maid': 'Cameriera', 'bartender': 'Barista', 'secretary': 'Segretaria', 'technician': 'Tecnico',
  'host': 'Host / Albergatrice', 'doctor': 'Medico', 'knight': 'Cavaliere', 'journalist': 'Giornalista',
  'apprentice': 'Apprendista', 'chief inspector': 'Ispettore Capo', 'dancer': 'Ballerina',
  'superintendent': 'Sovrintendente', 'messenger': 'Messaggera', 'star student': 'Studentessa modello',
  'studentessa modello': 'Studentessa modello'
};

const POST_CATEGORY = {
  'Presentazione Gioco': 'Trailer Ufficiale',
  'Trailer': 'Trailer Ufficiale',
  'Annunci': 'Annuncio Ufficiale',
  'Annuncio': 'Annuncio Ufficiale',
  'Live Events': 'Live Event Internazionale',
  'Characters Extra Stories': 'Extra Lore Story',
  'Festività': 'Evento Festività',
  'Festivita': 'Evento Festività',
  'Post Social': 'Post Social / X',
  'Stickers': 'Extra Multimediali',
  'Drip Marketing': 'Drip Marketing',
  'Extra Multimediali': 'Extra Multimediali',
  'Character Trailer': 'Character Trailer'
};

const FOLDER_LABELS = {
  'MISS': ['Maid Institute Society and Services', 'Maid Institute Society and Services'],
  'UMI': ['United Mining Industry', 'United Mining Industry'],
  'STATS': ['Surveillance, Tracking and Troubleshooting Services', 'Surveillance, Tracking and Troubleshooting Services'],
  'RIVER CONSTABULARY': ['Polizia Fluviale di Silvernia', 'River Constabulary']
};

// ---------------------------------------------------------------- run

log('=== INIZIO SYNC SPVAULT ===');
if (!fs.existsSync(VAULT_REPO)) fail(`vault non trovato: ${VAULT_REPO}`);

if (!NO_PULL) {
  try {
    const out = execSync(`git -C "${VAULT_REPO}" pull --ff-only`, { encoding: 'utf8' }).trim();
    log(`git pull: ${out.split('\n').pop() || 'ok'}`);
  } catch (e) {
    fail(`git pull fallito (${e.message.split('\n')[0]}). Vault non aggiornato: non sincronizzo dati potenzialmente vecchi. Usa --no-pull per forzare.`);
  }
}

// 1. multimedia
const mmSrc = path.join(VAULT_REPO, 'content/_Multimedia');
const mmDest = path.join(SITE_DIR, '_multimedia');
let copied = 0;
function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  fs.readdirSync(src).forEach(item => {
    const s = path.join(src, item);
    const d = path.join(dest, item);
    if (fs.statSync(s).isDirectory()) return copyRecursive(s, d);
    if (!fs.existsSync(d) || fs.statSync(s).size !== fs.statSync(d).size) {
      fs.copyFileSync(s, d);
      copied++;
    }
  });
}
copyRecursive(mmSrc, mmDest);
log(`Asset copiati: ${copied}`);

const repoContent = path.join(VAULT_REPO, 'content');
const charBase = path.join(repoContent, 'Personaggi');

// 2. personaggi
const charFolders = fs.existsSync(charBase)
  ? fs.readdirSync(charBase).filter(f => fs.statSync(path.join(charBase, f)).isDirectory())
  : [];
if (charFolders.length === 0) fail('nessuna cartella in content/Personaggi');

const cases = [];
charFolders.forEach(name => {
  const cDir = path.join(charBase, name);
  const files = fs.readdirSync(cDir);
  const dripFile = files.find(f => f.toLowerCase().includes('drip') && f.endsWith('.md'));
  const hiddenFile = files.find(f => f.toLowerCase().includes('hidden') && f.endsWith('.md'));

  if (!dripFile) {
    drift('file-non-mappato', `${name}: manca il file Drip Marketing`, `content/Personaggi/${name}`, 'Senza `<Nome> Drip Marketing.md` il personaggio non entra nel database.', files.join(', '));
    return;
  }

  const dripRaw = fs.readFileSync(path.join(cDir, dripFile), 'utf8');
  const hiddenRaw = hiddenFile ? fs.readFileSync(path.join(cDir, hiddenFile), 'utf8') : '';
  const drip = splitBilingual(dripRaw);
  const hidden = hiddenRaw ? splitBilingual(hiddenRaw) : { en: '', it: '' };

  const enLines = drip.en.split('\n').map(l => l.trim()).filter(Boolean);
  const itLines = drip.it.split('\n').map(l => l.trim()).filter(Boolean);
  const rawTitleEn = enLines[0] || name;
  const rawTitleIt = itLines[0] || name;

  const quoteEn = extractQuote(drip.en);
  const quoteIt = extractQuote(drip.it);

  const hiddenTitleEn = (hidden.en.split('\n').map(l => l.trim()).filter(Boolean)[0] || '').replace(/^#+\s*/, '');
  const hiddenTitleIt = (hidden.it.split('\n').map(l => l.trim()).filter(Boolean)[0] || '').replace(/^#+\s*/, '');

  // tags
  const tags = [];
  const tagRegex = /(^|\s)#([a-zA-Z0-9_-]+)/g;
  let tm;
  const tagSource = dripRaw + '\n' + hiddenRaw;
  while ((tm = tagRegex.exec(tagSource)) !== null) {
    const t = tm[2].toLowerCase();
    if (!tags.includes(t)) tags.push(t);
  }

  let faction = 'Indipendente';
  for (const [tag, factionName] of FACTION_TAGS) {
    if (tags.includes(tag)) { faction = factionName; break; }
  }
  if (faction === 'Indipendente') {
    drift('fazione-da-classificare', `${name}: nessun tag di fazione riconosciuto`, `content/Personaggi/${name}/${dripFile}`,
      `Tag presenti: ${tags.join(', ') || 'nessuno'}. Aggiungi il tag canonico o una riga in FACTION_TAGS.`, dripRaw.slice(0, 160));
  }

  // immagini: embed espliciti, poi fallback su disco
  const dripEmbed = dripRaw.match(/!\[\[([^|\]]*?Drip Marketing[^|\]]*?\.[a-zA-Z0-9]+)(?:\|.*?)?\]\]/i);
  const profileEmbed = (dripRaw + '\n' + hiddenRaw).match(/!\[\[([^|\]]*?Profile Art[^|\]]*?\.[a-zA-Z0-9]+)(?:\|.*?)?\]\]/i);

  let dripImg = dripEmbed ? `_multimedia/Personaggi/Drip Marketing/${dripEmbed[1].trim()}` : `_multimedia/Personaggi/Drip Marketing/${name} Drip Marketing.jpg`;
  let profileImg = profileEmbed ? `_multimedia/Personaggi/Profile Art/${profileEmbed[1].trim()}` : `_multimedia/Personaggi/Profile Art/${name} Profile Art.jpg`;
  const rawDripPath = dripEmbed ? path.join(SITE_DIR, '_multimedia', 'Personaggi', 'Drip Marketing', dripEmbed[1].trim()) : path.join(SITE_DIR, '_multimedia', 'Personaggi', 'Drip Marketing', `${name} Drip Marketing.jpg`);
  const rawProfilePath = profileEmbed ? path.join(SITE_DIR, '_multimedia', 'Personaggi', 'Profile Art', profileEmbed[1].trim()) : path.join(SITE_DIR, '_multimedia', 'Personaggi', 'Profile Art', `${name} Profile Art.jpg`);

  if (!fs.existsSync(rawDripPath)) {
    if (fs.existsSync(rawProfilePath)) dripImg = profileImg;
    else drift('immagine-mancante', `${name}: manca il Drip Marketing`, `content/Personaggi/${name}`, 'Embed `![[… Drip Marketing.jpg]]` assente e nessun file su disco: la card resterà vuota.', dripEmbed ? dripEmbed[1] : `${name} Drip Marketing.jpg`);
  }
  if (!fs.existsSync(rawProfilePath)) {
    drift('immagine-mancante', `${name}: manca la Profile Art`, `content/Personaggi/${name}`, 'La card usa il fallback Drip Marketing; il tarocco 1:2 non è disponibile.', `${name} Profile Art.jpg`);
  }

  // hidden / official art
  const cleanCharName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const baseCharName = cleanCharName.replace(/ii$/, '');
  const hiddenImgs = [];
  const hiddenDir = path.join(SITE_DIR, '_multimedia', 'Personaggi', 'Hidden Pages');
  if (fs.existsSync(hiddenDir)) {
    fs.readdirSync(hiddenDir).forEach(f => {
      const cf = f.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cf.includes(cleanCharName) || (baseCharName && cf.includes(baseCharName))) hiddenImgs.push(`_multimedia/Personaggi/Hidden Pages/${f}`);
    });
  }
  // le pagine "Acquaintance Intel" hanno una loro art, distinta dalle Pagine Nascoste
  const intelImgs = [];
  const intelDir = path.join(SITE_DIR, '_multimedia', 'Personaggi', 'Acquaintance Intel');
  if (fs.existsSync(intelDir)) {
    fs.readdirSync(intelDir).forEach(f => {
      const cf = f.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cf.includes(cleanCharName) || (baseCharName && cf.includes(baseCharName))) intelImgs.push(`_multimedia/Personaggi/Acquaintance Intel/${f}`);
    });
  }
  let officialArt = '';
  const officialDir = path.join(SITE_DIR, '_multimedia', 'Personaggi', 'Official Art');
  if (fs.existsSync(officialDir)) {
    const match = fs.readdirSync(officialDir).find(f => {
      const cf = f.toLowerCase().replace(/[^a-z0-9]/g, '');
      return cf.includes(cleanCharName) || (baseCharName && cf.includes(baseCharName));
    });
    if (match) officialArt = `_multimedia/Personaggi/Official Art/${match}`;
  }

  // link
  const links = [];
  const linkRegex = /https?:\/\/[^\s)"'>]+/g;
  let lm;
  while ((lm = linkRegex.exec(tagSource)) !== null) if (!links.includes(lm[0])) links.push(lm[0]);
  const ytLink = links.find(l => l.includes('youtube.com') || l.includes('youtu.be')) || '';
  const xLink = links.find(l => l.includes('x.com') || l.includes('twitter.com')) || '';

  // titolo e ruolo
  const stripEdges = (s) => s.replace(/^[—–-]+\s*/, '').replace(/\s*[—–-]+.*$/, '').trim();
  const titleItFull = stripEdges(rawTitleIt);
  const titleEnFull = stripEdges(rawTitleEn);
  const roleMatchIt = titleItFull.match(/\((.*?)\)/);
  const roleMatchEn = titleEnFull.match(/\((.*?)\)/);
  let role = '';
  if (roleMatchIt) role = roleMatchIt[1].trim();
  else if (roleMatchEn) role = ROLE_MAP[roleMatchEn[1].trim().toLowerCase()] || roleMatchEn[1].trim();
  else role = titleItFull || name;


  cases.push({
    id: 'case_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
    name,
    faction,
    role,
    title_it: (titleItFull && !titleItFull.includes(name)) ? `${name} (${role})` : (titleItFull || `${name} (${role})`),
    title_en: titleEnFull || titleItFull || name,
    quote_it: quoteIt,
    quote_en: quoteEn,
    bio_it: cleanBio(drip.it, rawTitleIt, name),
    bio_en: cleanBio(drip.en, rawTitleEn, name),
    has_hidden: !!hiddenRaw,
    hidden_title_it: hiddenTitleIt,
    hidden_title_en: hiddenTitleEn,
    hidden_bio_it: cleanBio(hidden.it, hiddenTitleIt, name),
    hidden_bio_en: cleanBio(hidden.en, hiddenTitleEn, name),
    hidden_story_it: cleanBio(hidden.it, hiddenTitleIt, name),
    hidden_story_en: cleanBio(hidden.en, hiddenTitleEn, name),
    drip_img: dripImg,
    profile_img: profileImg,
    thumb: thumbPath(profileImg || dripImg),
    thumb_hidden: hiddenImgs[0] ? thumbPath(hiddenImgs[0]) : '',
    thumb_official: officialArt ? thumbPath(officialArt) : '',
    hidden_img: hiddenImgs[0] || '',
    hidden_imgs: hiddenImgs,
    intel_img: intelImgs[0] || '',
    intel_imgs: intelImgs,
    official_art: officialArt,
    trailer_url: ytLink,
    x_url: xLink,
    x_post_url: xLink,
    tags
  });
});

// 3. fazioni
const factionsBase = path.join(repoContent, 'Fazioni');
const factionFolders = fs.existsSync(factionsBase)
  ? fs.readdirSync(factionsBase).filter(f => fs.statSync(path.join(factionsBase, f)).isDirectory())
  : [];
const factions = [];

factionFolders.forEach(fDirName => {
  const fPath = path.join(factionsBase, fDirName);
  const files = fs.readdirSync(fPath).filter(f => f.endsWith('.md'));
  if (files.length === 0) {
    drift('file-non-mappato', `Fazione vuota: ${fDirName}`, `content/Fazioni/${fDirName}`, 'Nessun .md nella cartella: la fazione non ha descrizione.', '');
    return;
  }
  const mainFile = files.find(f => f.startsWith('ATOTS')) || files[0];
  const raw = fs.readFileSync(path.join(fPath, mainFile), 'utf8');
  const p = splitBilingual(raw);
  const en = p.en;
  const it = p.it || p.en;

  let banner = '';
  const artDir = path.join(SITE_DIR, '_multimedia', 'Art Per Fazioni');
  if (fs.existsSync(artDir)) {
    const cleanFName = fDirName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const match = fs.readdirSync(artDir).find(file => file.toLowerCase().replace(/[^a-zA-Z0-9]/g, '').includes(cleanFName));
    if (match) banner = `_multimedia/Art Per Fazioni/${match}`;
  }

  // il vault nuovo nomina le cartelle in maiuscolo: qui si riportano ai nomi canonici dei tag
  const cleanDir = fDirName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const folderTag = FACTION_TAGS.find(([t]) => t === cleanDir || cleanDir.startsWith(t) || t.startsWith(cleanDir));
  const display = folderTag ? folderTag[1] : fDirName;
  const labels = FOLDER_LABELS[fDirName];

  factions.push({
    name: display,
    alias: labels ? labels[0] : fDirName,
    desc_it: it,
    desc_en: en,
    banner,
    thumb: banner ? thumbPath(banner) : '',
    tags: [fDirName.toLowerCase().replace(/[^a-z0-9]/g, '')]
  });
});

// fazioni derivate dai tag (senza cartella nel vault)
const derived = [];
const pushDerived = (name, alias, it, en, tags) => {
  if (factions.some(f => f.name.toLowerCase() === name.toLowerCase()) || derived.some(f => f.name === name)) return;
  derived.push({ name, alias, desc_it: it, desc_en: en, banner: '', thumb: '', tags, derived: true });
};
pushDerived('Casa Reale & Nobiltà', 'La Corona di Silvernia', 'Casa reale e aristocrazia di Silvernia.', 'Royal house and aristocracy of Silvernia.', ['queen', 'royaltyandaristocracy']);
pushDerived('House Luna', 'La Casata Reale di Silvernia', 'Casata nobiliare e dinastia reale di Silvernia.', 'Royal house of Silvernia.', ['houseluna']);
pushDerived('Crag Edgers', 'Fazione Portuale di Middensea', 'Organizzazione portuale del distretto di Middensea.', 'Harbor organization of the Middensea district.', ['cragedgers', 'middensea']);
pushDerived('Fableborn', 'Popolo delle Favole', 'Fazione citata negli atti dei personaggi Fableborn.', 'Faction referenced in Fableborn character records.', ['fableborn']);
pushDerived('Ivory Tower', 'La Torre d’Avorio', 'Accademia e circolo di studiosi di Silvernia.', 'Academy and scholars circle of Silvernia.', ['ivorytower']);
pushDerived('Oz School of Metallurgy', 'Accademia di Metallurgia', 'Accademia di metallurgia citata negli atti di Tinsley e Cordelia.', 'Academy of Metallurgy referenced in Tinsley and Cordelia records.', ['ozschoolofmetallurgy']);

const allFactions = factions.concat(derived);
const knownFactionNames = new Set(allFactions.map(f => f.name.toLowerCase()));
cases.forEach(c => {
  if (!knownFactionNames.has(c.faction.toLowerCase())) {
    drift('fazione-da-classificare', `${c.name}: fazione "${c.faction}" senza scheda`, `content/Personaggi/${c.name}`, 'La fazione compare nel roster ma non tra le fazioni censite (o derivate).', c.tags.join(', '));
  }
});

// tag "di fazione" usati da più personaggi ma non mappati
const tagUsage = {};
cases.forEach(c => (c.tags || []).forEach(t => { tagUsage[t] = (tagUsage[t] || 0) + 1; }));
const mappedTags = new Set(FACTION_TAGS.map(([t]) => t));
Object.entries(tagUsage).forEach(([tag, count]) => {
  if (count >= 2 && !mappedTags.has(tag) && !tag.includes(' ') && tag.length > 4) {
    const suspicious = /(society|guild|house|order|school|constabulary|agency|club|association|council|institute|academy|royal|noble|clan|crew|family)/i.test(tag);
    if (suspicious) drift('tag-fazione-non-mappato', `Tag di fazione non mappato: #${tag}`, 'content/Personaggi/*', `Usato da ${count} personaggi ma non presente in FACTION_TAGS: la fazione non esiste nel sito.`, tag);
  }
});

// 4. lessico
const lexicon = [];
const dizDir = path.join(repoContent, 'Dizionario');
if (fs.existsSync(dizDir)) {
  fs.readdirSync(dizDir).filter(f => f.endsWith('.md')).forEach(f => {
    const raw = fs.readFileSync(path.join(dizDir, f), 'utf8');
    const p = splitBilingual(raw);
    lexicon.push({
      term: f.replace('.md', ''),
      category: 'Terminologia & Concetti',
      def_it: p.it || p.en,
      def_en: p.en,
      date: gitIsoDate(path.join(dizDir, f)),
      source_file: 'Dizionario/' + f
    });
  });
}

const mapsFootnotes = path.join(repoContent, 'Mappe/Footnotes');
if (fs.existsSync(mapsFootnotes)) {
  fs.readdirSync(mapsFootnotes).filter(f => f.endsWith('.md')).forEach(f => {
    const raw = fs.readFileSync(path.join(mapsFootnotes, f), 'utf8');
    const imgMatch = raw.match(/!\[\[(.*?)\]\]/);
    const img = imgMatch ? '_multimedia/Art Per Mappe/' + imgMatch[1] : '';
    if (img && !fs.existsSync(path.join(SITE_DIR, img))) {
      drift('immagine-mancante', `Mappa ${f.replace('.md', '')}: art assente`, `content/Mappe/Footnotes/${f}`, 'Embed `![[…]]` presente ma il file non è in `_Multimedia/Art Per Mappe`.', imgMatch ? imgMatch[1] : '');
    }
    const p = splitBilingual(raw);
    lexicon.push({
      term: f.replace('.md', ''),
      category: 'Mappe & Ambientazione',
      def_it: p.it || p.en,
      def_en: p.en,
      image: img,
      thumb: img ? thumbPath(img) : '',
      source_file: 'Mappe/Footnotes/' + f
    });
  });
}

const distrettiDir = path.join(repoContent, 'Mappe/Distretti ed Aree Menzionate');
function districtFiles(dir) {
  const out = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...districtFiles(full));
    else if (e.name.endsWith('.md')) out.push(full);
  });
  return out;
}
if (fs.existsSync(distrettiDir)) {
  // il vault nuovo raccoglie i distretti in sottocartelle (Middensea, Silvernia)
  districtFiles(distrettiDir).forEach(full => {
    const raw = fs.readFileSync(full, 'utf8');
    const clean = cleanObsidianProse(raw);
    lexicon.push({
      term: path.basename(full, '.md'),
      category: 'Distretti & Aree Notabili',
      def_it: clean || 'Distretto censito negli atti ufficiali del database.',
      def_en: clean || 'District registered in official database records.',
      source_file: path.relative(repoContent, full).replace(/\\/g, '/')
    });
  });
}

// 5. dispatch
const dispatches = [];
let dispId = 1;

function categoryFor(folder) {
  if (!folder) return 'Post Ufficiale';
  if (POST_CATEGORY[folder]) return POST_CATEGORY[folder];
  const lower = folder.toLowerCase();
  const hit = Object.keys(POST_CATEGORY).find(k => k.toLowerCase() === lower);
  if (hit) return POST_CATEGORY[hit];
  drift('categoria-post-nuova', `Nuova categoria di post: ${folder}`, 'content/Post Ufficiali/' + folder, `La cartella non è in POST_CATEGORY: il post usa il nome cartella "${folder}" come tipo e il filtro Timeline non lo conosce.`, folder);
  return folder;
}

function parsePost(fullPath, folder) {
  const fileName = path.basename(fullPath, '.md');
  const raw = fs.readFileSync(fullPath, 'utf8');
  const p = splitBilingual(raw);

  let img = '';
  const imgMatch = raw.match(/!\[\[(.*?)\]\]/);
  if (imgMatch) {
    const imgName = imgMatch[1];
    const candidates = [
      '_multimedia/Art Per Eventi/' + imgName,
      '_multimedia/Art Per Festività/' + imgName,
      '_multimedia/Personaggi/Official Art/' + imgName,
      '_multimedia/Web Event/Mystery Unveiled/' + imgName,
      '_multimedia/Art Per Fazioni/' + imgName
    ];
    img = candidates.find(c => fs.existsSync(path.join(SITE_DIR, c))) || '';
    if (!img) {
      drift('immagine-mancante', `${fileName}: copertina non trovata`, rel(fullPath), 'Embed `![[…]]` presente ma il file non esiste in nessuna cartella indicizzata.', imgName);
    }
  }

  const links = raw.match(/https?:\/\/[^\s)"'>]+/g) || [];
  const yt = links.find(l => l.includes('youtube.com') || l.includes('youtu.be')) || '';
  const tags = [];
  const tagRegex = /(^|\s)#([a-zA-Z0-9_-]+)/g;
  let tm;
  while ((tm = tagRegex.exec(raw)) !== null) {
    const t = tm[2].toLowerCase();
    if (!tags.includes(t)) tags.push(t);
  }

  dispatches.push({
    id: 'disp_' + (dispId++),
    title: fileName,
    type: categoryFor(folder),
    date: frontmatterDate(raw) || gitIsoDate(fullPath),
    desc_en: p.en,
    desc_it: p.it || p.en,
    cover_img: img,
    thumb: img ? thumbPath(img) : '',
    link: yt || (links[0] || ''),
    tags
  });
}

function scanPosts(dir, folder) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(item => {
    const full = path.join(dir, item);
    if (fs.statSync(full).isDirectory()) return scanPosts(full, item);
    if (item.endsWith('.md')) parsePost(full, folder);
  });
}
scanPosts(path.join(repoContent, 'Post Ufficiali'), '');

// trailer nelle cartelle personaggio
charFolders.forEach(cName => {
  const cDir = path.join(charBase, cName);
  fs.readdirSync(cDir).forEach(sub => {
    const subPath = path.join(cDir, sub);
    if (fs.statSync(subPath).isDirectory() && sub.toLowerCase().includes('trailer')) {
      fs.readdirSync(subPath).filter(f => f.endsWith('.md')).forEach(f => parsePost(path.join(subPath, f), 'Character Trailer'));
    }
  });
});

// ordinamento cronologico reale (il più recente in alto)
dispatches.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.id.localeCompare(b.id));

// 6. multimedia
const multimedia = [];
let mmId = 1;
const KNOWN_MM_DIRS = new Set([
  'Art Per Eventi', 'Art Per Festività', 'Art Per Fazioni', 'Art Per Mappe',
  'Personaggi/Drip Marketing', 'Personaggi/Profile Art', 'Personaggi/Hidden Pages',
  'Personaggi/Official Art', 'Personaggi/Acquaintance Intel', 'Personaggi/Transparent Art',
  'Web Event/Mystery Unveiled', 'Personaggi', 'Web Event'
]);

function scanMediaDir(dir, category, labelIt, labelEn) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(f => {
    if (f.isDirectory()) return;
    if (f.name === 'index.md' || f.name.startsWith('.')) return;
    const ext = path.extname(f.name).toUpperCase().replace('.', '');
    const baseName = path.basename(f.name, path.extname(f.name));
    const src = rel(path.join(dir, f.name));
    const tags = [category];
    baseName.toLowerCase().split(/[\s\-_]+/).forEach(w => { if (w.length > 2 && !tags.includes(w)) tags.push(w); });
    multimedia.push({
      id: 'mm_' + (mmId++),
      title: baseName,
      category,
      category_label_it: labelIt,
      category_label_en: labelEn,
      type: 'image',
      src,
      thumb: thumbPath(src),
      format: ext,
      tags
    });
  });
}

scanMediaDir(path.join(SITE_DIR, '_multimedia/Art Per Eventi'), 'eventi', 'Art Eventi', 'Event Art');
scanMediaDir(path.join(SITE_DIR, '_multimedia/Art Per Festività'), 'festivita', 'Festività', 'Holiday Art');
scanMediaDir(path.join(SITE_DIR, '_multimedia/Art Per Fazioni'), 'fazioni_mappe', 'Fazioni & Mappe', 'Factions & Maps');
scanMediaDir(path.join(SITE_DIR, '_multimedia/Art Per Mappe'), 'fazioni_mappe', 'Fazioni & Mappe', 'Factions & Maps');
scanMediaDir(path.join(SITE_DIR, '_multimedia/Personaggi/Drip Marketing'), 'personaggi_drip', 'Drip Marketing', 'Drip Marketing');
scanMediaDir(path.join(SITE_DIR, '_multimedia/Personaggi/Profile Art'), 'personaggi_profile', 'Profile Art (Tarocchi)', 'Profile Art (Tarot)');
scanMediaDir(path.join(SITE_DIR, '_multimedia/Personaggi/Hidden Pages'), 'personaggi_hidden', 'Pagine Segrete', 'Hidden Pages Art');
scanMediaDir(path.join(SITE_DIR, '_multimedia/Personaggi/Official Art'), 'personaggi_official', 'Official Art Personaggi', 'Official Character Art');
scanMediaDir(path.join(SITE_DIR, '_multimedia/Personaggi/Acquaintance Intel'), 'personaggi_intel', 'Acquaintance Intel', 'Acquaintance Intel');
scanMediaDir(path.join(SITE_DIR, '_multimedia/Web Event/Mystery Unveiled'), 'webevent', 'Web Event (Mystery Unveiled)', 'Web Event (Mystery Unveiled)');

// trailer come asset video
const trailersDir = path.join(repoContent, 'Post Ufficiali/Trailers/Presentazione Gioco');
if (fs.existsSync(trailersDir)) {
  fs.readdirSync(trailersDir).filter(f => f.endsWith('.md')).forEach(tf => {
    const raw = fs.readFileSync(path.join(trailersDir, tf), 'utf8');
    const m = raw.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    const ytId = m ? m[1] : '';
    if (!ytId) return;
    multimedia.push({
      id: 'mm_' + (mmId++),
      title: path.basename(tf, '.md'),
      category: 'trailers',
      category_label_it: 'Trailer & Video',
      category_label_en: 'Official Trailers',
      type: 'video',
      youtube_id: ytId,
      video_url: m[0],
      src: `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`,
      thumb: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
      format: 'YouTube HD',
      tags: ['trailer', 'video', 'ufficiale']
    });
  });
}

// 7. drift strutturale
// 'Note Recenti' e 'Tag' sono indici generati dagli script del vault, non contenuto
const knownRoots = new Set(['Personaggi', 'Fazioni', 'Dizionario', 'Mappe', 'Post Ufficiali', '_Multimedia', '!Indici', 'Template', 'Note Recenti', 'Tag']);
fs.readdirSync(repoContent).filter(f => fs.statSync(path.join(repoContent, f)).isDirectory()).forEach(r => {
  if (!knownRoots.has(r)) drift('cartella-vault', `Nuova cartella nel vault: ${r}`, `content/${r}`, 'Non è mappata in sync_spvault.js: il contenuto non arriverà nel sito.', '');
});

const knownSections = new Set(['traduzione', 'traduzioni', 'immagini', 'immagine', 'tags', 'tag', 'post', 'video', 'media', 'fonti', 'link', 'data di creazione']);
// "Immagini e Link", "Immagini & Link", "Immagini/Link": ogni parte deve essere nota.
// L'estrazione asset non dipende dal titolo (va per nome file), qui conta solo il rumore nel drift.
function isKnownSection(heading) {
  const parts = heading.toLowerCase().replace(/\s+/g, ' ').trim()
    .split(/\s+(?:e|and|&|\/)\s+|\s*[\/&]\s*/)
    .map(p => p.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every(p => knownSections.has(p));
}
function scanHeadings(file) {
  const raw = fs.readFileSync(file, 'utf8');
  if (/^---\n/.test(raw)) drift('frontmatter-ignorato', `Frontmatter in ${path.basename(file)}`, rel(file), 'Del frontmatter il parser legge solo `date:` (fallback: data del commit). Gli altri campi vanno aggiunti a DATA-CONTRACT.md prima di usarli in UI.', raw.slice(0, 120));
  const hs = raw.match(/^######\s*(.+)$/gm) || [];
  hs.map(h => h.replace(/^######\s*/, '').trim()).forEach(h => {
    if (!isKnownSection(h)) {
      drift('sezione-non-mappata', `Sezione "${h}" in ${path.basename(path.dirname(file))}/${path.basename(file)}`, rel(file), 'Questa sezione del vault non ha una UI dedicata: va aggiunta una tab o mappata.', h);
    }
  });
}
charFolders.forEach(name => {
  const cDir = path.join(charBase, name);
  fs.readdirSync(cDir).filter(f => f.endsWith('.md')).forEach(f => scanHeadings(path.join(cDir, f)));
});

fs.readdirSync(mmDest, { withFileTypes: true }).forEach(d => {
  if (d.isDirectory() && !KNOWN_MM_DIRS.has(d.name)) drift('categoria-asset-nuova', `Nuova categoria di asset: ${d.name}`, `_multimedia/${d.name}`, 'La cartella non è indicizzata in extractMultimedia: le immagini non compaiono in archivio.', '');
});
const personaggiMm = path.join(mmDest, 'Personaggi');
if (fs.existsSync(personaggiMm)) {
  fs.readdirSync(personaggiMm, { withFileTypes: true }).forEach(d => {
    if (d.isDirectory() && !KNOWN_MM_DIRS.has('Personaggi/' + d.name)) drift('categoria-asset-nuova', `Nuova categoria di asset: Personaggi/${d.name}`, `_multimedia/Personaggi/${d.name}`, 'Sottocartella non indicizzata: le immagini non compaiono in archivio.', '');
  });
}

// 8. validazione (bloccante)
function validate() {
  const problems = [];
  if (cases.length === 0) problems.push('nessun personaggio estratto');
  cases.forEach(c => {
    if (!c.name || !c.title_it) problems.push(`personaggio senza nome/titolo: ${c.name || '?'}`);
    if (!c.bio_it) problems.push(`${c.name}: bio italiana vuota`);
    if (!c.drip_img && !c.profile_img) problems.push(`${c.name}: nessuna immagine`);
  });
  if (dispatches.length === 0) problems.push('nessun dispatch estratto');
  dispatches.forEach(d => {
    if (!d.title) problems.push('dispatch senza titolo');
    if (d.date && !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) problems.push(`${d.title}: data non ISO (${d.date})`);
  });
  if (factions.length === 0) problems.push('nessuna fazione estratta');
  if (lexicon.length === 0) problems.push('nessun termine di lessico');
  if (multimedia.length === 0) problems.push('nessun asset multimediale');
  const missingImg = [...cases.map(c => c.profile_img), ...cases.map(c => c.drip_img), ...multimedia.filter(m => m.type === 'image').map(m => m.src)]
    .filter(Boolean)
    .filter(p => !fs.existsSync(path.join(SITE_DIR, p)));
  if (missingImg.length) problems.push(`immagini referenziate ma assenti: ${missingImg.slice(0, 5).join(', ')}${missingImg.length > 5 ? ` (+${missingImg.length - 5})` : ''}`);
  if (problems.length) fail('validazione dati fallita:\n  - ' + problems.join('\n  - '));
}
validate();

// 9. scritture
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const version = 'spvault_sync_' + Date.now();
const archive = { version, generated_at: new Date().toISOString(), counts: { cases: cases.length, dispatches: dispatches.length, factions: allFactions.length, lexicon: lexicon.length, multimedia: multimedia.length }, cases, dispatches, factions: allFactions, lexicon, multimedia };
fs.writeFileSync(path.join(DATA_DIR, 'archive.json'), JSON.stringify(archive, null, 2), 'utf8');
fs.writeFileSync(path.join(DATA_DIR, 'drift.json'), JSON.stringify({ version, generated_at: archive.generated_at, count: DRIFT.length, items: DRIFT }, null, 2), 'utf8');
log(`data/archive.json + data/drift.json scritti (${DRIFT.length} voci di drift).`);

let html = fs.readFileSync(INDEX_HTML, 'utf8');
const start = html.indexOf('const DEFAULT_CASES = [');
const end = html.indexOf('// Auto-sync with SPVault DB Version');
if (start === -1 || end === -1 || end < start) fail('marker DEFAULT_CASES / Auto-sync non trovati in index.html');

const block = [
  'const DEFAULT_CASES = ' + safeJson(cases) + ';',
  '',
  '    const DEFAULT_DISPATCHES = ' + safeJson(dispatches) + ';',
  '',
  '    const DEFAULT_FACTIONS = ' + safeJson(allFactions) + ';',
  '',
  '    const DEFAULT_LEXICON = ' + safeJson(lexicon) + ';',
  '',
  '    const DEFAULT_MULTIMEDIA = ' + safeJson(multimedia) + ';',
  '',
  '    '
].join('\n');

html = html.slice(0, start) + block + html.slice(end);
html = html.replace(/const SDB_VERSION = "[^"]+";/, `const SDB_VERSION = "${version}";`);
fs.writeFileSync(INDEX_HTML, html, 'utf8');
log(`index.html aggiornato a ${version}`);

if (fs.existsSync(STATUS_HTML)) {
  let st = fs.readFileSync(STATUS_HTML, 'utf8');
  const ds = st.indexOf('/*DRIFT_START*/');
  const de = st.indexOf('/*DRIFT_END*/');
  if (ds !== -1 && de !== -1) {
    st = st.slice(0, ds) + '/*DRIFT_START*/' + safeJson(DRIFT) + '/*DRIFT_END*/' + st.slice(de + '/*DRIFT_END*/'.length);
    const ms = st.indexOf('/*META_START*/');
    const me = st.indexOf('/*META_END*/');
    if (ms !== -1 && me !== -1) {
      const meta = JSON.stringify({ version, generated_at: archive.generated_at, counts: archive.counts });
      st = st.slice(0, ms) + '/*META_START*/' + meta + '/*META_END*/' + st.slice(me + '/*META_END*/'.length);
    } else {
      log('ATTENZIONE: marker META non trovati in status.html');
    }
    fs.writeFileSync(STATUS_HTML, st, 'utf8');
    log('status.html aggiornato.');
  } else {
    log('ATTENZIONE: marker drift non trovati in status.html');
  }
}

// 10. thumbs
if (!NO_THUMBS) {
  const r = spawnSync('python', [path.join(SITE_DIR, 'tools', 'thumbs.py')], { encoding: 'utf8' });
  if (r.error) log('thumbs: python non disponibile, salto.');
  else if (r.status !== 0) log('thumbs: errore\n' + (r.stderr || '').slice(0, 400));
  else log('thumbs: ' + (r.stdout || '').trim().split('\n').pop());
}

// 11. commit locale (mai push)
if (!NO_COMMIT) {
  try {
    execSync(`git -C "${SITE_DIR}" add index.html status.html 404.html favicon.svg robots.txt sitemap.xml data _multimedia _thumbs docs tools AGENTS.md CHANGELOG.md README.md sync_spvault.js sync.bat .gitignore`, { encoding: 'utf8' });
    const dirty = execSync(`git -C "${SITE_DIR}" status --porcelain`, { encoding: 'utf8' }).trim();
    if (dirty) {
      execSync(`git -C "${SITE_DIR}" commit -m "chore(sync): vault ${version}"`, { encoding: 'utf8' });
      log('Commit locale creato. Push manuale: git push origin main && git push origin main:gh-pages');
    } else {
      log('Nessuna modifica da committare.');
    }
  } catch (e) {
    log('commit saltato: ' + e.message.split('\n')[0]);
  }
}

// 12. notifica Windows se c'è drift
if (DRIFT.length > 0 && fs.existsSync(path.join(SITE_DIR, 'notify.ps1'))) {
  const msg = `${DRIFT.length} elementi del vault non sono mappati nella UI. Apri status.html`;
  try {
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${path.join(SITE_DIR, 'notify.ps1')}" -Title "Silverium DB" -Message "${msg}"`, { encoding: 'utf8' });
    log('Notifica desktop inviata.');
  } catch (e) {
    log('notifica non inviata: ' + e.message.split('\n')[0]);
  }
}

log(`Riepilogo: ${cases.length} personaggi, ${allFactions.length} fazioni (${derived.length} derivate), ${lexicon.length} termini, ${dispatches.length} post, ${multimedia.length} asset, ${DRIFT.length} drift.`);
log('=== COMPLETATO ===');
