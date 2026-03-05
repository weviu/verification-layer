#  How You Will Run Dev Mode

Start server like this:

```
VL_ZK_MODE=passthrough VL_ACCEPT_EMPTY_PROOFS=true pnpm run dev
```

This lets you use a fully testable system that temporarily allows for empty ZK and Merkle proofs

to kill server: ps aux | grep pnpm then kill -9 [process number]
also kill tsx related everything to reset memory: pkill -f tsx
