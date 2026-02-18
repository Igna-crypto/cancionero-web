/* script.js - Versión con DOMContentLoaded y debug */

// ---------- CONFIG SCALES ----------
const SHARP_SCALE = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLAT_SCALE  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const LATIN_TO_ENG = {
  'Do':'C','Do#':'C#','Reb':'Db',
  'Re':'D','Re#':'D#','Mib':'Eb',
  'Mi':'E',
  'Fa':'F','Fa#':'F#','Solb':'Gb',
  'Sol':'G','Sol#':'G#','Lab':'Ab',
  'La':'A','La#':'A#','Sib':'Bb',
  'Si':'B'
};
const ALL_KEYS = ['C','C#','Db','D','D#','Eb','E','F','F#','Gb','G','G#','Ab','A','A#','Bb','B'];

// ---------- UTIL ----------
function normalizeNote(note){ return LATIN_TO_ENG[note] || note; }
function getIndex(note){
  note = normalizeNote(note);
  let i = SHARP_SCALE.indexOf(note);
  if(i !== -1) return i;
  return FLAT_SCALE.indexOf(note);
}

// prefer flats if original had b
function transposeRoot(root, steps){
  root = normalizeNote(root);
  const inSharp = SHARP_SCALE.indexOf(root);
  const inFlat  = FLAT_SCALE.indexOf(root);
  let useFlat=false, index=-1;
  if(inSharp !== -1) index=inSharp;
  else if(inFlat !== -1){ index=inFlat; useFlat=true; }
  else return root;
  let newIndex = (index + steps + 12) % 12;
  return useFlat ? FLAT_SCALE[newIndex] : SHARP_SCALE[newIndex];
}

function transposeChordString(chordStr, steps){
  const m = chordStr.match(/^([A-G][#b]?)(.*)$/);
  if(!m) return chordStr;
  const root = m[1];
  let rest = m[2] || '';

  if(rest.includes('/')){
    const parts = rest.split('/');
    const afterSlash = parts.slice(1).join('/');
    const bassMatch = afterSlash.match(/^([A-G][#b]?)/);
    if(bassMatch){
      const bassRoot = bassMatch[1];
      const bassRest = afterSlash.slice(bassRoot.length);
      const newBass = transposeRoot(bassRoot, steps);
      rest = parts[0] + '/' + newBass + bassRest;
    }
  }

  const newRoot = transposeRoot(root, steps);
  return newRoot + rest;
}

function transposeChordPro(text, steps){
  return text.replace(/\[([^\]]+)\]/g, (m, chord) => '[' + transposeChordString(chord.trim(), steps) + ']');
}

// ---------- RENDER CHORDPRO (chords above lyrics) ----------
function renderChordProToHTML(chordproText){
  const lines = chordproText.replace(/\r/g,'').split('\n');
  let html = '';
  let inChorus = false;
  function pad(n){ return Array(n+1).join('\u00A0'); }
  function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  for(let raw of lines){
    const line = raw.replace(/\t/g,'    ');
    if(line.trim() === ''){ html += '<div class="line"><br/></div>'; continue; }

    const meta = line.match(/^\{(title|subtitle|chorus|\/chorus):?\s*(.*?)\}$/i);
    if(meta){
      const tag = meta[1].toLowerCase();
      if(tag === 'title'){ html += <div class="line"><strong style="font-size:1.2em">${meta[2]}</strong></div>; continue; }
      if(tag === 'subtitle'){ html += <div class="line"><em>${meta[2]}</em></div>; continue; }
      if(tag === 'chorus'){ inChorus = true; html += <div class="line"><div class="song-block" style="border-left:3px solid #ddd;padding-left:8px">; continue; }
      if(tag === '/chorus'){ inChorus = false; html += </div></div>; continue; }
    }

    const regex = /(\[([^\]]+)\])?([^\[]*)/g;
    let match;
    let lyricLine = '';
    let chordLine = '';

    while((match = regex.exec(line)) !== null){
      const chordToken = match[2];
      const textToken = match[3] || '';
      lyricLine += textToken;
      const textLen = textToken.length;
      const currentLyricLen = lyricLine.length;
      const startPos = currentLyricLen - textLen;
      if(chordToken){
        if(chordLine.length < startPos) chordLine += pad(startPos - chordLine.length);
        chordLine += chordToken;
      } else {
        if(chordLine.length < lyricLine.length) chordLine += pad(lyricLine.length - chordLine.length);
      }
    }

    if(chordLine.length < lyricLine.length) chordLine += pad(lyricLine.length - chordLine.length);
    else if(lyricLine.length < chordLine.length) lyricLine += pad(chordLine.length - lyricLine.length);

    html += <div class="line ${inChorus ? 'chorus' : ''}">;
    html += <div class="chord-line">${esc(chordLine)}</div>;
    html += <div class="lyric-line">${esc(lyricLine)}</div>;
    if(inChorus) html += </div>;
    html += </div>;
  }
  return html;
}

// ---------- UI / STATE ----------
let ORIGINAL_HTML = '';
let ORIGINAL_RAW = '';
let ORIGINAL_KEY = null;
let currentSteps = 0;
let currentCapo = 0;

// ---------- CORE FUNCTIONS ----------
async function loadSongFromSlug(slug){
  const content = document.getElementById('content');
  if(!content){ console.error('No element #content'); return; }

  try{
    const res = await fetch(./songs/${slug}.json);
    if(!res.ok) throw new Error('notfound');
    const data = await res.json();

    ORIGINAL_KEY = data.baseKey || data.key || 'C';
    document.getElementById('songTitle').innerText = data.title || slug;
    document.getElementById('subtitle').innerText = data.artist || '';

    // store raw chordpro for transposition
    ORIGINAL_RAW = data.lyrics || data.content || '';
    content.dataset.raw = ORIGINAL_RAW;

    const html = renderChordProToHTML(ORIGINAL_RAW);
    content.innerHTML = html;
    content.dataset.key = ORIGINAL_KEY;
    ORIGINAL_HTML = content.innerHTML;
    currentSteps = 0; currentCapo = 0;

    populateKeySelector(ORIGINAL_KEY);
    populateCapoSelector();
    loadSavedKey();
    applyInitialKeyFromURL();

    showView('songView');
    console.log('Song loaded:', slug);
  }catch(e){
    console.error('loadSongFromSlug error', e);
    content.innerText = 'Canción no encontrada.';
    showView('songView');
  }
}

function loadIndex(){
  const listEl = document.getElementById('list');
  if(!listEl){ console.error('No element #list'); return; }

  fetch('./songs/index.json')
    .then(r=>{ if(!r.ok) throw new Error('index.json not found'); return r.json(); })
    .then(list=>{
      console.log('Index JSON length:', list.length);
      listEl.innerHTML = '';
      list.forEach(item=>{
        const li = document.createElement('li');
        const a = document.createElement('a');
        // use hash link to avoid server fallback issues local
        a.href = #/cancion/${item.slug};
        a.textContent = item.title + (item.artist ? ' — ' + item.artist : '');
        li.appendChild(a);
        listEl.appendChild(li);
      });
      showView('songList');
    })
    .catch(e=>{
      console.error('loadIndex error', e);
      listEl.innerText = 'No se puede cargar lista';
    });
}

function showView(id){
  document.querySelectorAll('.page').forEach(p=>p.hidden=true);
  const el = document.getElementById(id);
  if(el) el.hidden = false;
}

// ---------- SELECTORS & CAPO ----------
function populateKeySelector(originalKey){
  const sel = document.getElementById('keySelector');
  if(!sel) return;
  sel.innerHTML = '<option value="">Tonalidad</option>';
  ALL_KEYS.forEach(k=>{
    const opt = document.createElement('option');
    opt.value = k; opt.textContent = k;
    sel.appendChild(opt);
  });
  if(originalKey) sel.value = originalKey;
  sel.onchange = () => {
    const target = sel.value;
    if(!target){ resetSongToOriginal(); saveKey(null); return; }
    changeToKey(target);
  };
}

function populateCapoSelector(){
  const cap = document.getElementById('capoSelector');
  if(!cap) return;
  cap.innerHTML = '';
  for(let i=0;i<=11;i++){
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = i===0? 'Capo 0' : 'Capo ' + i;
    cap.appendChild(opt);
  }
  cap.onchange = () => applyCapo(parseInt(cap.value,10));
}

// ---------- STORAGE ----------
function storageKey(){ return 'songKey_' + window.location.pathname; }
function saveKey(k){ if(k) localStorage.setItem(storageKey(), k); else localStorage.removeItem(storageKey()); }
function loadSavedKey(){
  const saved = localStorage.getItem(storageKey());
  if(saved){
    const sel = document.getElementById('keySelector'); if(sel) sel.value = saved;
    changeToKey(saved);
  }
}

// ---------- TRANSPOSE / RESET ----------
function changeToKey(targetKey){
  if(!ORIGINAL_KEY) return;
  resetSongToOriginal();
  const fromIndex = getIndex(ORIGINAL_KEY);
  const toIndex = getIndex(targetKey);
  if(fromIndex === -1 || toIndex === -1) return;
  const steps = toIndex - fromIndex;
  currentSteps = steps;
  applyTransposeSteps(steps);
  saveKey(targetKey);
}

function applyTransposeSteps(steps){
  const content = document.getElementById('content');
  if(!content) return;
  const raw = content.dataset.raw || ORIGINAL_RAW || '';
  if(!raw) return;
  const transposed = transposeChordPro(raw, steps);
  content.innerHTML = renderChordProToHTML(transposed);
}

function resetSongToOriginal(){
  const content = document.getElementById('content');
  if(!content) return;
  if(ORIGINAL_HTML) content.innerHTML = ORIGINAL_HTML;
  currentSteps = 0; currentCapo = 0;
  const cap = document.getElementById('capoSelector'); if(cap) cap.value = 0;
}

function applyCapo(capoSteps){
  resetSongToOriginal();
  if(capoSteps === 0) return;
  currentCapo = capoSteps;
  applyTransposeSteps(-capoSteps);
}

// +/- buttons
function incTranspose(){ currentSteps++; applyTransposeSteps(currentSteps); }
function decTranspose(){ currentSteps--; applyTransposeSteps(currentSteps); }

// ---------- UI EVENTS (assigned after DOM ready) ----------
function attachUI(){
  const inc = document.getElementById('incTrans');
  const dec = document.getElementById('decTrans');
  const printBtn = document.getElementById('printBtn');
  const fontRange = document.getElementById('fontSizeRange');
  const columnsToggle = document.getElementById('columnsToggle');

  if(inc) inc.onclick = incTranspose;
  if(dec) dec.onclick = decTranspose;
  if(printBtn) printBtn.onclick = () => window.print();
  if(fontRange) fontRange.oninput = (e) => { const v=e.target.value; const s=document.querySelector('.song-content'); if(s) s.style.fontSize = v+'pt'; };
  if(columnsToggle) columnsToggle.onchange = (e) => {
    const v = parseInt(e.target.value,10);
    const area = document.getElementById('songArea');
    area.className = v === 2 ? 'columns-2' : 'columns-1';
  };
}

// ---------- ROUTER (hash-based for local + support clean path) ----------
function route(){
  // First try hash-based routing (safer local)
  if(window.location.hash && window.location.hash.startsWith('#/cancion/')){
    const slug = window.location.hash.split('#/cancion/')[1];
    if(slug) { loadSongFromSlug(slug); return; }
  }

  // Then attempt path-based routing (production)
  const path = window.location.pathname.replace(/\/+$/,'');
  if(path === '' || path === '/' || path === '/index.html'){
    loadIndex(); return;
  }
  // assume /cancion/slug or /song/slug
  const parts = path.split('/');
  let slug = parts.pop();
  if(!slug) slug = parts.pop();
  if(slug) { loadSongFromSlug(slug); return; }
  loadIndex();
}

// ---------- BOOT ----------
window.addEventListener('DOMContentLoaded', function(){
  console.log('DOM loaded - initializing script');
  attachUI();
  // default font size
  const fr = document.getElementById('fontSizeRange');
  if(fr) { fr.value = 11; document.querySelector('.song-content').style.fontSize = '11pt'; }

  // initial route
  route();

  // handle hash changes and back/forward
  window.addEventListener('hashchange', route);
  window.addEventListener('popstate', route);
});