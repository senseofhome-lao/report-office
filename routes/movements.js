const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query, run, getOne } = require('../database/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// File upload setup: Cloudinary in production, local disk in development
let upload;
let useCloudinary = false;
let cloudinary;

if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  const { CloudinaryStorage } = require('multer-storage-cloudinary');
  const storage = new CloudinaryStorage({
    cloudinary,
    params: { folder: 'ldb-reports', resource_type: 'raw', allowed_formats: ['pdf','doc','docx','xls','xlsx','jpg','jpeg','png'] }
  });
  upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });
  useCloudinary = true;
} else {
  const uploadsDir = process.env.VERCEL
    ? '/tmp/uploads'
    : path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1e6) + path.extname(file.originalname))
  });
  upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });
}

// Get all movements for current user
router.get('/', requireAuth, async (req, res) => {
  try {
    const movements = await query(`
      SELECT m.*, u.full_name, u.branch
      FROM movements m JOIN users u ON m.user_id = u.id
      WHERE m.user_id = ? ORDER BY m.created_at DESC
    `, [req.user.id]);

    const result = await Promise.all(movements.map(async m => {
      const pending = await query('SELECT * FROM pending_items WHERE movement_id = ? ORDER BY created_at ASC', [m.id]);
      const files = await query('SELECT * FROM report_files WHERE movement_id = ? ORDER BY uploaded_at ASC', [m.id]);
      const done = pending.filter(p => p.is_completed).length;
      return { ...m, pending_items: pending, report_files: files, completion_pct: pending.length > 0 ? Math.round((done / pending.length) * 100) : 0 };
    }));

    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

// Create movement
router.post('/', requireAuth, async (req, res) => {
  try {
    const { movement_date_start, movement_date_end, period, province, purpose,
      lesson_good, lesson_challenge, lesson_solution,
      location_score, service_score, staff_score, notes } = req.body;

    if (!movement_date_start || !movement_date_end || !period || !province)
      return res.status(400).json({ error: 'ກາລຸນາປ້ອນຂໍ້ມູນທີ່ຈຳເປັນໃຫ້ຄົບ' });

    const result = await run(`
      INSERT INTO movements (user_id, movement_date_start, movement_date_end, period, province,
        purpose, lesson_good, lesson_challenge, lesson_solution,
        location_score, service_score, staff_score, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [req.user.id, movement_date_start, movement_date_end, period, province,
        purpose || '', lesson_good || '', lesson_challenge || '', lesson_solution || '',
        parseFloat(location_score) || 0, parseFloat(service_score) || 0, parseFloat(staff_score) || 0, notes || '']);

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

// Update movement
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const movement = await getOne('SELECT * FROM movements WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!movement) return res.status(404).json({ error: 'ບໍ່ພົບຂໍ້ມູນ' });

    const { movement_date_start, movement_date_end, period, province, purpose,
      lesson_good, lesson_challenge, lesson_solution,
      location_score, service_score, staff_score, notes } = req.body;

    await run(`UPDATE movements SET
      movement_date_start=?, movement_date_end=?, period=?, province=?, purpose=?,
      lesson_good=?, lesson_challenge=?, lesson_solution=?,
      location_score=?, service_score=?, staff_score=?, notes=?
      WHERE id = ? AND user_id = ?
    `, [movement_date_start, movement_date_end, period, province, purpose || '',
        lesson_good || '', lesson_challenge || '', lesson_solution || '',
        parseFloat(location_score) || 0, parseFloat(service_score) || 0, parseFloat(staff_score) || 0,
        notes || '', req.params.id, req.user.id]);

    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

// Delete movement
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const movement = await getOne('SELECT * FROM movements WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!movement) return res.status(404).json({ error: 'ບໍ່ພົບຂໍ້ມູນ' });
    await run('DELETE FROM movements WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

// ===== PENDING ITEMS =====

router.post('/:id/pending', requireAuth, async (req, res) => {
  try {
    const movement = await getOne('SELECT * FROM movements WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!movement) return res.status(404).json({ error: 'ບໍ່ພົບຂໍ້ມູນ' });
    const { description } = req.body;
    if (!description?.trim()) return res.status(400).json({ error: 'ກາລຸນາປ້ອນລາຍການ' });
    const result = await run('INSERT INTO pending_items (movement_id, description) VALUES (?, ?)', [req.params.id, description.trim()]);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

router.patch('/pending/:itemId/toggle', requireAuth, async (req, res) => {
  try {
    const item = await getOne(`
      SELECT pi.* FROM pending_items pi JOIN movements m ON pi.movement_id = m.id
      WHERE pi.id = ? AND m.user_id = ?
    `, [req.params.itemId, req.user.id]);

    if (!item) return res.status(404).json({ error: 'ບໍ່ພົບລາຍການ' });

    const newStatus = item.is_completed ? 0 : 1;
    const completedAt = newStatus ? new Date().toISOString() : null;
    await run('UPDATE pending_items SET is_completed=?, completed_at=? WHERE id=?', [newStatus, completedAt, req.params.itemId]);

    const allItems = await query('SELECT is_completed FROM pending_items WHERE movement_id=?', [item.movement_id]);
    const done = allItems.filter(x => x.is_completed).length;
    const pct = allItems.length > 0 ? Math.round((done / allItems.length) * 100) : 0;

    res.json({ success: true, is_completed: newStatus, completion_pct: pct });
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

router.delete('/pending/:itemId', requireAuth, async (req, res) => {
  try {
    const item = await getOne(`
      SELECT pi.* FROM pending_items pi JOIN movements m ON pi.movement_id = m.id
      WHERE pi.id = ? AND m.user_id = ?
    `, [req.params.itemId, req.user.id]);
    if (!item) return res.status(404).json({ error: 'ບໍ່ພົບລາຍການ' });
    await run('DELETE FROM pending_items WHERE id=?', [req.params.itemId]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

// ===== FILE UPLOAD =====

router.post('/:id/upload', requireAuth, upload.single('report'), async (req, res) => {
  try {
    const movement = await getOne('SELECT * FROM movements WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!movement) return res.status(404).json({ error: 'ບໍ່ພົບຂໍ້ມູນ' });
    if (!req.file) return res.status(400).json({ error: 'ກາລຸນາເລືອກໄຟລ' });

    let fileUrl, publicId;
    if (useCloudinary) {
      fileUrl = req.file.path;
      publicId = req.file.filename;
    } else {
      fileUrl = '/uploads/' + req.file.filename;
      publicId = req.file.filename;
    }

    await run('INSERT INTO report_files (movement_id, original_name, file_url, public_id) VALUES (?, ?, ?, ?)',
      [req.params.id, req.file.originalname, fileUrl, publicId]);

    res.json({ success: true, url: fileUrl, original_name: req.file.originalname });
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

router.delete('/file/:fileId', requireAuth, async (req, res) => {
  try {
    const file = await getOne(`
      SELECT rf.* FROM report_files rf JOIN movements m ON rf.movement_id = m.id
      WHERE rf.id = ? AND m.user_id = ?
    `, [req.params.fileId, req.user.id]);
    if (!file) return res.status(404).json({ error: 'ບໍ່ພົບໄຟລ' });

    if (useCloudinary && cloudinary) {
      await cloudinary.uploader.destroy(file.public_id, { resource_type: 'raw' });
    } else {
      const filepath = path.join(__dirname, '../uploads', file.public_id);
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    }

    await run('DELETE FROM report_files WHERE id = ?', [req.params.fileId]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

// ===== EXPORT CSV =====

router.get('/export/csv', requireAuth, async (req, res) => {
  try {
    const movements = await query(`
      SELECT m.*, u.full_name, u.branch
      FROM movements m JOIN users u ON m.user_id = u.id
      WHERE m.user_id = ? ORDER BY m.movement_date_start DESC
    `, [req.user.id]);

    const headers = ['ລຳດັບ','ວັນທີເລີ່ມ','ວັນທີສິ້ນສຸດ','ໄລຍະ','ແຂວງ','ຈຸດປະສົງ',
      'ຄ.ສະຖານທີ່','ຄ.ການບໍລິການ','ຄ.ພະນັກງານ','ຄ.ສະເລ່ຍ','ດ້ານດີ','ດ້ານທ້າທາຍ','ວິທີການແກ້ໄຂ','ໝາຍເຫດ'];

    const rows = movements.map((m, i) => {
      const avg = ((+m.location_score + +m.service_score + +m.staff_score) / 3).toFixed(2);
      return [i+1, m.movement_date_start, m.movement_date_end, `ໄລຍະ ${m.period}`, m.province, m.purpose||'',
        m.location_score, m.service_score, m.staff_score, avg,
        m.lesson_good||'', m.lesson_challenge||'', m.lesson_solution||'', m.notes||'']
        .map(v => `"${String(v).replace(/"/g,'""')}"`).join(',');
    });

    const csv = '﻿' + [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="movements.csv"');
    res.send(csv);
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

module.exports = router;
