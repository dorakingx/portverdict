# Local contract-preflight results

> Development evidence only. No model, Nebius, NVIDIA, Token Factory Sandbox, Tavily, or GitHub API call was made.

The recorded run contains 10 synthetic contract fixtures. The naive baseline passes 0 fixtures. PortVerdict's stored candidate tournament selects a contract-complete candidate in 9 fixtures and abstains on the TypeScript tool-call fixture because the nominal candidate violates a forbidden coercion marker. That abstention is expected safety behavior: the evaluator does not choose the least-bad candidate.

| Metric                      | Recorded value | Interpretation                                  |
| --------------------------- | -------------: | ----------------------------------------------- |
| Fixtures                    |             10 | Five TypeScript and five Python probes          |
| Baseline contract passes    |              0 | Deliberately naive stored migrations            |
| Selected fixture candidates |              9 | All explicit markers passed                     |
| Abstentions                 |              1 | No fixture candidate passed every marker        |
| Known regressions caught    |              9 | Baseline failed and a passing candidate existed |

These numbers validate the local harness only. They are not evidence that an AI migration workflow outperforms another model or system. The canonical machine-readable record is `docs/evaluations/results.json`; its own integrity hash and every fixture digest are verified in the unit suite.
