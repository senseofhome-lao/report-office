const express = require('express');
const bcrypt = require('bcryptjs');
const { getOne } = require('../database/db');
const { requireAuth, signToken, cookieOpts } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'ກາລຸນາປ້ອນຊື່ຜູ້ໃຊ້ ແລະ ລະຫັດຜ່ານ' });

    const user = await getOne('SELECT * FROM users WHERE username = ?', [username]);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'ຊື່ຜູ້ໃຊ້ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ' });
    }

    const token = signToken(user);
    res.cookie('auth_token', token, cookieOpts());
    res.json({ success: true, role: user.role, full_name: user.full_name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ success: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

module.exports = router;
