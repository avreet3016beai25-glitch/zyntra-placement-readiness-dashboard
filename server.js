const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.ZYNTRA_DB_PATH || path.join(__dirname, '.data', 'zyntra.sqlite');
const LEGACY_DB_PATH = process.env.ZYNTRA_LEGACY_DB_PATH || path.join(__dirname, 'db.json');

app.use(cors());
app.use(express.json({ limit: '32kb' }));

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE COLLATE NOCASE,
    phone TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    profile_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    reset_token TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS demo_requests (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    organization TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
`);

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  const [algorithm, salt, expectedHex] = String(storedHash).split('$');
  if (algorithm !== 'scrypt' || !salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePhone(value) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return '';
  const digitsOnly = cleaned.replace(/\D/g, '');
  return digitsOnly.length >= 8 ? digitsOnly : '';
}

function normalizeIdentifier(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const email = normalizeEmail(trimmed);
  if (email.includes('@')) return email;
  const phone = normalizePhone(trimmed);
  return phone || trimmed;
}

function getUserByIdentifier(identifier) {
  const normalized = normalizeIdentifier(identifier);
  if (!normalized) return null;
  const email = normalized.includes('@') ? normalized : '';
  if (email) return db.prepare('SELECT * FROM users WHERE email = ? LIMIT 1').get(email);

  const phone = normalizePhone(normalized);
  if (phone) {
    const rows = db.prepare('SELECT * FROM users WHERE phone IS NOT NULL').all();
    return rows.find(user => {
      const stored = normalizePhone(user.phone || '');
      return stored && (stored === phone || stored.endsWith(phone) || phone.endsWith(stored));
    }) || null;
  }

  return db.prepare('SELECT * FROM users WHERE email = ? LIMIT 1').get(normalized);
}

function issueToken() {
  return crypto.randomBytes(32).toString('hex');
}

function migrateUsersTableSchema() {
  const columns = db.prepare('PRAGMA table_info(users)').all();
  const columnNames = new Set(columns.map(column => column.name));
  const emailColumn = columns.find(column => column.name === 'email');
  const hasPhone = columnNames.has('phone');
  if (!hasPhone || emailColumn?.notnull === 1) {
    const currentUsers = db.prepare('SELECT * FROM users').all();
    db.exec('BEGIN');
    try {
      db.exec(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY,
          email TEXT UNIQUE COLLATE NOCASE,
          phone TEXT UNIQUE,
          password_hash TEXT NOT NULL,
          token_hash TEXT NOT NULL,
          profile_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      const insertUser = db.prepare(`
        INSERT INTO users_new (id, email, phone, password_hash, token_hash, profile_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const user of currentUsers) {
        insertUser.run(
          user.id,
          user.email || null,
          user.phone || null,
          user.password_hash,
          user.token_hash,
          user.profile_json || '{}',
          user.created_at,
          user.updated_at
        );
      }
      db.exec('DROP TABLE users');
      db.exec('ALTER TABLE users_new RENAME TO users');
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

function migrateLegacyDatabase() {
  if (!fs.existsSync(LEGACY_DB_PATH)) return;
  const legacy = JSON.parse(fs.readFileSync(LEGACY_DB_PATH, 'utf8'));
  if (!Array.isArray(legacy.users)) return;
  const insert = db.prepare(`
    INSERT OR IGNORE INTO users (email, password_hash, token_hash, profile_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    for (const user of legacy.users) {
      if (!user.email || typeof user.password !== 'string') continue;
      const token = typeof user.token === 'string' && user.token ? user.token : issueToken();
      const profile = user.profile && typeof user.profile === 'object' && !Array.isArray(user.profile) ? user.profile : {};
      insert.run(String(user.email).trim().toLowerCase(), hashPassword(user.password), hashToken(token), JSON.stringify(profile), now, now);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  const sanitized = {
    ...legacy,
    users: legacy.users.map(user => {
      const { password, token, resetToken, ...safeUser } = user;
      return safeUser;
    })
  };
  const temporaryPath = `${LEGACY_DB_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(sanitized, null, 2));
  fs.renameSync(temporaryPath, LEGACY_DB_PATH);
}

migrateUsersTableSchema();
migrateLegacyDatabase();

function profileFor(user) {
  try {
    return JSON.parse(user.profile_json || '{}');
  } catch {
    return {};
  }
}

function getAuthenticatedUser(req, res) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    res.status(401).send('Authorization required.');
    return null;
  }
  const user = db.prepare('SELECT * FROM users WHERE token_hash = ?').get(hashToken(token));
  if (!user) {
    res.status(401).send('Invalid token.');
    return null;
  }
  return user;
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'zyntra-api', database: 'connected' });
});

app.post('/api/demo-requests', (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const role = String(req.body.role || '').trim();
  const organization = String(req.body.organization || '').trim();
  const message = String(req.body.message || '').trim();
  if (name.length < 2 || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Enter your name and a valid email address.' });
  }
  if (!['student', 'educator', 'career-team'].includes(role) || organization.length > 120 || message.length > 1000) {
    return res.status(400).json({ error: 'Please check the role, organization, and message fields.' });
  }

  db.prepare(`
    INSERT INTO demo_requests (name, email, role, organization, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, email, role, organization, message, new Date().toISOString());
  res.status(201).json({ message: 'Thanks for reaching out. Your request has been received.' });
});

app.post('/api/signup', (req, res) => {
  const email = normalizeEmail(req.body.email);
  const phone = normalizePhone(req.body.phone);
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const profile = req.body.profile && typeof req.body.profile === 'object' && !Array.isArray(req.body.profile) ? req.body.profile : {};

  if ((!email && !phone) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || (phone && phone.length < 8) || password.length < 8 || password.length > 128) {
    return res.status(400).send('Provide a valid email or phone number and a password between 8 and 128 characters.');
  }

  const token = issueToken();
  const now = new Date().toISOString();
  try {
    db.prepare(`
      INSERT INTO users (email, phone, password_hash, token_hash, profile_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(email || null, phone || null, hashPassword(password), hashToken(token), JSON.stringify(profile), now, now);
  } catch (error) {
    if (error.errcode === 2067) return res.status(409).send('User already exists.');
    throw error;
  }

  res.status(201).json({ email: email || '', phone: phone || '', token, profile });
});

app.post('/api/login', (req, res) => {
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const identifier = normalizeIdentifier(req.body.identifier || req.body.email || req.body.phone);
  if (!identifier || !password) {
    return res.status(400).send('Email or phone and password are required.');
  }

  const user = getUserByIdentifier(identifier);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).send('Invalid email/phone or password.');
  }

  const token = issueToken();
  db.prepare('UPDATE users SET token_hash = ?, updated_at = ? WHERE id = ?').run(hashToken(token), new Date().toISOString(), user.id);
  res.json({ email: user.email || '', phone: user.phone || '', token, profile: profileFor(user) });
});

app.post('/api/forgot-password', (req, res) => {
  const identifier = normalizeIdentifier(req.body.identifier || req.body.email || req.body.phone);
  if (!identifier) {
    return res.status(400).send('Email or phone is required.');
  }

  const user = getUserByIdentifier(identifier);
  if (!user) {
    return res.json({ message: 'If the account exists, a reset token has been created for the next step.' });
  }

  const resetToken = issueToken();
  const expiresAt = new Date(Date.now() + (15 * 60 * 1000)).toISOString();
  db.prepare('INSERT INTO password_resets (user_id, reset_token, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(user.id, hashToken(resetToken), expiresAt, new Date().toISOString());

  res.json({ message: 'If the account exists, a reset token has been created for the next step.', resetToken });
});

app.post('/api/reset-password', (req, res) => {
  const identifier = normalizeIdentifier(req.body.identifier || req.body.email || req.body.phone);
  const resetToken = String(req.body.token || '').trim();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!identifier || !resetToken || password.length < 8 || password.length > 128) {
    return res.status(400).send('Provide a valid identifier, reset token, and a new password between 8 and 128 characters.');
  }

  const user = getUserByIdentifier(identifier);
  if (!user) {
    return res.status(404).send('Account not found.');
  }

  const resetRecord = db.prepare('SELECT * FROM password_resets WHERE user_id = ? AND reset_token = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1')
    .get(user.id, hashToken(resetToken), new Date().toISOString());
  if (!resetRecord) {
    return res.status(400).send('This reset token is invalid or expired.');
  }

  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .run(hashPassword(password), new Date().toISOString(), user.id);
  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
  res.json({ message: 'Password updated successfully.' });
});

app.get('/api/profile', (req, res) => {
  const user = getAuthenticatedUser(req, res);
  if (!user) return;
  res.json({ email: user.email, profile: profileFor(user) });
});

app.post('/api/profile', (req, res) => {
  const user = getAuthenticatedUser(req, res);
  if (!user) return;
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).send('Profile must be an object.');
  }
  const profile = { ...profileFor(user), ...req.body };
  db.prepare('UPDATE users SET profile_json = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(profile), new Date().toISOString(), user.id);
  res.json({ email: user.email, profile });
});

app.get('/api/insights', (req, res) => {
  const auth = getAuthenticatedUser(req, res);
  if (!auth) return;

  const profile = profileFor(auth);
  const sessions = Array.isArray(profile.focusSessions) ? profile.focusSessions : [];
  const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const weeklyFocusMinutes = sessions
    .filter(session => new Date(session.completedAt).getTime() >= weekAgo)
    .reduce((total, session) => total + Number(session.minutes || 0), 0);
  const tasks = Array.isArray(profile.tasks) ? profile.tasks : [];
  const completedTasks = tasks.filter(task => task.done).length;
  const dsaSolved = Number(profile.dsaSolved || 0);
  const skillCount = Array.isArray(profile.skills) ? profile.skills.length : 0;
  const readinessScore = Math.min(100,
    Math.round(Math.min(35, (dsaSolved / 200) * 35) +
      Math.min(20, (Number(profile.dsaStreak || 0) / 30) * 20) +
      Math.min(20, (skillCount / 6) * 20) +
      Math.min(15, (completedTasks / Math.max(1, tasks.length)) * 15) +
      (profile.resume ? 10 : 0)));

  res.json({ readinessScore, weeklyFocusMinutes, totalFocusMinutes: sessions.reduce((total, session) => total + Number(session.minutes || 0), 0), focusSessions: sessions.length });
});

app.post('/api/focus-sessions', (req, res) => {
  const auth = getAuthenticatedUser(req, res);
  if (!auth) return;
  const minutes = Number(req.body.minutes);
  const topic = String(req.body.topic || 'General preparation').trim();
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) {
    return res.status(400).send('Focus duration must be between 1 and 240 minutes.');
  }

  const profile = profileFor(auth);
  const sessions = Array.isArray(profile.focusSessions) ? profile.focusSessions : [];
  const session = { minutes, topic: topic.slice(0, 80), completedAt: new Date().toISOString() };
  const focusSessions = [session, ...sessions].slice(0, 100);
  db.prepare('UPDATE users SET profile_json = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify({ ...profile, focusSessions }), new Date().toISOString(), auth.id);
  res.status(201).json({ session, focusSessions });
});

app.get('/api/wallpaper', (req, res) => {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1600" height="900" viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#08111f" />
      <stop offset="100%" stop-color="#10233d" />
    </linearGradient>
    <linearGradient id="waveGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgba(88,166,255,0.25)" />
      <stop offset="100%" stop-color="rgba(124,92,255,0.18)" />
    </linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#bgGrad)" />
  <g opacity="0.42">
    <path d="M0 180 C400 240 650 120 1050 170 C1350 210 1600 110 1600 110 L1600 900 L0 900 Z" fill="url(#waveGrad)">
      <animate attributeName="d" dur="24s" repeatCount="indefinite"
        values="M0 180 C400 240 650 120 1050 170 C1350 210 1600 110 1600 110 L1600 900 L0 900 Z;
                M0 210 C420 190 680 180 1080 230 C1380 270 1600 140 1600 140 L1600 900 L0 900 Z;
                M0 160 C380 250 620 140 1020 190 C1320 240 1600 100 1600 100 L1600 900 L0 900 Z;
                M0 180 C400 240 650 120 1050 170 C1350 210 1600 110 1600 110 L1600 900 L0 900 Z" />
    </path>
    <path d="M0 540 C300 520 550 620 900 560 C1250 500 1600 640 1600 640 L1600 900 L0 900 Z" fill="rgba(88,166,255,0.14)">
      <animate attributeName="d" dur="28s" repeatCount="indefinite"
        values="M0 540 C300 520 550 620 900 560 C1250 500 1600 640 1600 640 L1600 900 L0 900 Z;
                M0 520 C320 560 570 580 920 540 C1270 500 1600 620 1600 620 L1600 900 L0 900 Z;
                M0 560 C280 500 530 640 880 580 C1230 520 1600 660 1600 660 L1600 900 L0 900 Z;
                M0 540 C300 520 550 620 900 560 C1250 500 1600 640 1600 640 L1600 900 L0 900 Z" />
    </path>
  </g>
  <g fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="1.2">
    <path d="M0 120 L1600 120" />
    <path d="M0 260 L1600 260" />
    <path d="M0 400 L1600 400" />
    <path d="M0 540 L1600 540" />
    <path d="M0 680 L1600 680" />
    <path d="M0 820 L1600 820" />
  </g>
  <circle cx="260" cy="160" r="18" fill="rgba(88,166,255,0.12)">
    <animate attributeName="cx" dur="18s" values="260;320;260" repeatCount="indefinite" />
  </circle>
  <circle cx="1360" cy="260" r="10" fill="rgba(236,72,153,0.18)">
    <animate attributeName="cy" dur="22s" values="260;220;260" repeatCount="indefinite" />
  </circle>
  <circle cx="880" cy="720" r="14" fill="rgba(16,185,129,0.15)">
    <animate attributeName="cx" dur="20s" values="880;920;880" repeatCount="indefinite" />
  </circle>
</svg>`;
  res.set('Content-Type', 'image/svg+xml');
  res.send(svg);
});

const publicFiles = new Set([
  'auth.html', 'campus.html', 'certifications.html', 'dashboard.html', 'dsa.html', 'how-it-works.html', 'index.html',
  'onboarding.html', 'placements.html', 'platform.html', 'profile.html', 'projects.html',
  'report.html', 'resources.html', 'script.js', 'styles.css', 'marketing.css'
]);

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/:file', (req, res, next) => {
  if (!publicFiles.has(req.params.file)) return next();
  res.sendFile(path.join(__dirname, req.params.file));
});
app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal server error.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Zyntra is running at http://localhost:${PORT}`);
  });
} else {
  module.exports = { app, db };
}
