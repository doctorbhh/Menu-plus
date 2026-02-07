import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-secret-change-in-production';

// Enable CORS for React app
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Data storage paths
const dataDir = path.join(__dirname, 'data');
const menuFilePath = path.join(dataDir, 'menu.json');
const adminFilePath = path.join(dataDir, 'admin.json');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Load data helpers
function loadJSON(filePath) {
    if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    return null;
}

function saveJSON(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Verify JWT token
function verifyToken(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    const token = authHeader.split(' ')[1];
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        return null;
    }
}

// ==================== AUTH API ====================

// POST /api/auth - Login, Register, Verify
app.post('/api/auth', async (req, res) => {
    const { action, username, password, token } = req.body;

    if (action === 'login') {
        const admin = loadJSON(adminFilePath);

        if (!admin || admin.username !== username) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isValid = await bcrypt.compare(password, admin.passwordHash);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const jwtToken = jwt.sign(
            { id: admin.username, username: admin.username },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        return res.json({ success: true, token: jwtToken, username: admin.username });
    }

    if (action === 'register') {
        const existingAdmin = loadJSON(adminFilePath);

        if (existingAdmin) {
            return res.status(403).json({ error: 'Admin already exists' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        saveJSON(adminFilePath, {
            username,
            passwordHash,
            createdAt: new Date().toISOString(),
        });

        console.log(`✅ Admin account created: ${username}`);
        return res.status(201).json({ success: true, message: 'Admin created' });
    }

    if (action === 'verify') {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            return res.json({ valid: true, username: decoded.username });
        } catch (err) {
            return res.status(401).json({ valid: false, error: 'Invalid token' });
        }
    }

    return res.status(400).json({ error: 'Invalid action' });
});

// ==================== MENU API ====================

// GET /api/menu - Public: Fetch menu
app.get('/api/menu', (req, res) => {
    const menu = loadJSON(menuFilePath);

    if (menu) {
        return res.json(menu);
    }
    return res.status(404).json({ error: 'No menu available' });
});

// POST /api/menu - Protected: Update menu
app.post('/api/menu', (req, res) => {
    const user = verifyToken(req.headers.authorization);

    if (!user) {
        return res.status(401).json({ error: 'Unauthorized. Please login.' });
    }

    const menuData = req.body;
    menuData.lastUpdated = new Date().toISOString();
    menuData.updatedBy = user.username;

    saveJSON(menuFilePath, menuData);

    console.log(`✅ Menu updated by ${user.username}`);
    return res.json({
        success: true,
        message: 'Menu updated!',
        updatedBy: user.username
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', hasMenu: fs.existsSync(menuFilePath) });
});

app.listen(PORT, () => {
    console.log(`
🍽️  Menu+ API Server (Local Dev)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 API:    http://localhost:${PORT}/api/menu
🔐 Auth:   http://localhost:${PORT}/api/auth  
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});
