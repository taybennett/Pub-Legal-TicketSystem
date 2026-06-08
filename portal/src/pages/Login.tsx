import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../api/client';

export function Login() {
  const { me, signIn, loading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && me) navigate('/locations', { replace: true });
  }, [loading, me, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email || !pin) return;
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email.trim(), pin.trim());
      navigate('/locations', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.status === 401 ? 'Email or PIN incorrect.' : err.message);
      } else {
        setError('Something went wrong. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-mark">PUB</div>
          <div className="login-sub">LEGAL · PORTAL</div>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <label className="form-label" htmlFor="email">Email</label>
          <input
            id="email"
            className="form-input"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={e => setEmail(e.target.value)}
            disabled={submitting}
          />
          <label className="form-label" htmlFor="pin">PIN</label>
          <input
            id="pin"
            className="form-input"
            type="password"
            autoComplete="current-password"
            value={pin}
            onChange={e => setPin(e.target.value)}
            disabled={submitting}
          />
          {error && <div className="form-error">{error}</div>}
          <button className="btn-primary" type="submit" disabled={submitting || !email || !pin}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="login-help">
          Forgot your PIN? Contact your PUB Legal rep.
        </div>
      </div>
    </div>
  );
}
