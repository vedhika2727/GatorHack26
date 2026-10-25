import { useCallback, useEffect, useState } from 'react';
import Icon from './components/Icon.jsx';
import Logo from './components/Logo.jsx';
import { useStore, HOSTED_PREVIEW } from './store.jsx';
import Landing from './screens/Landing.jsx';
import Auth from './screens/Auth.jsx';
import Home from './screens/Home.jsx';
import CheckIn from './screens/CheckIn.jsx';
import Twin from './screens/Twin.jsx';
import ScansScreen from './screens/ScansScreen.jsx';
import Report from './screens/Report.jsx';
import Account from './screens/Account.jsx';

const PUBLIC = ['welcome', 'signin', 'signup'];
const PRIVATE = ['home', 'checkin', 'twin', 'scans', 'report', 'account'];
const NAV = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'checkin', label: 'Check in', icon: 'plus', cta: true },
  { id: 'twin', label: 'My twin', icon: 'timeline' },
  { id: 'scans', label: 'Scans', icon: 'scan' },
  { id: 'report', label: 'Report', icon: 'report' },
];
const readHash = () => (location.hash || '').replace(/^#\/?/, '') || '';

export default function App() {
  const { status, user } = useStore();
  const [view, setView] = useState(readHash());
  const go = useCallback((v) => { setView(v); try { history.replaceState(null, '', '#' + v); } catch (_) {} window.scrollTo(0, 0); }, []);
  useEffect(() => { const f = () => setView(readHash()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);

  if (status === 'loading') return <div className="wrap" style={{ paddingTop: 80 }}><p className="muted">Loading…</p></div>;
  const signedIn = status === 'signedIn';
  let v = view;
  if (!signedIn && !PUBLIC.includes(v)) v = 'welcome';
  if (signedIn && !PRIVATE.includes(v)) v = 'home';

  return (
    <>
      <header className="topbar">
        <div className="wrap wide topbar-inner">
          <button type="button" className="brand" onClick={() => go(signedIn ? 'home' : 'welcome')} aria-label="Steadi home"><Logo /><span className="brand-name">Steadi</span></button>
          {signedIn ? <>
            <nav className="topnav" aria-label="Sections">
              {NAV.map((n) => <button key={n.id} type="button" aria-current={v === n.id ? 'page' : undefined} onClick={() => go(n.id)}><Icon name={n.icon} size={18} />{n.label}</button>)}
            </nav>
            <button type="button" className="brand account" onClick={() => go('account')} aria-label="Your account"><span className="avatar">{user.name[0]?.toUpperCase()}</span></button>
          </> : (
            <div className="account">
              {v !== 'signin' && <button type="button" className="btn ghost small" onClick={() => go('signin')}>Sign in</button>}
              {v !== 'signup' && <button type="button" className="btn primary small" onClick={() => go('signup')}>Create account</button>}
            </div>
          )}
        </div>
        {signedIn && user.mode === 'demo' && <div className="strip"><div className="wrap wide">You’re viewing a demo patient: simulated check-ins, fictional reports. <button type="button" className="linkish" onClick={() => go('account')}>Leave the demo</button></div></div>}
        {HOSTED_PREVIEW && !signedIn && <div className="strip"><div className="wrap wide">Preview mode. Accounts, Gemma, and motion sensors run in the full app.</div></div>}
      </header>

      <main className="page" id="main" data-view={v}>
        {v === 'welcome' && <Landing go={go} />}
        {(v === 'signin' || v === 'signup') && <Auth key={v} mode={v} go={go} />}
        {v === 'home' && <Home go={go} />}
        {v === 'checkin' && <CheckIn key={user?.name + (location.hash)} go={go} />}
        {v === 'twin' && <Twin go={go} />}
        {v === 'scans' && <ScansScreen go={go} />}
        {v === 'report' && <Report go={go} />}
        {v === 'account' && <Account go={go} />}
      </main>

      {!signedIn && <footer className="site-foot"><div className="wrap wide"><p className="fine">Prototype built for Gator Hack V. Not a medical device. Explanations by Gemma 4. Measurements are approximate and only meaningful compared with your own earlier check-ins.</p></div></footer>}

      {signedIn && (
        <nav className="tabbar" aria-label="Sections">
          <div className="tabbar-inner">
            {NAV.map((n) => <button key={n.id} type="button" className={n.cta ? 'cta' : ''} aria-current={v === n.id ? 'page' : undefined} onClick={() => go(n.id)}><span className="ic"><Icon name={n.icon} size={22} /></span>{n.label}</button>)}
          </div>
        </nav>
      )}
    </>
  );
}
