require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { initDB } = require('./database/db');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/movements', require('./routes/movements'));
app.use('/api/admin', require('./routes/admin'));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/user', (req, res) => res.sendFile(path.join(__dirname, 'public', 'user', 'dashboard.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard.html')));

// Initialize DB on first request (for serverless cold start)
let dbReady = false;
app.use(async (req, res, next) => {
  if (!dbReady) {
    try { await initDB(); dbReady = true; } catch (err) { return res.status(500).json({ error: 'DB init failed' }); }
  }
  next();
});

// Local development server
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  initDB()
    .then(() => app.listen(PORT, () => {
      console.log(`ລະບົບເລີ່ມທຳງານ: http://localhost:${PORT}`);
      console.log(`Admin: admin / admin123`);
      console.log(`User:  user1 / user123`);
    }))
    .catch(err => { console.error('DB Error:', err.message); process.exit(1); });
}

module.exports = app;
