const express = require('express');
const bcrypt = require('bcryptjs');
const { getDB } = require('../database/db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

function avg(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }

router.get('/summary', requireAdmin, async (req, res) => {
  try {
    const year = String(req.query.year || new Date().getFullYear());
    const db = getDB();

    const allSnap = await db.collection('movements').get();
    const allMovements = allSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const movements = allMovements.filter(m => (m.movement_date_start || '').startsWith(year));

    // Available years
    const yearSet = new Set(allMovements.map(m => (m.movement_date_start || '').slice(0, 4)).filter(Boolean));
    const availableYears = [...yearSet].sort((a, b) => b.localeCompare(a));

    // Overall scores
    const overallScores = {
      avg_location: avg(movements.map(m => +m.location_score || 0)),
      avg_service:  avg(movements.map(m => +m.service_score  || 0)),
      avg_staff:    avg(movements.map(m => +m.staff_score     || 0)),
      avg_total:    avg(movements.map(m => ((+m.location_score + +m.service_score + +m.staff_score) / 3) || 0))
    };

    // By period
    const byPeriod = [1, 2, 3].map(p => {
      const items = movements.filter(m => m.period === p);
      if (!items.length) return null;
      return {
        period: p, count: items.length,
        avg_location: avg(items.map(m => +m.location_score || 0)),
        avg_service:  avg(items.map(m => +m.service_score  || 0)),
        avg_staff:    avg(items.map(m => +m.staff_score     || 0)),
        avg_total:    avg(items.map(m => ((+m.location_score + +m.service_score + +m.staff_score) / 3)))
      };
    }).filter(Boolean);

    // By province
    const provinceMap = {};
    movements.forEach(m => {
      if (!m.province) return;
      if (!provinceMap[m.province]) provinceMap[m.province] = [];
      provinceMap[m.province].push((+m.location_score + +m.service_score + +m.staff_score) / 3);
    });
    const byProvince = Object.entries(provinceMap)
      .map(([province, scores]) => ({ province, count: scores.length, avg_score: avg(scores) }))
      .sort((a, b) => b.count - a.count);

    // By user — need user info
    const usersSnap = await db.collection('users').get();
    const usersMap = {};
    usersSnap.docs.forEach(d => { usersMap[d.id] = { full_name: d.data().full_name, branch: d.data().branch }; });

    const userMovMap = {};
    movements.forEach(m => {
      if (!userMovMap[m.user_id]) userMovMap[m.user_id] = [];
      userMovMap[m.user_id].push(m);
    });
    const byUser = Object.entries(userMovMap).map(([uid, items]) => ({
      full_name: usersMap[uid]?.full_name || uid,
      branch: usersMap[uid]?.branch || '',
      count: items.length,
      avg_location: avg(items.map(m => +m.location_score || 0)),
      avg_service:  avg(items.map(m => +m.service_score  || 0)),
      avg_staff:    avg(items.map(m => +m.staff_score     || 0)),
      avg_total:    avg(items.map(m => ((+m.location_score + +m.service_score + +m.staff_score) / 3)))
    })).sort((a, b) => b.count - a.count);

    // Pending summary
    const movIds = movements.map(m => m.id);
    let pendingTotal = 0, pendingDone = 0;
    if (movIds.length) {
      // Firestore 'in' query supports up to 30 items — batch if needed
      const chunks = [];
      for (let i = 0; i < movIds.length; i += 30) chunks.push(movIds.slice(i, i + 30));
      for (const chunk of chunks) {
        const pSnap = await db.collection('pending_items').where('movement_id', 'in', chunk).get();
        pSnap.docs.forEach(d => {
          pendingTotal++;
          if (d.data().is_completed) pendingDone++;
        });
      }
    }

    res.json({
      year, totalMovements: movements.length,
      byPeriod, byProvince, byUser, overallScores,
      pendingSummary: { total: pendingTotal, done: pendingDone },
      availableYears
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

router.get('/movements', requireAdmin, async (req, res) => {
  try {
    const { year, period, user_id } = req.query;
    const db = getDB();

    const snap = await db.collection('movements').get();
    let movements = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (year) movements = movements.filter(m => (m.movement_date_start || '').startsWith(year));
    if (period) movements = movements.filter(m => m.period === parseInt(period));
    if (user_id) movements = movements.filter(m => m.user_id === user_id);
    movements.sort((a, b) => (b.movement_date_start || '').localeCompare(a.movement_date_start || ''));

    // Attach user info
    const usersSnap = await db.collection('users').get();
    const usersMap = {};
    usersSnap.docs.forEach(d => { usersMap[d.id] = d.data(); });

    const result = await Promise.all(movements.map(async m => {
      const pSnap = await db.collection('pending_items').where('movement_id', '==', m.id).get();
      const pending = pSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
      const done = pending.filter(p => p.is_completed).length;
      const u = usersMap[m.user_id] || {};
      return { ...m, full_name: u.full_name || '', branch: u.branch || '',
        pending_items: pending,
        completion_pct: pending.length > 0 ? Math.round((done / pending.length) * 100) : 0 };
    }));

    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

router.get('/users', requireAdmin, async (req, res) => {
  try {
    const db = getDB();
    const snap = await db.collection('users').get();
    const users = snap.docs
      .map(d => { const { password, ...rest } = d.data(); return { id: d.id, ...rest }; })
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    res.json(users);
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

router.post('/users', requireAdmin, async (req, res) => {
  try {
    const { username, password, full_name, role, branch } = req.body;
    if (!username || !password || !full_name) return res.status(400).json({ error: 'ກາລຸນາປ້ອນຂໍ້ມູນໃຫ້ຄົບ' });

    const db = getDB();
    const existing = await db.collection('users').where('username', '==', username).limit(1).get();
    if (!existing.empty) return res.status(400).json({ error: 'ຊື່ຜູ້ໃຊ້ນີ້ມີຢູ່ແລ້ວ' });

    const ref = await db.collection('users').add({
      username, password: bcrypt.hashSync(password, 10),
      full_name, role: role || 'user', branch: branch || '',
      created_at: new Date().toISOString()
    });
    res.json({ success: true, id: ref.id });
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: 'ບໍ່ສາມາດລຶບຕົນເອງໄດ້' });
    const db = getDB();
    await db.collection('users').doc(req.params.id).delete();
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

router.get('/export/csv', requireAdmin, async (req, res) => {
  try {
    const { year } = req.query;
    const db = getDB();

    const snap = await db.collection('movements').get();
    let movements = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (year) movements = movements.filter(m => (m.movement_date_start || '').startsWith(year));
    movements.sort((a, b) => (b.movement_date_start || '').localeCompare(a.movement_date_start || ''));

    const usersSnap = await db.collection('users').get();
    const usersMap = {};
    usersSnap.docs.forEach(d => { usersMap[d.id] = d.data(); });

    const headers = ['ລຳດັບ','ຊື່ພະນັກງານ','ສາຂາ','ວັນທີເລີ່ມ','ວັນທີສິ້ນສຸດ','ໄລຍະ','ແຂວງ','ຈຸດປະສົງ',
      'ຄ.ສະຖານທີ່','ຄ.ການບໍລິການ','ຄ.ພະນັກງານ','ຄ.ສະເລ່ຍ','ດ້ານດີ','ດ້ານທ້າທາຍ','ວິທີການແກ້ໄຂ','ໝາຍເຫດ'];

    const rows = movements.map((m, i) => {
      const u = usersMap[m.user_id] || {};
      const a = ((+m.location_score + +m.service_score + +m.staff_score) / 3).toFixed(2);
      return [i+1, u.full_name||'', u.branch||'', m.movement_date_start, m.movement_date_end,
        `ໄລຍະ ${m.period}`, m.province, m.purpose||'',
        m.location_score, m.service_score, m.staff_score, a,
        m.lesson_good||'', m.lesson_challenge||'', m.lesson_solution||'', m.notes||'']
        .map(v => `"${String(v).replace(/"/g,'""')}"`).join(',');
    });

    const csv = '﻿' + [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="admin_movements.csv"');
    res.send(csv);
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

module.exports = router;
