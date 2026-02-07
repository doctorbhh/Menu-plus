// Menu API - Vercel Serverless Function
const { MongoClient } = require('mongodb');
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

module.exports = async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { db } = await connectToDatabase();
        const menuCollection = db.collection('menu');

        // GET /api/menu - Public: Fetch menu
        if (req.method === 'GET') {
            const menu = await menuCollection.findOne({ _id: 'current' });

            if (menu) {
                const { _id, ...menuData } = menu;
                return res.status(200).json(menuData);
            }

            return res.status(404).json({ error: 'No menu available' });
        }

        // POST /api/menu - Protected: Update menu
        if (req.method === 'POST') {
            const user = verifyToken(req.headers.authorization);

            if (!user) {
                return res.status(401).json({ error: 'Unauthorized. Please login.' });
            }

            const menuData = req.body;
            menuData.lastUpdated = new Date().toISOString();
            menuData.updatedBy = user.username;

            await menuCollection.updateOne(
                { _id: 'current' },
                { $set: { ...menuData, _id: 'current' } },
                { upsert: true }
            );

            return res.status(200).json({
                success: true,
                message: 'Menu updated!',
                updatedBy: user.username,
                updatedAt: menuData.lastUpdated
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Menu API error:', error);
        return res.status(500).json({ error: 'Server error: ' + error.message });
    }
};
