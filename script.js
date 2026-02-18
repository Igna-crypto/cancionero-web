/* ---------- CONFIG & SCALES ---------- */
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

/* ---------- UTILITIES ---------- */
function normalizeNote(note){
  return LATIN_TO_ENG[note] || note;
}
function getIndex(note){
  note = normalizeNote(note);
  let i = SHARP_SCALE.indexOf(note);
  if(i !== -1) return i;
  return FLAT_SCALE.indexOf(note);
}
function chooseOutputName(original){
  // prefer flats if original contains b, otherwise sharps
  return original && original.includes('b') ? FLAT_SCALE : SHARP_SCALE;
}

/* Transpose root by steps (positive or negative) */
function transposeRoot(root, steps){
  root = normalizeNote(root);
  // handle unexpected roots
  const inSharp = SHARP_SCALE.indexOf(root);
  const inFlat  = FLAT_SCALE.indexOf(root);
  let useFlat = false;
  let index = -1;
  if(inSharp !== -1) index = inSharp;
  else if(inFlat !== -1){ index = inFlat; useFlat = true; }
  else return root;

  let newIndex = (index + steps + 12) % 12;
  return useFlat ? FLAT_SCALE[newIndex] : SHARP_SCALE[newIndex];
}

/* ---------- CHORD TRANSPOSE (handles slash chords & extensions) ---------- */
function transposeChordString(chordStr, steps) {
  // chordStr examples: C, C#m7, Bbmaj7/D, D/F#
  // detect root (A-G plus optional # or b or 'b' char)
  const m = chordStr.match(/^([A-G][#b]?)(.*)$/);
  if(!m) return chordStr;
  const root = m[1];
  let rest = m[2] || '';

  // If there is slash bass inside rest, handle bass separately
  if(rest.includes('/')){
    // split on first '/'
    const parts = rest.split('/');
    const afterSlash = parts.slice(1).join('/');
    // parts[0] is the chord remainder before slash (e.g. "m7")
    // but the bass root is at start of afterSlash
    const bassMatch = afterSlash.match(/^([A-G][#b]?)/);
    if(bassMatch){
      const bassRoot = bassMatch[1];
      const bassRest = afterSlash.slice(bassRoot.length);
      const newBass = transposeRoot(bassRoot, steps);
      // rebuild rest: keep the pre-slash remainder + '/' + newBass + any remainder
      rest = parts[0] + '/' + newBass + bassRest;
    }
  }

  const newRoot = transposeRoot(root, steps);
  return newRoot + rest;
}

/* Transposes inside bracketed chords like [C] or [C#m7] */
function transposeChordPro(text, steps){
  return text.replace(/\[([^\]]+)\]/g, (m, chord) => {
    return '[' + transposeChordString(chord.trim(), steps) + ']';
  });
}

/* ---------- CHORDPRO RENDER: produce chord-line above lyric-line using monospace spacing ---------- */
function renderChordProToHTML(chordproText){
  // normalize line endings
  const lines = chordproText.replace(/\r/g,'').split('\n');

  let html = '';
  let inChorus = false;

  function pad(n){ return Array(n+1).join('\u00A0'); } // non-breaking spaces

  for(let raw of lines){
    const line = raw.replace(/\t/g,'    '); // tabs -> spaces

    if(line.trim() === ''){ html += '<div class="line"><br/></div>'; continue; }

    // metadata
    const meta = line.match(/^\{(title|subtitle|chorus|\/chorus):?\s*(.*?)\}$/i);
    if(meta){
      const tag = meta[1].toLowerCase();
      if(tag === 'title'){
        html += <div class="line"><strong style="font-size:1.2em">${meta[2]}</strong></div>;
        continue;
      }
      if(tag === 'subtitle'){
        html += <div class="line"><em>${meta[2]}</em></div>;
        continue;
      }
      if(tag === 'chorus' || tag === 'chorus:'){
        inChorus = true;
        html += <div class="line"><div class="song-block" style="border-left:3px solid #ddd;padding-left:8px">;
        continue;
      }
      if(tag === '/chorus' || tag === '/chorus:'){
        inChorus = false;
        html += </div></div>;
        continue;
      }
    }

    // Build tokens: matches like [C]Text
    // We'll iterate capturing chords and text segments
    const regex = /(\[([^\]]+)\])?([^\[]*)/g;
    let match;
    let lyricLine = '';
    let chordLine = '';

    while((match = regex.exec(line)) !== null){
      const chordToken = match[2]; // may be undefined
      const textToken = match[3] || '';

      // append text token to lyricLine
      lyricLine += textToken;

      // chord placement: we place chord at start of this textToken
      // pad chordLine to current lyricLine length before appending chord
      // compute current lyricLine length before adding textToken (we use visible chars)
      // but since we appended textToken already, compute its length:
      const textLen = textToken.length;

      // Ensure chordLine has same length as lyricLine before adding chord
      const currentLyricLen = lyricLine.length;
      // chord should align to the start of textToken: compute start pos = currentLyricLen - textLen
      const startPos = currentLyricLen - textLen;

      // ensure chordLine is long enough before placing chord
      if(chordToken){
        // make chordLine length to startPos
        if(chordLine.length < startPos){
          chordLine += pad(startPos - chordLine.length);
        }
        // place chord (as string)
        chordLine += chordToken;
      } else {
        // if no chord here, ensure chordLine grows with text spaces
        if(chordLine.length < lyricLine.length){
          chordLine += pad(lyricLine.length - chordLine.length);
        }
      }
    }

    // At end, ensure chordLine and lyricLine lengths match visually (pad with spaces)
    if(chordLine.length < lyricLine.length){
      chordLine += pad(lyricLine.length - chordLine.length);
    } else if(lyricLine.length < chordLine.length){
      lyricLine += pad(chordLine.length - lyricLine.length);
    }

    // escape HTML entities for lyricLine
    function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    // wrap as HTML block
    html += <div class="line ${inChorus ? 'chorus' : ''}">;
    html += <div class="chord-line">${esc(chordLine)}</div>;
    html += <div class="lyric-line">${esc(lyricLine)}</div>;
    if(inChorus) html += </div>; // close inner block if opened
    html += </div>;
  }

  return html;
}

/* ---------- UI / STATE ---------- */
let ORIGINAL_HTML = '';
let ORIGINAL_KEY = null;
let currentSteps = 0; // last applied steps
let currentCapo = 0;

async function loadSongFromSlug(slug){
  // fetch index to know list or directly song file
  try {
    const res = await fetch(/songs/${slug}.json);
    if(!res.ok) throw new Error('notfound');
    const data = await res.json();
    ORIGINAL_KEY = data.baseKey || data.baseKey || 'C';
    document.getElementById('songTitle').innerText = data.title || slug;
    document.getElementById('subtitle').innerText = data.artist || '';
    // render original chordpro as HTML blocks
    const html = renderChordProToHTML(data.lyrics || '');
    const content = document.getElementById('content');
    content.innerHTML = html;
    content.dataset.key = ORIGINAL_KEY;
    ORIGINAL_HTML = content.innerHTML; // save pristine
    currentSteps = 0;
    currentCapo = 0;

    // populate UI
    populateKeySelector(ORIGINAL_KEY);
    populateCapoSelector();
    loadSavedKey();
    applyInitialKeyFromURL();

    showView('songView');

  } catch(e){
    document.getElementById('content').innerText = 'Canción no encontrada.';
    showView('songView');
  }
}

/* ---------- UI helpers ---------- */
function showView(id){
  document.querySelectorAll('.page').forEach(p=>p.hidden=true);
  document.getElementById(id).hidden = false;
}

/* ---------- Keys selector & capo ---------- */
function populateKeySelector(originalKey){
  const sel = document.getElementById('keySelector');
  sel.innerHTML = '<option value="">Tonalidad</option>';
  ALL_KEYS.forEach(k=>{
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = k;
    sel.appendChild(opt);
  });
  if(originalKey) sel.value = originalKey;

  sel.onchange = () => {
    const target = sel.value;
    if(!target) {
      resetSongToOriginal();
      saveKey(null);
      return;
    }
    changeToKey(target);
  };
}

function populateCapoSelector(){
  const cap = document.getElementById('capoSelector');
  cap.innerHTML = '';
  for(let i=0;i<=11;i++){
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = i===0? 'Capo 0' : 'Capo ' + i;
    cap.appendChild(opt);
  }
  cap.onchange = () => {
    const v = parseInt(cap.value,10);
    applyCapo(v);
  };
}

/* ---------- SAVE / LOAD localStorage per song path ---------- */
function storageKey(){
  return 'songKey_' + window.location.pathname;
}
function saveKey(k){
  if(k) localStorage.setItem(storageKey(), k);
  else localStorage.removeItem(storageKey());
}
function loadSavedKey(){
  const saved = localStorage.getItem(storageKey());
  if(saved){
    const sel = document.getElementById('keySelector');
    if(sel) sel.value = saved;
    changeToKey(saved);
  }
}

/* ---------- TRANSPOSE / RESET / CAPO ---------- */
function changeToKey(targetKey){
  if(!ORIGINAL_KEY) return;
  resetSongToOriginal(); // ensure base
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
  // get original HTML text (ChordPro original string must be preserved somewhere)
  // We stored ORIGINAL_HTML containing rendered chord/lyric lines; but transpose functions operate on chord tokens inside brackets.
  // Easiest approach: reconstruct current chordpro text from original rendered lines by reading lyric-line and chord-line and reinsert brackets where chords exist.
  // Simpler method: maintain original chordpro raw source in data attribute - let's store raw lyrics in dataset when loading song.
  // We'll use a fallback: if original raw is stored in data-raw attribute, use it.
  const raw = content.dataset.raw || null;
  if(!raw){
    // Try to reconstruct: not ideal. But we stored raw at loadSongFromSlug (update that).
  }
  // We'll assume content.dataset.raw exists (script sets it at load).
  const transposed = transposeChordPro(raw, steps);
  // render transposed text HTML
  content.innerHTML = renderChordProToHTML(transposed);
}

function resetSongToOriginal(){
  const content = document.getElementById('content');
  if(ORIGINAL_HTML) content.innerHTML = ORIGINAL_HTML;
  currentSteps = 0;
  currentCapo = 0;
  const cap = document.getElementById('capoSelector');
  if(cap) cap.value = 0;
}

/* CAPO: display capo by transposing negative steps (visual capo shifts chords down) */
function applyCapo(capoSteps){
  // capoSteps: 0..11. To show chords when capo is used, transpose by -capoSteps visually (so chord labels are easier)
  resetSongToOriginal();
  if(capoSteps === 0) return;
  currentCapo = capoSteps;
  applyTransposeSteps(-capoSteps);
}

/* +/- buttons */
document.addEventListener('click', function(e){
  if(e.target && e.target.id === 'incTrans'){
    // increment one semitone from current displayed: we compute new target based on currentSteps
    applyTransposeSteps(++currentSteps);
  }
  if(e.target && e.target.id === 'decTrans'){
    applyTransposeSteps(--currentSteps);
  }
});

/* font size control */
document.getElementById('fontSizeRange').addEventListener('input', function(e){
  const v = e.target.value;
  document.querySelector('.song-content').style.fontSize = v + 'pt';
});

/* columns toggle */
document.getElementById('columnsToggle').addEventListener('change', function(e){
  const v = parseInt(e.target.value,10);
  const area = document.getElementById('songArea');
  area.className = v === 2 ? 'columns-2' : 'columns-1';
});

/* print button */
document.getElementById('printBtn').addEventListener('click', function(){
  window.print();
});

/* ---------- ROUTING & BOOT ---------- */
async function loadIndex(){
  // load the songs index and list
  try{
    const res = await fetch('/songs/index.json');
    const list = await res.json();
    const ul = document.getElementById('list');
    ul.innerHTML = '';
    list.forEach(item=>{
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = /cancion/${item.slug};
      a.textContent = item.title + (item.artist ? ' — ' + item.artist : '');
      li.appendChild(a);
      ul.appendChild(li);
    });
    showView('songList');
  }catch(e){
    document.getElementById('list').innerText = 'No se puede cargar lista';
  }
}

function applyInitialKeyFromURL(){
  const params = new URLSearchParams(window.location.search);
  const key = params.get('key');
  if(key){
    const sel = document.getElementById('keySelector');
    if(sel) sel.value = key;
    changeToKey(key);
  }
}

function route(){
  // path / or /cancion/slug
  const path = window.location.pathname.replace(/\/+$/,'');
  if(path === '' || path === '/'){
    loadIndex();
    return;
  }
  const parts = path.split('/');
  // expect ['', 'cancion', 'slug'] or ['cancion','slug'] depending on server
  let slug = parts.pop();
  if(!slug) slug = parts.pop();
  // fetch song JSON
  fetch(/songs/${slug}.json)
    .then(r => {
      if(!r.ok) throw new Error('notfound');
      return r.json();
    })
    .then(data => {
      // store raw lyrics for transpose operations:
      const content = document.getElementById('content');
      content.dataset.raw = data.lyrics || '';
      loadSongFromSlug(slug); // will re-fetch; but we already have data; to optimize one could refactor.
    })
    .catch(err => {
      // not a song route -> show index
      loadIndex();
    });
}

/* on load, run routing */
window.addEventListener('load', function(){
  // initialize UI values
  document.getElementById('fontSizeRange').value = 11;
  document.querySelector('.song-content').style.fontSize = '11pt';
  route();
  // handle back/forward
  window.addEventListener('popstate', route);
});