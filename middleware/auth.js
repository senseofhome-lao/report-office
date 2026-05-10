const jwt = require('jsonwebtoken');

// Firebase Hosting only forwards cookies named '__session' to Cloud Functions.
// All other cookie names are stripped at the CDN layer.
const COOKIE_NAME = '__session';

function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'ກາລຸນາ login ກ່ອນ' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'ldb-dev-secret');
    next();
  } catch {
    res.clearCookie(COOKIE_NAME);
    return res.status(401).json({ error: 'Session ໝົດອາຍຸ ກາລຸນາ login ໃໝ່' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'ບໍ່ມີສິດໃຊ້ງານ' });
    next();
  });
}

function signToken(user) {
  const payload = { id: user.id, username: user.username, full_name: user.full_name, role: user.role, branch: user.branch };
  return jwt.sign(payload, process.env.JWT_SECRET || 'ldb-dev-secret', { expiresIn: '8h' });
}

function cookieOpts() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000
  };
}

module.exports = { requireAuth, requireAdmin, signToken, cookieOpts, COOKIE_NAME };
