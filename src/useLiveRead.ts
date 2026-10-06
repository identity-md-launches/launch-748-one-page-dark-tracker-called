import { useCallback, useEffect, useRef, useState } from 'react';
import { REFRESH_MS } from './ethereum';

export function useLiveRead<T>(reader: (() => Promise<T>) | null) {
  type State = { source: typeof reader; data: T | null; error: boolean; loading: boolean; checkedAt: number };
  const empty: State = { source: reader, data: null, error: false, loading: !!reader, checkedAt: 0 };
  const [state, setState] = useState<State>(empty);
  const version = useRef(0);
  const running = useRef(false);
  const refresh = useCallback(async () => {
    if (!reader || running.current) return;
    running.current = true;
    const token = ++version.current;
    setState(previous => ({
      source: reader, data: previous.source === reader ? previous.data : null,
      error: previous.source === reader && previous.error, loading: true,
      checkedAt: previous.source === reader ? previous.checkedAt : 0,
    }));
    try {
      const data = await reader();
      if (token === version.current) setState({ source: reader, data, error: false, loading: false, checkedAt: Date.now() });
    } catch {
      if (token === version.current) setState(previous => ({ ...previous, error: true, loading: false }));
    } finally {
      if (token === version.current) running.current = false;
    }
  }, [reader]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), REFRESH_MS);
    return () => { clearInterval(interval); version.current++; running.current = false; };
  }, [refresh]);

  return { ...(state.source === reader ? state : empty), refresh };
}
