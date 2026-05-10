const express = require('express');
const { query, run, getOne } = require('../database/db');
const { requireAdmin } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

const router = express.Router();

router.get('/summary', requireAdmin, async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();

    const totalMovements = await getOne(`
      SELECT COUNT(*) as count FROM movements WHERE LEFT(movement_date_start, 4) = ?
    `, [String(year)]);

    const byPeriod = await query(`
      SELECT period, COUNT(*) as count,
             AVG(location_score) as avg_location, AVG(service_score) as avg_service,
             AVG(staff_score) as avg_staff, AVG((location_score + service_score + staff_score) / 3.0) as avg_total
      FROM movements WHERE LEFT(movement_date_start, 4) = ?
      GROUP BY period ORDER BY period
    `, [String(year)]);

    const byProvince = await query(`
      SELECT province, COUNT(*) as count,
             AVG((location_score + service_score + staff_score) / 3.0) as avg_score
      FROM movements WHERE LEFT(movement_date_start, 4) = ?
      GROUP BY province ORDER BY count DESC
    `, [String(year)]);

    const byUser = await query(`
      SELECT u.full_name, u.branch, COUNT(m.id) as count,
             AVG(m.location_score) as avg_location, AVG(m.service_score) as avg_service,
             AVG(m.staff_score) as avg_staff, AVG((m.location_score + m.service_score + m.staff_score) / 3.0) as avg_total
      FROM movements m JOIN users u ON m.user_id = u.id
      WHERE LEFT(m.movement_date_start, 4) = ?
      GROUP BY m.user_id, u.full_name, u.branch ORDER BY count DESC
    `, [String(year)]);

    const overallScores = await getOne(`
      SELECT AVG(location_score) as avg_location, AVG(service_score) as avg_service,
             AVG(staff_score) as avg_staff, AVG((location_score + service_score + staff_score) / 3.0) as avg_total
      FROM movements WHERE LEFT(movement_date_start, 4) = ?
    `, [String(year)]);

    const pendingSummary = await getOne(`
      SELECT COUNT(*) as total,
             SUM(CASE WHEN pi.is_completed = 1 THEN 1 ELSE 0 END) as done
      FROM pending_items pi JOIN movements m ON pi.movement_id = m.id
      WHERE LEFT(m.movement_date_start, 4) = ?
    `, [String(year)]);

    const availableYears = await query(`
      SELECT DISTINCT LEFT(movement_date_start, 4) as year
      FROM movements ORDER BY year DESC
    `);

    res.json({
      year, totalMovements: totalMovements?.count || 0,
      byPeriod, byProvince, byUser, overallScores, pendingSummary,
      availableYears: availableYears.map(r => r.year)
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

router.get('/movements', requireAdmin, async (req, res) => {
  try {
    const { year, period, user_id } = req.query;
    let sql = `SELECT m.*, u.full_name, u.branch FROM movements m JOIN users u ON m.user_id = u.id WHERE 1=1`;
    const params = [];

    if (year) { sql += ` AND LEFT(m.movement_date_start, 4) = ?`; params.push(year); }
    if (period) { sql += ` AND m.period = ?`; params.push(period); }
    if (user_id) { sql += ` AND m.user_id = ?`; params.push(user_id); }
    sql += ` ORDER BY m.movement_date_start DESC`;

    const movements = await query(sql, params);
    const result = await Promise.all(movements.map(async m => {
      const pending = await query('SELECT * FROM pending_items WHERE movement_id = ? ORDER BY created_at ASC', [m.id]);
      const done = pending.filter(p => p.is_completed).length;
      return { ...m, pending_items: pending, completion_pct: pending.length > 0 ? Math.round((done / pending.length) * 100) : 0 };
    }));

    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

router.get('/users', requireAdmin, async (req, res) => {
  try {
    res.json(await query('SELECT id, username, full_name, role, branch, created_at FROM users ORDER BY created_at'));
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

router.post('/users', requireAdmin, async (req, res) => {
  try {
    const { username, password, full_name, role, branch } = req.body;
    if (!username || !password || !full_name) return res.status(400).json({ error: 'ກາລຸນາປ້ອນຂໍ້ມູນໃຫ້ຄົບ' });
    if (await getOne('SELECT id FROM users WHERE username = ?', [username]))
      return res.status(400).json({ error: 'ຊື່ຜູ້ໃຊ້ນີ້ມີຢູ່ແລ້ວ' });

    const hashed = bcrypt.hashSync(password, 10);
    const result = await run('INSERT INTO users (username, password, full_name, role, branch) VALUES (?, ?, ?, ?, ?)',
      [username, hashed, full_name, role || 'user', branch || '']);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

router.delete('/users/:id', requireAdmin, async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'ບໍ່ສາມາດລຶບຕົນເອງໄດ້' });
    await run('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

router.get('/export/csv', requireAdmin, async (req, res) => {
  try {
    const year = req.query.year || '';
    let sql = `SELECT m.*, u.full_name, u.branch FROM movements m JOIN users u ON m.user_id = u.id`;
    const params = [];
    if (year) { sql += ` WHERE LEFT(m.movement_date_start, 4) = ?`; params.push(year); }
    sql += ` ORDER BY m.movement_date_start DESC`;

    const movements = await query(sql, params);
    const headers = ['ລຳດັບ','ຊື່ພະນັກງານ','ສາຂາ','ວັນທີເລີ່ມ','ວັນທີສິ້ນສຸດ','ໄລຍະ','ແຂວງ','ຈຸດປະສົງ',
      'ຄ.ສະຖານທີ່','ຄ.ການບໍລິການ','ຄ.ພະນັກງານ','ຄ.ສະເລ່ຍ','ດ້ານດີ','ດ້ານທ້າທາຍ','ວິທີການແກ້ໄຂ','ໝາຍເຫດ'];

    const rows = movements.map((m, i) => {
      const avg = ((+m.location_score + +m.service_score + +m.staff_score) / 3).toFixed(2);
      return [i+1, m.full_name, m.branch, m.movement_date_start, m.movement_date_end, `ໄລຍະ ${m.period}`,
        m.province, m.purpose||'', m.location_score, m.service_score, m.staff_score, avg,
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
