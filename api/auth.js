// Admin Authentication API
import { connectToDatabase, COLLECTIONS } from './lib/db.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

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
        const adminCollection = db.collection(COLLECTIONS.ADMIN);

        // POST /api/auth - Login
        if (req.method === 'POST') {
            const { action, username, password } = req.body;

            if (action === 'login') {
                // Find admin user
                const admin = await adminCollection.findOne({ username });

                if (!admin) {
                    return res.status(401).json({ error: 'Invalid credentials' });
                }

                // Verify password
                const isValid = await bcrypt.compare(password, admin.passwordHash);

                if (!isValid) {
                    return res.status(401).json({ error: 'Invalid credentials' });
                }

                // Generate JWT token
                const token = jwt.sign(
                    { id: admin._id, username: admin.username },
                    JWT_SECRET,
                    { expiresIn: '7d' }
                );

                return res.status(200).json({
                    success: true,
                    token,
                    username: admin.username,
                });
            }

            if (action === 'register') {
                // Check if any admin exists (only allow first registration)
                const existingAdmin = await adminCollection.findOne({});

                if (existingAdmin) {
                    return res.status(403).json({ error: 'Admin already exists. Contact system administrator.' });
                }

                // Hash password and create admin
                const passwordHash = await bcrypt.hash(password, 10);

                await adminCollection.insertOne({
                    username,
                    passwordHash,
                    createdAt: new Date(),
                });

                return res.status(201).json({ success: true, message: 'Admin created successfully' });
            }

            if (action === 'verify') {
                // Verify JWT token
                const token = req.body.token;

                try {
                    const decoded = jwt.verify(token, JWT_SECRET);
                    return res.status(200).json({ valid: true, username: decoded.username });
                } catch (err) {
                    return res.status(401).json({ valid: false, error: 'Invalid or expired token' });
                }
            }
        }

        return res.status(400).json({ error: 'Invalid request' });
    } catch (error) {
        console.error('Auth error:', error);
        return res.status(500).json({ error: 'Server error' });
    }
}
