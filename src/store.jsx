/*
 * App state: who is signed in and their check-ins and scan reports.
 *
 * Three ways to use the app:
 *   cloud   real accounts (Supabase email + password); data saved to the user's own rows
 *   device  a profile on this device only (name, no password); data in browser storage
 *   demo    a simulated patient, generated fresh each time, nothing saved
 * Cloud mode turns on when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { buildDemoCheckins } from './core/demo.js';
import { buildDemoScans } from './core/demoScans.js';

const URL_ = import.meta.env.VITE_SUPABASE_URL;
const KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = URL_ && KEY_ ? createClient(URL_, KEY_) : null;
export const CLOUD_ENABLED = !!supabase;
export const HOSTED_PREVIEW = import.meta.env.VITE_HOSTED_PREVIEW === '1';

const PROFILE_KEY = 'cnc.profile.v2';
const DATA_KEY = 'cnc.data.v2';
const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } };
const remove = (k) => { try { localStorage.removeItem(k); } catch (_) {} };

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

const byCycle = (a, b) => a.cycle - b.cycle || a.date.localeCompare(b.date);
const byDate = (a, b) => a.date.localeCompare(b.date);

export function StoreProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [user, setUser] = useState(null);
  const [checkins, setCheckins] = useState([]);
  const [scans, setScans] = useState([]);
  const [error, setError] = useState('');

  // ---------- loading ----------
  const loadCloud = useCallback(async (u) => {
    const { data, error: e } = await supabase.from('records').select('id, kind, data').order('updated_at');
    if (e) { setError(`Couldn't load your data: ${e.message}`); return; }
    setCheckins(data.filter((r) => r.kind === 'checkin').map((r) => r.data).sort(byCycle));
    setScans(data.filter((r) => r.kind === 'scan').map((r) => r.data).sort(byDate));
    setUser({ mode: 'cloud', id: u.id, email: u.email, name: u.user_metadata?.name || u.email.split('@')[0] });
    setStatus('signedIn');
  }, []);

  useEffect(() => {
    let sub;
    (async () => {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (data.session) { await loadCloud(data.session.user); }
        else {
          const p = read(PROFILE_KEY, null);
          if (p) { setUser(p); const d = read(DATA_KEY, { checkins: [], scans: [] }); setCheckins(d.checkins.sort(byCycle)); setScans(d.scans.sort(byDate)); setStatus('signedIn'); }
          else setStatus('signedOut');
        }
        sub = supabase.auth.onAuthStateChange((evt, session) => {
          if (evt === 'SIGNED_OUT') { setUser(null); setCheckins([]); setScans([]); setStatus('signedOut'); }
        }).data.subscription;
      } else {
        const p = read(PROFILE_KEY, null);
        if (p && p.mode === 'device') { setUser(p); const d = read(DATA_KEY, { checkins: [], scans: [] }); setCheckins(d.checkins.sort(byCycle)); setScans(d.scans.sort(byDate)); setStatus('signedIn'); }
        else setStatus('signedOut');
      }
    })();
    return () => sub?.unsubscribe();
  }, [loadCloud]);

  // Device mode persists after every change.
  useEffect(() => {
    if (user?.mode === 'device') write(DATA_KEY, { checkins, scans });
  }, [user, checkins, scans]);

  // ---------- sign in / out ----------
  const signUp = useCallback(async (name, email, password) => {
    setError('');
    const { data, error: e } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
    if (e) throw new Error(e.message);
    if (!data.session) return { needsConfirmation: true };
    await loadCloud(data.session.user);
    return {};
  }, [loadCloud]);

  const signIn = useCallback(async (email, password) => {
    setError('');
    const { data, error: e } = await supabase.auth.signInWithPassword({ email, password });
    if (e) throw new Error(e.message === 'Invalid login credentials' ? 'That email and password don’t match an account.' : e.message);
    await loadCloud(data.user);
  }, [loadCloud]);

  const continueOnDevice = useCallback((name) => {
    const p = { mode: 'device', name: name.trim() || 'Patient' };
    write(PROFILE_KEY, p);
    const d = read(DATA_KEY, { checkins: [], scans: [] });
    setUser(p); setCheckins(d.checkins.sort(byCycle)); setScans(d.scans.sort(byDate)); setStatus('signedIn');
  }, []);

  const startDemo = useCallback(() => {
    const c = buildDemoCheckins();
    setUser({ mode: 'demo', name: 'Maria' });
    setCheckins(c); setScans(buildDemoScans(c)); setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    if (user?.mode === 'cloud') await supabase.auth.signOut();
    if (user?.mode === 'device') remove(PROFILE_KEY);
    setUser(null); setCheckins([]); setScans([]); setStatus('signedOut');
  }, [user]);

  // ---------- data ----------
  const cloudUpsert = async (kind, rec) => {
    const { error: e } = await supabase.from('records').upsert({ id: rec.id, kind, data: rec, updated_at: new Date().toISOString() });
    if (e) throw new Error(`Couldn't save to your account: ${e.message}`);
  };

  const addCheckin = useCallback(async (c) => {
    if (user?.mode === 'cloud') await cloudUpsert('checkin', c);
    setCheckins((list) => [...list.filter((x) => !(x.cycle === c.cycle && x.date === c.date) && x.id !== c.id), c].sort(byCycle));
  }, [user]);

  const saveScan = useCallback(async (s) => {
    if (user?.mode === 'cloud') await cloudUpsert('scan', s);
    setScans((list) => [...list.filter((x) => x.id !== s.id), s].sort(byDate));
  }, [user]);

  const removeScan = useCallback(async (id) => {
    if (user?.mode === 'cloud') { const { error: e } = await supabase.from('records').delete().eq('id', id); if (e) throw new Error(e.message); }
    setScans((list) => list.filter((x) => x.id !== id));
  }, [user]);

  const deleteAll = useCallback(async () => {
    if (user?.mode === 'cloud') { const { error: e } = await supabase.from('records').delete().neq('id', ''); if (e) throw new Error(e.message); }
    if (user?.mode === 'device') remove(DATA_KEY);
    setCheckins([]); setScans([]);
  }, [user]);

  const value = useMemo(() => ({ status, user, checkins, scans, error, setError, signUp, signIn, continueOnDevice, startDemo, signOut, addCheckin, saveScan, removeScan, deleteAll }),
    [status, user, checkins, scans, error, signUp, signIn, continueOnDevice, startDemo, signOut, addCheckin, saveScan, removeScan, deleteAll]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
