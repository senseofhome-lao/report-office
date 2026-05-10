const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

let _db;

function getDB() {
  if (!_db) {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FB_PROJECT_ID,
          clientEmail: process.env.FB_CLIENT_EMAIL,
          privateKey: (process.env.FB_PRIVATE_KEY || '').replace(/\\n/g, '\n')
        }),
        storageBucket: process.env.FB_STORAGE_BUCKET
      });
    }
    _db = admin.firestore();
  }
  return _db;
}

async function initDB() {
  const db = getDB();
  const snap = await db.collection('users').limit(1).get();
  if (snap.empty) {
    await db.collection('users').add({
      username: 'admin',
      password: bcrypt.hashSync('admin123', 10),
      full_name: 'ຜູ້ບໍລິຫານລະບົບ',
      role: 'admin',
      branch: 'ສຳນັກງານໃຫຍ່',
      created_at: new Date().toISOString()
    });
    await db.collection('users').add({
      username: 'user1',
      password: bcrypt.hashSync('user123', 10),
      full_name: 'ພະນັກງານທົດສອບ',
      role: 'user',
      branch: 'ສາຂາວຽງຈັນ',
      created_at: new Date().toISOString()
    });
    console.log('Seeded default users');
  }
}

module.exports = { initDB, getDB };
