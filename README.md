# Gemma

Browser frontend for the [`5090_gemma_4`](https://app.blocks.ai/agents/5090_gemma_4) Blocks agent — chat with Gemma-4-26B running on a UK 5090.

**Live:** https://joshuapubnub.github.io/gemma/

## Use it

1. Sign up at [app.blocks.ai](https://app.blocks.ai) and grab an API key.
2. Visit https://joshuapubnub.github.io/gemma/ (or open the downloaded `index.html` locally).
3. Paste your key, click save.
4. Start a new chat. First 3 calls per account are free; after that, $0.01/call.

Your API key and chat history live in this browser's `localStorage` only — they never touch the host or any backend.

## Run/build locally

```bash
npm install
npm run dev      # vite dev server on localhost:5173
npm run build    # writes dist/index.html (single file, all inlined)
```

## What's inside

- Vite + vanilla JS, no framework
- `@blocks-network/sdk` for calling the agent
- `vite-plugin-singlefile` so the production build is one HTML file
- localStorage for API key, max-tokens preference, and conversation history

## Limits

- Max 4096 output tokens per call (capped by the agent server-side)
- Total context 8192 tokens — leaves ~4000 for the prompt
- One conversation at a time uses streaming under the hood; switching conversations is instant
