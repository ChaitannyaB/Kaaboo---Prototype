import { useState } from 'react';
import { api } from '../api';

export default function Auth({ onLogin }) {
  const [tab, setTab] = useState('login'); // 'login' | 'signup'

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [signupForm, setSignupForm] = useState({ username: '', email: '', password: '', confirm: '' });

  const [loginError, setLoginError] = useState('');
  const [signupError, setSignupError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError('');
    setLoading(true);
    try {
      const { token, user } = await api.login({ email: loginForm.email, password: loginForm.password });
      localStorage.setItem('kaaboo_token', token);
      localStorage.setItem('kaaboo_user', JSON.stringify(user));
      onLogin(user, token);
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    setSignupError('');
    if (signupForm.password !== signupForm.confirm) {
      return setSignupError('Passwords do not match');
    }
    setLoading(true);
    try {
      const { token, user } = await api.register({
        username: signupForm.username,
        email: signupForm.email,
        password: signupForm.password,
      });
      localStorage.setItem('kaaboo_token', token);
      localStorage.setItem('kaaboo_user', JSON.stringify(user));
      onLogin(user, token);
    } catch (err) {
      setSignupError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="title" style={{ marginBottom: '4px' }}>KAABOO</h1>
        <p className="subtitle" style={{ marginBottom: '24px' }}>Real-time multiplayer card game</p>

        <div className="auth-tabs">
          <button
            className={`auth-tab${tab === 'login' ? ' auth-tab-active' : ''}`}
            onClick={() => { setTab('login'); setLoginError(''); }}
          >
            Login
          </button>
          <button
            className={`auth-tab${tab === 'signup' ? ' auth-tab-active' : ''}`}
            onClick={() => { setTab('signup'); setSignupError(''); }}
          >
            Sign Up
          </button>
        </div>

        {tab === 'login' && (
          <form className="auth-form" onSubmit={handleLogin}>
            <div className="auth-field">
              <label className="auth-label">Email</label>
              <input
                className="input"
                type="email"
                placeholder="you@example.com"
                value={loginForm.email}
                onChange={(e) => setLoginForm((f) => ({ ...f, email: e.target.value }))}
                required
                autoFocus
              />
            </div>
            <div className="auth-field">
              <label className="auth-label">Password</label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={loginForm.password}
                onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
                required
              />
            </div>
            {loginError && <p className="auth-error">{loginError}</p>}
            <button className="btn-primary" type="submit" disabled={loading} style={{ width: '100%', marginTop: '8px' }}>
              {loading ? 'Logging in…' : 'Log In'}
            </button>
          </form>
        )}

        {tab === 'signup' && (
          <form className="auth-form" onSubmit={handleSignup}>
            <div className="auth-field">
              <label className="auth-label">Username</label>
              <input
                className="input"
                type="text"
                placeholder="2–20 characters"
                value={signupForm.username}
                minLength={2}
                maxLength={20}
                onChange={(e) => setSignupForm((f) => ({ ...f, username: e.target.value }))}
                required
                autoFocus
              />
            </div>
            <div className="auth-field">
              <label className="auth-label">Email</label>
              <input
                className="input"
                type="email"
                placeholder="you@example.com"
                value={signupForm.email}
                onChange={(e) => setSignupForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            <div className="auth-field">
              <label className="auth-label">Password</label>
              <input
                className="input"
                type="password"
                placeholder="At least 6 characters"
                value={signupForm.password}
                minLength={6}
                onChange={(e) => setSignupForm((f) => ({ ...f, password: e.target.value }))}
                required
              />
            </div>
            <div className="auth-field">
              <label className="auth-label">Confirm Password</label>
              <input
                className="input"
                type="password"
                placeholder="Repeat password"
                value={signupForm.confirm}
                onChange={(e) => setSignupForm((f) => ({ ...f, confirm: e.target.value }))}
                required
              />
            </div>
            {signupError && <p className="auth-error">{signupError}</p>}
            <button className="btn-primary" type="submit" disabled={loading} style={{ width: '100%', marginTop: '8px' }}>
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
