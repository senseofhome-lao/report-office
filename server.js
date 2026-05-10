require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { initDB } = require('./database/db');

const app = express();

// DB initializes once when module loads (critical for Vercel cold start)
const dbReady = initDB().catch(err => {
  console.error('DB init failed:', err.message);
  throw err;
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// DB guard MUST be before all routes
app.use(async (req, res, next) => {
  try {
    await dbReady;
    next();
  } catch (err) {
    res.status(503).json({ error: 'ລະບົບຖານຂໍ້ມູນບໍ່ພ້ອມ - ກວດສອບ DATABASE_URL' });
  }
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/movements', require('./routes/movements'));
app.use('/api/admin', require('./routes/admin'));

// Page routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/user', (req, res) => res.sendFile(path.join(__dirname, 'public', 'user', 'dashboard.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard.html')));

// Local development only
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  dbReady
    .then(() => app.listen(PORT, () => {
      console.log(`ລະບົບເລີ່ມທຳງານ: http://localhost:${PORT}`);
      console.log(`Admin: admin / admin123 | User: user1 / user123`);
    }))
    .catch(err => { console.error('Cannot start:', err.message); process.exit(1); });
}

module.exports = app;
