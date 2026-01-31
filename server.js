require('dotenv').config();
const express = require('express');
const cors = require('cors');
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

/* ------------------ GET IMAGES (FROM CLOUDINARY) ------------------ */
app.get('/api/images/:section', async (req, res) => {
    try {
        const { section } = req.params;
        let expression = `folder:interio/*`; // Default: fetch everything under interio

        if (section !== 'all') {
            expression = `folder:interio/${section}/*`;
        }

        const result = await cloudinary.search
            .expression(expression)
            .sort_by('created_at', 'desc')
            .max_results(100)
            .with_field('context') // Fetches custom metadata (category)
            .execute();

        // DEBUG: Log the first result to see structure
        if (result.resources.length > 0) {
            console.log('[DEBUG] First Image Raw Context:', JSON.stringify(result.resources[0].context));
        }

        // Map Cloudinary result to our frontend format
        const images = result.resources.map(res => {
            // Context can be directly in .context or .context.custom depending on config
            const category = res.context?.category || res.context?.custom?.category || '';

            return {
                id: res.public_id,
                url: res.secure_url,
                // Safely handle missing folder or context
                section: (res.folder || '').split('/')[1] || 'Uncategorized',
                category: category,
                createdAt: res.created_at
            };
        });

        res.json(images);
    } catch (error) {
        console.error('Error fetching images:', error);
        res.status(500).json({ error: 'Failed to fetch images from Cloudinary' });
    }
});

/* ------------------ UPLOAD IMAGE (TO CLOUDINARY) ------------------ */
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
            {
                folder: `interio/${section}`,
                context: { category: category } // Save category as metadata
            }
        );

        const imageData = {
            id: result.public_id,
            section,
            category,
            url: result.secure_url,
            createdAt: new Date().toISOString()
        };

        res.json({ success: true, image: imageData });

    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ error: 'Upload failed', details: err.message });
    }
});

/* ------------------ DELETE IMAGE (FROM CLOUDINARY) ------------------ */
app.delete('/api/images', async (req, res) => {
    try {
        const publicId = req.query.id; // Get ID from Query Param
        console.log(`[DELETE] Request for ID: ${publicId}`);

        if (!publicId) {
            return res.status(400).json({ error: 'Missing image ID' });
        }

        // Delete from Cloudinary
        const result = await cloudinary.uploader.destroy(publicId);

        if (result.result !== 'ok') {
            console.error(`[DELETE] Cloudinary Error: ${JSON.stringify(result)}`);
            throw new Error('Cloudinary delete failed');
        }

        console.log(`[DELETE] Success for ID: ${publicId}`);
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