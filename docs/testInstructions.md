# Start dev server
pnpm run dev

# Check health endpoint status
curl http://77.42.73.172:3000/health
## Expected: {"status":"ok","phase":2,"zkMode":"passthrough","acceptEmptyProofs":true}

# Structure validation test

curl -X POST http://77.42.73.172:3000/api/v1/submissions \
  -H "Content-Type: application/json" \
  -d '{
    "electionId": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "roundId": 1,
    "zkProof": "0xcccc",
    "submissions": [
      {
        "nodeId": "node-0",
        "encryptedVote": "0xdddd",
        "tracker": "0xeeee",
        "merkleProof": []
      },
      {
        "nodeId": "node-1",
        "encryptedVote": "0x1111",
        "tracker": "0x2222",
        "merkleProof": []
      }
    ],
    "metadata": {
      "nodeSignatures": [
        {"nodeId": "node-0", "signature": "0xaaaa"},
        {"nodeId": "node-1", "signature": "0xbbbb"}
      ],
      "version": "mixnet-1.0",
      "timestamp": "2026-01-01T12:00:00Z"
    }
  }'

## Expected: {"success":true,"message":"Round verified successfully (Merkle proofs bypassed in development mode).","data":{"electionId":"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","roundId":1,"derivedMerkleRoot":"0xe88e0037903c03cde1545805f677a621e9138670d38d87604158ec7b3bd94490","submissionCount":2},"warnings":["Merkle proof verification bypassed for 2 submission(s) because VL_ACCEPT_EMPTY_PROOFS=true"]}

# Replay prevention
Send same round again
## Expected: {"success":false,"error":"VERIFICATION_FAILED","step":"REPLAY_PREVENTION","message":"Round (0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa, 1) has already been processed. Duplicate submission rejected."}
