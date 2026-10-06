import type { Page } from '@playwright/test';

export const ACCOUNT_A = '0x1111111111111111111111111111111111111111';
export const ACCOUNT_B = '0x2222222222222222222222222222222222222222';
const hex = (value: bigint) => `0x${value.toString(16)}`;
const hash = (value: bigint) => `0x${value.toString(16).padStart(64, '0')}`;
export const encodeRound = (answer = 239867000000n, timestamp = Math.floor(Date.now() / 1000) - 45) =>
  '0x' + [1n, answer, BigInt(timestamp), BigInt(timestamp), 1n].map(v => v.toString(16).padStart(64, '0')).join('');

export async function mockRpc(page: Page) {
  const state = {
    height: 27_000_000n, fail: false, invalidPrice: false, wrongChain: false, failPrimary: false,
    priceAge: 45, blockAge: 0, balanceDelay: 0, calls: [] as { method: string; params: unknown[]; url: string }[],
  };
  await page.route(/https:\/\/(ethereum-rpc\.publicnode\.com|eth-mainnet\.public\.blastapi\.io|ethereum\.public\.blockpi\.network)/, async route => {
    if (state.fail || (state.failPrimary && route.request().url().includes('publicnode'))) {
      await route.fulfill({ status: 503, body: 'Unavailable' }); return;
    }
    const requests = route.request().postDataJSON() as { id: number; method: string; params: unknown[] }[];
    const results = requests.map(request => {
      state.calls.push({ ...request, url: route.request().url() });
      let result: unknown;
      switch (request.method) {
        case 'eth_chainId': result = state.wrongChain && route.request().url().includes('publicnode') ? '0xaa36a7' : '0x1'; break;
        case 'eth_call': result = (request.params[0] as { data: string }).data === '0x313ce567' ? hex(8n) :
          encodeRound(state.invalidPrice ? 2n ** 256n - 1n : 239867000000n, Math.floor(Date.now() / 1000) - state.priceAge); break;
        case 'eth_getBlockByNumber': {
          const number = request.params[0] === 'latest' ? state.height : BigInt(request.params[0] as string);
          const offset = state.height - number;
          result = { number: hex(number), timestamp: hex(BigInt(Math.floor(Date.now() / 1000) - state.blockAge) - offset * 12n),
            baseFeePerGas: hex(1_167_000_000n + offset * 17_000_000n), gasUsed: hex(31_080_000n + (offset * 3_753_777n) % 26_000_000n),
            gasLimit: hex(60_000_000n), hash: hash(number), parentHash: hash(number - 1n) }; break;
        }
        case 'eth_getBalance': result = request.params[0] === ACCOUNT_A ? hex(1_234_567_890_123_456_789n) : hex(5_000_000_000_000_000_000n); break;
        default: throw new Error(`Unexpected RPC: ${request.method}`);
      }
      return { jsonrpc: '2.0', id: request.id, result };
    });
    if (requests.some(r => r.method === 'eth_getBalance' && r.params[0] === ACCOUNT_A) && state.balanceDelay) {
      await new Promise(resolve => setTimeout(resolve, state.balanceDelay));
    }
    // Deliberately reverse replies to exercise matching by id instead of array order.
    await route.fulfill({ json: results.reverse() });
  });
  return state;
}

export async function mockWallet(page: Page, reject = false) {
  await page.addInitScript(({ account, shouldReject }) => {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    const calls: string[] = [];
    const wallet = {
      calls,
      reject: shouldReject,
      emit: (name: string, value: unknown) => listeners[name]?.forEach(fn => fn(value)),
      async request({ method }: { method: string }) {
        calls.push(method);
        if (wallet.reject) throw { code: 4001 };
        if (method !== 'eth_requestAccounts') throw new Error(`Unexpected wallet permission: ${method}`);
        return [account];
      },
      on: (event: string, listener: (...args: unknown[]) => void) => { (listeners[event] ??= []).push(listener); },
      removeListener: (event: string, listener: (...args: unknown[]) => void) => { listeners[event] = listeners[event]?.filter(fn => fn !== listener); },
    };
    Object.assign(window, { ethereum: wallet, __wallet: wallet });
  }, { account: ACCOUNT_A, shouldReject: reject });
}
