# Test goal
## This test makes sure that the verification layer does:

1. Node-Level Checks: makes sure each nodeId is unique
2. Canonical Ordering: sorts submissions deterministically by keccak256(tracker)
3. Merkle Tree Construction: builds a Merkle tree using keccak256(encryptedVote || tracker) for each leaf
4. Creates a canonical Merkle root
5. Merkle Proof Verification
	Compares each submission’s merkleProof array to the tree it just built
	This submission has 2 leaves but empty proofs → the VL expects 1 proof element per leaf (in a 2-leaf binary tree, each leaf has 1 sibling hash in its proof)
6. ZK Proof verification: skipped because VL_ZK_MODE=passthrough
7. Replay Check: rejects duplicates

## Expected result: Error 422
2+ submissions → more than one leaf → requires proper proof. Since no proper proof is provided by the mixnet, this will not be accepted by the VL.


curl -X POST http://localhost:3000/api/v1/submissions \
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
