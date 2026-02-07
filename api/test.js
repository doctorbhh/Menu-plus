// Simple test endpoint to verify Vercel is working
module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    return res.status(200).json({
        status: 'ok',
        method: req.method,
        timestamp: new Date().toISOString(),
        env: {
            hasMongoUri: !!process.env.MONGODB_URI,
            hasJwtSecret: !!process.env.JWT_SECRET
        }
    });
};
