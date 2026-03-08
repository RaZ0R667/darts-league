export type RulePhase = "POULE" | "DEMI" | "PFINAL" | "FINAL";

export type MatchLike = {
  phase: RulePhase;
  a: string;
  b: string;
  winner: string;
  checkoutBy: "" | "A" | "B";
};

export type SoireeLike = {
  number: number;
  matches: MatchLike[];
};

export type SeasonLike = {
  soirees: SoireeLike[];
};

export type SoireeRulePolicy = {
  id: string;
  label: string;
  enabled: boolean;
  trigger: {
    soireeNumber?: number;
    lastSoireeOfSeason?: boolean;
  };
  scoring: {
    matchWinMultiplier: number;
    checkoutBonusMultiplierWithMatchMultiplier: boolean;
    checkoutBonusOverrides?: Partial<Record<RulePhase, number>>;
    rebuyPointsMultiplier: number;
    podiumPointsOverride?: {
      first: number;
      second: number;
      third: number;
    };
  };
  rebuy: {
    lockAfterKnockoutStart: boolean;
    jackpotContributionMultiplier: number;
  };
};

export type ResolvedRuleContext = {
  policy: SoireeRulePolicy | null;
  matchWinMultiplier: number;
  checkoutBonusMultiplierWithMatchMultiplier: boolean;
  checkoutBonusOverrides: Partial<Record<RulePhase, number>>;
  rebuyPointsMultiplier: number;
  rebuyLockAfterKnockoutStart: boolean;
  rebuyJackpotContributionMultiplier: number;
  podiumPointsOverride?: {
    first: number;
    second: number;
    third: number;
  };
};

export const DEFAULT_SOIREE_RULE_POLICIES: SoireeRulePolicy[] = [
  {
    id: "final-night",
    label: "Final Night",
    enabled: true,
    trigger: { soireeNumber: 6 },
    scoring: {
      matchWinMultiplier: 2,
      checkoutBonusMultiplierWithMatchMultiplier: true,
      checkoutBonusOverrides: { FINAL: 3 },
      rebuyPointsMultiplier: 1,
      podiumPointsOverride: { first: 3, second: 2, third: 1 },
    },
    rebuy: {
      lockAfterKnockoutStart: true,
      jackpotContributionMultiplier: 1,
    },
  },
];

function policyMatchesSoiree(policy: SoireeRulePolicy, soiree: SoireeLike, season: SeasonLike): boolean {
  if (!policy.enabled) return false;

  const triggerSoiree = Number(policy.trigger.soireeNumber ?? 0);
  if (triggerSoiree > 0 && soiree.number !== triggerSoiree) return false;

  if (policy.trigger.lastSoireeOfSeason) {
    const maxSoiree = Math.max(...season.soirees.map((s) => Number(s.number) || 0), 0);
    if (soiree.number !== maxSoiree) return false;
  }

  return true;
}

export function getActiveSoireeRulePolicy(
  soiree: SoireeLike,
  season: SeasonLike,
  policies: SoireeRulePolicy[]
): SoireeRulePolicy | null {
  const ordered = [...policies];
  for (const policy of ordered) {
    if (policyMatchesSoiree(policy, soiree, season)) return policy;
  }
  return null;
}

export function resolveSoireeRuleContext(
  soiree: SoireeLike,
  season: SeasonLike,
  policies: SoireeRulePolicy[]
): ResolvedRuleContext {
  const policy = getActiveSoireeRulePolicy(soiree, season, policies);
  return {
    policy,
    matchWinMultiplier: Math.max(1, Number(policy?.scoring.matchWinMultiplier ?? 1)),
    checkoutBonusMultiplierWithMatchMultiplier: Boolean(policy?.scoring.checkoutBonusMultiplierWithMatchMultiplier),
    checkoutBonusOverrides: policy?.scoring.checkoutBonusOverrides ?? {},
    rebuyPointsMultiplier: Math.max(0, Number(policy?.scoring.rebuyPointsMultiplier ?? 1)),
    rebuyLockAfterKnockoutStart: Boolean(policy?.rebuy.lockAfterKnockoutStart),
    rebuyJackpotContributionMultiplier: Math.max(0, Number(policy?.rebuy.jackpotContributionMultiplier ?? 1)),
    podiumPointsOverride: policy?.scoring.podiumPointsOverride,
  };
}

export function hasKnockoutStarted(soiree: SoireeLike): boolean {
  return soiree.matches.some((m) => {
    if (m.phase === "POULE") return false;
    return Boolean((m.a && m.b) || m.winner);
  });
}
