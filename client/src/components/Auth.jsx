import { useState } from 'react';
import { api } from '../api';

/**
 * Two-step login matching the backend's design (docs 2.3): credentials
 * first return a list of companies the user belongs to plus a short-lived
 * pre-auth token, then a second call exchanges (pre-auth token + chosen
 * companyId) for a real, company-scoped access token. This is the only
 * place a companyId ever gets minted into a JWT, and the UI mirrors that
 * on purpose rather than hiding it behind one combined call.
 */
export default function Auth({ onAuthenticated }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '', companyName: '' });
  const [companies, setCompanies] = useState(null);
  const [preAuthToken, setPreAuthToken] = useState(null);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api.post('/api/auth/login', loginForm, { token: null });
      setPreAuthToken(res.preAuthToken);
      setCompanies(res.companies);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/api/auth/register', registerForm, { token: null });
      setLoginForm({ email: registerForm.email, password: registerForm.password });
      setMode('login');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function selectCompany(companyId, companyName) {
    setError('');
    setBusy(true);
    try {
      const res = await api.post('/api/auth/select-company', { companyId }, { token: preAuthToken });
      onAuthenticated({ accessToken: res.accessToken, companyId, companyName });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (companies) {
    return (
      <div className="auth-box card">
        <h2>Choose a company</h2>
        {error && <div className="error-banner">{error}</div>}
        {companies.map((c) => (
          <div key={c.companyId} style={{ marginBottom: 8 }}>
            <button className="secondary" disabled={busy} onClick={() => selectCompany(c.companyId, c.companyName)}>
              {c.companyName} <span className="pill">{c.roles.join(', ')}</span>
            </button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="auth-box card">
      <h2>{mode === 'login' ? 'Sign in' : 'Create your company'}</h2>
      {error && <div className="error-banner">{error}</div>}

      {mode === 'login' ? (
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label>
            Email
            <input type="email" required value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} />
          </label>
          <label>
            Password
            <input type="password" required value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} />
          </label>
          <button type="submit" disabled={busy}>Sign in</button>
        </form>
      ) : (
        <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label>
            Your name
            <input required value={registerForm.name} onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })} />
          </label>
          <label>
            Company name
            <input required value={registerForm.companyName} onChange={(e) => setRegisterForm({ ...registerForm, companyName: e.target.value })} />
          </label>
          <label>
            Email
            <input type="email" required value={registerForm.email} onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })} />
          </label>
          <label>
            Password (min 8 chars)
            <input type="password" required minLength={8} value={registerForm.password} onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })} />
          </label>
          <button type="submit" disabled={busy}>Create company &amp; account</button>
        </form>
      )}

      <p className="hint">
        {mode === 'login' ? (
          <>New here? <a href="#" onClick={(e) => { e.preventDefault(); setMode('register'); setError(''); }}>Create a company</a></>
        ) : (
          <>Already registered? <a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); setError(''); }}>Sign in</a></>
        )}
      </p>
    </div>
  );
}
