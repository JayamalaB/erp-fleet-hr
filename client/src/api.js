const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

let accessToken = null;

function setToken(token) {
  accessToken = token;
}

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const bearer = token !== undefined ? token : accessToken;
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    // no JSON body (e.g. 204) - fine
  }

  if (!res.ok) {
    const message = data?.error?.message || `Request failed with status ${res.status}`;
    throw new Error(message);
  }
  return data;
}

export const api = {
  setToken,
  get: (path) => request(path),
  post: (path, body, opts) => request(path, { method: 'POST', body, ...opts }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
};
