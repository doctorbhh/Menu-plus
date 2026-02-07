// Admin Authentication API - Vercel Serverless Function
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';
const DB_NAME = 'menuplus';

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
    if (cachedClient && cachedDb) {
        return { client: cachedClient, db: cachedDb };
    }

    if (!MONGODB_URI) {
        throw new Error('MONGODB_URI environment variable not set');
    }

    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(DB_NAME);

    cachedClient = client;
    cachedDb = db;

    return { client, db };
}

module.exports = async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { db } = await connectToDatabase();
        const adminCollection = db.collection('admin');

        const { action, username, password, token } = req.body;

        if (action === 'login') {
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
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                return res.status(200).json({ valid: true, username: decoded.username });
            } catch (err) {
                return res.status(401).json({ valid: false, error: 'Invalid token' });
            }
        }

        return res.status(400).json({ error: 'Invalid action' });
    } catch (error) {
        console.error('Auth error:', error);
        return res.status(500).json({ error: 'Server error: ' + error.message });
    }
};
