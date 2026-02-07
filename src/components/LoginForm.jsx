import { useState } from 'react';

export default function LoginForm({ onLogin, onRegister }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegistering) {
        await onRegister(username, password);
      } else {
        await onLogin(username, password);
      }
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <span className="login-icon">🔐</span>
          <h2>{isRegistering ? 'Create Admin Account' : 'Admin Login'}</h2>
          <p className="login-subtitle">
            {isRegistering 
              ? 'Set up your first admin account' 
              : 'Sign in to manage menu data'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              required
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
              autoComplete={isRegistering ? 'new-password' : 'current-password'}
            />
          </div>

          {error && <div className="error-message">❌ {error}</div>}

          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? '⏳ Please wait...' : (isRegistering ? '🚀 Create Account' : '🔓 Sign In')}
          </button>

          <button 
            type="button" 
            className="btn-link"
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError('');
            }}
          >
            {isRegistering 
              ? '← Back to login' 
              : 'First time? Register as admin →'}
          </button>
        </form>
      </div>
    </div>
  );
}
