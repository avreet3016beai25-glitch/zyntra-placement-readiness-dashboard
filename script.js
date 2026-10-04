const initialState = {
  name: 'Avreet',
  branch: 'CSE',
  cgpa: '8.9',
  skills: ['Python', 'Data Structures', 'SQL', 'React'],
  resume: 'https://example.com/resume.pdf',
  github: 'https://github.com/avreet',
  linkedin: 'https://linkedin.com/in/avreet',
  leetcode: 'https://leetcode.com/avreet',
  geeksforgeeks: 'https://www.geeksforgeeks.org/user/avreet/',
  goals: [
    'Solve 2 DSA Problems',
    'Learn 1 SQL Topic',
    'Finish Python Project',
    'Apply to 3 Companies'
  ],
  dsaStats: {
    solved: 185,
    easy: 90,
    medium: 75,
    hard: 20,
    streak: 30,
    timeSpent: 24,
    topics: [
      { name: 'Arrays', progress: 90 },
      { name: 'Linked List', progress: 60 },
      { name: 'Trees', progress: 40 },
      { name: 'Graphs', progress: 20 }
    ]
  },
  certifications: [
    { title: 'Python', organization: 'Cisco', date: '2025-01-10', credentialId: 'PY-101', skills: 'OOP, Flask', file: 'Python.pdf' },
    { title: 'Azure AI', organization: 'Microsoft', date: '2025-03-02', credentialId: 'AZ-900', skills: 'AI Fundamentals', file: 'AzureAI.pdf' }
  ],
  projects: [
    { name: 'Portfolio Website', github: 'https://github.com/avreet/portfolio', demo: 'https://avreet.dev', tech: 'HTML, CSS, JS', status: 'Completed' },
    { name: 'AI Resume Builder', github: 'https://github.com/avreet/resume-builder', demo: '', tech: 'Python, FastAPI', status: 'In Progress' }
  ],
  placements: [
    { name: 'Microsoft', date: '2026-10-18' },
    { name: 'Google', date: '2026-11-04' },
    { name: 'Amazon', date: '2026-11-12' }
  ],
  tasks: [
    { title: 'Finish resume update', due: 'Today', note: 'Add recent projects and coding achievements' },
    { title: 'Practice mock interview', due: 'Tomorrow', note: 'Focus on system design and behavioral questions' }
  ]
};

const state = loadState();
const isLocalPreview = ['localhost', '127.0.0.1'].includes(window.location.hostname) && window.location.port !== '3000';
const API_BASE_URL = window.location.protocol === 'file:' || isLocalPreview
  ? `http://${window.location.hostname === '127.0.0.1' ? '127.0.0.1' : 'localhost'}:3000/api`
  : `${window.location.origin}/api`;
const PYTHON_API_BASE_URL = 'http://localhost:8000/api';
const AUTH_STORAGE_KEY = 'placement-pulse-auth';
const PENDING_SAVE_STORAGE_KEY = 'zyntra-pending-save';
const THEME_STORAGE_KEY = 'placement-pulse-theme';
const PROTECTED_PAGES = ['dashboard.html', 'dsa.html', 'certifications.html', 'projects.html', 'report.html', 'placements.html', 'profile.html', 'onboarding.html', 'resources.html'];
let authState = loadAuthState();
let profileCache = null;
let insightsCache = null;
let analysisCache = null;
let editingTaskIndex = null;

function loadAuthState() {
  const saved = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!saved) {
    return { email: null, token: null };
  }

  try {
    const parsed = JSON.parse(saved);
    return parsed && typeof parsed === 'object' ? parsed : { email: null, token: null };
  } catch (error) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return { email: null, token: null };
  }
}

function saveAuthState() {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState));
}

function clearAuthState() {
  authState = { email: null, token: null };
  profileCache = null;
  saveAuthState();
}

function isAuthenticated() {
  return Boolean(authState?.token);
}

function normalizeSkills(skills) {
  if (Array.isArray(skills)) {
    return skills.filter(Boolean);
  }
  return String(skills || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

async function requestApi(path, options = {}) {
  const url = `${API_BASE_URL}${path}`;
  const headers = { ...(options.headers || {}) };

  if (authState?.token) {
    headers.Authorization = `Bearer ${authState.token}`;
  }
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(errorText || `API request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Unable to reach the backend server. Ensure http://localhost:3000 is running and retry.');
    }
    throw error;
  }
}

async function loadUserProfile() {
  if (!isAuthenticated()) {
    return null;
  }

  try {
    const result = await requestApi('/profile');
    profileCache = result.profile || {};
    state.certifications = Array.isArray(profileCache.certifications) ? profileCache.certifications : [];
    state.projects = Array.isArray(profileCache.projects) ? profileCache.projects : [];
    state.placements = Array.isArray(profileCache.placements) ? profileCache.placements : [];
    authState.email = result.email || authState.email;
    saveAuthState();
    return profileCache;
  } catch (error) {
    console.error('Failed to load profile:', error);
    return null;
  }
}

function getDefaultProfile() {
  return {
    name: '',
    branch: '',
    cgpa: '',
    skills: [],
    resume: '',
    github: '',
    linkedin: '',
    leetcode: '',
    geeksforgeeks: '',
    email: '',
    dsaSolved: 0,
    dsaEasy: 0,
    dsaMedium: 0,
    dsaHard: 0,
    dsaStreak: 0,
    dsaTimeSpent: 0,
    dailyGoals: [],
    workSummary: '',
    currentProject: '',
    currentCertification: '',
    placementTarget: '',
    studyResources: [],
    tasks: []
  };
}

function getProfileData() {
  if (!isAuthenticated()) {
    if (window.location.pathname.split('/').pop() === 'dashboard.html') {
      const today = new Date();
      const dateAfterDays = days => {
        const dueDate = new Date(today);
        dueDate.setDate(dueDate.getDate() + days);
        return `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;
      };
      return {
        ...getDefaultProfile(),
        name: 'Alex',
        branch: 'Computer Science',
        cgpa: '8.6',
        skills: ['JavaScript', 'Python', 'SQL', 'React'],
        resume: 'sample-preview',
        currentProject: 'Campus Connect',
        currentCertification: 'Cloud fundamentals',
        placementTarget: 'Frontend developer',
        workSummary: 'Building projects and preparing for interviews.',
        dailyGoals: ['Review graph traversal', 'Polish portfolio project', 'Research two target roles'],
        dsaSolved: 128,
        dsaEasy: 62,
        dsaMedium: 51,
        dsaHard: 15,
        dsaStreak: 6,
        dsaTimeSpent: 21,
        tasks: [
          { title: 'Review graph traversal', due: dateAfterDays(0), note: 'Revisit BFS and DFS patterns', done: false },
          { title: 'Polish portfolio project', due: dateAfterDays(1), note: 'Improve the project README and screenshots', done: false },
          { title: 'Update resume with recent work', due: dateAfterDays(-1), note: 'Add Campus Connect project highlights', done: true, completedAt: today.toISOString() }
        ],
        focusSessions: [
          { topic: 'Graph traversal', minutes: 45, completedAt: today.toISOString() },
          { topic: 'Portfolio improvements', minutes: 40, completedAt: new Date(today.getTime() - 86400000).toISOString() },
          { topic: 'SQL revision', minutes: 35, completedAt: new Date(today.getTime() - 2 * 86400000).toISOString() }
        ]
      };
    }
    return getDefaultProfile();
  }

  const profile = profileCache || {};
  return {
    ...getDefaultProfile(),
    ...profile,
    skills: normalizeSkills(profile.skills || getDefaultProfile().skills),
    dailyGoals: Array.isArray(profile.dailyGoals) ? profile.dailyGoals : getDefaultProfile().dailyGoals,
    studyResources: Array.isArray(profile.studyResources) ? profile.studyResources : getDefaultProfile().studyResources,
    tasks: Array.isArray(profile.tasks) ? profile.tasks : getDefaultProfile().tasks,
    email: authState.email || ''
  };
}

async function updateProfile(profile) {
  if (!isAuthenticated()) {
    return false;
  }

  const updatedProfile = { ...(profileCache || {}), ...profile };
  const result = await requestApi('/profile', {
    method: 'POST',
    body: JSON.stringify(profile)
  });
  profileCache = result.profile || updatedProfile;

  return true;
}

function logoutUser() {
  clearAuthState();
  window.location.href = 'auth.html';
}

function getDisplayDsaStats(profile) {
  return {
    solved: profile.dsaSolved ?? 0,
    easy: profile.dsaEasy ?? 0,
    medium: profile.dsaMedium ?? 0,
    hard: profile.dsaHard ?? 0,
    streak: profile.dsaStreak ?? 0,
    timeSpent: profile.dsaTimeSpent ?? 0,
    topics: Array.isArray(profile.dsaTopics) ? profile.dsaTopics : []
  };
}

function safeText(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
  }
}

function safeHTML(id, html) {
  const el = document.getElementById(id);
  if (el) {
    el.innerHTML = html;
  }
}

function loadState() {
  return { ...initialState, certifications: [], projects: [], placements: [], tasks: [] };
}

async function saveState(form) {
  const pendingProfile = {
    certifications: [...state.certifications],
    projects: [...state.projects],
    placements: [...state.placements]
  };
  try {
    await updateProfile({
      certifications: state.certifications,
      projects: state.projects,
      placements: state.placements
    });
    showFormFeedback(form, 'Saved to your account.');
    return true;
  } catch (error) {
    state.certifications = Array.isArray(profileCache?.certifications) ? profileCache.certifications : [];
    state.projects = Array.isArray(profileCache?.projects) ? profileCache.projects : [];
    state.placements = Array.isArray(profileCache?.placements) ? profileCache.placements : [];
    if (error.status === 401) {
      clearAuthState();
      beginSignupForSave({ kind: 'profile', profilePatch: pendingProfile });
      return false;
    }
    showFormFeedback(form, getSaveFailureMessage(error, 'Changes'), true);
    return false;
  }
}

function loadTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }

  return 'light';
}

function saveTheme(theme) {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
  }

  const wallpaper = document.getElementById('live-wallpaper');
  if (wallpaper && theme === 'light') {
    wallpaper.style.backgroundImage = '';
  }
}

async function loadInsights() {
  if (!isAuthenticated()) return null;
  try {
    insightsCache = await requestApi('/insights');
    return insightsCache;
  } catch (error) {
    console.error('Failed to load insights:', error);
    return null;
  }
}

async function loadReadinessAnalysis() {
  if (!isAuthenticated()) return null;
  try {
    const response = await fetch(`${PYTHON_API_BASE_URL}/readiness-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: getProfileData() })
    });
    if (!response.ok) throw new Error('Python analysis service is unavailable.');
    analysisCache = await response.json();
    return analysisCache;
  } catch (error) {
    console.info('Readiness analysis unavailable:', error.message);
    analysisCache = null;
    return null;
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || loadTheme();
  const nextTheme = current === 'dark' ? 'light' : 'dark';
  applyTheme(nextTheme);
  saveTheme(nextTheme);
}

function render() {
  renderWelcome();
  renderDashboard();
  renderTracker();
  renderCertifications();
  renderProjects();
  renderReport();
  renderPlacements();
  renderTasks();
  renderProfile();
  renderBadges();
  renderResources();
  attachHandlers();
}

function renderWelcome() {
  const profile = getProfileData();
  const dsaStats = getDisplayDsaStats(profile);
  safeText('welcome-name', profile.name || 'there');
  const placementDays = getClosestPlacementDays();
  safeText('placement-days', placementDays === null ? 'Not scheduled' : `${placementDays} Days`);
  safeText('next-company', `Next target: ${getClosestPlacementName()}`);

  const goalList = document.getElementById('goal-list');
  if (goalList) {
    const goals = Array.isArray(profile.dailyGoals) && profile.dailyGoals.length ? profile.dailyGoals : state.goals;
    goalList.innerHTML = goals.map(goal => `<li>${escapeHTML(goal)}</li>`).join('');
  }

  const welcomeProgress = document.getElementById('welcome-progress');
  if (welcomeProgress) {
    welcomeProgress.textContent = `${dsaStats.solved} DSA problems solved · ${profile.workSummary}`;
  }
}

function renderDashboard() {
  const profile = getProfileData();
  const dsaStats = getDisplayDsaStats(profile);
  const pendingTasks = Array.isArray(profile.tasks) ? profile.tasks.length : 0;
  const completedTasks = Array.isArray(profile.tasks) ? profile.tasks.filter(task => task.done).length : 0;
  const activeGoals = Array.isArray(profile.dailyGoals) ? profile.dailyGoals.slice(0, 3) : [];
  const today = new Date().toISOString().slice(0, 10);
  const dueToday = (profile.tasks || []).filter(task => !task.done && task.due === today).length;
  const overdueTasks = (profile.tasks || []).filter(task => !task.done && /^\d{4}-\d{2}-\d{2}$/.test(task.due || '') && task.due < today).length;

  safeHTML('productivity-summary', `
    <p><strong>${pendingTasks - completedTasks}</strong> open · ${completedTasks} completed</p>
    <p>${dueToday} due today · ${overdueTasks} overdue</p>
    <p>Current project: ${escapeHTML(profile.currentProject || 'Not set')}</p>
  `);

  safeHTML('dsa-summary', `
    <p><strong>${dsaStats.solved}</strong> problems solved</p>
    <p>Easy: ${dsaStats.easy} · Medium: ${dsaStats.medium} · Hard: ${dsaStats.hard}</p>
    <p>Current streak: ${dsaStats.streak} days</p>
    <p>Time spent: ${dsaStats.timeSpent} hrs</p>
  `);

  safeHTML('focus-summary', `
    <p><strong>${escapeHTML(activeGoals[0] || 'Set your focus for today')}</strong></p>
    <p>${escapeHTML(activeGoals.slice(1).join(' · ') || 'Update your profile with daily goals')}</p>
  `);

  safeHTML('profile-summary', `
    <p><strong>${escapeHTML(profile.branch || 'Add your program')}</strong> · CGPA ${escapeHTML(profile.cgpa || 'Not added')}</p>
    <p>${escapeHTML(profile.skills.slice(0, 3).join(' · ') || 'Add technical skills')}</p>
    <p>${escapeHTML(profile.workSummary || 'Add a short summary of your current focus')}</p>
    <p>Placement target: ${escapeHTML(profile.placementTarget || 'Not set')}</p>
  `);

  const scoreParts = [
    Math.min(35, Math.round((dsaStats.solved / 200) * 35)),
    Math.min(20, Math.round((dsaStats.streak / 30) * 20)),
    Math.min(20, Math.round((profile.skills.length / 6) * 20)),
    Math.min(15, Math.round((completedTasks / Math.max(1, pendingTasks)) * 15)),
    profile.resume ? 10 : 0
  ];
  const readinessScore = scoreParts.reduce((total, value) => total + value, 0);
  const actions = [];
  if (!profile.resume) actions.push('Add your resume link to complete your profile.');
  if (dsaStats.streak < 7) actions.push('Build a 7-day DSA practice streak.');
  if (profile.skills.length < 4) actions.push('Add your strongest technical skills.');
  if (pendingTasks > completedTasks) actions.push('Complete one planned task to improve momentum.');
  if (!actions.length) actions.push('Your preparation is on track—keep your current routine consistent.');

  const displayedScore = insightsCache?.readinessScore ?? readinessScore;
  const previewAnalysis = !isAuthenticated() ? {
    level: 'Building momentum',
    dimensions: [
      { name: 'Problem solving', points: 22, maxPoints: 35, detail: '128 of 200 practice problems', percent: 63 },
      { name: 'Consistency', points: 4, maxPoints: 20, detail: '6-day practice streak', percent: 20 },
      { name: 'Technical profile', points: 10, maxPoints: 15, detail: '4 skills added', percent: 67 },
      { name: 'Execution', points: 5, maxPoints: 15, detail: '1 of 3 tasks complete', percent: 33 },
      { name: 'Portfolio', points: 10, maxPoints: 10, detail: 'Resume and project evidence', percent: 100 },
      { name: 'Recent focus', points: 3, maxPoints: 5, detail: '120 minutes this week', percent: 60 }
    ],
    priorities: ['Build a steady practice streak.', 'Keep refining portfolio evidence.', 'Plan your next focus session.']
  } : null;
  const displayedAnalysis = analysisCache || previewAnalysis;
  const readinessLevel = displayedScore >= 85
    ? { label: 'Job-ready', description: 'You have a strong foundation for applications and interviews.' }
    : displayedScore >= 70
      ? { label: 'Interview-ready', description: 'You are close—strengthen weak areas and begin applying.' }
      : displayedScore >= 50
        ? { label: 'Developing foundation', description: 'Build consistency in skills, projects, and interview practice.' }
        : { label: 'Getting started', description: 'Complete your core profile and establish a regular preparation routine.' };
  safeHTML('readiness-score', `<strong>${displayedScore}<span>/100</span></strong><div class="progress-bar"><div class="progress-fill" style="width: ${displayedScore}%"></div></div>`);
  safeText('readiness-summary', readinessLevel.description);
  safeText('analysis-status', analysisCache
    ? `Calculated ${new Date(analysisCache.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · based on your saved profile and recent activity.`
    : previewAnalysis
      ? 'Illustrative score breakdown · sample data for this preview.'
      : 'Python analysis is offline. Run npm run start:python to unlock the detailed view.');
  safeText('analysis-level', displayedAnalysis?.level || 'Offline');
  safeHTML('analysis-breakdown', displayedAnalysis
    ? displayedAnalysis.dimensions.map(item => `<div class="analysis-row"><div><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.detail)}</small></div><div class="analysis-points"><strong>${item.points}<span>/${item.maxPoints}</span></strong><div class="progress-bar"><div class="progress-fill" style="width:${item.percent}%"></div></div></div></div>`).join('')
    : '<p class="meta">The existing dashboard score is still available above. This panel adds transparent scoring once the Python service is running.</p>');
  safeHTML('analysis-priorities', displayedAnalysis
    ? displayedAnalysis.priorities.map(priority => `<div class="action-item"><span>→</span><p>${escapeHTML(priority)}</p></div>`).join('')
    : '');
  safeHTML('readiness-level', `<span class="readiness-label">${readinessLevel.label}</span><small>Score reflects DSA progress, practice streak, skills, task completion, and resume availability.</small>`);
  safeHTML('readiness-actions', actions.map(action => `<div class="action-item"><span>→</span><p>${action}</p></div>`).join(''));

  const dashboardPlacements = isAuthenticated()
    ? state.placements
    : [{ name: 'Campus hiring fair', date: new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10) }];
  const deadlines = [...dashboardPlacements]
    .map(item => ({ ...item, days: calculateDays(item.date) }))
    .filter(item => item.days >= 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, 3);
  safeHTML('deadline-list', deadlines.length
    ? deadlines.map(item => `<div class="action-item"><span>${item.days}</span><p><strong>${escapeHTML(item.name)}</strong><br><small>${item.days === 0 ? 'Milestone today' : `${item.days} days remaining`}</small></p></div>`).join('')
    : '<div class="action-item"><p>No upcoming placement deadlines. Add one in Placements.</p></div>');

  const focusSessions = Array.isArray(profile.focusSessions) ? profile.focusSessions : [];
  const focusTotalMinutes = focusSessions.reduce((total, session) => total + (Number(session.minutes) || 0), 0);
  safeHTML('focus-insights', !isAuthenticated()
    ? `<div class="focus-stat"><strong>${focusTotalMinutes}</strong><span>sample minutes this week</span></div><div class="focus-stat"><strong>${focusSessions.length}</strong><span>sample sessions</span></div><p class="meta">Example data · create an account to track your own focus time.</p>`
    : insightsCache
      ? `<div class="focus-stat"><strong>${insightsCache.weeklyFocusMinutes}</strong><span>minutes focused this week</span></div><div class="focus-stat"><strong>${insightsCache.focusSessions}</strong><span>sessions completed</span></div><p class="meta">Total focused time: ${insightsCache.totalFocusMinutes} minutes</p>`
      : '<p class="meta">Loading your focus insights…</p>');
}

function renderTracker() {
  const profile = getProfileData();
  const dsaStats = getDisplayDsaStats(profile);

  const trackerOverview = document.getElementById('tracker-overview');
  if (trackerOverview) {
    trackerOverview.innerHTML = `
      <div class="tracker-pill"><strong>${dsaStats.solved}</strong><br/>Total Solved</div>
      <div class="tracker-pill"><strong>${dsaStats.streak}</strong><br/>Daily Streak</div>
      <div class="tracker-pill"><strong>${dsaStats.timeSpent}h</strong><br/>Time Spent</div>
      <div class="tracker-pill"><strong>${dsaStats.easy}/${dsaStats.medium}/${dsaStats.hard}</strong><br/>Easy/Medium/Hard</div>
    `;
  }

  const topicProgress = document.getElementById('topic-progress');
  if (topicProgress) {
    topicProgress.innerHTML = dsaStats.topics.length ? dsaStats.topics.map(topic => `
      <div class="topic-item">
        <div class="flex-between"><strong>${escapeHTML(topic.name)}</strong><span>${topic.progress}% · ${Number(topic.solved || 0)} solved</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(100, Math.max(0, Number(topic.progress) || 0))}%"></div></div>
      </div>
    `).join('') : '<p class="meta">Log a practice session to start tracking topic progress.</p>';
  }

  const sessionList = document.getElementById('dsa-session-list');
  if (sessionList) {
    const sessions = Array.isArray(profile.dsaSessions) ? profile.dsaSessions : [];
    sessionList.innerHTML = sessions.length ? sessions.slice(0, 8).map(session => `
      <div class="list-item dsa-session-item">
        <div><strong>${escapeHTML(session.topic)}</strong><span class="dsa-difficulty ${escapeHTML(session.difficulty)}">${escapeHTML(session.difficulty)}</span></div>
        <p class="meta">${Number(session.solved) || 0} problems · ${Number(session.minutes) || 0} minutes · ${new Date(session.completedAt).toLocaleDateString()}</p>
      </div>
    `).join('') : '<div class="certification-empty"><strong>No practice sessions yet.</strong><span>Your latest sessions will show here.</span></div>';
  }
}

function renderCertifications() {
  const list = document.getElementById('certification-list');
  const count = document.getElementById('certification-count');
  const search = (document.getElementById('certification-search')?.value || '').trim().toLowerCase();
  const filter = document.getElementById('certification-filter')?.value || 'all';
  const profile = getProfileData();
  const linkedinInput = document.getElementById('linkedin-certification-url');
  const linkedinPreview = document.getElementById('linkedin-certification-preview');
  const linkedinUrl = safeExternalUrl(profile.linkedin);
  if (linkedinInput && document.activeElement !== linkedinInput) linkedinInput.value = profile.linkedin || '';
  if (linkedinPreview) {
    linkedinPreview.innerHTML = linkedinUrl
      ? `<a href="${linkedinUrl}" target="_blank" rel="noopener noreferrer">View LinkedIn profile</a>`
      : 'No LinkedIn profile link saved yet.';
  }
  if (list) {
    const filteredCertifications = state.certifications
      .map((cert, index) => ({ cert, index }))
      .filter(({ cert }) => {
        const status = cert.status === 'in-progress' || cert.status === 'In Progress' ? 'in-progress' : 'completed';
        const searchable = [cert.title, cert.organization, cert.credentialId, cert.skills].join(' ').toLowerCase();
        return (filter === 'all' || filter === status) && searchable.includes(search);
      });
    if (count) count.textContent = `${state.certifications.length} ${state.certifications.length === 1 ? 'certificate' : 'certificates'}`;
    if (!filteredCertifications.length) {
      list.innerHTML = state.certifications.length
        ? '<div class="certification-empty">No certificates match these filters.</div>'
        : '<div class="certification-empty"><strong>Your certificates will appear here.</strong><span>Add a course, credential, or industry certification to get started.</span></div>';
      return;
    }
    list.innerHTML = filteredCertifications.map(({ cert, index }) => {
      const credentialUrl = safeExternalUrl(cert.credentialUrl);
      const status = cert.status === 'in-progress' || cert.status === 'In Progress' ? 'in-progress' : 'completed';
      return `
        <div class="list-item">
          <div class="certification-record-heading">
            <div><h4>${escapeHTML(cert.title)}</h4><p class="meta">${escapeHTML(cert.organization)} · ${escapeHTML(cert.date)}</p></div>
            <span class="certification-status ${status}">${status === 'completed' ? 'Completed' : 'In progress'}</span>
          </div>
          <p><strong>Credential ID:</strong> ${escapeHTML(cert.credentialId || 'Not added')}</p>
          <p><strong>Skills:</strong> ${escapeHTML(cert.skills || 'Not added')}</p>
          <p>${cert.file ? `File: ${escapeHTML(cert.file)}` : 'No file uploaded'}</p>
          ${credentialUrl ? `<p><a href="${escapeHTML(credentialUrl)}" target="_blank" rel="noopener noreferrer">View certificate or verify credential</a></p>` : '<p class="meta">No verification link added</p>'}
          <div class="certification-record-actions"><button class="btn btn-secondary btn-small" type="button" data-cert-remove="${index}">Remove</button></div>
        </div>
      `;
    }).join('');
  }
}

function renderProjects() {
  const list = document.getElementById('project-list');
  if (list) {
    const search = (document.getElementById('project-search')?.value || '').trim().toLowerCase();
    const filter = document.getElementById('project-filter')?.value || 'all';
    const count = document.getElementById('project-count');
    if (count) count.textContent = `${state.projects.length} ${state.projects.length === 1 ? 'project' : 'projects'}`;
    const filteredProjects = state.projects
      .map((project, index) => ({ project, index }))
      .filter(({ project }) => (filter === 'all' || project.status === filter) && [project.name, project.tech].join(' ').toLowerCase().includes(search));
    list.innerHTML = filteredProjects.length ? filteredProjects.map(({ project, index }) => {
      const github = safeExternalUrl(project.github);
      const demo = safeExternalUrl(project.demo);
      const status = ['Planned', 'In Progress', 'Completed', 'On Hold'].includes(project.status) ? project.status : 'In Progress';
      return `
        <article class="list-item project-record">
          <div class="project-record-heading"><div><h3>${escapeHTML(project.name)}</h3><p class="meta">${escapeHTML(project.tech || 'Technology stack not added')}</p></div><span class="project-status ${status.toLowerCase().replaceAll(' ', '-')}">${escapeHTML(status)}</span></div>
          <div class="project-links">${github ? `<a href="${escapeHTML(github)}" target="_blank" rel="noopener noreferrer">GitHub repository</a>` : ''}${demo ? `<a href="${escapeHTML(demo)}" target="_blank" rel="noopener noreferrer">Live demo</a>` : ''}${!github && !demo ? '<span class="meta">Add a repository or demo link</span>' : ''}</div>
          <div class="project-record-actions"><label class="form-label">Update status<select data-project-status="${index}"><option${status === 'Planned' ? ' selected' : ''}>Planned</option><option${status === 'In Progress' ? ' selected' : ''}>In Progress</option><option${status === 'Completed' ? ' selected' : ''}>Completed</option><option${status === 'On Hold' ? ' selected' : ''}>On Hold</option></select></label><button class="btn btn-secondary btn-small" type="button" data-project-remove="${index}">Remove</button></div>
        </article>
      `;
    }).join('') : `<div class="certification-empty">${state.projects.length ? 'No projects match these filters.' : 'Add a project to start building your portfolio.'}</div>`;
  }
}

function renderReport() {
  const preview = document.getElementById('report-preview');
  if (preview) {
    preview.textContent = generateReportText();
  }
  const report = getWeeklyReportData();
  const highlights = document.getElementById('report-highlights');
  if (highlights) {
    highlights.innerHTML = [
      ['DSA problems', report.dsaProblems],
      ['Focus minutes', report.focusMinutes],
      ['Tasks completed', report.tasksCompleted],
      ['Applications tracked', report.applications]
    ].map(([label, value]) => `<div class="report-highlight"><strong>${value}</strong><span>${label}</span></div>`).join('');
  }
  safeText('report-period', `Last 7 days · ${report.period}`);
}

function getWeeklyReportData() {
  const profile = getProfileData();
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  const isThisWeek = value => {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) && timestamp >= start.getTime() && timestamp <= end.getTime();
  };
  const dsaSessions = (Array.isArray(profile.dsaSessions) ? profile.dsaSessions : []).filter(session => isThisWeek(session.completedAt));
  const focusSessions = (Array.isArray(profile.focusSessions) ? profile.focusSessions : []).filter(session => isThisWeek(session.completedAt));
  const completedTasks = (Array.isArray(profile.tasks) ? profile.tasks : []).filter(task => task.done && isThisWeek(task.completedAt));
  const applications = state.placements.filter(company => ['applied', 'interview', 'offer'].includes(company.stage)).length;
  const upcomingInterviews = state.placements.filter(company => company.stage === 'interview' && calculateDays(company.date) >= 0).length;
  const completedProjects = state.projects.filter(project => project.status === 'Completed').length;
  const formatDate = date => date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return {
    dsaProblems: dsaSessions.reduce((total, session) => total + (Number(session.solved) || 0), 0),
    focusMinutes: focusSessions.reduce((total, session) => total + (Number(session.minutes) || 0), 0),
    tasksCompleted: completedTasks.length,
    openTasks: (Array.isArray(profile.tasks) ? profile.tasks : []).filter(task => !task.done).length,
    projects: state.projects.length,
    completedProjects,
    applications,
    upcomingInterviews,
    period: `${formatDate(start)}–${formatDate(end)}`
  };
}

function generateReportText() {
  const report = getWeeklyReportData();
  return [
    `Weekly progress · ${report.period}`,
    `DSA practice\n${report.dsaProblems} problems solved in logged sessions`,
    `Focus\n${report.focusMinutes} focused minutes`,
    `Tasks\n${report.tasksCompleted} completed this week · ${report.openTasks} currently open`,
    `Projects\n${report.projects} in portfolio · ${report.completedProjects} completed`,
    `Placement pipeline\n${report.applications} applications tracked · ${report.upcomingInterviews} upcoming interviews`
  ].join('\n\n');
}

function escapePdfText(value) {
  return String(value)
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function downloadReportPdf() {
  const reportText = generateReportText();
  const lines = reportText.split('\n');
  const pageHeight = 792;
  const top = 740;
  const lineHeight = 20;
  const linesPerPage = 33;
  const pages = [];

  for (let start = 0; start < lines.length; start += linesPerPage) {
    const pageLines = lines.slice(start, start + linesPerPage);
    const content = [
      'BT',
      '/F1 18 Tf',
      '72 758 Td',
      `(Zyntra Weekly Report) Tj`,
      '/F1 11 Tf'
    ];

    pageLines.forEach((line, index) => {
      const y = top - (index * lineHeight);
      content.push(`1 0 0 1 72 ${y} Tm`);
      content.push(`(${escapePdfText(line || ' ')}) Tj`);
    });
    content.push('ET');
    pages.push(content.join('\n'));
  }

  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', ''];
  const pageObjectNumbers = pages.map((_, index) => 4 + (index * 2));
  objects[1] = `<< /Type /Pages /Kids [${pageObjectNumbers.map(number => `${number} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  pages.forEach((content, index) => {
    const pageNumber = pageObjectNumbers[index];
    const contentNumber = pageNumber + 1;
    objects[pageNumber - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNumber} 0 R >>`;
    objects[contentNumber - 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const blob = new Blob([pdf], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'zyntra-weekly-report.pdf';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderPlacements() {
  const list = document.getElementById('placement-list');
  const profile = getProfileData();
  const search = (document.getElementById('placement-search')?.value || '').trim().toLowerCase();
  const filter = document.getElementById('placement-filter')?.value || 'all';
  const upcoming = state.placements.filter(company => calculateDays(company.date) >= 0 && getPlacementStage(company) !== 'closed');
  const interviews = state.placements.filter(company => getPlacementStage(company) === 'interview');
  safeText('placement-total', state.placements.length);
  safeText('placement-interview-count', interviews.length);
  safeText('placement-upcoming-count', upcoming.length);
  if (list) {
    const targetCard = `
      <div class="list-item highlight-card">
        <h4>Your focus target</h4>
        <p class="meta">${escapeHTML(profile.placementTarget || 'No target selected')}</p>
        <p>Use your profile to change your primary target.</p>
      </div>
    `;
    const visiblePlacements = state.placements
      .map((company, index) => ({ company, index, days: calculateDays(company.date), stage: getPlacementStage(company) }))
      .filter(({ company, stage }) => stageMatches(filter, stage) && String(company.name || '').toLowerCase().includes(search))
      .sort((a, b) => (a.days < 0) - (b.days < 0) || a.days - b.days);
    const count = document.getElementById('placement-count');
    if (count) count.textContent = `${state.placements.length} ${state.placements.length === 1 ? 'company' : 'companies'}`;
    const cards = visiblePlacements.map(({ company, index, days, stage }) => {
      const applicationUrl = safeExternalUrl(company.applicationUrl);
      const daysLabel = days === 0 ? 'Milestone today' : days > 0 ? `${days} days remaining` : `${Math.abs(days)} days passed`;
      return `
        <div class="list-item placement-record">
          <div class="placement-record-heading"><div><h4>${escapeHTML(company.name)}</h4><p class="meta">${escapeHTML(company.date)} · ${daysLabel}</p></div><span class="placement-stage ${stage}">${getPlacementStageLabel(stage)}</span></div>
          ${applicationUrl ? `<p><a href="${escapeHTML(applicationUrl)}" target="_blank" rel="noopener noreferrer">Open application page</a></p>` : ''}
          <div class="placement-record-actions"><label class="form-label">Update stage<select data-placement-stage="${index}"><option value="targeting"${stage === 'targeting' ? ' selected' : ''}>Targeting</option><option value="applied"${stage === 'applied' ? ' selected' : ''}>Applied</option><option value="interview"${stage === 'interview' ? ' selected' : ''}>Interview</option><option value="offer"${stage === 'offer' ? ' selected' : ''}>Offer</option><option value="closed"${stage === 'closed' ? ' selected' : ''}>Closed</option></select></label><button class="btn btn-secondary btn-small" type="button" data-placement-remove="${index}">Remove</button></div>
        </div>
      `;
    }).join('');
    list.innerHTML = targetCard + (cards || (state.placements.length
      ? '<div class="certification-empty">No companies match these filters.</div>'
      : '<div class="certification-empty"><strong>Your pipeline is empty.</strong><span>Add a target company to track its hiring timeline.</span></div>'));
  }
}

function getPlacementStage(company) {
  const knownStages = ['targeting', 'applied', 'interview', 'offer', 'closed'];
  return knownStages.includes(company.stage) ? company.stage : 'targeting';
}

function getPlacementStageLabel(stage) {
  return stage === 'targeting' ? 'Targeting' : stage === 'interview' ? 'Interview' : stage[0].toUpperCase() + stage.slice(1);
}

function stageMatches(filter, stage) {
  return filter === 'all' || filter === stage;
}

function renderTasks() {
  const list = document.getElementById('task-list');
  const profile = getProfileData();
  if (!list) {
    return;
  }

  const tasks = Array.isArray(profile.tasks) ? profile.tasks : [];
  const completedCount = tasks.filter(task => task.done).length;
  const summary = document.getElementById('task-list-summary');
  if (summary) {
    summary.textContent = `${tasks.length - completedCount} to do · ${completedCount} completed`;
  }

  if (!tasks.length) {
    list.innerHTML = '<div class="list-item task-empty"><strong>No tasks yet</strong><p class="meta">Add your first task to turn a goal into a clear next step.</p></div>';
    return;
  }

  const filter = document.getElementById('task-filter')?.value || 'all';
  const orderedTasks = tasks.map((task, index) => ({ task, index }))
    .filter(({ task }) => filter === 'all' || (filter === 'completed' ? task.done : !task.done))
    .sort((a, b) => Number(a.task.done) - Number(b.task.done) || String(a.task.due || '9999-12-31').localeCompare(String(b.task.due || '9999-12-31')));
  if (!orderedTasks.length) {
    list.innerHTML = `<div class="list-item task-empty"><strong>${filter === 'completed' ? 'Nothing completed yet' : 'You’re all caught up'}</strong><p class="meta">${filter === 'completed' ? 'Completed tasks will appear here.' : 'No open tasks. Enjoy the breathing room.'}</p></div>`;
    return;
  }

  list.innerHTML = orderedTasks.map(({ task, index }) => `
    <article class="list-item task-item${task.done ? ' is-complete' : ''}">
      <div class="task-header">
        <div class="task-title-group">
          <span class="task-state">${task.done ? 'Completed' : 'To do'}</span>
          <strong class="${task.done ? 'task-complete' : ''}">${escapeHTML(task.title)}</strong>
        </div>
        <div class="task-actions">
          <button class="btn btn-secondary btn-small" data-task-edit="${index}" type="button" aria-label="Edit ${escapeHTML(task.title)}">Edit</button>
          <button class="btn btn-secondary btn-small" data-task-toggle="${index}" type="button" aria-label="${task.done ? 'Reopen' : 'Complete'} ${escapeHTML(task.title)}">${task.done ? 'Reopen' : 'Complete'}</button>
          <button class="btn btn-quiet btn-small" data-task-remove="${index}" type="button" aria-label="Remove ${escapeHTML(task.title)}">Remove</button>
        </div>
      </div>
      <p class="task-due${!task.done && /^\d{4}-\d{2}-\d{2}$/.test(task.due || '') && task.due < new Date().toISOString().slice(0, 10) ? ' is-overdue' : ''}">${escapeHTML(task.due || 'No deadline')}${!task.done && /^\d{4}-\d{2}-\d{2}$/.test(task.due || '') && task.due < new Date().toISOString().slice(0, 10) ? ' · Overdue' : ''}</p>
      ${task.note ? `<p class="task-note">${escapeHTML(task.note)}</p>` : ''}
    </article>
  `).join('');
}

function renderResources() {
  const list = document.getElementById('resource-list');
  const profile = getProfileData();
  const resources = Array.isArray(profile.studyResources) ? profile.studyResources : [];
  const search = (document.getElementById('resource-search')?.value || '').trim().toLowerCase();
  const filter = document.getElementById('resource-filter');
  const selectedTopic = filter?.value || 'all';
  if (filter) {
    const topics = [...new Set(resources.map(resource => String(resource.topic || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    filter.innerHTML = '<option value="all">All topics</option>' + topics.map(topic => `<option value="${escapeHTML(topic)}">${escapeHTML(topic)}</option>`).join('');
    filter.value = topics.includes(selectedTopic) ? selectedTopic : 'all';
  }
  if (list) {
    const count = document.getElementById('resource-count');
    if (count) count.textContent = `${resources.length} ${resources.length === 1 ? 'resource' : 'resources'}`;
    if (!resources.length) {
      list.innerHTML = '<div class="certification-empty"><strong>Your library is empty.</strong><span>Save useful articles, videos, and course pages to revisit later.</span></div>';
      return;
    }
    const filtered = resources.map((resource, index) => ({ resource, index })).filter(({ resource }) => {
      const topic = String(resource.topic || '').trim();
      const searchable = [resource.title, topic, resource.description].join(' ').toLowerCase();
      return (filter?.value === 'all' || topic === filter?.value) && searchable.includes(search);
    });
    list.innerHTML = filtered.length ? filtered.map(({ resource, index }) => {
      const url = safeExternalUrl(resource.link);
      return `
        <article class="list-item resource-record">
          <div><h3>${escapeHTML(resource.title)}</h3><p class="meta">${escapeHTML(resource.topic || 'General reference')}</p></div>
          <p>${escapeHTML(resource.description || 'No notes added')}</p>
          ${url ? `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">Open resource</a>` : '<span class="meta">No valid link saved</span>'}
          <div class="resource-record-actions"><button class="btn btn-secondary btn-small" type="button" data-resource-remove="${index}">Remove</button></div>
        </article>
      `;
    }).join('') : '<div class="certification-empty">No resources match your search and topic filter.</div>';
  }
}

function renderProfile() {
  const profile = document.getElementById('profile-content');
  if (profile) {
    const currentProfile = getProfileData();
    const profileFields = [currentProfile.name, currentProfile.branch, currentProfile.cgpa, currentProfile.skills.length, currentProfile.resume, currentProfile.github || currentProfile.linkedin, currentProfile.currentProject, currentProfile.placementTarget];
    const completeness = Math.round(profileFields.filter(Boolean).length / profileFields.length * 100);
    const onlineProfiles = [
      ['Resume', currentProfile.resume],
      ['GitHub', currentProfile.github],
      ['LinkedIn', currentProfile.linkedin],
      ['LeetCode', currentProfile.leetcode],
      ['GeeksforGeeks', currentProfile.geeksforgeeks]
    ].map(([label, value]) => {
      const url = safeExternalUrl(value);
      return url ? `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : '';
    }).filter(Boolean);
    profile.innerHTML = `
      <div class="profile-completeness">
        <div class="flex-between"><strong>Profile completeness</strong><strong>${completeness}%</strong></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${completeness}%"></div></div>
        <p class="meta">${completeness === 100 ? 'Your core profile is complete.' : 'Add your academic details, skills, and portfolio links to strengthen your profile.'}</p>
      </div>
      <div class="profile-summary">
        <div class="list-item profile-details">
          <p class="eyebrow">Your submitted details</p>
          <h3>${escapeHTML(currentProfile.name || 'Name not added')}</h3>
          <dl>
            <div><dt>Email</dt><dd>${escapeHTML(currentProfile.email || 'Not provided')}</dd></div>
            <div><dt>Branch</dt><dd>${escapeHTML(currentProfile.branch || 'Not provided')}</dd></div>
            <div><dt>CGPA</dt><dd>${escapeHTML(currentProfile.cgpa || 'Not provided')}</dd></div>
            <div><dt>Skills</dt><dd>${escapeHTML(currentProfile.skills.join(', ') || 'Not provided')}</dd></div>
          </dl>
          <p><strong>Daily goals:</strong> ${escapeHTML(currentProfile.dailyGoals.join(', ') || 'Not added')}</p>
          <p><strong>Work summary:</strong> ${escapeHTML(currentProfile.workSummary || 'Not added')}</p>
          <p><strong>Placement target:</strong> ${escapeHTML(currentProfile.placementTarget || 'Not set')}</p>
          <div class="profile-links">${onlineProfiles.length ? onlineProfiles.join('') : '<span class="meta">Add a valid portfolio link to make it visible here.</span>'}</div>
        </div>
        <form id="profile-editor" class="form-card profile-form">
          <h3>Update Your Details</h3>
          <input type="text" id="profile-name" value="${escapeHTML(currentProfile.name)}" placeholder="Full name" />
          <input type="text" id="profile-branch" value="${escapeHTML(currentProfile.branch)}" placeholder="Branch" />
          <input type="number" id="profile-cgpa" value="${escapeHTML(currentProfile.cgpa)}" min="0" max="10" step="0.01" placeholder="CGPA" />
          <input type="text" id="profile-skills" value="${escapeHTML(currentProfile.skills.join(', '))}" placeholder="Skills" />
          <input type="text" id="profile-goals" value="${escapeHTML(currentProfile.dailyGoals.join(', '))}" placeholder="Daily goals" />
          <textarea id="profile-work" rows="3" placeholder="Work done / current focus">${escapeHTML(currentProfile.workSummary)}</textarea>
          <input type="text" id="profile-project" value="${escapeHTML(currentProfile.currentProject)}" placeholder="Current project" />
          <input type="text" id="profile-cert" value="${escapeHTML(currentProfile.currentCertification)}" placeholder="Current certification" />
          <input type="text" id="profile-placement" value="${escapeHTML(currentProfile.placementTarget)}" placeholder="Placement target" />
          <input type="url" id="profile-resume" value="${escapeHTML(currentProfile.resume)}" placeholder="Resume link" />
          <input type="url" id="profile-github" value="${escapeHTML(currentProfile.github)}" placeholder="GitHub" />
          <input type="url" id="profile-linkedin" value="${escapeHTML(currentProfile.linkedin)}" placeholder="LinkedIn" />
          <input type="url" id="profile-leetcode" value="${escapeHTML(currentProfile.leetcode)}" placeholder="LeetCode" />
          <input type="url" id="profile-geeks" value="${escapeHTML(currentProfile.geeksforgeeks)}" placeholder="GeeksforGeeks" />
          <button class="btn btn-primary" type="submit">Save Profile</button>
          <button class="btn btn-secondary" type="button" id="logout-btn">Logout</button>
        </form>
      </div>
    `;
  }
}

function renderBadges() {
  const profile = getProfileData();
  const completedProjects = state.projects.filter(project => project.status === 'Completed').length;
  const certifications = state.certifications.length;
  const focusMinutes = (Array.isArray(profile.focusSessions) ? profile.focusSessions : []).reduce((total, session) => total + Number(session.minutes || 0), 0);
  const badges = [
    { icon: '01', title: 'First steps', detail: 'Log your first DSA problem', earned: profile.dsaSolved >= 1 },
    { icon: '50', title: 'Problem solver', detail: 'Solve 50 DSA problems', earned: profile.dsaSolved >= 50 },
    { icon: '7', title: 'Consistent practice', detail: 'Build a 7-day streak', earned: profile.dsaStreak >= 7 },
    { icon: 'P', title: 'Project shipped', detail: 'Complete a portfolio project', earned: completedProjects > 0 },
    { icon: 'C', title: 'Credential earned', detail: 'Add a certification', earned: certifications > 0 },
    { icon: 'F', title: 'Focused learner', detail: 'Complete 5 focus hours', earned: focusMinutes >= 300 }
  ];

  const achievementList = document.getElementById('achievement-list');
  if (achievementList) {
    achievementList.innerHTML = badges.map(badge => `
      <div class="badge">
        <strong>${badge.icon} ${badge.title}</strong>
        <span>${badge.detail}</span>
        <small>${badge.earned ? 'Earned' : 'In progress'}</small>
      </div>
    `).join('');
  }
}

function calculateDays(targetDate) {
  const today = new Date();
  const target = new Date(targetDate);
  const diff = target.setHours(0,0,0,0) - today.setHours(0,0,0,0);
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getClosestPlacementDays() {
  const remaining = state.placements.map(c => calculateDays(c.date));
  const positive = remaining.filter(days => days >= 0);
  return positive.length ? Math.min(...positive) : null;
}

function getClosestPlacementName() {
  const upcoming = state.placements.filter(company => calculateDays(company.date) >= 0);
  if (!upcoming.length) return getProfileData().placementTarget || 'No target selected';
  const nearest = upcoming.reduce((closest, current) => calculateDays(current.date) < calculateDays(closest.date) ? current : closest);
  return nearest.name;
}

function showAuthMessage(message, isError = false) {
  const messageBox = document.getElementById('auth-message');
  if (messageBox) {
    messageBox.textContent = message;
    messageBox.className = isError ? 'auth-message error' : 'auth-message';
  }
}

function showFormFeedback(form, message, isError = false) {
  if (!form) return;
  let status = form.querySelector('[data-form-feedback]');
  if (!status) {
    status = document.createElement('p');
    status.dataset.formFeedback = 'true';
    status.setAttribute('role', 'status');
    form.append(status);
  }
  status.className = isError ? 'field-error' : 'meta';
  status.textContent = message;
}

function getSaveFailureMessage(error, item) {
  if (error instanceof TypeError || /unable to reach the backend server/i.test(error?.message || '')) {
    return `${item} couldn't be saved because the Zyntra server is unreachable. Start the app with "npm start", then try again.`;
  }
  if (error?.status === 401) {
    return `Please sign in again to save ${item.toLowerCase()}.`;
  }
  return `${item} couldn't be saved. Please try again.`;
}

function initGuestAccess() {
  const currentPage = window.location.pathname.split('/').pop();
  const isDashboardPreview = currentPage === 'dashboard.html';
  const authenticated = isAuthenticated();
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const signInUrl = `auth.html?returnTo=${encodeURIComponent(returnTo)}&mode=signup`;

  if (isDashboardPreview) {
    const previewBanner = document.querySelector('.dashboard-preview-banner');
    const signupLink = previewBanner?.querySelector('a');
    if (signupLink) {
      signupLink.href = signInUrl;
      signupLink.innerHTML = 'Make it yours <span aria-hidden="true">→</span>';
    }
  }

  if (isDashboardPreview && !authenticated) {
    const topbar = document.querySelector('.topbar');
    if (topbar && !topbar.querySelector('.dashboard-header-cta')) {
      const link = document.createElement('a');
      link.className = 'dashboard-header-cta';
      link.href = signInUrl;
      link.textContent = 'Make it yours';
      topbar.insertBefore(link, topbar.querySelector('.theme-toggle'));
    }

    document.addEventListener('click', event => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest('a[href]');
      if (!link) return;

      const target = new URL(link.href, window.location.href);
      const targetPage = target.pathname.split('/').pop();
      if (target.origin !== window.location.origin
        || !PROTECTED_PAGES.includes(targetPage)
        || targetPage === 'dashboard.html') return;

      event.preventDefault();
      const destination = `${target.pathname}${target.search}${target.hash}`;
      window.location.assign(`auth.html?returnTo=${encodeURIComponent(destination)}&mode=signup`);
    }, true);
  }

  if (authenticated || !PROTECTED_PAGES.includes(currentPage)) return true;
  if (!isDashboardPreview) {
    window.location.replace(signInUrl);
    return false;
  }

  const main = document.querySelector('main');
  if (!main) return true;

  document.addEventListener('click', event => {
    if (isAuthenticated() || !(event.target instanceof Element)) return;
    const addTaskButton = event.target.closest('#task-form button[type="submit"]');
    if (!addTaskButton) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const task = {
      title: document.getElementById('task-title')?.value.trim() || '',
      due: document.getElementById('task-due')?.value.trim() || '',
      note: document.getElementById('task-note')?.value.trim() || '',
      done: false
    };
    if (task.title) {
      beginSignupForSave({ kind: 'task', item: task });
    } else {
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.assign(`auth.html?returnTo=${encodeURIComponent(returnTo)}&mode=signup`);
    }
  }, true);

  document.addEventListener('submit', event => {
    if (isAuthenticated()) return;
    if (event.target instanceof HTMLFormElement && ['task-form', 'certification-form', 'focus-session-form'].includes(event.target.id)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.target.id === 'task-form') {
        const task = {
          title: document.getElementById('task-title')?.value.trim() || '',
          due: document.getElementById('task-due')?.value.trim() || '',
          note: document.getElementById('task-note')?.value.trim() || '',
          done: false
        };
        if (!task.title) {
          showFormFeedback(event.target, 'Add a task title before continuing.', true);
          return;
        }
        beginSignupForSave({ kind: 'task', item: task });
      } else if (event.target.id === 'focus-session-form') {
        const session = {
          topic: document.getElementById('focus-topic')?.value.trim() || 'General preparation',
          minutes: Number(document.getElementById('focus-minutes')?.value) || 25,
          completedAt: new Date().toISOString()
        };
        beginSignupForSave({ kind: 'focus-session', item: session });
      } else {
        const certification = {
          title: document.getElementById('cert-title')?.value.trim() || '',
          organization: document.getElementById('cert-org')?.value.trim() || '',
          date: document.getElementById('cert-date')?.value || '',
          status: document.getElementById('cert-status')?.value || 'completed',
          credentialId: document.getElementById('cert-id')?.value.trim() || '',
          skills: document.getElementById('cert-skills')?.value.trim() || '',
          credentialUrl: document.getElementById('cert-link')?.value.trim() || '',
          file: document.getElementById('cert-file')?.files[0]?.name || ''
        };
        if (certification.credentialUrl && !safeExternalUrl(certification.credentialUrl)) {
          showFormFeedback(event.target, 'Enter a valid HTTP or HTTPS verification link.', true);
          return;
        }
        beginSignupForSave({ kind: 'certification', item: certification });
      }
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    showGuestAccessMessage();
  }, true);

  document.addEventListener('click', event => {
    if (isAuthenticated() || !(event.target instanceof Element)) return;
    const action = event.target.closest('[data-task-toggle], [data-task-remove], [data-cert-remove], [data-placement-remove], [data-project-remove], [data-resource-remove]');
    if (!action) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showGuestAccessMessage();
  }, true);

  document.addEventListener('change', event => {
    if (isAuthenticated() || !(event.target instanceof Element)) return;
    if (!event.target.closest('[data-project-status], [data-placement-stage]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    render();
    showGuestAccessMessage();
  }, true);
  return true;
}

function beginSignupForSave(pendingSave) {
  sessionStorage.setItem(PENDING_SAVE_STORAGE_KEY, JSON.stringify(pendingSave));
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.assign(`auth.html?returnTo=${encodeURIComponent(returnTo)}&mode=signup&intent=save`);
}

async function savePendingWorkspaceItem() {
  if (!isAuthenticated()) return;
  const savedItem = sessionStorage.getItem(PENDING_SAVE_STORAGE_KEY);
  if (!savedItem) return;

  try {
    const pendingSave = JSON.parse(savedItem);
    let profilePatch;
    if (pendingSave.kind === 'task' && pendingSave.item?.title) {
      const profile = getProfileData();
      profilePatch = { tasks: [...(Array.isArray(profile.tasks) ? profile.tasks : []), pendingSave.item] };
    } else if (pendingSave.kind === 'focus-session' && pendingSave.item?.minutes) {
      const profile = getProfileData();
      const sessions = Array.isArray(profile.focusSessions) ? profile.focusSessions : [];
      profilePatch = { focusSessions: [pendingSave.item, ...sessions].slice(0, 100) };
    } else if (pendingSave.kind === 'certification' && pendingSave.item?.title) {
      const profile = getProfileData();
      profilePatch = { certifications: [...(Array.isArray(profile.certifications) ? profile.certifications : []), pendingSave.item] };
    } else if (pendingSave.kind === 'profile' && pendingSave.profilePatch) {
      profilePatch = pendingSave.profilePatch;
    } else {
      sessionStorage.removeItem(PENDING_SAVE_STORAGE_KEY);
      return;
    }

    await updateProfile(profilePatch);
    sessionStorage.removeItem(PENDING_SAVE_STORAGE_KEY);
    if (Array.isArray(profilePatch.tasks)) profileCache.tasks = profilePatch.tasks;
    if (Array.isArray(profilePatch.certifications)) state.certifications = profilePatch.certifications;
    if (Array.isArray(profilePatch.projects)) state.projects = profilePatch.projects;
    if (Array.isArray(profilePatch.placements)) state.placements = profilePatch.placements;
    render();
    const feedbackForm = document.getElementById(
      pendingSave.kind === 'task' ? 'task-form'
        : pendingSave.kind === 'focus-session' ? 'focus-session-form'
          : 'certification-form'
    );
    if (feedbackForm) showFormFeedback(feedbackForm, 'Saved to your profile.');
  } catch (error) {
    const feedbackForm = document.getElementById('task-form')
      || document.getElementById('focus-session-form')
      || document.getElementById('certification-form');
    if (feedbackForm) showFormFeedback(feedbackForm, getSaveFailureMessage(error, 'Your entry'), true);
  }
}

function showGuestAccessMessage() {
  const status = document.getElementById('guest-access-status');
  if (status) status.textContent = 'Create an account or sign in to save workspace changes.';
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getAuthReturnPath() {
  const returnTo = new URLSearchParams(window.location.search).get('returnTo');
  if (!returnTo) return 'profile.html';
  try {
    const destination = new URL(returnTo, window.location.origin);
    const page = destination.pathname.split('/').pop();
    if (destination.origin !== window.location.origin || !PROTECTED_PAGES.includes(page)) return 'profile.html';
    return `${page}${destination.search}${destination.hash}`;
  } catch (error) {
    return 'profile.html';
  }
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch (error) {
    return '';
  }
}

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function isIndexPage() {
  const page = window.location.pathname.split('/').pop();
  return page === 'index.html' || page === '' || page === '/';
}

function initCurrentPageNavigation() {
  const currentPath = window.location.pathname.endsWith('/')
    ? `${window.location.pathname}index.html`
    : window.location.pathname;
  document.querySelectorAll('nav a[href]').forEach(link => {
    const target = new URL(link.href, window.location.href);
    if (target.hash && target.pathname === currentPath) {
      link.removeAttribute('aria-current');
      return;
    }
    if (target.pathname === currentPath) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  document.querySelector('.m-workspace-menu')?.classList.toggle(
    'has-current-page',
    Boolean(document.querySelector('.m-workspace-links a[aria-current="page"]'))
  );
}

function getWallpaperUrl() {
  return `${API_BASE_URL}/wallpaper`;
}

async function loadLiveSiteBackground() {
  const background = document.getElementById('live-site-background');
  if (!background) return;
  if (document.documentElement.getAttribute('data-theme') === 'light') {
    background.style.backgroundImage = '';
    return;
  }
  try {
    const response = await fetch(getWallpaperUrl());
    if (!response.ok) throw new Error('Failed to load live background');
    const svg = await response.text();
    background.style.backgroundImage = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
  } catch (error) {
    background.style.backgroundImage = '';
  }
}

function initLiveSiteBackground() {
  const background = document.createElement('div');
  background.id = 'live-site-background';
  background.setAttribute('aria-hidden', 'true');
  document.body.prepend(background);
  loadLiveSiteBackground();
}

async function loadLiveWallpaper() {
  if (!isIndexPage()) {
    return;
  }

  const wallpaper = document.getElementById('live-wallpaper');
  if (!wallpaper) {
    return;
  }

  // The live wallpaper is intentionally dark. Let light mode use its CSS-based
  // hero treatment instead of injecting a dark image or fallback gradient.
  if (document.documentElement.getAttribute('data-theme') === 'light') {
    wallpaper.style.backgroundImage = '';
    wallpaper.style.opacity = '1';
    return;
  }

  try {
    const response = await fetch(getWallpaperUrl());
    if (!response.ok) {
      throw new Error('Failed to load wallpaper');
    }
    const svg = await response.text();
    wallpaper.style.backgroundImage = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
    wallpaper.style.opacity = '1';
  } catch (error) {
    wallpaper.style.backgroundImage = 'linear-gradient(135deg, rgba(39, 54, 96, 0.82), rgba(20, 27, 49, 0.84))';
    wallpaper.style.opacity = '1';
  }
}

function initLiveWallpaper() {
  loadLiveWallpaper();
  setInterval(loadLiveWallpaper, 120000);
}

function initLiveStatus() {
  const status = document.getElementById('live-status');
  const clock = document.getElementById('live-clock');
  if (!status && !clock) {
    return;
  }

  const updateStatus = () => {
    if (status) {
      status.textContent = navigator.onLine ? 'ONLINE' : 'OFFLINE';
      status.classList.toggle('is-offline', !navigator.onLine);
    }
    if (clock) {
      clock.textContent = new Intl.DateTimeFormat([], {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      }).format(new Date());
    }
  };

  updateStatus();
  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  setInterval(updateStatus, 1000);
}

function showFieldError(fieldId, message) {
  const fieldError = document.getElementById(fieldId);
  if (fieldError) {
    fieldError.textContent = message;
  }
}

function clearFieldErrors(form) {
  if (!form) {
    return;
  }
  form.querySelectorAll('.field-error').forEach(el => el.textContent = '');
  form.querySelectorAll('input').forEach(input => input.classList.remove('invalid'));
}

function validateSignupFields() {
  const form = document.getElementById('signup-form');
  if (!form) {
    return false;
  }

  clearFieldErrors(form);
  let valid = true;

  const nameInput = document.getElementById('signup-name');
  const emailInput = document.getElementById('signup-email');
  const phoneInput = document.getElementById('signup-phone');
  const passwordInput = document.getElementById('signup-password');
  const cgpaInput = document.getElementById('signup-cgpa');

  const name = nameInput?.value.trim();
  const email = emailInput?.value.trim();
  const phone = phoneInput?.value.trim();
  const password = passwordInput?.value || '';
  const cgpa = cgpaInput?.value.trim();

  if (!name) {
    showFieldError('signup-name-error', 'Full name is required.');
    nameInput?.classList.add('invalid');
    valid = false;
  }

  const hasEmail = Boolean(email && validateEmail(email));
  const hasPhone = Boolean(phone && phone.replace(/\D/g, '').length >= 8);
  if (!hasEmail && !hasPhone) {
    showFieldError('signup-email-error', 'Enter a valid email or phone number.');
    emailInput?.classList.add('invalid');
    if (phoneInput) phoneInput.classList.add('invalid');
    valid = false;
  } else {
    if (email && !validateEmail(email)) {
      showFieldError('signup-email-error', 'Enter a valid email address.');
      emailInput?.classList.add('invalid');
      valid = false;
    }
    if (phone && phone.replace(/\D/g, '').length < 8) {
      showFieldError('signup-phone-error', 'Enter a valid phone number.');
      phoneInput?.classList.add('invalid');
      valid = false;
    }
  }

  if (!password) {
    showFieldError('signup-password-error', 'Password is required.');
    passwordInput?.classList.add('invalid');
    valid = false;
  } else if (password.length < 8) {
    showFieldError('signup-password-error', 'Use at least 8 characters.');
    passwordInput?.classList.add('invalid');
    valid = false;
  }

  const cgpaValue = Number(cgpa);
  if (cgpa && (Number.isNaN(cgpaValue) || cgpaValue < 0 || cgpaValue > 10)) {
    showFieldError('signup-cgpa-error', 'Enter a valid CGPA between 0 and 10.');
    cgpaInput?.classList.add('invalid');
    valid = false;
  }

  return valid;
}

function validateLoginFields() {
  const form = document.getElementById('login-form');
  if (!form) {
    return false;
  }

  clearFieldErrors(form);
  let valid = true;

  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const identifier = emailInput?.value.trim();
  const password = passwordInput?.value || '';

  if (!identifier) {
    showFieldError('login-email-error', 'Email or phone is required.');
    emailInput?.classList.add('invalid');
    valid = false;
  } else {
    const looksLikeEmail = identifier.includes('@');
    const digitsOnly = identifier.replace(/\D/g, '');
    if (!looksLikeEmail && digitsOnly.length < 8) {
      showFieldError('login-email-error', 'Enter a valid email or phone number.');
      emailInput?.classList.add('invalid');
      valid = false;
    }
    if (looksLikeEmail && !validateEmail(identifier)) {
      showFieldError('login-email-error', 'Enter a valid email address.');
      emailInput?.classList.add('invalid');
      valid = false;
    }
  }

  if (!password) {
    showFieldError('login-password-error', 'Password is required.');
    passwordInput?.classList.add('invalid');
    valid = false;
  }

  return valid;
}

function validateForgotPassword() {
  const form = document.getElementById('forgot-password-form');
  if (!form) {
    return false;
  }

  clearFieldErrors(form);
  let valid = true;
  const emailInput = document.getElementById('forgot-email');
  const identifier = emailInput?.value.trim();

  if (!identifier) {
    showFieldError('forgot-email-error', 'Email or phone is required.');
    emailInput?.classList.add('invalid');
    valid = false;
  } else {
    const looksLikeEmail = identifier.includes('@');
    const digitsOnly = identifier.replace(/\D/g, '');
    if (!looksLikeEmail && digitsOnly.length < 8) {
      showFieldError('forgot-email-error', 'Enter a valid email or phone number.');
      emailInput?.classList.add('invalid');
      valid = false;
    }
    if (looksLikeEmail && !validateEmail(identifier)) {
      showFieldError('forgot-email-error', 'Enter a valid email address.');
      emailInput?.classList.add('invalid');
      valid = false;
    }
  }

  return valid;
}

function validateResetPasswordFields() {
  const form = document.getElementById('reset-password-form');
  if (!form) return false;
  clearFieldErrors(form);
  let valid = true;

  const identifierInput = document.getElementById('reset-identifier');
  const tokenInput = document.getElementById('reset-token');
  const passwordInput = document.getElementById('reset-password');

  const identifier = identifierInput?.value.trim();
  const token = tokenInput?.value.trim();
  const password = passwordInput?.value || '';

  if (!identifier) {
    showFieldError('reset-identifier-error', 'Email or phone is required.');
    identifierInput?.classList.add('invalid');
    valid = false;
  }

  if (!token) {
    showFieldError('reset-token-error', 'Reset token is required.');
    tokenInput?.classList.add('invalid');
    valid = false;
  }

  if (!password) {
    showFieldError('reset-password-error', 'Enter a new password.');
    passwordInput?.classList.add('invalid');
    valid = false;
  } else if (password.length < 8) {
    showFieldError('reset-password-error', 'Use at least 8 characters.');
    passwordInput?.classList.add('invalid');
    valid = false;
  }

  return valid;
}

function showAuthSection(section) {
  const signupCard = document.getElementById('signup-card');
  const loginCard = document.getElementById('login-card');
  const signupForm = document.getElementById('signup-form');
  const loginForm = document.getElementById('login-form');
  const choiceRow = document.getElementById('auth-choice');

  if (signupForm) {
    clearFieldErrors(signupForm);
  }
  if (loginForm) {
    clearFieldErrors(loginForm);
  }
  const forgotCard = document.getElementById('forgot-password-card');
  const resetCard = document.getElementById('reset-password-card');

  if (signupCard) {
    signupCard.classList.toggle('hidden', section !== 'signup');
  }
  if (loginCard) {
    loginCard.classList.toggle('hidden', section !== 'login');
  }
  if (forgotCard) {
    forgotCard.classList.toggle('hidden', section !== 'forgot');
  }
  if (resetCard) {
    resetCard.classList.toggle('hidden', section !== 'reset');
  }
  if (choiceRow) {
    choiceRow.classList.toggle('hidden', section === 'forgot' || section === 'reset');
  }
  showAuthMessage('', false);
}

function attachHandlers() {
  const showLogin = document.getElementById('show-login');
  const showSignup = document.getElementById('show-signup');
  if (showLogin && !showLogin.dataset.bound) {
    showLogin.dataset.bound = 'true';
    showLogin.addEventListener('click', () => showAuthSection('login'));
  }
  if (showSignup && !showSignup.dataset.bound) {
    showSignup.dataset.bound = 'true';
    showSignup.addEventListener('click', () => showAuthSection('signup'));
  }

  const showForgotPassword = document.getElementById('show-forgot-password');
  if (showForgotPassword && !showForgotPassword.dataset.bound) {
    showForgotPassword.dataset.bound = 'true';
    showForgotPassword.addEventListener('click', () => showAuthSection('forgot'));
  }

  const backToLogin = document.getElementById('back-to-login');
  if (backToLogin && !backToLogin.dataset.bound) {
    backToLogin.dataset.bound = 'true';
    backToLogin.addEventListener('click', () => showAuthSection('login'));
  }

  const signupForm = document.getElementById('signup-form');
  if (signupForm && !signupForm.dataset.bound) {
    signupForm.dataset.bound = 'true';
    signupForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (!validateSignupFields()) {
        showAuthMessage('Please fix the highlighted fields before continuing.', true);
        return;
      }

      const name = document.getElementById('signup-name').value.trim();
      const email = normalizeEmail(document.getElementById('signup-email').value);
      const phone = document.getElementById('signup-phone').value.trim();
      const password = document.getElementById('signup-password').value;
      const branch = document.getElementById('signup-branch').value.trim();
      const cgpa = document.getElementById('signup-cgpa').value.trim();
      const skills = document.getElementById('signup-skills').value.split(',').map(item => item.trim()).filter(Boolean);
      const resume = document.getElementById('signup-resume').value.trim();
      const github = document.getElementById('signup-github').value.trim();
      const linkedin = document.getElementById('signup-linkedin').value.trim();
      const leetcode = document.getElementById('signup-leetcode').value.trim();
      const geeksforgeeks = document.getElementById('signup-geeks').value.trim();
      const submitButton = signupForm.querySelector('button[type="submit"]');

      try {
        if (submitButton) {
          submitButton.disabled = true;
          submitButton.textContent = 'Creating account…';
        }
        const result = await requestApi('/signup', {
          method: 'POST',
          body: JSON.stringify({
            email,
            phone,
            password,
            profile: { name, branch, cgpa, skills, resume, github, linkedin, leetcode, geeksforgeeks }
          })
        });

        if (!result.token) {
          throw new Error('Account creation could not be completed. Please try again.');
        }

        authState = { email: result.email || '', phone: result.phone || '', token: result.token };
        profileCache = result.profile || {};
        saveAuthState();
        showAuthMessage('Account created successfully.', false);
        window.location.href = getAuthReturnPath();
      } catch (error) {
        const message = error.message.includes('already exists')
          ? 'An account with this email or phone number already exists. Please log in instead.'
          : (error.message || 'Signup failed. Please try again.');
        showFieldError('signup-email-error', message);
        document.getElementById('signup-email')?.classList.add('invalid');
        showAuthMessage(message, true);
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Create Account';
        }
      }
    });

    signupForm.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', () => {
        showFieldError(`${input.id}-error`, '');
        input.classList.remove('invalid');
        showAuthMessage('', false);
      });
    });
  }

  const loginForm = document.getElementById('login-form');
  if (loginForm && !loginForm.dataset.bound) {
    loginForm.dataset.bound = 'true';
    loginForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (!validateLoginFields()) {
        showAuthMessage('Please fix the highlighted fields before continuing.', true);
        return;
      }

      const identifier = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const submitButton = loginForm.querySelector('button[type="submit"]');

      try {
        if (submitButton) {
          submitButton.disabled = true;
          submitButton.textContent = 'Logging in…';
        }
        const result = await requestApi('/login', {
          method: 'POST',
          body: JSON.stringify({ identifier, password })
        });

        if (!result.token) {
          throw new Error('Login could not be completed. Please try again.');
        }

        authState = { email: result.email || '', phone: result.phone || '', token: result.token };
        profileCache = result.profile || {};
        saveAuthState();
        showAuthMessage('Login successful.', false);
        window.location.href = getAuthReturnPath();
      } catch (error) {
        const message = error.message || 'Invalid email/phone or password.';
        showFieldError('login-password-error', message);
        document.getElementById('login-password')?.classList.add('invalid');
        showAuthMessage(message, true);
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Login';
        }
      }
    });

    loginForm.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', () => {
        showFieldError(`${input.id}-error`, '');
        input.classList.remove('invalid');
        showAuthMessage('', false);
      });
    });
  }

  const forgotForm = document.getElementById('forgot-password-form');
  if (forgotForm && !forgotForm.dataset.bound) {
    forgotForm.dataset.bound = 'true';
    forgotForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (!validateForgotPassword()) {
        showAuthMessage('Please enter a valid email or phone to continue.', true);
        return;
      }

      const identifier = document.getElementById('forgot-email').value.trim();
      try {
        const result = await requestApi('/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ identifier })
        });
        if (result.resetToken) {
          const resetIdentifier = document.getElementById('reset-identifier');
          const resetToken = document.getElementById('reset-token');
          if (resetIdentifier) resetIdentifier.value = identifier;
          if (resetToken) resetToken.value = result.resetToken;
          showAuthMessage(result.message || 'Reset token created.', false);
          showAuthSection('reset');
        } else {
          showAuthMessage(result.message || 'If the account exists, a reset token has been created for the next step.', false);
          showAuthSection('login');
        }
      } catch (error) {
        const message = error.message || 'Unable to generate a password reset token.';
        showFieldError('forgot-email-error', message);
        document.getElementById('forgot-email')?.classList.add('invalid');
        showAuthMessage(message, true);
      }
    });

    forgotForm.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', () => {
        showFieldError(`${input.id}-error`, '');
        input.classList.remove('invalid');
        showAuthMessage('', false);
      });
    });
  }

  const resetForm = document.getElementById('reset-password-form');
  if (resetForm && !resetForm.dataset.bound) {
    resetForm.dataset.bound = 'true';
    resetForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (!validateResetPasswordFields()) {
        showAuthMessage('Please complete the reset form correctly.', true);
        return;
      }

      const identifier = document.getElementById('reset-identifier').value.trim();
      const token = document.getElementById('reset-token').value.trim();
      const password = document.getElementById('reset-password').value;
      try {
        const result = await requestApi('/reset-password', {
          method: 'POST',
          body: JSON.stringify({ identifier, token, password })
        });
        showAuthMessage(result.message || 'Password updated successfully.', false);
        resetForm.reset();
        showAuthSection('login');
      } catch (error) {
        const message = error.message || 'Unable to reset your password.';
        showFieldError('reset-token-error', message);
        document.getElementById('reset-token')?.classList.add('invalid');
        showAuthMessage(message, true);
      }
    });

    resetForm.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', () => {
        showFieldError(`${input.id}-error`, '');
        input.classList.remove('invalid');
        showAuthMessage('', false);
      });
    });
  }

  const backToLoginFromReset = document.getElementById('back-to-login-from-reset');
  if (backToLoginFromReset && !backToLoginFromReset.dataset.bound) {
    backToLoginFromReset.dataset.bound = 'true';
    backToLoginFromReset.addEventListener('click', () => showAuthSection('login'));
  }

  const profileEditor = document.getElementById('profile-editor');
  if (profileEditor && !profileEditor.dataset.bound) {
    profileEditor.dataset.bound = 'true';
    profileEditor.addEventListener('submit', async event => {
      event.preventDefault();
      const profile = {
        name: document.getElementById('profile-name').value.trim(),
        branch: document.getElementById('profile-branch').value.trim(),
        cgpa: document.getElementById('profile-cgpa').value.trim(),
        skills: document.getElementById('profile-skills').value.split(',').map(item => item.trim()).filter(Boolean),
        dailyGoals: document.getElementById('profile-goals').value.split(',').map(item => item.trim()).filter(Boolean),
        workSummary: document.getElementById('profile-work').value.trim(),
        currentProject: document.getElementById('profile-project').value.trim(),
        currentCertification: document.getElementById('profile-cert').value.trim(),
        placementTarget: document.getElementById('profile-placement').value.trim(),
        resume: document.getElementById('profile-resume').value.trim(),
        github: document.getElementById('profile-github').value.trim(),
        linkedin: document.getElementById('profile-linkedin').value.trim(),
        leetcode: document.getElementById('profile-leetcode').value.trim(),
        geeksforgeeks: document.getElementById('profile-geeks').value.trim()
      };
      if ([profile.resume, profile.github, profile.linkedin, profile.leetcode, profile.geeksforgeeks].some(value => value && !safeExternalUrl(value))) {
        showFormFeedback(profileEditor, 'Portfolio links must be valid HTTP or HTTPS URLs.', true);
        return;
      }
      try {
        await updateProfile(profile);
        render();
        showFormFeedback(document.getElementById('profile-editor'), 'Profile updated successfully.');
      } catch (error) {
        showFormFeedback(document.getElementById('profile-editor'), getSaveFailureMessage(error, 'Profile'), true);
      }
    });
  }

  const logoutButton = document.getElementById('logout-btn');
  if (logoutButton && !logoutButton.dataset.bound) {
    logoutButton.dataset.bound = 'true';
    logoutButton.addEventListener('click', logoutUser);
  }

  const linkedinCertificationForm = document.getElementById('linkedin-certification-form');
  if (linkedinCertificationForm && !linkedinCertificationForm.dataset.bound) {
    linkedinCertificationForm.dataset.bound = 'true';
    linkedinCertificationForm.addEventListener('submit', async event => {
      event.preventDefault();
      const input = document.getElementById('linkedin-certification-url');
      const linkedinUrl = input.value.trim();
      if (linkedinUrl && !safeExternalUrl(linkedinUrl)) {
        showFormFeedback(linkedinCertificationForm, 'Enter a valid HTTP or HTTPS LinkedIn URL.', true);
        return;
      }
      try {
        await updateProfile({ linkedin: linkedinUrl });
        renderCertifications();
        showFormFeedback(linkedinCertificationForm, 'LinkedIn link saved to your profile.');
      } catch (error) {
        showFormFeedback(linkedinCertificationForm, getSaveFailureMessage(error, 'Certification link'), true);
      }
    });
  }

  const onboardingForm = document.getElementById('onboarding-form');
  if (onboardingForm && !onboardingForm.dataset.bound) {
    onboardingForm.dataset.bound = 'true';
    onboardingForm.addEventListener('submit', async event => {
      event.preventDefault();
      const currentProfile = getProfileData();
      const profile = {
        name: document.getElementById('onboarding-name').value.trim() || currentProfile.name,
        branch: document.getElementById('onboarding-branch').value.trim() || currentProfile.branch,
        cgpa: document.getElementById('onboarding-cgpa').value.trim() || currentProfile.cgpa,
        skills: document.getElementById('onboarding-skills').value.split(',').map(item => item.trim()).filter(Boolean),
        dsaSolved: Number(document.getElementById('onboarding-solved').value) || currentProfile.dsaSolved,
        dsaEasy: Number(document.getElementById('onboarding-easy').value) || currentProfile.dsaEasy,
        dsaMedium: Number(document.getElementById('onboarding-medium').value) || currentProfile.dsaMedium,
        dsaHard: Number(document.getElementById('onboarding-hard').value) || currentProfile.dsaHard,
        dsaStreak: Number(document.getElementById('onboarding-streak').value) || currentProfile.dsaStreak,
        dsaTimeSpent: Number(document.getElementById('onboarding-time').value) || currentProfile.dsaTimeSpent,
        dailyGoals: document.getElementById('onboarding-goals').value.split(',').map(item => item.trim()).filter(Boolean),
        workSummary: document.getElementById('onboarding-work').value.trim() || currentProfile.workSummary,
        currentProject: document.getElementById('onboarding-project').value.trim() || currentProfile.currentProject,
        currentCertification: document.getElementById('onboarding-cert').value.trim() || currentProfile.currentCertification,
        placementTarget: document.getElementById('onboarding-placement').value.trim() || currentProfile.placementTarget
      };
      try {
        await updateProfile(profile);
        window.location.href = 'dashboard.html';
      } catch (error) {
        showFormFeedback(onboardingForm, getSaveFailureMessage(error, 'Your setup'), true);
      }
    });
  }

  const certificationForm = document.getElementById('certification-form');
  if (certificationForm && !certificationForm.dataset.bound) {
    certificationForm.dataset.bound = 'true';
    certificationForm.addEventListener('submit', async event => {
      event.preventDefault();
      const title = document.getElementById('cert-title').value;
      const organization = document.getElementById('cert-org').value;
      const date = document.getElementById('cert-date').value;
      const status = document.getElementById('cert-status').value;
      const credentialId = document.getElementById('cert-id').value;
      const skills = document.getElementById('cert-skills').value;
      const credentialUrl = document.getElementById('cert-link').value.trim();
      const file = document.getElementById('cert-file').files[0]?.name || '';
      if (credentialUrl && !safeExternalUrl(credentialUrl)) {
        showFormFeedback(certificationForm, 'Enter a valid HTTP or HTTPS verification link.', true);
        return;
      }
      state.certifications.unshift({ title, organization, date, status, credentialId, skills, credentialUrl, file });
      const saved = await saveState(certificationForm);
      render();
      if (saved) event.target.reset();
    });
  }

  const certificationSearch = document.getElementById('certification-search');
  if (certificationSearch && !certificationSearch.dataset.bound) {
    certificationSearch.dataset.bound = 'true';
    certificationSearch.addEventListener('input', renderCertifications);
  }

  const certificationFilter = document.getElementById('certification-filter');
  if (certificationFilter && !certificationFilter.dataset.bound) {
    certificationFilter.dataset.bound = 'true';
    certificationFilter.addEventListener('change', renderCertifications);
  }

  const certificationList = document.getElementById('certification-list');
  if (certificationList && !certificationList.dataset.bound) {
    certificationList.dataset.bound = 'true';
    certificationList.addEventListener('click', async event => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest('button[data-cert-remove]');
      if (!button || !window.confirm('Remove this certification from your profile?')) return;
      const index = Number(button.dataset.certRemove);
      state.certifications.splice(index, 1);
      const saved = await saveState(document.getElementById('certification-form'));
      render();
      if (saved) showFormFeedback(document.getElementById('certification-form'), 'Certification removed.');
    });
  }

  const projectForm = document.getElementById('project-form');
  if (projectForm && !projectForm.dataset.bound) {
    projectForm.dataset.bound = 'true';
    projectForm.addEventListener('submit', async event => {
      event.preventDefault();
      const name = document.getElementById('project-name').value;
      const github = document.getElementById('project-github').value;
      const demo = document.getElementById('project-demo').value;
      const tech = document.getElementById('project-tech').value;
      const status = document.getElementById('project-status').value;
      if ((github && !safeExternalUrl(github)) || (demo && !safeExternalUrl(demo))) {
        showFormFeedback(projectForm, 'Project links must use a valid HTTP or HTTPS URL.', true);
        return;
      }
      state.projects.unshift({ name: name.trim(), github, demo, tech, status });
      const saved = await saveState(projectForm);
      render();
      if (saved) event.target.reset();
    });
  }

  const projectSearch = document.getElementById('project-search');
  if (projectSearch && !projectSearch.dataset.bound) {
    projectSearch.dataset.bound = 'true';
    projectSearch.addEventListener('input', renderProjects);
  }

  const projectFilter = document.getElementById('project-filter');
  if (projectFilter && !projectFilter.dataset.bound) {
    projectFilter.dataset.bound = 'true';
    projectFilter.addEventListener('change', renderProjects);
  }

  const projectList = document.getElementById('project-list');
  if (projectList && !projectList.dataset.bound) {
    projectList.dataset.bound = 'true';
    projectList.addEventListener('change', async event => {
      if (!(event.target instanceof HTMLSelectElement) || event.target.dataset.projectStatus === undefined) return;
      state.projects[Number(event.target.dataset.projectStatus)] = {
        ...state.projects[Number(event.target.dataset.projectStatus)],
        status: event.target.value
      };
      const saved = await saveState(projectForm);
      render();
      if (saved) showFormFeedback(projectForm, 'Project status updated.');
    });
    projectList.addEventListener('click', async event => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest('button[data-project-remove]');
      if (!button || !window.confirm('Remove this project from your portfolio?')) return;
      state.projects.splice(Number(button.dataset.projectRemove), 1);
      const saved = await saveState(projectForm);
      render();
      if (saved) showFormFeedback(projectForm, 'Project removed from your portfolio.');
    });
  }

  const placementForm = document.getElementById('placement-form');
  if (placementForm && !placementForm.dataset.bound) {
    placementForm.dataset.bound = 'true';
    placementForm.addEventListener('submit', async event => {
      event.preventDefault();
      const name = document.getElementById('company-name').value.trim();
      const date = document.getElementById('company-date').value;
      const stage = document.getElementById('company-stage').value;
      const applicationUrl = document.getElementById('company-link').value.trim();
      if (applicationUrl && !safeExternalUrl(applicationUrl)) {
        showFormFeedback(placementForm, 'Enter a valid HTTP or HTTPS application link.', true);
        return;
      }
      state.placements.push({ name, date, stage, applicationUrl });
      const saved = await saveState(placementForm);
      render();
      if (saved) event.target.reset();
    });
  }

  const placementSearch = document.getElementById('placement-search');
  if (placementSearch && !placementSearch.dataset.bound) {
    placementSearch.dataset.bound = 'true';
    placementSearch.addEventListener('input', renderPlacements);
  }

  const placementFilter = document.getElementById('placement-filter');
  if (placementFilter && !placementFilter.dataset.bound) {
    placementFilter.dataset.bound = 'true';
    placementFilter.addEventListener('change', renderPlacements);
  }

  const placementList = document.getElementById('placement-list');
  if (placementList && !placementList.dataset.bound) {
    placementList.dataset.bound = 'true';
    placementList.addEventListener('change', async event => {
      if (!(event.target instanceof HTMLSelectElement) || event.target.dataset.placementStage === undefined) return;
      const index = Number(event.target.dataset.placementStage);
      state.placements[index] = { ...state.placements[index], stage: event.target.value };
      const saved = await saveState(document.getElementById('placement-form'));
      render();
      if (saved) showFormFeedback(document.getElementById('placement-form'), 'Placement stage updated.');
    });
    placementList.addEventListener('click', async event => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest('button[data-placement-remove]');
      if (!button || !window.confirm('Remove this company from your placement pipeline?')) return;
      state.placements.splice(Number(button.dataset.placementRemove), 1);
      const saved = await saveState(document.getElementById('placement-form'));
      render();
      if (saved) showFormFeedback(document.getElementById('placement-form'), 'Company removed from your pipeline.');
    });
  }

  const dsaSessionForm = document.getElementById('dsa-session-form');
  if (dsaSessionForm && !dsaSessionForm.dataset.bound) {
    dsaSessionForm.dataset.bound = 'true';
    dsaSessionForm.addEventListener('submit', async event => {
      event.preventDefault();
      const profile = getProfileData();
      const topicName = document.getElementById('dsa-topic').value.trim();
      const difficulty = document.getElementById('dsa-difficulty').value;
      const solved = Number(document.getElementById('dsa-solved-count').value);
      const minutes = Number(document.getElementById('dsa-minutes').value);
      if (!topicName || !Number.isInteger(solved) || solved < 1 || solved > 100 || !Number.isInteger(minutes) || minutes < 1 || minutes > 480) {
        showFormFeedback(dsaSessionForm, 'Enter a topic, 1–100 problems, and 1–480 minutes.', true);
        return;
      }

      const sessions = Array.isArray(profile.dsaSessions) ? profile.dsaSessions : [];
      const topics = Array.isArray(profile.dsaTopics) ? [...profile.dsaTopics] : [];
      const matchingTopic = topics.findIndex(item => String(item.name).toLowerCase() === topicName.toLowerCase());
      const previousTopic = matchingTopic >= 0 ? topics[matchingTopic] : { name: topicName, solved: 0 };
      const topicSolved = (Number(previousTopic.solved) || Math.round((Number(previousTopic.progress) || 0) / 5)) + solved;
      const updatedTopic = { name: previousTopic.name || topicName, solved: topicSolved, progress: Math.min(100, Math.round(topicSolved / 20 * 100)) };
      if (matchingTopic >= 0) topics[matchingTopic] = updatedTopic;
      else topics.push(updatedTopic);

      const today = new Date().toISOString().slice(0, 10);
      const lastPractice = profile.dsaLastPracticedAt;
      const daysSinceLastPractice = lastPractice
        ? (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastPractice}T00:00:00Z`)) / 86400000
        : Infinity;
      const streak = daysSinceLastPractice === 0
        ? Math.max(1, Number(profile.dsaStreak) || 0)
        : daysSinceLastPractice === 1 ? (Number(profile.dsaStreak) || 0) + 1 : 1;
      const statKey = `dsa${difficulty[0].toUpperCase()}${difficulty.slice(1)}`;
      const session = { topic: topicName, difficulty, solved, minutes, completedAt: new Date().toISOString() };
      const updatedProfile = {
        dsaSolved: (Number(profile.dsaSolved) || 0) + solved,
        [statKey]: (Number(profile[statKey]) || 0) + solved,
        dsaTimeSpent: Math.round(((Number(profile.dsaTimeSpent) || 0) + minutes / 60) * 10) / 10,
        dsaStreak: streak,
        dsaLastPracticedAt: today,
        dsaTopics: topics,
        dsaSessions: [session, ...sessions].slice(0, 100)
      };

      try {
        await updateProfile(updatedProfile);
        render();
        dsaSessionForm.reset();
        showFormFeedback(dsaSessionForm, 'Practice session saved.');
      } catch (error) {
        showFormFeedback(dsaSessionForm, getSaveFailureMessage(error, 'Practice session'), true);
      }
    });
  }

  const resourceForm = document.getElementById('resource-form');
  if (resourceForm && !resourceForm.dataset.bound) {
    resourceForm.dataset.bound = 'true';
    resourceForm.addEventListener('submit', async event => {
      event.preventDefault();
      const currentProfile = getProfileData();
      const resource = {
        title: document.getElementById('resource-title').value.trim(),
        topic: document.getElementById('resource-topic').value.trim(),
        link: document.getElementById('resource-link').value.trim(),
        description: document.getElementById('resource-desc').value.trim()
      };
      if (!resource.title || !resource.link) {
        showAuthMessage('Please add a resource title and link.', true);
        return;
      }
      if (!safeExternalUrl(resource.link)) {
        showFormFeedback(resourceForm, 'Resource links must use a valid HTTP or HTTPS URL.', true);
        return;
      }
      const updatedResources = [...(currentProfile.studyResources || []), resource];
      try {
        await updateProfile({ studyResources: updatedResources });
        render();
        event.target.reset();
        showFormFeedback(resourceForm, 'Study resource added successfully.');
      } catch (error) {
        showFormFeedback(resourceForm, getSaveFailureMessage(error, 'Resource'), true);
      }
    });
  }

  const resourceSearch = document.getElementById('resource-search');
  if (resourceSearch && !resourceSearch.dataset.bound) {
    resourceSearch.dataset.bound = 'true';
    resourceSearch.addEventListener('input', renderResources);
  }

  const resourceFilter = document.getElementById('resource-filter');
  if (resourceFilter && !resourceFilter.dataset.bound) {
    resourceFilter.dataset.bound = 'true';
    resourceFilter.addEventListener('change', renderResources);
  }

  const resourceList = document.getElementById('resource-list');
  if (resourceList && !resourceList.dataset.bound) {
    resourceList.dataset.bound = 'true';
    resourceList.addEventListener('click', async event => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest('button[data-resource-remove]');
      if (!button || !window.confirm('Remove this resource from your library?')) return;
      const resources = Array.isArray(getProfileData().studyResources) ? [...getProfileData().studyResources] : [];
      resources.splice(Number(button.dataset.resourceRemove), 1);
      try {
        await updateProfile({ studyResources: resources });
        render();
        showFormFeedback(document.getElementById('resource-form'), 'Resource removed from your library.');
      } catch (error) {
        showFormFeedback(document.getElementById('resource-form'), getSaveFailureMessage(error, 'Resource'), true);
      }
    });
  }

  const taskForm = document.getElementById('task-form');
  if (taskForm && !taskForm.dataset.bound) {
    taskForm.dataset.bound = 'true';
    const taskSubmitButton = taskForm.querySelector('button[type="submit"]');
    const cancelTaskEdit = document.getElementById('cancel-task-edit');
    const taskFormHeading = document.getElementById('task-form-heading');
    const resetTaskEditor = () => {
      editingTaskIndex = null;
      taskForm.reset();
      if (taskSubmitButton) taskSubmitButton.textContent = 'Add task';
      if (cancelTaskEdit) cancelTaskEdit.hidden = true;
      if (taskFormHeading) taskFormHeading.textContent = 'Add a new task';
    };
    cancelTaskEdit?.addEventListener('click', resetTaskEditor);
    taskForm.addEventListener('submit', async event => {
      event.preventDefault();
      const currentProfile = getProfileData();
      const task = {
        title: document.getElementById('task-title').value.trim(),
        due: document.getElementById('task-due').value.trim(),
        note: document.getElementById('task-note').value.trim()
      };
      if (!task.title) {
        showAuthMessage('Please provide a title for the task.', true);
        return;
      }
      const currentTasks = Array.isArray(currentProfile.tasks) ? currentProfile.tasks : [];
      const isEditing = editingTaskIndex !== null && Boolean(currentTasks[editingTaskIndex]);
      const updatedTasks = isEditing
        ? currentTasks.map((currentTask, index) => index === editingTaskIndex
          ? { ...currentTask, ...task }
          : currentTask)
        : [...currentTasks, { ...task, done: false }];
      if (taskSubmitButton) {
        taskSubmitButton.disabled = true;
        taskSubmitButton.textContent = 'Saving…';
      }
      try {
        await updateProfile({ tasks: updatedTasks });
        render();
        resetTaskEditor();
        showFormFeedback(taskForm, isEditing ? 'Task updated.' : 'Task added to your planner.');
      } catch (error) {
        if (error.status === 401) {
          clearAuthState();
          beginSignupForSave({ kind: 'task', item: isEditing ? updatedTasks[editingTaskIndex] : { ...task, done: false } });
        } else {
          showFormFeedback(taskForm, getSaveFailureMessage(error, 'Task'), true);
        }
      } finally {
        if (taskSubmitButton) {
          taskSubmitButton.disabled = false;
          taskSubmitButton.textContent = editingTaskIndex === null ? 'Add task' : 'Save changes';
        }
      }
    });
  }

  const taskList = document.getElementById('task-list');
  if (taskList && !taskList.dataset.bound) {
    taskList.dataset.bound = 'true';
    taskList.addEventListener('click', async event => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest('button[data-task-edit], button[data-task-toggle], button[data-task-remove]');
      if (!button) {
        return;
      }
      if (button.dataset.taskEdit !== undefined) {
        const index = Number(button.dataset.taskEdit);
        const task = getProfileData().tasks[index];
        if (!task) return;
        editingTaskIndex = index;
        document.getElementById('task-title').value = task.title || '';
        const dueInput = document.getElementById('task-due');
        if (/^\d{4}-\d{2}-\d{2}$/.test(task.due || '')) {
          dueInput.value = task.due;
        } else if (task.due === 'Today' || task.due === 'Tomorrow') {
          const due = new Date();
          if (task.due === 'Tomorrow') due.setDate(due.getDate() + 1);
          dueInput.value = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
        } else {
          dueInput.value = '';
        }
        document.getElementById('task-note').value = task.note || '';
        const submitButton = document.querySelector('#task-form button[type="submit"]');
        if (submitButton) submitButton.textContent = 'Save changes';
        const taskFormHeading = document.getElementById('task-form-heading');
        if (taskFormHeading) taskFormHeading.textContent = 'Edit task';
        const cancelButton = document.getElementById('cancel-task-edit');
        if (cancelButton) cancelButton.hidden = false;
        document.getElementById('task-title').focus();
        document.getElementById('task-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      const index = Number(button.dataset.taskToggle ?? button.dataset.taskRemove);
      const currentProfile = getProfileData();
      if (button.dataset.taskRemove !== undefined && !window.confirm('Remove this task? This cannot be undone.')) return;
      const updatedTasks = button.dataset.taskRemove !== undefined
        ? (currentProfile.tasks || []).filter((_, idx) => idx !== index)
        : (currentProfile.tasks || []).map((task, idx) => idx === index
          ? { ...task, done: !task.done, completedAt: !task.done ? new Date().toISOString() : null }
          : task);
      try {
        await updateProfile({ tasks: updatedTasks });
        if (button.dataset.taskRemove !== undefined && editingTaskIndex === index) {
          editingTaskIndex = null;
          document.getElementById('task-form')?.reset();
          const submitButton = document.querySelector('#task-form button[type="submit"]');
          if (submitButton) submitButton.textContent = 'Add task';
          const cancelButton = document.getElementById('cancel-task-edit');
          if (cancelButton) cancelButton.hidden = true;
          const taskFormHeading = document.getElementById('task-form-heading');
          if (taskFormHeading) taskFormHeading.textContent = 'Add a new task';
        } else if (button.dataset.taskRemove !== undefined && editingTaskIndex !== null && index < editingTaskIndex) {
          editingTaskIndex -= 1;
        }
        render();
      } catch (error) {
        showFormFeedback(taskList, getSaveFailureMessage(error, 'Task'), true);
      }
    });
  }

  const taskFilter = document.getElementById('task-filter');
  if (taskFilter && !taskFilter.dataset.bound) {
    taskFilter.dataset.bound = 'true';
    taskFilter.addEventListener('change', renderTasks);
  }

  const generateReport = document.getElementById('generate-report');
  if (generateReport && !generateReport.dataset.bound) {
    generateReport.dataset.bound = 'true';
    generateReport.addEventListener('click', () => {
      renderReport();
    });
  }

  const downloadReport = document.getElementById('download-report');
  if (downloadReport && !downloadReport.dataset.bound) {
    downloadReport.dataset.bound = 'true';
    downloadReport.addEventListener('click', () => {
      downloadReportPdf();
    });
  }

  const focusSessionForm = document.getElementById('focus-session-form');
  if (focusSessionForm && !focusSessionForm.dataset.bound) {
    focusSessionForm.dataset.bound = 'true';
    focusSessionForm.addEventListener('submit', async event => {
      event.preventDefault();
      const button = focusSessionForm.querySelector('button[type="submit"]');
      try {
        if (button) {
          button.disabled = true;
          button.textContent = 'Saving…';
        }
        await requestApi('/focus-sessions', {
          method: 'POST',
          body: JSON.stringify({
            topic: document.getElementById('focus-topic').value.trim() || 'General preparation',
            minutes: Number(document.getElementById('focus-minutes').value)
          })
        });
        await loadUserProfile();
        await loadInsights();
        render();
        focusSessionForm.reset();
        showFormFeedback(focusSessionForm, 'Focus session saved.');
      } catch (error) {
        if (error.status === 401) {
          clearAuthState();
          const session = {
            topic: document.getElementById('focus-topic').value.trim() || 'General preparation',
            minutes: Number(document.getElementById('focus-minutes').value),
            completedAt: new Date().toISOString()
          };
          beginSignupForSave({ kind: 'focus-session', item: session });
        } else {
          showFormFeedback(focusSessionForm, getSaveFailureMessage(error, 'Focus session'), true);
        }
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = 'Complete focus session';
        }
      }
    });
  }

  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle && !themeToggle.dataset.bound) {
    themeToggle.dataset.bound = 'true';
    themeToggle.addEventListener('click', toggleTheme);
  }
}

function initDemoRequestForm() {
  const form = document.getElementById('demo-request-form');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = 'true';

  const button = form.querySelector('button[type="submit"]');
  const status = document.getElementById('demo-request-status');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    status.textContent = '';
    status.classList.remove('is-error');
    button.disabled = true;
    button.innerHTML = 'Sending request…';
    try {
      const result = await requestApi('/demo-requests', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries()))
      });
      status.textContent = result.message || 'Your request has been saved.';
      form.reset();
    } catch (error) {
      let message = error.message || 'Unable to send your request. Please try again.';
      try {
        message = JSON.parse(message).error || message;
      } catch {
        // Keep the original message when the backend does not return JSON.
      }
      status.textContent = message;
      status.classList.add('is-error');
    } finally {
      button.disabled = false;
      button.innerHTML = 'Send request <span aria-hidden="true">&#8594;</span>';
    }
  });
}

function initAboutChecklist() {
  const form = document.getElementById('about-checklist-form');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = 'true';

  const scoreNode = document.getElementById('about-checklist-score');
  const summaryNode = document.getElementById('about-checklist-summary');

  const getReadinessText = (score) => {
    if (score >= 80) return 'You have a strong base. Stay consistent with interviews, project polish, and applications.';
    if (score >= 60) return 'You are building momentum. Focus on one weak area and keep the routine sustainable.';
    if (score >= 40) return 'Your foundation is forming. Prioritize one project, one DSA habit, and one profile upgrade.';
    return 'You are in the right place to build structure. Start with a weekly plan and a clear goal.';
  };

  form.addEventListener('submit', event => {
    event.preventDefault();
    const formData = new FormData(form);
    const values = {
      dsa: Number(formData.get('dsa') || 0),
      projects: Number(formData.get('projects') || 0),
      resume: Number(formData.get('resume') || 0),
      interviews: Number(formData.get('interviews') || 0)
    };

    const score = Math.min(100, Math.round((values.dsa + values.projects + values.resume + values.interviews) / 1.2));
    if (scoreNode) scoreNode.textContent = `${score}`;
    if (summaryNode) summaryNode.textContent = getReadinessText(score);
  });
}

function initBackToTop() {
  const button = document.getElementById('back-to-top');
  if (!button || button.dataset.bound) return;
  button.dataset.bound = 'true';

  const updateVisibility = () => {
    button.classList.toggle('is-visible', window.scrollY > 260);
  };

  updateVisibility();
  window.addEventListener('scroll', updateVisibility, { passive: true });
  button.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

async function initApp() {
  const theme = loadTheme();
  applyTheme(theme);
  initCurrentPageNavigation();
  initLiveSiteBackground();
  initDemoRequestForm();
  initAboutChecklist();
  initBackToTop();
  const canRenderPage = initGuestAccess();

  if (isAuthenticated()) {
    await loadUserProfile();
    await savePendingWorkspaceItem();
    await loadInsights();
    await loadReadinessAnalysis();
  }

  if (!canRenderPage) return;

  render();
  initLiveWallpaper();
  initLiveStatus();

  if (window.location.pathname.split('/').pop() === 'auth.html') {
    const mode = new URLSearchParams(window.location.search).get('mode');
    showAuthSection(mode === 'signup' ? 'signup' : 'login');
  }
}

initApp();
setInterval(renderWelcome, 60000);
