import { useEffect, useRef, useState } from 'react';

type Listener = (...args: unknown[]) => void;
export type Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: Listener) => void;
  removeListener?: (event: string, listener: Listener) => void;
};
declare global { interface Window { ethereum?: Provider } }

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState('');
  const [provider, setProvider] = useState<Provider | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    if (!provider) return;
    const changed: Listener = accounts => {
      generation.current++;
      setConnecting(false);
      const next = Array.isArray(accounts) ? accounts[0] : null;
      setAddress(typeof next === 'string' && /^0x[0-9a-f]{40}$/i.test(next) ? next : null);
      setMessage(next ? 'Wallet updated. Balance is always on Ethereum mainnet.' : 'Wallet disconnected.');
    };
    const disconnected = () => changed([]);
    provider.on?.('accountsChanged', changed);
    provider.on?.('disconnect', disconnected);
    return () => {
      provider.removeListener?.('accountsChanged', changed);
      provider.removeListener?.('disconnect', disconnected);
    };
  }, [provider]);

  async function connect() {
    const injected = window.ethereum;
    if (!injected?.request) {
      setMessage('No wallet detected. Open this page in a wallet browser or enable a browser wallet, then try again.');
      return;
    }
    setProvider(injected);
    setConnecting(true);
    setMessage('Approve the connection in your wallet. Only your public address is requested.');
    const current = ++generation.current;
    try {
      const accounts = await injected.request({ method: 'eth_requestAccounts' });
      if (current !== generation.current) return;
      const next = Array.isArray(accounts) ? accounts[0] : null;
      if (typeof next !== 'string' || !/^0x[0-9a-f]{40}$/i.test(next)) throw new Error('No address returned');
      setAddress(next);
      setMessage('Wallet connected. Balance is always on Ethereum mainnet.');
    } catch (error) {
      if (current !== generation.current) return;
      const code = (error as { code?: number })?.code;
      setProvider(null);
      setMessage(code === 4001 ? 'Connection declined. You can try again when you’re ready.' :
        code === -32002 ? 'A connection request is already open. Check your wallet, then try again.' :
        'Could not connect. Unlock your wallet and try again.');
    } finally {
      if (current === generation.current) setConnecting(false);
    }
  }

  function disconnect() {
    generation.current++;
    setConnecting(false);
    setAddress(null);
    setProvider(null);
    setMessage('Wallet disconnected from this page.');
  }
  return { address, connecting, message, connect, disconnect };
}
