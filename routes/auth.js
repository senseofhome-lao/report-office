const express = require('express');
const bcrypt = require('bcryptjs');
const { getDB } = require('../database/db');
const { requireAuth, signToken, cookieOpts, COOKIE_NAME } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'ກາລຸນາປ້ອນຊື່ຜູ້ໃຊ້ ແລະ ລະຫັດຜ່ານ' });

    const db = getDB();
    const snap = await db.collection('users').where('username', '==', username).limit(1).get();
    if (snap.empty) return res.status(401).json({ error: 'ຊື່ຜູ້ໃຊ້ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ' });

    const user = { id: snap.docs[0].id, ...snap.docs[0].data() };
    if (!bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: 'ຊື່ຜູ້ໃຊ້ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ' });

    const token = signToken(user);
    res.cookie(COOKIE_NAME, token, cookieOpts());
    res.json({ success: true, role: user.role, full_name: user.full_name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ success: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

module.exports = router;
