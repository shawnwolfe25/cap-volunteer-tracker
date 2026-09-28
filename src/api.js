const TOKEN_KEY = 'cap036_session_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // no body
  }
  if (!res.ok) {
    const message = data?.error || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  requestCode: (email) => request('/auth/request-code', { method: 'POST', body: JSON.stringify({ email }) }),
  verifyToken: (token) => request('/auth/verify', { method: 'POST', body: JSON.stringify({ token }) }),
  verifyCode: (email, code) => request('/auth/verify', { method: 'POST', body: JSON.stringify({ email, code }) }),
  loginCapid: (capid) => request('/auth/login-capid', { method: 'POST', body: JSON.stringify({ capid }) }),
  me: () => request('/me'),
  cadets: () => request('/cadets'),
  cadet: (id) => request(`/cadets/${id}`),
  addEntry: (cadetId, payload) => request(`/cadets/${cadetId}`, { method: 'POST', body: JSON.stringify(payload) }),
  addGroupEntry: (payload) => request('/cadets', { method: 'POST', body: JSON.stringify(payload) }),
  updateEntry: (entryId, payload) => request(`/entries/${entryId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteEntry: (entryId) => request(`/entries/${entryId}`, { method: 'DELETE' }),
  pendingEntries: () => request('/entries/pending'),
  adminUsers: () => request('/admin/users'),
  adminAddUser: (payload) => request('/admin/users', { method: 'POST', body: JSON.stringify(payload) }),
  adminAddCadet: (payload) => request('/admin/cadets', { method: 'POST', body: JSON.stringify(payload) }),
  adminLoginCode: (email) => request(`/admin/users?loginCode=${encodeURIComponent(email)}`),
  adminArchiveCadet: (id, archived) =>
    request('/admin/cadets', { method: 'PATCH', body: JSON.stringify({ id, archived }) }),
  adminMigrateStatus: () => request('/admin/migrate'),
  adminMigrate: () => request('/admin/migrate', { method: 'POST' }),
  report: (cadetId) => request(`/reports/${cadetId}`),
};

// Page link for a roster record. Senior members get /member/, cadets keep /cadet/.
export function memberPath(id, type) {
  return `/${type === 'senior' ? 'member' : 'cadet'}/${id}`;
}
