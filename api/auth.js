// Admin Authentication API - Vercel Serverless Function
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';
const DB_NAME = 'menuplus';

let cachedClient = null;

async function connectToDatabase() {
    if (cachedClient) {
        return cachedClient.db(DB_NAME);
    }

    if (!MONGODB_URI) {
        throw new Error('MONGODB_URI not configured');
    }

    try {
        const client = new MongoClient(MONGODB_URI, {
            maxPoolSize: 1,
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 10000,
        });

        await client.connect();
        cachedClient = client;
        return client.db(DB_NAME);
    } catch (err) {
        throw new Error(`MongoDB connection failed: ${err.message}`);
    }
}

module.exports = async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Health check for GET requests
    if (req.method === 'GET') {
        return res.status(200).json({
            status: 'ok',
            hasMongoUri: !!MONGODB_URI,
            mongoUriStart: MONGODB_URI ? MONGODB_URI.substring(0, 20) + '...' : 'not set'
        });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    let db;
    try {
        db = await connectToDatabase();
    } catch (err) {
        console.error('DB connection error:', err);
        return res.status(500).json({ error: err.message });
    }

    try {
        const adminCollection = db.collection('admin');
        const { action, username, password, token } = req.body || {};

        if (!action) {
            return res.status(400).json({ error: 'Missing action parameter' });
        }

        if (action === 'login') {
            if (!username || !password) {
                return res.status(400).json({ error: 'Username and password required' });
            }

            const admin = await adminCollection.findOne({ username });

            if (!admin) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const isValid = await bcrypt.compare(password, admin.passwordHash);

            if (!isValid) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const jwtToken = jwt.sign(
                { id: admin._id.toString(), username: admin.username },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            return res.status(200).json({
                success: true,
                token: jwtToken,
                username: admin.username,
            });
        }

        if (action === 'register') {
            if (!username || !password) {
                return res.status(400).json({ error: 'Username and password required' });
            }

            const existingAdmin = await adminCollection.findOne({});

            if (existingAdmin) {
                return res.status(403).json({ error: 'Admin already exists' });
            }

            const passwordHash = await bcrypt.hash(password, 10);

            await adminCollection.insertOne({
                username,
                passwordHash,
                createdAt: new Date(),
            });

            return res.status(201).json({ success: true, message: 'Admin created' });
        }

        if (action === 'verify') {
            if (!token) {
                return res.status(400).json({ error: 'Token required' });
            }

            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                return res.status(200).json({ valid: true, username: decoded.username });
            } catch (err) {
                return res.status(401).json({ valid: false, error: 'Invalid token' });
            }
        }

        return res.status(400).json({ error: 'Invalid action: ' + action });
    } catch (error) {
        console.error('Auth error:', error);
        return res.status(500).json({ error: 'Auth error: ' + error.message });
    }
};
