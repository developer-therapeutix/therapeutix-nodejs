const express = require('express');
const path = require('path');

const router = express.Router();

// Serve images from the assets/images directory
router.get('/:imageName', (req, res) => {
    const imageName = req.params.imageName;
    const imagePath = path.join(__dirname, '..', 'assets', 'images', imageName);
    res.sendFile(imagePath, (err) => {
        if (err) {
            res.status(404).json({ error_code: 'IMAGE_NOT_FOUND', error: 'Image not found' });
        }
    });
});

module.exports = router;

