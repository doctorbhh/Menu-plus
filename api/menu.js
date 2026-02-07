// Menu API with MongoDB storage and JWT authentication
import { connectToDatabase, COLLECTIONS } from './lib/db.js';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

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

export default async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { db } = await connectToDatabase();
        const menuCollection = db.collection(COLLECTIONS.MENU);

        // GET /api/menu - Public: Fetch menu (no auth required)
        if (req.method === 'GET') {
            const menu = await menuCollection.findOne({ _id: 'current' });

            if (menu) {
                // Remove MongoDB _id from response
                const { _id, ...menuData } = menu;
                return res.status(200).json(menuData);
            }

            return res.status(404).json({ error: 'No menu available. Admin needs to upload a menu.' });
        }

        // POST /api/menu - Protected: Update menu (auth required)
        if (req.method === 'POST') {
            // Verify authentication
            const user = verifyToken(req.headers.authorization);

            if (!user) {
                return res.status(401).json({ error: 'Unauthorized. Please login as admin.' });
            }

            const menuData = req.body;
            menuData.lastUpdated = new Date().toISOString();
            menuData.updatedBy = user.username;

            // Upsert menu (update or insert)
            await menuCollection.updateOne(
                { _id: 'current' },
                { $set: { ...menuData, _id: 'current' } },
                { upsert: true }
            );

            return res.status(200).json({
                success: true,
                message: 'Menu updated successfully!',
                updatedBy: user.username,
                updatedAt: menuData.lastUpdated
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Menu API error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
}
