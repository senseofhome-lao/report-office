const express = require('express');
const multer = require('multer');
const path = require('path');
const admin = require('firebase-admin');
const { getDB } = require('../database/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ===== MOVEMENTS =====

router.get('/', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const snap = await db.collection('movements').where('user_id', '==', req.user.id).get();
    const movements = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

    const result = await Promise.all(movements.map(async m => {
      const pSnap = await db.collection('pending_items').where('movement_id', '==', m.id).get();
      const pending = pSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
      const fSnap = await db.collection('report_files').where('movement_id', '==', m.id).get();
      const files = fSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const done = pending.filter(p => p.is_completed).length;
      return { ...m, pending_items: pending, report_files: files,
        completion_pct: pending.length > 0 ? Math.round((done / pending.length) * 100) : 0 };
    }));

    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { movement_date_start, movement_date_end, period, province, purpose,
      lesson_good, lesson_challenge, lesson_solution,
      location_score, service_score, staff_score, notes } = req.body;

    if (!movement_date_start || !movement_date_end || !period || !province)
      return res.status(400).json({ error: 'ກາລຸນາປ້ອນຂໍ້ມູນທີ່ຈຳເປັນໃຫ້ຄົບ' });

    const db = getDB();
    const ref = await db.collection('movements').add({
      user_id: req.user.id,
      movement_date_start, movement_date_end,
      period: parseInt(period),
      province,
      purpose: purpose || '',
      lesson_good: lesson_good || '',
      lesson_challenge: lesson_challenge || '',
      lesson_solution: lesson_solution || '',
      location_score: parseFloat(location_score) || 0,
      service_score: parseFloat(service_score) || 0,
      staff_score: parseFloat(staff_score) || 0,
      notes: notes || '',
      created_at: new Date().toISOString()
    });

    res.json({ success: true, id: ref.id });
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

router.put('/:id', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const doc = await db.collection('movements').doc(req.params.id).get();
    if (!doc.exists || doc.data().user_id !== req.user.id)
      return res.status(404).json({ error: 'ບໍ່ພົບຂໍ້ມູນ' });

    const { movement_date_start, movement_date_end, period, province, purpose,
      lesson_good, lesson_challenge, lesson_solution,
      location_score, service_score, staff_score, notes } = req.body;

    await db.collection('movements').doc(req.params.id).update({
      movement_date_start, movement_date_end,
      period: parseInt(period),
      province,
      purpose: purpose || '',
      lesson_good: lesson_good || '',
      lesson_challenge: lesson_challenge || '',
      lesson_solution: lesson_solution || '',
      location_score: parseFloat(location_score) || 0,
      service_score: parseFloat(service_score) || 0,
      staff_score: parseFloat(staff_score) || 0,
      notes: notes || ''
    });

    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const doc = await db.collection('movements').doc(req.params.id).get();
    if (!doc.exists || doc.data().user_id !== req.user.id)
      return res.status(404).json({ error: 'ບໍ່ພົບຂໍ້ມູນ' });

    // Delete sub-collections
    const pSnap = await db.collection('pending_items').where('movement_id', '==', req.params.id).get();
    const fSnap = await db.collection('report_files').where('movement_id', '==', req.params.id).get();
    const batch = db.batch();
    pSnap.docs.forEach(d => batch.delete(d.ref));
    fSnap.docs.forEach(d => batch.delete(d.ref));
    batch.delete(db.collection('movements').doc(req.params.id));
    await batch.commit();

    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

// ===== PENDING ITEMS =====

router.post('/:id/pending', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const doc = await db.collection('movements').doc(req.params.id).get();
    if (!doc.exists || doc.data().user_id !== req.user.id)
      return res.status(404).json({ error: 'ບໍ່ພົບຂໍ້ມູນ' });

    const { description } = req.body;
    if (!description?.trim()) return res.status(400).json({ error: 'ກາລຸນາປ້ອນລາຍການ' });

    const ref = await db.collection('pending_items').add({
      movement_id: req.params.id,
      description: description.trim(),
      is_completed: 0,
      completed_at: null,
      created_at: new Date().toISOString()
    });

    res.json({ success: true, id: ref.id });
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

router.patch('/pending/:itemId/toggle', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const itemDoc = await db.collection('pending_items').doc(req.params.itemId).get();
    if (!itemDoc.exists) return res.status(404).json({ error: 'ບໍ່ພົບລາຍການ' });

    const item = itemDoc.data();
    const movDoc = await db.collection('movements').doc(item.movement_id).get();
    if (!movDoc.exists || movDoc.data().user_id !== req.user.id)
      return res.status(404).json({ error: 'ບໍ່ພົບລາຍການ' });

    const newStatus = item.is_completed ? 0 : 1;
    await db.collection('pending_items').doc(req.params.itemId).update({
      is_completed: newStatus,
      completed_at: newStatus ? new Date().toISOString() : null
    });

    const allSnap = await db.collection('pending_items').where('movement_id', '==', item.movement_id).get();
    const allItems = allSnap.docs.map(d => d.data());
    const done = allItems.filter(x => x.is_completed).length;
    const pct = allItems.length > 0 ? Math.round((done / allItems.length) * 100) : 0;

    res.json({ success: true, is_completed: newStatus, completion_pct: pct });
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

router.delete('/pending/:itemId', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const itemDoc = await db.collection('pending_items').doc(req.params.itemId).get();
    if (!itemDoc.exists) return res.status(404).json({ error: 'ບໍ່ພົບລາຍການ' });

    const movDoc = await db.collection('movements').doc(itemDoc.data().movement_id).get();
    if (!movDoc.exists || movDoc.data().user_id !== req.user.id)
      return res.status(404).json({ error: 'ບໍ່ພົບລາຍການ' });

    await db.collection('pending_items').doc(req.params.itemId).delete();
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

// ===== FILE UPLOAD =====

router.post('/:id/upload', requireAuth, upload.single('report'), async (req, res) => {
  try {
    const db = getDB();
    const doc = await db.collection('movements').doc(req.params.id).get();
    if (!doc.exists || doc.data().user_id !== req.user.id)
      return res.status(404).json({ error: 'ບໍ່ພົບຂໍ້ມູນ' });
    if (!req.file) return res.status(400).json({ error: 'ກາລຸນາເລືອກໄຟລ' });

    const bucket = admin.storage().bucket();
    const ext = path.extname(req.file.originalname);
    const fileName = `reports/${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    const fileRef = bucket.file(fileName);
    await fileRef.save(req.file.buffer, { contentType: req.file.mimetype, resumable: false });
    await fileRef.makePublic();
    const fileUrl = fileRef.publicUrl();

    const fRef = await db.collection('report_files').add({
      movement_id: req.params.id,
      original_name: req.file.originalname,
      file_url: fileUrl,
      public_id: fileName,
      uploaded_at: new Date().toISOString()
    });

    res.json({ success: true, id: fRef.id, url: fileUrl, original_name: req.file.originalname });
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

router.delete('/file/:fileId', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const fileDoc = await db.collection('report_files').doc(req.params.fileId).get();
    if (!fileDoc.exists) return res.status(404).json({ error: 'ບໍ່ພົບໄຟລ' });

    const file = fileDoc.data();
    const movDoc = await db.collection('movements').doc(file.movement_id).get();
    if (!movDoc.exists || movDoc.data().user_id !== req.user.id)
      return res.status(404).json({ error: 'ບໍ່ພົບໄຟລ' });

    try {
      await admin.storage().bucket().file(file.public_id).delete();
    } catch (_) { /* file may already be gone */ }

    await db.collection('report_files').doc(req.params.fileId).delete();
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'ເກີດຂໍ້ຜິດພາດ' }); }
});

// ===== EXPORT CSV =====

router.get('/export/csv', requireAuth, async (req, res) => {
  try {
    const db = getDB();
    const snap = await db.collection('movements').where('user_id', '==', req.user.id).get();
    const movements = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.movement_date_start || '').localeCompare(a.movement_date_start || ''));

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
