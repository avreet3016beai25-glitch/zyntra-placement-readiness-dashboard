const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { after, before, test } = require('node:test');

let app;
let db;
let server;
let baseUrl;
let tempDirectory;

before(async () => {
  tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'zyntra-api-test-'));
  const legacyPath = path.join(tempDirectory, 'legacy.json');
  const sqlitePath = path.join(tempDirectory, 'zyntra.sqlite');
  fs.writeFileSync(legacyPath, JSON.stringify({
    users: [{
      email: 'legacy@example.com',
      password: 'legacy-password',
      token: 'legacy-token',
      profile: { name: 'Legacy User', skills: ['JavaScript'] }
    }]
  }));
  process.env.ZYNTRA_DB_PATH = sqlitePath;
  process.env.ZYNTRA_LEGACY_DB_PATH = legacyPath;
  ({ app, db } = require('./server.js'));
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  if (db) db.close();
  if (tempDirectory) fs.rmSync(tempDirectory, { recursive: true, force: true });
  delete process.env.ZYNTRA_DB_PATH;
  delete process.env.ZYNTRA_LEGACY_DB_PATH;
});

test('SQLite API migrates accounts and persists secure auth and profile data', async () => {
  const migratedProfile = await fetch(`${baseUrl}/api/profile`, {
    headers: { Authorization: 'Bearer legacy-token' }
  });
  assert.equal(migratedProfile.status, 200);
  assert.deepEqual((await migratedProfile.json()).profile, { name: 'Legacy User', skills: ['JavaScript'] });

  const legacyLogin = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'LEGACY@example.com', password: 'legacy-password' })
  });
  assert.equal(legacyLogin.status, 200);
  const migratedAccount = await legacyLogin.json();
  assert.match(migratedAccount.token, /^[a-f0-9]{64}$/);

  const signup = await fetch(`${baseUrl}/api/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'new@example.com', password: 'secure-password', profile: { name: 'New User' } })
  });
  assert.equal(signup.status, 201);
  const account = await signup.json();
  assert.match(account.token, /^[a-f0-9]{64}$/);

  const duplicate = await fetch(`${baseUrl}/api/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'NEW@example.com', password: 'secure-password' })
  });
  assert.equal(duplicate.status, 409);

  const savedProfile = await fetch(`${baseUrl}/api/profile`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ branch: 'Computer Science' })
  });
  assert.deepEqual((await savedProfile.json()).profile, { name: 'New User', branch: 'Computer Science' });

  const workspaceData = {
    tasks: [{ title: 'Finish a dashboard task', due: '', note: '', done: false }],
    projects: [{ name: 'Private project', status: 'In Progress' }],
    certifications: [{ title: 'Private certification', status: 'completed', credentialUrl: 'https://issuer.example/verify/123' }],
    placements: [{ name: 'Private company', date: '2026-11-01', stage: 'interview', applicationUrl: 'https://careers.example/role/123' }],
    dsaSolved: 4,
    dsaHard: 4,
    dsaStreak: 2,
    dsaTimeSpent: 1.5,
    dsaTopics: [{ name: 'Graphs', solved: 4, progress: 20 }],
    dsaSessions: [{ topic: 'Graphs', difficulty: 'hard', solved: 4, minutes: 90, completedAt: '2026-10-01T10:00:00.000Z' }]
  };
  const savedWorkspace = await fetch(`${baseUrl}/api/profile`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(workspaceData)
  });
  assert.equal(savedWorkspace.status, 200);

  const secondSignup = await fetch(`${baseUrl}/api/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'second@example.com', password: 'secure-password' })
  });
  const secondAccount = await secondSignup.json();
  const isolatedProfile = await fetch(`${baseUrl}/api/profile`, {
    headers: { Authorization: `Bearer ${secondAccount.token}` }
  });
  assert.deepEqual((await isolatedProfile.json()).profile, {});
  const reloadedWorkspace = await fetch(`${baseUrl}/api/profile`, {
    headers: { Authorization: `Bearer ${account.token}` }
  });
  assert.deepEqual((await reloadedWorkspace.json()).profile, { ...workspaceData, name: 'New User', branch: 'Computer Science' });

  const focusSession = await fetch(`${baseUrl}/api/focus-sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${account.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: 'Graph algorithms', minutes: 45 })
  });
  assert.equal(focusSession.status, 201);
  const savedSession = await focusSession.json();
  assert.equal(savedSession.session.topic, 'Graph algorithms');
  assert.equal(savedSession.session.minutes, 45);
  assert.equal(savedSession.focusSessions.length, 1);

  const storedCredentials = db.prepare('SELECT password_hash, token_hash FROM users WHERE email = ?').get('new@example.com');
  assert.match(storedCredentials.password_hash, /^scrypt\$/);
  assert.equal(storedCredentials.password_hash.includes('secure-password'), false);
  assert.notEqual(storedCredentials.token_hash, account.token);

  const privateDatabase = await fetch(`${baseUrl}/db.json`);
  assert.equal(privateDatabase.status, 404);
  const privateServer = await fetch(`${baseUrl}/server.js`);
  assert.equal(privateServer.status, 404);
  const homePage = await fetch(`${baseUrl}/`);
  assert.equal(homePage.status, 200);
  const homepageHtml = await homePage.text();
  assert.match(homepageHtml, /A clearer path from campus to/);
  for (const route of ['dashboard.html', 'onboarding.html', 'dsa.html', 'certifications.html', 'projects.html', 'report.html', 'placements.html', 'resources.html', 'profile.html', 'platform.html', 'how-it-works.html', 'campus.html']) {
    assert.ok(homepageHtml.includes(`href="${route}"`), `Homepage should link to ${route}`);
  }
  for (const [route, heading] of [['platform.html', 'The Zyntra platform'], ['how-it-works.html', 'How Zyntra turns small steps'], ['campus.html', 'For learners and campus teams']]) {
    const page = await fetch(`${baseUrl}/${route}`);
    assert.equal(page.status, 200);
    assert.ok((await page.text()).includes(heading), `${route} should render its page heading`);
  }
  const marketingStyles = await fetch(`${baseUrl}/marketing.css`);
  assert.equal(marketingStyles.status, 200);

  const phoneSignup = await fetch(`${baseUrl}/api/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'phone.user@example.com', phone: '+91 98765 43210', password: 'secure-password', profile: { name: 'Phone User' } })
  });
  assert.equal(phoneSignup.status, 201);
  const phoneLogin = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: '9876543210', password: 'secure-password' })
  });
  assert.equal(phoneLogin.status, 200);
  const phoneUser = await phoneLogin.json();
  assert.equal(phoneUser.profile.name, 'Phone User');

  const forgot = await fetch(`${baseUrl}/api/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'phone.user@example.com' })
  });
  assert.equal(forgot.status, 200);
  const resetData = await forgot.json();
  assert.ok(resetData.resetToken);

  const reset = await fetch(`${baseUrl}/api/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'phone.user@example.com', token: resetData.resetToken, password: 'new-secure-password' })
  });
  assert.equal(reset.status, 200);

  const loginWithUpdatedPassword = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'phone.user@example.com', password: 'new-secure-password' })
  });
  assert.equal(loginWithUpdatedPassword.status, 200);

  const demoRequest = await fetch(`${baseUrl}/api/demo-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Avery Student', email: 'AVERY@example.com', role: 'student', organization: 'North College' })
  });
  assert.equal(demoRequest.status, 201);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM demo_requests').get().count, 1);
  const invalidDemoRequest = await fetch(`${baseUrl}/api/demo-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'A', email: 'invalid', role: 'student' })
  });
  assert.equal(invalidDemoRequest.status, 400);
});