import { useCallback, useEffect, useState } from 'react';
import { FEED, fixed, formatGwei, gasPercent, readBalance, readBlocks, readPrice, utcDateTime, utcTime } from './ethereum';
import { useLiveRead } from './useLiveRead';
import { useWallet } from './wallet';

function Icon({ kind, className = '' }: { kind: 'eth' | 'wallet' | 'refresh' | 'block' | 'arrow' | 'pulse'; className?: string }) {
  return <svg className={`icon ${className}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'eth' && <><path d="m12 2 6 10-6 3.5L6 12 12 2Z" /><path d="m6 15 6 7 6-7-6 3.5L6 15Z" /><path d="M12 2v13.5M6 12l6-3 6 3" /></>}
    {kind === 'wallet' && <><path d="M19 7V5a2 2 0 0 0-2-2L5 6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H5" /><path d="M21 12h-6v5h6M17.5 14.5h.01" /></>}
    {kind === 'refresh' && <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9" /></>}
    {kind === 'block' && <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>}
    {kind === 'arrow' && <path d="M6 18 18 6M6 6h12v12" />}
    {kind === 'pulse' && <path d="M2 12h5l3-7 4 14 3-7h5" />}
  </svg>;
}

export function App() {
  const [now, setNow] = useState(Date.now());
  const [cycle] = useState(Date.now());
  const wallet = useWallet();
  const blocks = useLiveRead(readBlocks);
  const price = useLiveRead(readPrice);
  const balanceReader = useCallback(() => readBalance(wallet.address!), [wallet.address]);
  const balance = useLiveRead(wallet.address ? balanceReader : null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const latest = blocks.data?.[0];
  const blockDelayed = !!latest && now / 1000 - latest.timestamp > 90;
  const priceDelayed = !!price.data && now / 1000 - price.data.updatedAt > 3600;
  const unavailable = blocks.error || price.error;
  const working = blocks.loading || price.loading || balance.loading;
  const stale = unavailable || blockDelayed || priceDelayed;
  const status = !latest ? (blocks.error ? 'Connection issue' : 'Connecting to mainnet') :
    stale ? 'Data delayed' : 'Live on mainnet';
  const countdown = 15 - Math.floor((Math.max(0, now - cycle) % 15_000) / 1000);

  function refresh() {
    void blocks.refresh(); void price.refresh(); void balance.refresh();
  }

  const balanceText = balance.data === null ? '—' :
    balance.data > 0n && balance.data < 100_000_000_000_000n ? '<0.0001' : fixed(balance.data, 18, 4, false);

  return <div className="app-shell">
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark"><Icon kind="eth" /></span>
        <div><h1>ETH Pulse<span className="brand-period" aria-hidden="true">.</span></h1><p>data from Ethereum mainnet</p></div>
      </div>
      <div className="topbar-actions">
        <div className="clock"><span className="clock-dot" /><time dateTime={new Date(now).toISOString()}>{utcTime(now)}</time><span className="clock-zone">UTC</span></div>
        <button className={`button wallet-button ${wallet.address ? '' : 'primary'}`} disabled={wallet.connecting} onClick={wallet.address ? wallet.disconnect : wallet.connect}>
          <Icon kind="wallet" /><span>{wallet.connecting ? 'Connecting…' : wallet.address ? 'Disconnect wallet' : 'Connect wallet'}</span>
        </button>
      </div>
    </header>

    <main id="main" tabIndex={-1}>
      <div className="overview-heading"><div><p className="eyebrow">The Ethereum dashboard</p><h2>Onchain. At a glance.</h2></div>
        <div className={`network-status ${stale ? 'is-delayed' : ''}`}><span className="status-dot" />{status}</div>
      </div>

      <section className="metrics" aria-label="Ethereum mainnet overview">
        <article className="metric" aria-labelledby="price-label">
          <div className="metric-label"><h3 id="price-label">ETH / USD</h3><span className="metric-symbol" aria-hidden="true">$</span></div>
          <p className={`metric-value ${price.error ? 'value-stale' : ''}`}>{price.data ? <><span className="currency">$</span>{fixed(price.data.answer, 8, 2)}</> : <span className="empty-value">—</span>}</p>
          <div className="metric-detail"><a href={`https://etherscan.io/address/${FEED}#readContract`} target="_blank" rel="noreferrer" aria-label="Chainlink ETH/USD feed on Etherscan (opens in a new tab)">Chainlink feed<Icon kind="arrow" /></a>
            <span>{price.error ? (price.data ? 'Last known price' : 'Price unavailable') : price.data ? (priceDelayed ? 'Oracle update delayed' : `Updated ${utcTime(price.data.updatedAt * 1000)} UTC`) : 'Reading price…'}</span>
          </div>
        </article>
        <article className="metric" aria-labelledby="fee-label">
          <div className="metric-label"><h3 id="fee-label">Base fee</h3><Icon kind="pulse" /></div>
          <p className={`metric-value ${blocks.error ? 'value-stale' : ''}`}>{latest ? <>{formatGwei(latest.baseFee)}<span className="metric-unit">gwei</span></> : <span className="empty-value">—</span>}</p>
          <div className="metric-detail"><span>{latest ? `Block #${latest.number.toLocaleString('en-US')}` : 'Latest Ethereum block'}</span><span>{blocks.error ? (latest ? 'Last known base fee' : 'Base fee unavailable') : blockDelayed ? 'Latest block is delayed' : 'Network fee per unit of gas'}</span></div>
        </article>
        <article className="metric wallet-metric" aria-labelledby="balance-label">
          <div className="metric-label"><h3 id="balance-label">Your ETH</h3><Icon kind="wallet" /></div>
          <p className="metric-value balance-value">{balanceText}{balance.data !== null && <span className="metric-unit">ETH</span>}</p>
          <div className="metric-detail">{wallet.address ? <><span className="wallet-address" title={wallet.address}>{wallet.address}</span><span>{balance.error ? (balance.data !== null ? 'Last known balance · retry below' : 'Balance unavailable · retry below') : balance.loading && balance.data === null ? 'Reading mainnet balance…' : 'Balance on Ethereum mainnet'}</span></> : <><span>No wallet connected</span><span>Connect to view your balance</span></>}</div>
        </article>
      </section>

      <div className="wallet-message" role="status">{wallet.message}</div>
      <div className="data-message" role="status">{unavailable ? 'Some data could not refresh. Last known readings are kept when available. Check your connection and select Retry.' : blockDelayed ? 'The latest reported block is over 90 seconds old. These readings may be delayed.' : priceDelayed ? 'The oracle’s reported price is over an hour old. Its last known value is shown.' : ''}</div>

      <section className="blocks-section" aria-labelledby="blocks-title">
        <div className="section-heading">
          <div><h2 id="blocks-title">Latest blocks <span className="count-badge">12</span></h2><p>A rolling window into the network.</p></div>
          <div className="refresh-controls"><span className="countdown">{working ? 'Reading mainnet…' : <>Refresh in <span>{countdown}s</span></>}</span><button className="button refresh-button" disabled={working} onClick={refresh}><Icon kind="refresh" />{unavailable || balance.error ? 'Retry' : 'Refresh'}</button></div>
        </div>

        <div className="table-frame">
          <table>
            <caption className="sr-only">Last 12 Ethereum mainnet blocks, newest first. Times are in UTC. Gas used is the percentage of each block’s gas limit.</caption>
            <thead><tr><th scope="col">Block <span className="sort-arrow" aria-hidden="true">↓</span></th><th scope="col">Timestamp <span className="table-unit">UTC</span></th><th scope="col" className="numeric">Base fee <span className="table-unit">gwei</span></th><th scope="col" className="numeric">Gas used <span className="table-unit">%</span></th></tr></thead>
            <tbody>{blocks.data ? blocks.data.map((block, index) => <tr key={block.hash} className={index === 0 ? 'latest-row' : ''}>
              <th scope="row"><div className="block-number"><Icon kind="block" /><span className="desktop-number">{block.number.toLocaleString('en-US')}</span><span className="mobile-number">{block.number.toString()}</span>{index === 0 && <span className="latest-badge">Latest</span>}</div></th>
              <td><time dateTime={new Date(block.timestamp * 1000).toISOString()} title={utcDateTime(block.timestamp * 1000)}><span aria-hidden="true">{utcTime(block.timestamp * 1000)}</span><span className="sr-only">{utcDateTime(block.timestamp * 1000)}</span></time></td>
              <td className="numeric">{formatGwei(block.baseFee)}</td>
              <td className="numeric"><div className="gas-cell"><span className="gas-track" aria-hidden="true"><span style={{ width: `${gasPercent(block)}%` }} /></span><span>{gasPercent(block).toFixed(1)}<span className="percent-sign">%</span></span></div></td>
            </tr>) : <tr><td colSpan={4} className="table-empty"><Icon kind="block" /><p>{blocks.error ? 'Unable to load the latest blocks' : 'Reading the latest blocks'}</p><span>{blocks.error ? 'Check your connection, then select Retry.' : 'Connecting directly to Ethereum mainnet…'}</span></td></tr>}</tbody>
          </table>
          <div className="table-footer"><span><span className={`status-dot ${blocks.error ? 'dot-muted' : ''}`} />{blocks.checkedAt ? `${blocks.error ? 'Last success' : 'Fetched'} ${utcTime(blocks.checkedAt)} UTC` : 'Waiting for mainnet data'}</span><span>Auto-refresh every 15s</span></div>
        </div>
      </section>
    </main>
    <footer className="page-footer"><Icon kind="pulse" /><p>Built by the IMD swarm. Read-only. Not financial advice.</p></footer>
  </div>;
}
