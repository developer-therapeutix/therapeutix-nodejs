const express = require('express');
const { authenticate } = require('./middleware/helper');
const multer = require('multer');
const AWS = require('aws-sdk');
const upload = multer({ storage: multer.memoryStorage() });

const sharp = require('sharp');
const Tesseract = require('tesseract.js');
const pdfParse = require('pdf-parse');
const path = require('path');
const os = require('os');
const { Converter } = require('pdf-poppler');

const fs = require('fs');

const router = express.Router();

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

router.post('/upload', express.json({ limit: process.env.DOCUMENTS_JSON_LIMIT || '25mb' }), authenticate, async (req, res) => {
  const userId = (req.user && (req.user.userId || req.user._id));
  if (!userId) return res.status(401).json({ error_code: 'UNAUTHORIZED', error: 'User not authenticated' });

  const stripDataUrl = (s) => {
    if (typeof s !== 'string') return s;
    if (s.startsWith('data:')) {
      const comma = s.indexOf(',');
      if (comma !== -1) return s.slice(comma + 1);
    }
    return s;
  };

  const uploadOne = async ({ name, mime, data, folder }) => {
    if (!name || !mime || !data) throw new Error('INVALID_PAYLOAD');
    const safeName = String(name).replace(/[^a-zA-Z0-9._-]/g, '_');
    const buffer = Buffer.from(stripDataUrl(data), 'base64');
    const key = `${userId}/${folder}/${safeName}`;
    const params = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mime,
      ContentLength: buffer.length
    };
    const out = await s3.upload(params).promise();
    return { key, url: out.Location, size: buffer.length, mime };
  };

  try {
    const list = Array.isArray(req.body.attachments)
      ? req.body.attachments
      : (Array.isArray(req.body.files) ? req.body.files : null);

    if (list) {
      const results = await Promise.all(list.map(uploadOne));
      return res.json({ items: results });
    }
    const fileObj = req.body.file || { name: req.body.name, mime: req.body.mime, data: req.body.data, folder: req.body.folder || 'documents' };
    const result = await uploadOne(fileObj);
    return res.json(result);
  } catch (err) {
    if (err.message === 'INVALID_PAYLOAD') {
      return res.status(400).json({ error_code: 'INVALID_PAYLOAD', error: 'Expected {name,mime,data} or {attachments:[...]}' });
    }
    return res.status(500).json({ error_code: 'S3_UPLOAD_FAILED', error: err.message });
  }
});


// Load (stream) a file from S3
router.get('/load/:key', authenticate, async (req, res) => {
  const userId = (req.user && (req.user.userId || req.user._id));
  const key = req.params.key;
  if (!key || !key.startsWith(`${userId}/`)) {
    return res.status(403).json({ error_code: 'FORBIDDEN', error: 'Access to this file is not allowed' });
  }
  const params = { Bucket: process.env.AWS_S3_BUCKET, Key: key };
  try {
    const s3Stream = s3.getObject(params).createReadStream();
    s3Stream.on('error', err => res.status(404).json({ error: 'File not found' }));
    res.setHeader('Content-Disposition', `inline; filename="${key.split('/').pop()}"`);
    s3Stream.pipe(res);
  } catch (err) {
    res.status(500).json({ error_code: 'S3_LOAD_FAILED', error: err.message });
  }
});

// Download a file from S3
router.get('/download/:key', authenticate, async (req, res) => {
  const userId = (req.user && (req.user.userId || req.user._id));
  const key = req.params.key;
  if (!key || !key.startsWith(`${userId}/`)) {
    return res.status(403).json({ error_code: 'FORBIDDEN', error: 'Access to this file is not allowed' });
  }
  const params = { Bucket: process.env.AWS_S3_BUCKET, Key: key };
  try {
    const s3Stream = s3.getObject(params).createReadStream();
    s3Stream.on('error', err => res.status(404).json({ error: 'File not found' }));
    res.setHeader('Content-Disposition', `attachment; filename="${key.split('/').pop()}"`);
    s3Stream.pipe(res);
  } catch (err) {
    res.status(500).json({ error_code: 'S3_DOWNLOAD_FAILED', error: err.message });
  }
});

// Delete a file from S3 (must belong to current user)
router.delete('/delete/:key', authenticate, async (req, res) => {
  const userId = (req.user && (req.user.userId || req.user._id));
  const key = req.params.key;
  if (!key) return res.status(400).json({ error_code: 'MISSING_KEY', error: 'Key is required' });
  if (!key.startsWith(`${userId}/`)) {
    return res.status(403).json({ error_code: 'FORBIDDEN', error: 'Access to this file is not allowed' });
  }
  try {
    await s3.deleteObject({ Bucket: process.env.AWS_S3_BUCKET, Key: key }).promise();
    return res.json({ deleted: true, key });
  } catch (err) {
    if (err.code === 'NoSuchKey' || err.statusCode === 404) {
      return res.status(404).json({ error_code: 'NOT_FOUND', error: 'File not found' });
    }
    return res.status(500).json({ error_code: 'S3_DELETE_FAILED', error: err.message });
  }
});

router.post('/ocr', express.json({ limit: process.env.DOCUMENTS_JSON_LIMIT || '25mb' }), authenticate, async (req, res) => {
  const userId = (req.user && (req.user.userId || req.user._id));
  if (!userId) return res.status(401).json({ error_code: 'UNAUTHORIZED', error: 'User not authenticated' });

  const { files } = req.body;
  
  if (!Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error_code: 'MISSING_FILES', error: 'Files are required' });
  }
  const results = [];
  for (const f of files) {
    if (!f.name || !f.mime || !f.data) {
      return res.status(400).json({ error_code: 'INVALID_FILE_OBJECT', error: 'Each file must have name, mime, and data' });
    }
    const safeName = String(f.name).replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `./uploads/${safeName}`;
    try {
      // Distinguish PDF vs image
      if (f.mime === 'application/pdf' || safeName.toLowerCase().endsWith('.pdf')) {
        const pdfBuffer = Buffer.from(f.data, 'base64');
        fs.writeFileSync(filePath, pdfBuffer);
        let layerText = '';
        try {
          const parsed = await pdfParse(pdfBuffer);
          layerText = parsed.text || '';
        } catch (e) {
          layerText = '';
        }
        let ocrText = '';
        if (isMostlyEmpty(layerText)) {
          // Rasterize pages and OCR each until group found
            const pageBuffers = await rasterizePdfToPngBuffers(filePath, { dpi: 220 });
            for (const pb of pageBuffers) {
              const pre = await preprocessImageBuffer(pb);
              const { data: { text: pageText = '' } = {} } = await Tesseract.recognize(pre, 'deu');
              ocrText += '\n' + pageText;
              if (extractDiagnosisGroup(cleanText(ocrText))) break; // early exit
            }
        }
        const combined = cleanText(layerText + '\n' + ocrText);
        const diagnosisGroup = extractDiagnosisGroup(combined);
        results.push({ name: f.name, diagnosisGroup, source: 'pdf', hadTextLayer: !isMostlyEmpty(layerText) });
      } else {
        fs.writeFileSync(filePath, Buffer.from(f.data, 'base64'));
        const processed = await preprocessImage(f.data);
        const result = await Tesseract.recognize(processed, 'deu');
        const rawText = result?.data?.text || '';
        const cleaned = cleanText(rawText);
        const diagnosisGroup = extractDiagnosisGroup(cleaned);
        results.push({ name: f.name, diagnosisGroup, source: 'image' });
      }
    } catch (err) {
      results.push({ name: f.name, error: err.message || String(err) });
    } finally {
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_) { /* ignore */ }
      }
    }
  }
  return res.json({ results });
});

async function preprocessImage(base64Data) {
  const buf = Buffer.from(base64Data, 'base64');
  // Resize if small, grayscale, increase contrast, binarize
  let img = sharp(buf)
    .rotate()             // auto-orient
    .grayscale()
    .normalize();         // stretch contrast
  const metadata = await img.metadata();
  if ((metadata.width || 0) < 1600) {
    img = img.resize({ width: 1800, withoutEnlargement: false });
  }
  // Simple threshold (binarize)
  const processed = await img
    .threshold(170)       // tweak if needed (150–190 range)
    .toBuffer();
  return processed;
}

async function preprocessImageBuffer(buf) {
  let img = sharp(buf).rotate().grayscale().normalize();
  const metadata = await img.metadata();
  if ((metadata.width || 0) < 1600) {
    img = img.resize({ width: 1800, withoutEnlargement: false });
  }
  return img.threshold(170).toBuffer();
}

function cleanText(t) {
  return t
    .replace(/\u00AD/g, '')                  // soft hyphen
    .replace(/([A-Za-zÄÖÜäöü])-\s+([a-zäöü])/g, '$1$2') // join hyphen line breaks
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isMostlyEmpty(t) {
  return !t || t.replace(/\s+/g, '').length < 30; // threshold tweakable
}

async function rasterizePdfToPngBuffers(pdfPath, { dpi = 200 } = {}) {
  // pdf-poppler converts pages to numbered PNG files in a directory
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfpp-'));
  const baseName = path.basename(pdfPath, path.extname(pdfPath));
  const outPrefix = path.join(outDir, baseName);
  const converter = new Converter(pdfPath, {
    format: 'png',
    out_dir: outDir,
    out_prefix: outPrefix,
    page: null,
    dpi
  });
  await converter.convert();
  const files = fs.readdirSync(outDir)
    .filter(f => f.startsWith(path.basename(outPrefix)) && f.endsWith('.png'))
    .sort();
  const buffers = files.map(f => fs.readFileSync(path.join(outDir, f)));
  // Cleanup
  try {
    for (const f of files) fs.unlinkSync(path.join(outDir, f));
    fs.rmdirSync(outDir);
  } catch (_) { /* ignore */ }
  return buffers;
}

// Strategy:
// 1. Normalise whitespace & umlauts, remove soft hyphens & fancy quotes.
// 2. Look for the word "gruppe" (case-insensitive) followed by up to ~10 non-alphanumerics
//    and then capture an uppercase+digit pattern (letters 1–3 then 1–2 digits).
// 3. Provide fallbacks with tolerant spacing (e.g. "P S 2", "P S2").
// 4. Correct common OCR confusions (Z->2, S->5 and vice versa) using a small dictionary of allowed codes.
function extractDiagnosisGroup(text) {
  if (!text) return null;
  const ALLOWED = ['SB1','PS2']; // Extend if needed.

  const normalised = text
    .replace(/[“”„"']/g, '"')
    .replace(/\u00AD/g, '')
    .replace(/[^\S\r\n]+/g, ' ');

  // Primary regex: find "gruppe" then the code.
  const primary = /gruppe[^A-Z0-9]{0,10}([A-Z]{1,3}\s?\d{1,2})/i.exec(normalised);
  if (primary) {
    const cand = normaliseCode(primary[1]);
    const validated = validateCode(cand, ALLOWED);
    if (validated) return validated;
  }

  // Fallback: scan tokens and fuzzy match allowed codes.
  const tokenMatches = [];
  const tokenRegex = /\b([A-Z0-9]{2,6})\b/g;
  let m;
  while ((m = tokenRegex.exec(normalised)) !== null) {
    tokenMatches.push(normaliseCode(m[1]));
  }
  for (const tok of tokenMatches) {
    const validated = validateCode(tok, ALLOWED);
    if (validated) return validated;
  }

  // Fuzzy match (Levenshtein distance <=1) if not exact.
  let best = null;
  let bestDist = 2;
  for (const tok of tokenMatches) {
    for (const code of ALLOWED) {
      const d = levenshtein(tok, code);
      if (d < bestDist) { bestDist = d; best = code; }
    }
  }
  return bestDist <= 1 ? best : null;
}

function normaliseCode(c) {
  return c
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/Z/g, '2') // common misread
    .replace(/5(?=\d)/g, 'S'); // 5 vs S confusion before a digit
}

function validateCode(code, allowed) {
  if (!code) return null;
  if (allowed.includes(code)) return code;
  return null;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

module.exports = router;
