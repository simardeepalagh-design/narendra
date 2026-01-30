require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');

/* ------------------ ENV VALIDATION ------------------ */
const REQUIRED_ENV = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
const missingEnv = REQUIRED_ENV.filter(key => !process.env[key]);

if (missingEnv.length > 0) {
    console.error('❌ Missing required environment variables:', missingEnv.join(', '));
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

/* ------------------ CLOUDINARY ------------------ */
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
console.log('✅ Cloudinary Configured Successfully');

/* ------------------ MIDDLEWARE ------------------ */
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ------------------ MULTER (MEMORY) ------------------ */
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // Limit to 5MB
});

/* ------------------ DB ------------------ */
const DB_PATH = path.join(__dirname, 'data', 'db.json');

if (!fs.existsSync(DB_PATH)) {
    fs.outputJsonSync(DB_PATH, { images: [] });
}

/* ------------------ AUTH ------------------ */
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    // TODO: Move credentials to .env for production
    if (username === 'admin' && password === 'admin123') {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false });
    }
});

/* ------------------ GET IMAGES ------------------ */
app.get('/api/images/:section', async (req, res) => {
    try {
        const db = await fs.readJson(DB_PATH);
        let images = db.images;

        if (req.params.section !== 'all') {
            images = images.filter(i => i.section === req.params.section);
        }

        res.json(images.reverse());
    } catch (error) {
        console.error('Error fetching images:', error);
        res.status(500).json({ error: 'Failed to fetch images' });
    }
});

/* ------------------ UPLOAD IMAGE ------------------ */
app.post('/api/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { section, category } = req.body;
        if (!section || !category) {
            return res.status(400).json({ error: 'Section and Category are required' });
        }

        const result = await cloudinary.uploader.upload(
            `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`,
            { folder: `interio/${section}` }
        );

        const db = await fs.readJson(DB_PATH);

        const imageData = {
            id: Date.now().toString(),
            section,
            category,
            url: result.secure_url,
            public_id: result.public_id,
            createdAt: Date.now()
        };

        db.images.push(imageData);
        await fs.writeJson(DB_PATH, db, { spaces: 2 });

        res.json({ success: true, image: imageData });

    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ error: 'Upload failed', details: err.message });
    }
});

/* ------------------ DELETE IMAGE ------------------ */
app.delete('/api/images/:id', async (req, res) => {
    try {
        const db = await fs.readJson(DB_PATH);
        const index = db.images.findIndex(i => i.id === req.params.id);

        if (index === -1) {
            return res.status(404).json({ error: 'Image not found' });
        }

        const image = db.images[index];

        // Delete from Cloudinary
        if (image.public_id) {
            await cloudinary.uploader.destroy(image.public_id);
        }

        db.images.splice(index, 1);
        await fs.writeJson(DB_PATH, db, { spaces: 2 });

        res.json({ success: true });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Delete failed' });
    }
});

/* ------------------ START ------------------ */
app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
    console.log(`   Admin Dashboard: http://localhost:${PORT}/admin.html`);
});