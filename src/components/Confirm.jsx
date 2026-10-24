// In-page confirmation dialog (hosted pages can't show window.confirm).
import { createContext, useCallback, useContext, useRef, useState } from 'react';

const Ctx = createContext(async () => false);
export const useConfirm = () => useContext(Ctx);

export function ConfirmProvider({ children }) {
  const [ask, setAsk] = useState(null);
  const ref = useRef(null);
  const confirm = useCallback((message, yesLabel = 'Yes', danger = false) => new Promise((resolve) => {
    setAsk({ message, yesLabel, danger, resolve });
    setTimeout(() => ref.current?.showModal(), 0);
  }), []);
  const close = (v) => { ref.current?.close(); ask?.resolve(v); setAsk(null); };
  return (
    <Ctx.Provider value={confirm}>
      {children}
      <dialog ref={ref} onCancel={(e) => { e.preventDefault(); close(false); }}>
        {ask && <>
          <p style={{ maxWidth: '40ch', fontSize: '1.05rem' }}>{ask.message}</p>
          <div className="actions">
            <button type="button" className={`btn ${ask.danger ? 'danger' : 'primary'}`} onClick={() => close(true)}>{ask.yesLabel}</button>
            <button type="button" className="btn ghost" onClick={() => close(false)} autoFocus>Cancel</button>
          </div>
        </>}
      </dialog>
    </Ctx.Provider>
  );
}
