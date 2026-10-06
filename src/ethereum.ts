export const FEED = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';
export const REFRESH_MS = 15_000;
export const RPC_URLS = [
  'https://ethereum-rpc.publicnode.com',
  'https://eth-mainnet.public.blastapi.io',
  'https://ethereum.public.blockpi.network/v1/rpc/public',
];

type Call = { method: string; params: unknown[] };
type Reply = { id: number; result?: unknown; error?: unknown };
export type Block = {
  number: bigint;
  timestamp: number;
  baseFee: bigint;
  gasUsed: bigint;
  gasLimit: bigint;
  hash: string;
  parentHash: string;
};
export type Price = { answer: bigint; updatedAt: number };

let preferred = 0;
let requestId = 0;

// Each batch independently verifies Ethereum mainnet. Never use a wallet's chain for reads.
export async function rpc(calls: Call[]): Promise<unknown[]> {
  const startingEndpoint = preferred;
  for (let attempt = 0; attempt < RPC_URLS.length; attempt++) {
    const index = (startingEndpoint + attempt) % RPC_URLS.length;
    const requests = [{ method: 'eth_chainId', params: [] }, ...calls].map(call => ({
      jsonrpc: '2.0', id: ++requestId, ...call,
    }));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_000);
    try {
      const response = await fetch(RPC_URLS[index], {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requests), signal: controller.signal,
        cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      });
      if (!response.ok) throw new Error('RPC unavailable');
      const payload: unknown = await response.json();
      if (!Array.isArray(payload)) throw new Error('Invalid RPC batch');
      const replies = payload as Reply[];
      const ordered = requests.map(request => {
        const matches = replies.filter(reply => reply.id === request.id);
        if (matches.length !== 1 || matches[0].error || matches[0].result == null) {
          throw new Error('Incomplete RPC response');
        }
        return matches[0].result;
      });
      if (ordered[0] !== '0x1') throw new Error('RPC is not Ethereum mainnet');
      preferred = index;
      return ordered.slice(1);
    } catch {
      // A public endpoint may be rate limited or temporarily unavailable.
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error('Ethereum data is unavailable. Check your connection and retry.');
}

function quantity(value: unknown): bigint {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) throw new Error('Invalid quantity');
  return BigInt(value);
}

export function decodeBlock(value: unknown): Block {
  if (!value || typeof value !== 'object') throw new Error('Missing block');
  const b = value as Record<string, unknown>;
  const gasUsed = quantity(b.gasUsed);
  const gasLimit = quantity(b.gasLimit);
  const timestamp = Number(quantity(b.timestamp));
  if (gasLimit <= 0n || gasUsed > gasLimit || !Number.isSafeInteger(timestamp) || timestamp <= 0) {
    throw new Error('Invalid block data');
  }
  for (const hash of [b.hash, b.parentHash]) {
    if (typeof hash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error('Invalid block hash');
  }
  return { number: quantity(b.number), timestamp, gasUsed, gasLimit,
    baseFee: quantity(b.baseFeePerGas), hash: b.hash as string, parentHash: b.parentHash as string };
}

export async function readBlocks(): Promise<Block[]> {
  const [rawLatest] = await rpc([{ method: 'eth_getBlockByNumber', params: ['latest', false] }]);
  const latest = decodeBlock(rawLatest);
  const previous = await rpc(Array.from({ length: 11 }, (_, i) => ({
    method: 'eth_getBlockByNumber', params: [`0x${(latest.number - BigInt(i + 1)).toString(16)}`, false],
  })));
  const blocks = [latest, ...previous.map(decodeBlock)];
  for (let i = 1; i < blocks.length; i++) {
    if (blocks[i].number !== blocks[i - 1].number - 1n || blocks[i].hash !== blocks[i - 1].parentHash) {
      throw new Error('The chain changed during this read. Retry to load a consistent block window.');
    }
  }
  return blocks;
}

export function decodePrice(value: unknown): Price {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{320}$/i.test(value)) throw new Error('Invalid oracle response');
  const words = value.slice(2).match(/.{64}/g)!.map(word => BigInt(`0x${word}`));
  const [roundId, answer, , updatedAt, answeredInRound] = words;
  // int256 sign bit, zero prices, and incomplete rounds must not become plausible prices.
  if (answer <= 0n || answer >= 2n ** 255n || roundId === 0n || answeredInRound < roundId ||
      updatedAt <= 0n || updatedAt > BigInt(Math.floor(Date.now() / 1000) + 60)) {
    throw new Error('The oracle returned an invalid round');
  }
  return { answer, updatedAt: Number(updatedAt) };
}

export async function readPrice(): Promise<Price> {
  const [round, decimals] = await rpc([
    { method: 'eth_call', params: [{ to: FEED, data: '0xfeaf968c' }, 'latest'] },
    { method: 'eth_call', params: [{ to: FEED, data: '0x313ce567' }, 'latest'] },
  ]);
  if (quantity(decimals) !== 8n) throw new Error('Unexpected feed decimals');
  return decodePrice(round);
}

export async function readBalance(address: string): Promise<bigint> {
  if (!/^0x[0-9a-f]{40}$/i.test(address)) throw new Error('Invalid wallet address');
  const [balance] = await rpc([{ method: 'eth_getBalance', params: [address, 'latest'] }]);
  return quantity(balance);
}

// Integer rounding preserves precision for wei and the eight-decimal oracle answer.
export function fixed(value: bigint, decimals: number, places: number, round = true): string {
  const scale = 10n ** BigInt(decimals - places);
  const rounded = (value + (round ? scale / 2n : 0n)) / scale;
  const unit = 10n ** BigInt(places);
  const integer = (rounded / unit).toLocaleString('en-US');
  return places ? `${integer}.${(rounded % unit).toString().padStart(places, '0')}` : integer;
}

export const formatGwei = (wei: bigint) => wei > 0n && wei < 1_000_000n ? '<0.001' : fixed(wei, 9, 3);
export const gasPercent = (b: Block) => Number(b.gasUsed * 1000n / b.gasLimit) / 10;
export const utcTime = (ms: number) => new Date(ms).toISOString().slice(11, 19);
export const utcDateTime = (ms: number) => `${new Date(ms).toISOString().slice(0, 10)} ${utcTime(ms)} UTC`;
