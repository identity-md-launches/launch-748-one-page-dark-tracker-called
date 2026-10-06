# ETH Pulse

A single-page, read-only Ethereum mainnet dashboard. Three readings, the latest 12 blocks, a UTC clock, and an optional browser-wallet connection. Built with React, TypeScript, and Vite. The finished static site is included in **`dist/`**; a publisher does not need to rebuild it.

## Install and develop

Use Node.js **22.12+** (validated with **24.21.0**) and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. No environment file, API key, server, database, account, or wallet is needed to see network data.

## Preview and rebuild

Preview the delivered export:

```sh
npm run preview -- --host 127.0.0.1
```

Rebuild after editing source:

```sh
npm run typecheck
npm run build
npm run preview -- --host 127.0.0.1
```

`vite.config.ts` sets `base: './'`. HTML, CSS, JavaScript, fonts, and the favicon use relative local asset URLs. Serve over HTTP(S), rather than opening `index.html` with `file://`.

## Publish

Upload **the contents of `dist/` together**, including `assets/`, `licenses/`, and `favicon.svg`, to any static HTTPS host, an IPFS directory, or an ENS-linked static gateway. Use `dist/index.html` as the entry point. Keep the directory structure intact. No rewrites or backend endpoints are required. The site was tested beneath `/preview/`, not only at the origin root. If a host sets a CSP, permit `connect-src` to the three HTTPS RPC origins in `src/ethereum.ts` and local script/style/font assets.

Deliver the updated `dist/` alongside source and `package-lock.json` whenever rebuilding; publishing source alone will not update this site. Exclude all dependency installations, caches, browser downloads, and scratch output from source control. This delivery uses no submodules, vendored package registry, or ignore-file changes.

## Readings and wallet behavior

- **ETH / USD:** `latestRoundData()` on `0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419`. The response is decoded with integer arithmetic and its 8 decimals are checked onchain. The headline rounds to USD cents; the subline shows the oracle's own update time, which does not necessarily change every 15 seconds.
- **Base fee:** the latest block's `baseFeePerGas`, converted from wei to gwei. Displayed to three decimal places; nonzero values below `0.001` display as `<0.001`.
- **Your ETH:** a connected address's Ethereum mainnet balance, truncated to four decimals. Tiny nonzero balances display as `<0.0001`. Disconnected and unavailable balances are `—`, never fabricated zeros.
- **Blocks:** 12 consecutive blocks, newest first. Parent hashes and block numbers are checked before replacing the table. Gas used is `gasUsed / gasLimit × 100`, truncated to one decimal place. The full UTC date is available through each timestamp's accessible text and native title.
- Reads run every **15 seconds**, with a manual Refresh/Retry button. Pending requests do not overlap for the same reading. A slow request can defer the next scheduled read. Public RPC calls time out after four seconds per endpoint and try the other providers. Each batch checks chain ID `0x1` and matches replies by ID.
- Failures retain and label previous readings. A reported block older than 90 seconds or oracle update older than one hour is labelled delayed. These are display heuristics, not finality or oracle-health guarantees. An initial outage displays dashes and a recovery message. No sample data is bundled into the production UI.

Connect wallet requests **only `eth_requestAccounts`** from an injected `window.ethereum` provider. Reads still use the mainnet RPCs even if the wallet is on another chain. No network switch, signature, approval, transaction, private key, or wallet SDK is used. Account changes clear the previous balance immediately, and obsolete responses cannot overwrite the new account. Disconnect removes the page's connection and listeners; it does not revoke permissions previously granted in the wallet. Connections do not persist across page reloads. Multi-wallet selection and WalletConnect QR pairing are outside this scope.

RPC providers receive network requests and, when connected, the public address used for balance reads. There is no analytics or application backend. Live data needs internet access and available, CORS-enabled public RPCs.

The implementation follows the primary [Ethereum JSON-RPC reference](https://ethereum.org/developers/docs/apis/json-rpc/) and [Chainlink feed API reference](https://docs.chain.link/data-feeds/api-reference).

## Checks

```sh
npx playwright install chromium
npm run typecheck
npm run build
npm test
npm run test:live
python3 scripts/check-delivery.py
```

On a normal Linux development machine, Playwright may also require its documented browser system dependencies. `npm test` uses a bounded, Playwright-managed local server and the built export at `/preview/`. It mocks network/wallet responses to reproduce failures and races; it does not put fixtures in `dist/`. `npm run test:live` separately contacts real mainnet RPCs and can fail when those services or the network are unavailable.

**Actual final worker results (2026-10-05 UTC):** production build passed; strict typecheck passed; **10/10** deterministic checks passed; **1/1** live-mainnet check passed. Desktop and mobile axe scans reported zero violations for the selected WCAG tags. Tested widths: 320, 390, 768, and 1440 CSS pixels. The live run observed Ethereum mainnet block **26,129,613** at **23:59:56 UTC**; the captured values are historical evidence, not current quotes.

Dependencies were installed in an identical `test/scratch/build/` staging copy, and the commands above ran with `--prefix test/scratch/build`. Its verified export was copied byte-for-byte into the root `dist/`. This avoided creating repository-root `node_modules/`. The browser and extracted Linux libraries lived under `/tmp`. The provided browser tool lacked Chrome; local Playwright Chromium 141 completed the checks instead.

See [the complete validation record](artifacts/validation.md) for failures corrected during development, measured contrast, screenshots, and limitations. Native browser zoom, physical devices, screen-reader sessions, Safari/Firefox, and a real wallet extension were not tested. Tests and the design review are worker observations, not independent certification or a guarantee of correctness.

## Project map and attribution

`src/App.tsx` contains the page, `src/styles.css` the design tokens, `src/ethereum.ts` the read-only data layer, `src/useLiveRead.ts` polling/isolation, and `src/wallet.ts` wallet permissions. Reproducible checks are in `tests/`. [DESIGN.md](DESIGN.md) documents the implemented design.

Design guidance was adapted from Jakub Krehel's **Better Interface**, MIT, pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`. The documentation method was adapted from Paul Bakaus's **Impeccable**, copyright 2025 Paul Bakaus, Apache-2.0, pinned commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`. This project's documentation is an application of those methods, modified for ETH Pulse. Both [license texts](artifacts/design-guidance-LICENSE.txt) are retained. Geist and Geist Mono are locally bundled under SIL OFL; React uses MIT. Runtime notices ship in `public/licenses/` and `dist/licenses/`.
