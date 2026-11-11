// Looks inside an image or video file for clues about where it came from:
// AI-generator tags, Content Credentials (C2PA), editing apps, and camera details. No dependencies.
// Metadata can be stripped or faked, so these are clues, never proof.

const GENERATORS = [
  ['DALL·E / ChatGPT', /DALL[·\-_ ]?E|ChatGPT|OpenAI/i], ['Midjourney', /Midjourney/i], ['Stable Diffusion', /Stable[ _-]?Diffusion|stable-diffusion|ComfyUI|AUTOMATIC1111|InvokeAI|DreamStudio|Fooocus/i],
  ['Adobe Firefly', /Firefly/i], ['Google AI (Imagen / Gemini / Veo)', /Imagen|Gemini|SynthID|\bVeo\b|Made with Google AI/i], ['Grok / Aurora', /\bGrok\b|xAI Aurora/i],
  ['Flux', /\bFLUX\.?1\b|black-forest-labs/i], ['Ideogram', /Ideogram/i], ['Leonardo.Ai', /Leonardo\.?Ai/i], ['NovelAI', /NovelAI/i],
  ['Sora', /\bSora\b/], ['Runway', /RunwayML|Runway Gen/i], ['Pika', /Pika Labs|pika\.art/i], ['Kling', /\bKling\b/i], ['HeyGen', /HeyGen/i], ['Synthesia', /Synthesia/i], ['D-ID', /\bD-ID\b/]
];
const EDITORS = /Adobe Photoshop|Photoshop|GIMP|Snapseed|FaceApp|Facetune|Remini|Picsart|Lensa|Meitu|PhotoDirector|Lightroom|Affinity Photo|Pixelmator|CapCut|InShot|DeepFaceLab|FaceSwap|Reface/i;

// Read the IFD0 tags we care about from a TIFF/EXIF block.
function readExif(buf, start){
  try{
    const le = buf.toString('latin1', start, start + 2) === 'II';
    const u16 = o => le ? buf.readUInt16LE(o) : buf.readUInt16BE(o), u32 = o => le ? buf.readUInt32LE(o) : buf.readUInt32BE(o);
    const ifd = start + u32(start + 4); const n = u16(ifd); const out = {};
    const names = { 0x010f:'make', 0x0110:'model', 0x0131:'software', 0x0132:'date', 0x013b:'artist' };
    for(let i = 0; i < Math.min(n, 64); i++){
      const e = ifd + 2 + i * 12, tag = u16(e), type = u16(e + 2), count = u32(e + 4);
      if(!names[tag] || type !== 2) continue;
      const off = count <= 4 ? e + 8 : start + u32(e + 8);
      out[names[tag]] = buf.toString('latin1', off, off + Math.min(count, 120)).replace(/\0.*$/s, '').trim();
    }
    return out;
  }catch{ return {}; }
}
function findExif(buf){
  const i = buf.indexOf('Exif\0\0', 0, 'latin1'); if(i < 0 || i > buf.length - 14) return {};
  return readExif(buf, i + 6);
}

// Only the metadata parts of the file are searched, never the picture data itself (random bytes could spell "Sora").
function metaText(buf){
  const parts = []; const L = buf.length; const take = (a, b) => parts.push(buf.toString('latin1', a, Math.min(b, L)));
  try{
    if(buf[0] === 0xff && buf[1] === 0xd8){ // JPEG: APPn and COM segments before the image data
      let o = 2;
      while(o + 4 <= L && buf[o] === 0xff){ const mk = buf[o + 1]; if(mk === 0xda || mk === 0xd9) break; const len = buf.readUInt16BE(o + 2);
        if((mk >= 0xe0 && mk <= 0xef) || mk === 0xfe) take(o + 4, o + 2 + len); o += 2 + len; }
    } else if(buf.toString('latin1', 1, 4) === 'PNG'){ // PNG: text, EXIF and C2PA chunks
      let o = 8;
      while(o + 8 <= L){ const len = buf.readUInt32BE(o), type = buf.toString('latin1', o + 4, o + 8);
        if(/^(tEXt|iTXt|eXIf|caBX)$/.test(type)) take(o + 8, o + 8 + len);
        else if(type === 'zTXt'){ try{ const d = buf.subarray(o + 8, o + 8 + len); const z = d.indexOf(0); parts.push(d.toString('latin1', 0, z) + ' ' + require('zlib').inflateSync(d.subarray(z + 2)).toString('latin1')); }catch{} }
        if(type === 'IEND') break; o += 12 + len; }
    } else if(buf.toString('latin1', 0, 4) === 'RIFF'){ // WebP
      let o = 12;
      while(o + 8 <= L){ const type = buf.toString('latin1', o, o + 4), len = buf.readUInt32LE(o + 4); if(/^(EXIF|XMP )$/.test(type)) take(o + 8, o + 8 + len); o += 8 + len + (len & 1); }
    } else if(buf.toString('latin1', 4, 8) === 'ftyp'){ // MP4 / MOV / HEIC: every top-level box except the media data
      let o = 0;
      while(o + 8 <= L){ let len = buf.readUInt32BE(o); const type = buf.toString('latin1', o + 4, o + 8);
        if(len === 1 && o + 16 <= L) len = Number(buf.readBigUInt64BE(o + 8)); if(len < 8) break;
        if(type !== 'mdat') take(o, o + Math.min(len, 2e6)); o += len; }
    } else take(0, 65536);
  }catch{}
  return parts.join('\n');
}

function inspectMedia(buf, mime = ''){
  const s = metaText(buf);
  const clues = []; const add = (label, detail, points, severity) => clues.push({ label, detail, points, severity: severity || (points >= 20 ? 'high' : points >= 10 ? 'medium' : points > 0 ? 'low' : 'info') });
  let generator = null;
  for(const [name, re] of GENERATORS){ if(re.test(s)){ generator = name; break; } }
  const aiTag = /trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia|algorithmicMedia|c2pa\.ai_generated|"ai_generated"|ai-generated/i.test(s);
  const c2pa = /c2pa|jumbf|\bjumb\b/i.test(s);
  const sdParams = /\bparameters\b[\s\S]{0,400}\bSteps:\s*\d+[\s\S]{0,200}\bSampler:/i.test(s);
  if(aiTag) add('Labeled as AI-made', 'The file’s own metadata says it was created or changed with generative AI.', 45);
  if(generator) add('AI tool named in the file', `The file mentions ${generator}, an AI image or video tool.`, aiTag ? 15 : 35);
  if(sdParams) add('AI generation settings found', 'The file contains image-generation settings (steps, sampler), which AI image tools save automatically.', 40);
  if(c2pa) add('Content Credentials found', aiTag || generator ? 'The file carries Content Credentials (C2PA), a record of how it was made, and that record points to AI.' : 'The file carries Content Credentials (C2PA), a record of how it was made. You can view the record at contentcredentials.org/verify.', 0, 'info');
  const ex = /^image\/(jpeg|jpg|tiff|heic|heif|webp)/i.test(mime) || s.startsWith('\xff\xd8') ? findExif(buf) : {};
  if(ex.software && EDITORS.test(ex.software)) add('Edited in an app', `It was last saved with ${ex.software}. Editing isn’t proof of a fake, but face and photo editors can change who is in a picture.`, /FaceApp|Facetune|Reface|DeepFaceLab|FaceSwap|Remini/i.test(ex.software) ? 20 : 8);
  else if(!ex.software){ const m = EDITORS.exec(s); if(m) add('Edited in an app', `The file mentions ${m[0]}. Editing isn’t proof of a fake, but it means the original was changed.`, 6); }
  if(ex.make || ex.model) add('Camera details present', `Camera details say ${[ex.make, ex.model].filter(Boolean).join(' ')}${ex.date ? ', taken ' + ex.date : ''}. That leans toward a real photo, but these details can be copied or faked.`, 0, 'info');
  if(!aiTag && !generator && !sdParams && !c2pa && !ex.make && !ex.software) add('No metadata to go on', 'The file has no camera or creator details. That’s normal for images saved from texts and social media, so it doesn’t point either way.', 0, 'info');
  return { clues, generator, aiTag, c2pa, camera: ex.make || ex.model ? [ex.make, ex.model].filter(Boolean).join(' ') : null, software: ex.software || null };
}

module.exports = { inspectMedia };
