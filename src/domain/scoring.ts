import {
  type ResolvedRuleContext,
  type RulePhase,
  type SoireeRulePolicy,
  resolveSoireeRuleContext,
} from "./soireeRules";

export type RulesConfigLike = {
  winPoints: number;
  smallFinalPoints: number;
  checkoutBonusPoints: number;
  jackpotPerPlayerEUR: number;
  rebuyEUR: number;
  rebuyWinPointsS1S2: number;
  rebuyFirstWinPointsS3Plus: number;
  rebuyNextWinPointsS3Plus: number;
};

export type CoreMatchLike = {
  phase: RulePhase;
  a: string;
  b: string;
  winner: string;
  checkoutBy: "" | "A" | "B";
};

export type RebuyMatchLike = {
  buyer: string;
  winner: string;
  createdAt: number;
};

export type SoireeLike = {
  number: number;
  pools: { A: string[]; B: string[] };
  matches: CoreMatchLike[];
  rebuys: RebuyMatchLike[];
};

export type SeasonLike = {
  players: string[];
  soirees: SoireeLike[];
};

const norm = (value: string) => (value ?? "").toString().trim();

function getMatchWinPoints(match: CoreMatchLike, rules: RulesConfigLike, ctx: ResolvedRuleContext) {
  const base = match.phase === "PFINAL" ? rules.smallFinalPoints : rules.winPoints;
  return base * ctx.matchWinMultiplier;
}

function getCheckoutPoints(match: CoreMatchLike, rules: RulesConfigLike, ctx: ResolvedRuleContext) {
  const override = ctx.checkoutBonusOverrides[match.phase];
  if (typeof override === "number") return override;
  if (ctx.checkoutBonusMultiplierWithMatchMultiplier) return rules.checkoutBonusPoints * ctx.matchWinMultiplier;
  return rules.checkoutBonusPoints;
}

function computePodiumOverridePoints(matches: CoreMatchLike[], ctx: ResolvedRuleContext) {
  const out = new Map<string, number>();
  const add = (name: string, value: number) => {
    const p = norm(name);
    if (!p) return;
    out.set(p, (out.get(p) ?? 0) + value);
  };

  if (!ctx.podiumPointsOverride) return out;
  const final = matches.find((m) => m.phase === "FINAL");
  const pfinal = matches.find((m) => m.phase === "PFINAL");
  const first = norm(final?.winner ?? "");
  const second =
    first && first === norm(final?.a ?? "")
      ? norm(final?.b ?? "")
      : first && first === norm(final?.b ?? "")
        ? norm(final?.a ?? "")
        : "";
  const third = norm(pfinal?.winner ?? "");

  if (!first || !second || !third) return out;
  add(first, ctx.podiumPointsOverride.first);
  add(second, ctx.podiumPointsOverride.second);
  add(third, ctx.podiumPointsOverride.third);
  return out;
}

export function computePointsFromMatchesWithPolicies(
  matches: CoreMatchLike[],
  rebuyMatches: RebuyMatchLike[],
  seasonSoireeNumber: number | undefined,
  season: SeasonLike | undefined,
  rules: RulesConfigLike,
  policies: SoireeRulePolicy[]
) {
  const pts = new Map<string, number>();
  const wins = new Map<string, number>();
  const bonus = new Map<string, number>();
  const add = (map: Map<string, number>, key: string, delta: number) => {
    const k = norm(key);
    if (!k) return;
    map.set(k, (map.get(k) ?? 0) + delta);
  };

  const soN = Number(seasonSoireeNumber ?? 0);
  const ctx = resolveSoireeRuleContext(
    { number: soN, matches },
    season ?? { players: [], soirees: [] },
    policies
  );

  for (const m of matches) {
    const winner = norm(m.winner);
    if (winner) {
      add(pts, winner, getMatchWinPoints(m, rules, ctx));
      add(wins, winner, 1);
    }
    const checkoutPoints = getCheckoutPoints(m, rules, ctx);
    if (m.checkoutBy === "A") {
      add(bonus, m.a, 1);
      add(pts, m.a, checkoutPoints);
    } else if (m.checkoutBy === "B") {
      add(bonus, m.b, 1);
      add(pts, m.b, checkoutPoints);
    }
  }

  const priorCompleted = new Map<string, number>();
  if (soN >= 3 && season) {
    const soireesAsc = [...season.soirees].sort((a, b) => a.number - b.number);
    for (const s of soireesAsc) {
      if (s.number >= soN) break;
      for (const rb of s.rebuys) {
        const buyer = norm(rb.buyer);
        const winner = norm(rb.winner);
        if (!buyer || !winner) continue;
        priorCompleted.set(buyer, (priorCompleted.get(buyer) ?? 0) + 1);
      }
    }
  }

  const sortedRebuys = [...rebuyMatches].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  const localCompleted = new Map<string, number>();
  const doneBefore = (buyer: string) => (priorCompleted.get(buyer) ?? 0) + (localCompleted.get(buyer) ?? 0);
  const incLocalDone = (buyer: string) => localCompleted.set(buyer, (localCompleted.get(buyer) ?? 0) + 1);

  for (const r of sortedRebuys) {
    const buyer = norm(r.buyer);
    const winner = norm(r.winner);
    if (!buyer || !winner) continue;

    let rebuyWinPts: number;
    if (soN > 0 && soN <= 2) {
      rebuyWinPts = rules.rebuyWinPointsS1S2;
    } else {
      rebuyWinPts =
        soN >= 3
          ? doneBefore(buyer) === 0
            ? rules.rebuyFirstWinPointsS3Plus
            : rules.rebuyNextWinPointsS3Plus
          : rules.rebuyWinPointsS1S2;
    }
    rebuyWinPts *= ctx.rebuyPointsMultiplier;

    if (winner === buyer) {
      add(pts, buyer, rebuyWinPts);
      add(wins, buyer, 1);
    }

    incLocalDone(buyer);
  }

  const extraPodiumPts = computePodiumOverridePoints(matches, ctx);
  for (const [name, value] of extraPodiumPts.entries()) add(pts, name, value);

  return { pts, wins, bonus };
}

export function computeJackpotEURWithPolicies(
  season: SeasonLike,
  rules: RulesConfigLike,
  policies: SoireeRulePolicy[]
) {
  let total = 0;
  for (const s of season.soirees) {
    const playersCount = (s.pools.A?.length ?? 0) + (s.pools.B?.length ?? 0);
    total += playersCount * rules.jackpotPerPlayerEUR;
    const ctx = resolveSoireeRuleContext(s, season, policies);
    total += (s.rebuys?.length ?? 0) * rules.rebuyEUR * ctx.rebuyJackpotContributionMultiplier;
  }
  return total;
}
