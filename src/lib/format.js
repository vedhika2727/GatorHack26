export const fmtDate = (iso) => { try { return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch (_) { return iso; } };
export const fmtLong = (iso) => { try { return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }); } catch (_) { return iso; } };
export const today = () => new Date().toISOString().slice(0, 10);
export const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
