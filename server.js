const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const app = express();
const PORT = 3000;
const cloudinary = require('cloudinary').v2;
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Middleware
app.use(cors());
app.use(express.json());

// Serve frontend files only (NOT whole project)
app.use(express.static(path.join(__dirname, 'public')));

// DB Path
const DB_PATH = path.join(__dirname, 'data', 'db.json');

// Ensure DB exists
if (!fs.existsSync(DB_PATH)) {
    fs.outputJsonSync(DB_PATH, { images: [] });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        // Create unique filename: timestamp-originalName
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// --- API Endpoints ---

// Login Endpoint (Simple Hardcoded)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'admin123') {
        res.json({ success: true, message: 'Login valid' });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// Get Images by Section
app.get('/api/images/:section', async (req, res) => {
    try {
        const sectionParam = req.params.section; // Expected: Interior, Furniture, Showroom, or 'all'
        const db = await fs.readJson(DB_PATH);
        let images = db.images;

        if (sectionParam !== 'all') {
            images = images.filter(img => img.section === sectionParam);
        }

        // Return most recent first
        res.json(images.reverse());
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to Fetch Images' });
    }
});

// Upload Image Endpoint (Cloudinary)
app.post('/api/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { section, category, caption } = req.body;

        if (!section) {
            return res.status(400).json({ error: 'Section is required' });
        }

        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(
            `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`,
            {
                folder: `interio/${section}`,
            }
        );

        // Save only URL + metadata
        const imageData = {
            url: result.secure_url,
            section,
            category: category || 'all',
            caption: caption || '',
            createdAt: Date.now()
        };

        const dbPath = path.join(__dirname, 'data', 'db.json');
        const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

        db.images.push(imageData);
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

        res.json({
            success: true,
            image: imageData
        });

    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// Delete Image Endpoint
app.delete('/api/images/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const db = await fs.readJson(DB_PATH);

        const imageIndex = db.images.findIndex(img => img.id === id);
        if (imageIndex === -1) {
            return res.status(404).json({ error: 'Image not found' });
        }

        const image = db.images[imageIndex];

        // Delete file from filesystem
        const filePath = path.join(__dirname, image.path);
        if (await fs.pathExists(filePath)) {
            await fs.remove(filePath);
        }

        // Remove from DB
        db.images.splice(imageIndex, 1);
        await fs.writeJson(DB_PATH, db, { spaces: 2 });

        res.json({ success: true, message: 'Image deleted' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Delete Failed' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Admin Dashboard: http://localhost:${PORT}/admin.html`);
});
