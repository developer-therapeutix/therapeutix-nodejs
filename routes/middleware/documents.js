const express = require('express');
const { authenticate } = require('./helper');
const multer = require('multer');
const AWS = require('aws-sdk');
const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error_code: 'NO_FILE_UPLOADED', error: 'No file uploaded' });

  const params = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: `${req.user._id}/${Date.now()}_${req.file.originalname}`,
    Body: req.file.buffer,
    ContentType: req.file.mimetype
  };

  try {
    const data = await s3.upload(params).promise();
    res.json({ url: data.Location });
  } catch (err) {
    res.status(500).json({ error_code: 'S3_UPLOAD_FAILED', error: err.message });
  }
});


// Load (stream) a file from S3
router.get('/load/:key', authenticate, async (req, res) => {
  const params = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: req.params.key
  };
  try {
    const s3Stream = s3.getObject(params).createReadStream();
    s3Stream.on('error', err => res.status(404).json({ error: 'File not found' }));
    res.setHeader('Content-Disposition', `inline; filename="${req.params.key.split('/').pop()}"`);
    s3Stream.pipe(res);
  } catch (err) {
    res.status(500).json({ error_code: 'S3_LOAD_FAILED', error: err.message });
  }
});

// Download a file from S3
router.get('/download/:key', authenticate, async (req, res) => {
  const params = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: req.params.key
  };
  try {
    const s3Stream = s3.getObject(params).createReadStream();
    s3Stream.on('error', err => res.status(404).json({ error: 'File not found' }));
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.key.split('/').pop()}"`);
    s3Stream.pipe(res);
  } catch (err) {
    res.status(500).json({ error_code: 'S3_DOWNLOAD_FAILED', error: err.message });
  }
});

module.exports = router;
