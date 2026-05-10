const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const token = req.cookies?.auth_token;
  if (!token) return res.status(401).json({ error: 'ກາລຸນາ login ກ່ອນ' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'ldb-dev-secret');
    next();
  } catch {
    res.clearCookie('auth_token');
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
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000
  };
}

module.exports = { requireAuth, requireAdmin, signToken, cookieOpts };
