// Reads the text in a screenshot ON THE DEVICE (Tesseract, served from this site). The image is never uploaded.
(function(){
const BASE = '/vendor/tesseract/';
const READY_MSG = 'Getting the screenshot reader ready (about 4 MB, first time only)…';
let workerP = null;

function loadScript(src){ return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => fail(new Error('Couldn’t load the screenshot reader. Check your connection and try again.')); document.head.appendChild(s); }); }

async function getWorker(onProgress){
  if(!workerP) workerP = (async () => {
    if(!window.Tesseract) await loadScript(BASE + 'tesseract.min.js');
    return Tesseract.createWorker('eng', 1, {
      workerPath: BASE + 'worker.min.js', corePath: BASE + 'core', langPath: BASE + 'lang', gzip: true,
      logger: m => { if(SSOCR._progress) SSOCR._progress(m); }
    });
  })().catch(e => { workerP = null; throw e; });
  return workerP;
}

// Scale up small images, convert to grayscale, and flip dark-mode screenshots to dark-on-light: Tesseract reads that best.
async function prepare(file){
  const bmp = await (window.createImageBitmap ? createImageBitmap(file) : new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error('That file isn’t an image we can read.')); i.src = URL.createObjectURL(file); }));
  const w0 = bmp.width, h0 = bmp.height;
  if(!w0 || !h0) throw new Error('That image looks empty.');
  // Small screenshots read better enlarged (up to 3x, aiming for ~1400px wide); very tall ones are capped at 8000px.
  const scale = Math.min(Math.min(3, Math.max(1, 1400 / w0)), 8000 / h0);
  const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently:true }); x.drawImage(bmp, 0, 0, w, h);
  const img = x.getImageData(0, 0, w, h), d = img.data; let sum = 0;
  for(let i = 0; i < d.length; i += 4){ const g = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2]; d[i] = d[i+1] = d[i+2] = g; sum += g; }
  if(sum / (d.length / 4) < 110) for(let i = 0; i < d.length; i += 4){ d[i] = d[i+1] = d[i+2] = 255 - d[i]; }
  x.putImageData(img, 0, 0);
  return c;
}

// Drop phone status-bar noise and tidy spacing; keep everything else for the checker.
// Common OCR slips in links: "https //", "https:/ /", ".corn" for ".com", stray spaces around dots in a web address.
function fixLinks(t){
  return t.replace(/\.\s*corn\b/gi, '.com').replace(/\.\s*c0m\b/gi, '.com')
    .replace(/\b(https?)\s*[:;.,i]?\s*\/\s*\/\s*/gi, (m, p) => p.toLowerCase() + '://')
    .replace(/\b(www)\s*[.,]\s*/gi, 'www.')
    .replace(/([a-z0-9-])\s*\.\s*(com|net|org|top|xyz|info|co|us|io|app|link|click|shop|live|icu)\b/gi, '$1.$2');
}
function clean(text){
  return fixLinks(String(text || '')).split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim())
    .filter(l => l && !/^\d{1,2}:\d{1,2}\b.{0,24}(5G|4G|LTE|\d%)\s*$/i.test(l) && !/^[\d:\s]{3,8}(am|pm)?\s*[^\w\s]{0,6}$/i.test(l) && !/^(\.{1,3}|[|_\-–—=~]+)$/.test(l))
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const SSOCR = {
  _progress: null,
  isImage: f => !!f && /^image\//.test(f.type || ''),
  async read(file, onProgress){
    if(!SSOCR.isImage(file)) throw new Error('Please choose an image (a screenshot or photo of the message).');
    if(file.size > 15 * 1024 * 1024) throw new Error('That image is too large (15 MB max).');
    SSOCR._progress = m => { if(!onProgress) return;
      if(m.status === 'recognizing text') onProgress('Reading text… ' + Math.round((m.progress || 0) * 100) + '%');
      else if(/load|initializ/.test(m.status || '')) onProgress(READY_MSG); };
    onProgress && onProgress(READY_MSG);
    const [worker, canvas] = await Promise.all([getWorker(), prepare(file)]);
    const { data } = await worker.recognize(canvas);
    const text = clean(data.text);
    if(text.replace(/\W/g, '').length < 8) throw new Error('We couldn’t find readable text in that image. Try a sharper screenshot, or paste the text instead.');
    return text;
  },
  // Start downloading the reader as soon as someone reaches for the upload button, so it's ready sooner.
  warm(){ getWorker().catch(() => {}); },
  // Drag-and-drop and paste-an-image support for a drop zone element.
  attach(zone, onFile){
    ['dragenter','dragover'].forEach(t => zone.addEventListener(t, e => { if([...(e.dataTransfer?.items || [])].some(i => i.kind === 'file')){ e.preventDefault(); zone.classList.add('drag'); } }));
    ['dragleave','drop'].forEach(t => zone.addEventListener(t, () => zone.classList.remove('drag')));
    zone.addEventListener('drop', e => { const f = [...(e.dataTransfer?.files || [])].find(SSOCR.isImage); if(f){ e.preventDefault(); onFile(f); } });
    zone.addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])].find(SSOCR.isImage); if(f){ e.preventDefault(); onFile(f); } });
  }
};
window.SSOCR = SSOCR;
})();
