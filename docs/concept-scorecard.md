# Concept scorecard

Reviewed 2026-08-31 against the official four judging criteria plus sponsor fit, demo clarity, solo feasibility, and defensibility. Scores are directional design decisions, not benchmark results.

| Concept                                                        | Tech | Design | Impact | Idea | Sponsor fit | 3-min demo | Solo feasibility | Defensibility | Total / 80 |
| -------------------------------------------------------------- | ---: | -----: | -----: | ---: | ----------: | ---------: | ---------------: | ------------: | ---------: |
| PortVerdict: checkpoint branch tournament for model migrations |   10 |      9 |      9 |    9 |          10 |          9 |                7 |             9 |         72 |
| Generic Nemotron coding agent                                  |    8 |      7 |      7 |    5 |           9 |          8 |                8 |             4 |         56 |
| AI incident postmortem assistant                               |    7 |      8 |      8 |    6 |           6 |          7 |                8 |             6 |         56 |
| Personal research memory agent                                 |    7 |      8 |      7 |    6 |           7 |          7 |                7 |             5 |         54 |
| Autonomous dependency upgrade bot                              |    8 |      7 |      8 |    6 |           8 |          8 |                7 |             6 |         58 |

## Competitive review

Model migration and regression tools already exist. ModelPort focuses behavior-preserving model upgrades and evals; EvalShift focuses CLI regression gates; general modernization agents focus repository-scale migrations. This makes “an AI that migrates models” alone insufficiently distinctive.

PortVerdict's defensible center is the controlled trial: three semantic strategies fork from the same VM-isolated checkpoint, a counterexample stage attempts to falsify each, deterministic provenance-aware gates retain rejected and inconclusive branches, and the system abstains if none is complete. Nebius Sandboxes are therefore the experimental substrate rather than decorative compute, while Tavily supplies current official compatibility evidence.

## Naming decision

The provisional name ParityPilot was replaced with PortVerdict. “Port” identifies migration; “Verdict” identifies the evidence-backed select-or-abstain product behavior. The repository target is `dorakingx/portverdict`.
