import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { useStore, CLOUD_ENABLED } from '../store.jsx';

export default function Auth({ mode, go }) {
  const { signIn, signUp, continueOnDevice, startDemo } = useStore();
  const [tab, setTab] = useState(mode === 'signup' ? 'signup' : 'signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [deviceForm, setDeviceForm] = useState(!CLOUD_ENABLED);

  async function submit(e) {
    e.preventDefault(); setErr(''); setInfo('');
    if (deviceForm) {
      if (!name.trim()) { setErr('Enter your first name so the app can greet you.'); return; }
      continueOnDevice(name); go('home'); return;
    }
    if (!email.includes('@')) { setErr('Enter the email address for your account.'); return; }
    if (password.length < 8) { setErr('Use a password with at least 8 characters.'); return; }
    if (tab === 'signup' && !name.trim()) { setErr('Enter your first name.'); return; }
    setBusy(true);
    try {
      if (tab === 'signup') {
        const r = await signUp(name.trim(), email.trim(), password);
        if (r.needsConfirmation) { setInfo('Check your email for a link to confirm your account, then sign in here.'); setTab('signin'); return; }
      } else await signIn(email.trim(), password);
      go('home');
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="wrap auth">
      <button type="button" className="btn ghost small" onClick={() => go('welcome')}><Icon name="arrowLeft" size={18} /> Back</button>
      <div className="card" style={{ marginTop: 10 }}>
        {deviceForm ? (
          <>
            <h1 style={{ fontSize: '2rem' }}>Set up on this device</h1>
            <p className="muted">Your check-ins stay in this browser on this device. There’s no password, so anyone using this device can see them.</p>
          </>
        ) : (
          <>
            <div className="seg" role="group" aria-label="Account">
              <button type="button" aria-pressed={tab === 'signin'} onClick={() => { setTab('signin'); setErr(''); }}>Sign in</button>
              <button type="button" aria-pressed={tab === 'signup'} onClick={() => { setTab('signup'); setErr(''); }}>Create account</button>
            </div>
            <h1 style={{ fontSize: '2rem' }}>{tab === 'signin' ? 'Welcome back' : 'Create your account'}</h1>
            <p className="muted">{tab === 'signin' ? 'Sign in to see your check-ins on any device.' : 'Your check-ins and scan reports are saved to your account and visible only to you.'}</p>
          </>
        )}
        <form onSubmit={submit} noValidate>
          {(deviceForm || tab === 'signup') && (
            <label className="field">First name<input id="auth-name" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Maria" /></label>
          )}
          {!deviceForm && <>
            <label className="field">Email<input id="auth-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label className="field">Password<input id="auth-password" type="password" autoComplete={tab === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} /><span className="hint">{tab === 'signup' ? 'At least 8 characters.' : ''}</span></label>
          </>}
          {err && <p className="error" role="alert">{err}</p>}
          {info && <p className="notice" role="status">{info}</p>}
          <button type="submit" className="btn primary block" disabled={busy}>
            {busy ? 'One moment…' : deviceForm ? 'Continue' : tab === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <div className="divider">or</div>
        <div className="stack">
          <button type="button" className="btn block" onClick={() => { startDemo(); go('home'); }}><Icon name="play" size={16} /> Try a demo patient instead</button>
          {CLOUD_ENABLED && <button type="button" className="linkish" onClick={() => { setDeviceForm(!deviceForm); setErr(''); }}>{deviceForm ? 'Use an account instead' : 'Use the app without an account, on this device only'}</button>}
        </div>
        {!CLOUD_ENABLED && <p className="fine" style={{ marginTop: 14 }}>Accounts with email and password turn on when the app is connected to Supabase (see README).</p>}
      </div>
    </div>
  );
}
