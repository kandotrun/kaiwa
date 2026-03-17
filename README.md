# Kaiwa

**Programmable residential proxy network.**

Route HTTP requests through real residential and mobile IPs via a peer-to-peer network. No per-GB billing — flat monthly pricing.

```
┌─────────────┐     ┌──────────────────────┐     ┌─────────────┐
│  Client SDK  │────▶│  CF Workers (Relay)   │◀────│  Proxy Node │
│  @kaiwa/sdk  │     │  Signaling + Auth     │     │  (SIM/Fiber)│
└──────┬───────┘     │  Durable Objects      │     └──────┬───────┘
       │             └──────────────────────┘            │
       │                                                  │
       └──────────── P2P Direct (WebRTC) ─────────────────┘
                  Fallback: relay via Workers
```

## Packages

| Package | Description |
|---------|-------------|
| [`@kaiwa/relay`](./packages/relay) | Cloudflare Workers signaling & relay server |
| [`@kaiwa/node-agent`](./packages/node-agent) | Proxy node agent (runs on Raspberry Pi, VPS, etc.) |
| [`@kaiwa/sdk`](./packages/sdk) | TypeScript SDK for consuming the proxy network |
| [`@kaiwa/shared`](./packages/shared) | Shared types and protocol definitions |

## Quick Start

```bash
# Install dependencies
pnpm install

# Start relay server (local dev)
pnpm dev:relay

# Start a proxy node
KAIWA_NODE_ID=my-node pnpm dev:node
```

### SDK Usage

```typescript
import { KaiwaClient } from '@kaiwa/sdk';

const kaiwa = new KaiwaClient({ apiKey: 'kw_xxx' });

// Route a request through a Japanese residential IP
const res = await kaiwa.fetch('https://example.jp/api/data');
console.log(await res.text());

// Clean up
kaiwa.close();
```

## Tech Stack

- **Runtime**: Cloudflare Workers + Durable Objects
- **Language**: TypeScript (strict)
- **Monorepo**: pnpm workspaces
- **Lint/Format**: Biome
- **Framework**: Hono (Workers)
- **Testing**: Vitest

## License

Proprietary — All rights reserved.
