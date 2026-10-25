import Icon from '../components/Icon.jsx';
import { useStore, CLOUD_ENABLED } from '../store.jsx';
import { useConfirm } from '../components/Confirm.jsx';

export default function Account({ go }) {
  const { user, signOut, deleteAll, checkins, scans } = useStore();
  const confirm = useConfirm();
  const where = { cloud: 'Saved to your account. Only you can see it.', device: 'Saved in this browser on this device only.', demo: 'Demo patient. Nothing is saved.' }[user.mode];
  return (
    <div className="wrap">
      <h1>Your account</h1>
      <section className="card">
        <div className="score-row" style={{ gap: 14 }}><span className="avatar" style={{ width: 52, height: 52, fontSize: '1.4rem' }}>{user.name[0]?.toUpperCase()}</span>
          <div><h3 style={{ margin: 0 }}>{user.name}</h3><p className="muted" style={{ margin: 0 }}>{user.email || (user.mode === 'demo' ? 'Demo patient' : 'Profile on this device')}</p></div></div>
        <p style={{ marginTop: 14 }}>{checkins.length} check-ins and {scans.length} scan reports. {where}</p>
        {user.mode === 'device' && CLOUD_ENABLED && <p className="notice">Want your data on every device? Create an account. Your on-device check-ins stay here.</p>}
        <div className="actions" style={{ marginBottom: 0 }}>
          <button type="button" className="btn" onClick={async () => { await signOut(); go('welcome'); }}><Icon name="logout" size={18} /> {user.mode === 'demo' ? 'Leave the demo' : 'Sign out'}</button>
          {user.mode !== 'demo' && <button type="button" className="btn danger" onClick={async () => { if (await confirm('Delete every check-in and scan report? This can’t be undone.', 'Delete everything', true)) await deleteAll(); }}><Icon name="trash" size={18} /> Delete all my data</button>}
        </div>
      </section>
      <section className="card">
        <h3>About this app</h3>
        <p className="muted">Steadi is a prototype built for Gator Hack V. It isn’t a medical device and hasn’t been clinically validated. It measures walking, balance, and hand function, which can change for many reasons. Only your care team can tell what a change means.</p>
        <p className="muted">AI: Gemma 4 (gemma-4-26b-a4b-it) reads radiology reports and writes the plain-language explanations. The measurements, change flags, and twin are fixed code, not AI.</p>
      </section>
    </div>
  );
}
