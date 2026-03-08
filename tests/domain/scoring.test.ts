import { describe, expect, it } from "vitest";
import {
  computeJackpotEURWithPolicies,
  computePointsFromMatchesWithPolicies,
  type RulesConfigLike,
} from "../../src/domain/scoring";
import { DEFAULT_SOIREE_RULE_POLICIES, type SoireeRulePolicy } from "../../src/domain/soireeRules";

const BASE_RULES: RulesConfigLike = {
  winPoints: 2,
  smallFinalPoints: 1,
  checkoutBonusPoints: 1,
  jackpotPerPlayerEUR: 1,
  rebuyEUR: 0.5,
  rebuyWinPointsS1S2: 2,
  rebuyFirstWinPointsS3Plus: 2,
  rebuyNextWinPointsS3Plus: 1,
};

describe("scoring policy engine", () => {
  it("applies final-night match multiplier, final checkout override and podium override points", () => {
    const season = {
      players: ["A", "B", "C", "D"],
      soirees: [
        { number: 5, pools: { A: ["A", "B"], B: ["C", "D"] }, matches: [], rebuys: [] },
        {
          number: 6,
          pools: { A: ["A", "B"], B: ["C", "D"] },
          matches: [
            { phase: "DEMI", a: "A", b: "D", winner: "A", checkoutBy: "" },
            { phase: "DEMI", a: "B", b: "C", winner: "B", checkoutBy: "" },
            { phase: "PFINAL", a: "D", b: "C", winner: "D", checkoutBy: "" },
            { phase: "FINAL", a: "A", b: "B", winner: "A", checkoutBy: "A" },
          ],
          rebuys: [],
        },
      ],
    };

    const result = computePointsFromMatchesWithPolicies(
      season.soirees[1].matches,
      [],
      6,
      season,
      BASE_RULES,
      DEFAULT_SOIREE_RULE_POLICIES
    );

    expect(result.pts.get("A")).toBe(14); // demi 4 + final 4 + checkout finale 3 + podium 3
    expect(result.pts.get("B")).toBe(6); // demi win 4 + podium 2
    expect(result.pts.get("D")).toBe(3); // pfinal win 2 + podium 1
  });

  it("does not double rebuy points in final-night policy", () => {
    const season = {
      players: ["A", "B"],
      soirees: [
        {
          number: 6,
          pools: { A: ["A"], B: ["B"] },
          matches: [],
          rebuys: [
            { buyer: "A", winner: "A", createdAt: 1 },
            { buyer: "A", winner: "A", createdAt: 2 },
          ],
        },
      ],
    };

    const result = computePointsFromMatchesWithPolicies(
      [],
      season.soirees[0].rebuys,
      6,
      season,
      BASE_RULES,
      DEFAULT_SOIREE_RULE_POLICIES
    );

    expect(result.pts.get("A")).toBe(3); // first 2 + second 1
  });

  it("supports declarative jackpot multiplier override per soirée policy", () => {
    const policies: SoireeRulePolicy[] = [
      {
        ...DEFAULT_SOIREE_RULE_POLICIES[0],
        rebuy: { ...DEFAULT_SOIREE_RULE_POLICIES[0].rebuy, jackpotContributionMultiplier: 2 },
      },
    ];
    const season = {
      players: ["A", "B", "C", "D"],
      soirees: [
        {
          number: 6,
          pools: { A: ["A", "B"], B: ["C", "D"] },
          matches: [],
          rebuys: [{ buyer: "A", winner: "A", createdAt: 1 }],
        },
      ],
    };

    const jackpot = computeJackpotEURWithPolicies(season, BASE_RULES, policies);
    expect(jackpot).toBe(5); // 4 players + (0.5 * 2)
  });
});
