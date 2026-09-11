export type BreakPricingChecklistItem = {
  id: string
  card_number?: string | null
  player_name?: string | null
  printed_team?: string | null
  parallel_name?: string | null
  variation?: string | null
  rookie_flag?: boolean | null
  auto_flag?: boolean | null
  relic_flag?: boolean | null
  serial_flag?: boolean | null
  print_run?: number | null
  quantity_required?: number | null
  notes?: string | null
}

export type BreakPricingMode = 'pyt' | 'pyp'

export type BreakPricingWeights = {
  baseCard: number
  rookieBonus: number
  autoBonus: number
  relicBonus: number
  serialBonus: number
  parallelBonus: number
  variationBonus: number
  printRun100OrLessBonus: number
  printRun50OrLessBonus: number
  printRun25OrLessBonus: number
  printRun10OrLessBonus: number
  printRun5OrLessBonus: number
  oneOfOneBonus: number
}

export type PlayerDemandOverride = {
  playerName: string
  multiplier: number
  label?: string
}

export type BreakPricingOptions = {
  mode: BreakPricingMode
  targetRevenue: number
  roundTo?: number
  minimumSpotPrice?: number
  defaultPlayerPrice?: number
  weights?: Partial<BreakPricingWeights>
  playerDemandOverrides?: PlayerDemandOverride[]
}

export type SpotPricingSource = {
  sourceName: string
  sourceType: 'team' | 'player'
  teamName: string | null
  playerName: string | null
}

export type SpotPricingInput = {
  id: string
  spotName: string
  sources: SpotPricingSource[]
}

export type PlayerContribution = {
  playerName: string
  rawPoints: number
  demandMultiplier: number
  weightedPoints: number
  demandLabel: string | null
}

export type SpotScoreBreakdown = {
  checklistRows: number
  quantityWeightedCards: number
  rookies: number
  autos: number
  relics: number
  serials: number
  parallels: number
  variations: number
  lowNumbered100OrLess: number
  lowNumbered50OrLess: number
  lowNumbered25OrLess: number
  lowNumbered10OrLess: number
  lowNumbered5OrLess: number
  oneOfOnes: number
  rawChecklistPoints: number
  demandAdjustedPoints: number
}

export type SpotPricingSuggestion = {
  spotId: string
  spotName: string
  score: number
  rawSuggestedPrice: number
  suggestedPrice: number
  breakdown: SpotScoreBreakdown
  topPlayerContributors: PlayerContribution[]
}

export type BreakPricingResult = {
  mode: BreakPricingMode
  targetRevenue: number
  minimumTotal: number
  calculatedTotal: number
  differenceFromTarget: number
  suggestions: SpotPricingSuggestion[]
  weights: BreakPricingWeights
}

export const DEFAULT_BREAK_PRICING_WEIGHTS: BreakPricingWeights = {
  baseCard: 2,
  rookieBonus: 2,
  autoBonus: 8,
  relicBonus: 3,
  serialBonus: 4,
  parallelBonus: 1.5,
  variationBonus: 1.5,
  printRun100OrLessBonus: 1,
  printRun50OrLessBonus: 2,
  printRun25OrLessBonus: 3,
  printRun10OrLessBonus: 5,
  printRun5OrLessBonus: 8,
  oneOfOneBonus: 15,
}

/**
 * Player demand is intentionally data-driven.
 *
 * The pricing engine itself does not hard-code player names or multipliers.
 * Callers should provide resolved demand profiles from HITS data
 * (for example breaker_player_demand_resolved). If a player is not supplied,
 * the engine safely falls back to a neutral 1.0x multiplier.
 */
export const DEFAULT_PLAYER_DEMAND_OVERRIDES: PlayerDemandOverride[] = []

function clean(value: string | null | undefined) {
  return String(value ?? '').trim()
}

export function normalizePricingName(value: string | null | undefined) {
  return clean(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function positiveNumber(value: number | null | undefined, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function nonNegativeNumber(value: number | null | undefined, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : fallback
}

function normalizeRoundTo(value: number | null | undefined) {
  const roundTo = Number(value)
  return Number.isFinite(roundTo) && roundTo > 0 ? roundTo : 1
}

function roundToIncrement(value: number, increment: number) {
  if (!Number.isFinite(value)) return 0
  const safeIncrement = normalizeRoundTo(increment)
  return Math.round(value / safeIncrement) * safeIncrement
}

function mergeWeights(
  overrides?: Partial<BreakPricingWeights>
): BreakPricingWeights {
  return {
    ...DEFAULT_BREAK_PRICING_WEIGHTS,
    ...(overrides ?? {}),
  }
}

function buildDemandMap(overrides?: PlayerDemandOverride[]) {
  const map = new Map<
    string,
    {
      multiplier: number
      label: string | null
    }
  >()

  const merged = [
    ...DEFAULT_PLAYER_DEMAND_OVERRIDES,
    ...(overrides ?? []),
  ]

  for (const override of merged) {
    const key = normalizePricingName(override.playerName)
    if (!key) continue

    const multiplier = positiveNumber(override.multiplier, 1)

    map.set(key, {
      multiplier,
      label: clean(override.label) || null,
    })
  }

  return map
}

function printRunBonus(
  printRun: number | null | undefined,
  weights: BreakPricingWeights
) {
  const run = Number(printRun)

  if (!Number.isFinite(run) || run <= 0) {
    return 0
  }

  if (run === 1) return weights.oneOfOneBonus
  if (run <= 5) return weights.printRun5OrLessBonus
  if (run <= 10) return weights.printRun10OrLessBonus
  if (run <= 25) return weights.printRun25OrLessBonus
  if (run <= 50) return weights.printRun50OrLessBonus
  if (run <= 100) return weights.printRun100OrLessBonus

  return 0
}

function scoreChecklistItem(
  item: BreakPricingChecklistItem,
  weights: BreakPricingWeights
) {
  const quantity = Math.max(1, Math.trunc(positiveNumber(item.quantity_required, 1)))

  let points = weights.baseCard

  if (item.rookie_flag) points += weights.rookieBonus
  if (item.auto_flag) points += weights.autoBonus
  if (item.relic_flag) points += weights.relicBonus
  if (item.serial_flag) points += weights.serialBonus
  if (clean(item.parallel_name)) points += weights.parallelBonus
  if (clean(item.variation)) points += weights.variationBonus

  points += printRunBonus(item.print_run, weights)

  return {
    quantity,
    pointsPerCopy: points,
    totalPoints: points * quantity,
  }
}


function scoreChecklistItemQuality(
  item: BreakPricingChecklistItem,
  weights: BreakPricingWeights
) {
  const quantity = Math.max(1, Math.trunc(positiveNumber(item.quantity_required, 1)))

  let points = 0

  if (item.rookie_flag) points += weights.rookieBonus
  if (item.auto_flag) points += weights.autoBonus
  if (item.relic_flag) points += weights.relicBonus
  if (item.serial_flag) points += weights.serialBonus
  if (clean(item.parallel_name)) points += weights.parallelBonus
  if (clean(item.variation)) points += weights.variationBonus

  points += printRunBonus(item.print_run, weights)

  return {
    quantity,
    pointsPerCopy: points,
    totalPoints: points * quantity,
  }
}

function spotContainsItem(
  spot: SpotPricingInput,
  item: BreakPricingChecklistItem
) {
  if (spot.sources.length === 0) return false

  const itemTeam = normalizePricingName(item.printed_team)
  const itemPlayer = normalizePricingName(item.player_name)

  return spot.sources.some((source) => {
    if (source.sourceType === 'team') {
      const sourceTeam = normalizePricingName(source.teamName ?? source.sourceName)
      return Boolean(sourceTeam) && sourceTeam === itemTeam
    }

    const sourcePlayer = normalizePricingName(
      source.playerName ?? source.sourceName
    )

    if (!sourcePlayer || sourcePlayer !== itemPlayer) {
      return false
    }

    const sourceTeam = normalizePricingName(source.teamName)

    if (!sourceTeam) {
      return true
    }

    return sourceTeam === itemTeam
  })
}

function emptyBreakdown(): SpotScoreBreakdown {
  return {
    checklistRows: 0,
    quantityWeightedCards: 0,
    rookies: 0,
    autos: 0,
    relics: 0,
    serials: 0,
    parallels: 0,
    variations: 0,
    lowNumbered100OrLess: 0,
    lowNumbered50OrLess: 0,
    lowNumbered25OrLess: 0,
    lowNumbered10OrLess: 0,
    lowNumbered5OrLess: 0,
    oneOfOnes: 0,
    rawChecklistPoints: 0,
    demandAdjustedPoints: 0,
  }
}

function addPrintRunCounts(
  breakdown: SpotScoreBreakdown,
  printRun: number | null | undefined
) {
  const run = Number(printRun)
  if (!Number.isFinite(run) || run <= 0) return

  if (run === 1) {
    breakdown.oneOfOnes += 1
    return
  }

  if (run <= 5) {
    breakdown.lowNumbered5OrLess += 1
    return
  }

  if (run <= 10) {
    breakdown.lowNumbered10OrLess += 1
    return
  }

  if (run <= 25) {
    breakdown.lowNumbered25OrLess += 1
    return
  }

  if (run <= 50) {
    breakdown.lowNumbered50OrLess += 1
    return
  }

  if (run <= 100) {
    breakdown.lowNumbered100OrLess += 1
  }
}


function demandBonusRatio(multiplier: number, mode: BreakPricingMode) {
  const safeMultiplier = positiveNumber(multiplier, 1)

  if (safeMultiplier <= 1) {
    return 0
  }

  /**
   * Demand is intentionally a bounded bonus rather than a direct multiplier.
   *
   * Example:
   *   A stored 5x demand signal does NOT make every checklist opportunity
   *   worth five times as much.
   *
   * PYT needs stronger protection from a single superstar overwhelming the
   * whole team spot, so its bonus is capped more tightly.
   *
   * PYP can tolerate a larger demand effect because the player itself is the
   * product being sold.
   */
  const logarithmicSignal = Math.log2(safeMultiplier)

  if (mode === 'pyp') {
    return Math.min(4, logarithmicSignal * 0.85)
  }

  return Math.min(0.75, logarithmicSignal * 0.2)
}


function compressPricingScore(score: number, mode: BreakPricingMode) {
  const safeScore = Math.max(0, score)

  if (safeScore <= 0) {
    return 0
  }

  /**
   * Break prices usually bunch together more than raw checklist-point totals.
   * A power below 1 preserves ordering while compressing the distance between
   * the strongest and weakest spots.
   *
   * PYT is compressed more aggressively so the top 3-5 teams stay closer.
   * PYP retains more separation because star-player demand can legitimately
   * create a much wider price range.
   */
  const exponent = mode === 'pyp' ? 0.9 : 0.72

  return Math.pow(safeScore, exponent)
}

function scoreSpot(
  spot: SpotPricingInput,
  checklistItems: BreakPricingChecklistItem[],
  weights: BreakPricingWeights,
  demandMap: Map<string, { multiplier: number; label: string | null }>,
  mode: BreakPricingMode
) {
  const breakdown = emptyBreakdown()
  const playerMap = new Map<string, PlayerContribution>()
  let qualityPoints = 0

  for (const item of checklistItems) {
    if (!spotContainsItem(spot, item)) continue

    const breadthScore = scoreChecklistItem(item, {
      ...weights,
      rookieBonus: 0,
      autoBonus: 0,
      relicBonus: 0,
      serialBonus: 0,
      parallelBonus: 0,
      variationBonus: 0,
      printRun100OrLessBonus: 0,
      printRun50OrLessBonus: 0,
      printRun25OrLessBonus: 0,
      printRun10OrLessBonus: 0,
      printRun5OrLessBonus: 0,
      oneOfOneBonus: 0,
    })
    const qualityScore = scoreChecklistItemQuality(item, weights)

    const playerName = clean(item.player_name) || 'Unknown / Unassigned'
    const playerKey = normalizePricingName(playerName)
    const demand = demandMap.get(playerKey) ?? {
      multiplier: 1,
      label: null,
    }

    const bonusRatio = demandBonusRatio(demand.multiplier, mode)
    const demandBonusPoints = qualityScore.totalPoints * bonusRatio
    const demandAdjustedQuality = qualityScore.totalPoints + demandBonusPoints

    breakdown.checklistRows += 1
    breakdown.quantityWeightedCards += breadthScore.quantity
    breakdown.rawChecklistPoints += breadthScore.totalPoints
    qualityPoints += demandAdjustedQuality

    if (item.rookie_flag) breakdown.rookies += 1
    if (item.auto_flag) breakdown.autos += 1
    if (item.relic_flag) breakdown.relics += 1
    if (item.serial_flag) breakdown.serials += 1
    if (clean(item.parallel_name)) breakdown.parallels += 1
    if (clean(item.variation)) breakdown.variations += 1

    addPrintRunCounts(breakdown, item.print_run)

    const existing = playerMap.get(playerKey)

    if (existing) {
      existing.rawPoints += qualityScore.totalPoints
      existing.weightedPoints += demandAdjustedQuality
    } else {
      playerMap.set(playerKey, {
        playerName,
        rawPoints: qualityScore.totalPoints,
        demandMultiplier: demand.multiplier,
        weightedPoints: demandAdjustedQuality,
        demandLabel: demand.label,
      })
    }
  }

  breakdown.demandAdjustedPoints = qualityPoints

  const topPlayerContributors = Array.from(playerMap.values())
    .sort((a, b) => b.weightedPoints - a.weightedPoints)
    .slice(0, 5)

  return {
    breakdown,
    topPlayerContributors,
    breadthPoints: breakdown.rawChecklistPoints,
    qualityPoints,
  }
}

function distributeTarget(
  scoredSpots: Array<{
    spot: SpotPricingInput
    score: number
    breakdown: SpotScoreBreakdown
    topPlayerContributors: PlayerContribution[]
  }>,
  options: BreakPricingOptions
) {
  const targetRevenue = nonNegativeNumber(options.targetRevenue)
  const roundTo = normalizeRoundTo(options.roundTo)

  const minimumSpotPrice =
    options.mode === 'pyp'
      ? nonNegativeNumber(
          options.defaultPlayerPrice ?? options.minimumSpotPrice,
          0
        )
      : nonNegativeNumber(options.minimumSpotPrice, 0)

  const minimumTotal = minimumSpotPrice * scoredSpots.length
  const distributable = Math.max(0, targetRevenue - minimumTotal)

  const totalScore = scoredSpots.reduce(
    (sum, row) => sum + Math.max(0, row.score),
    0
  )

  const equalShare =
    scoredSpots.length > 0 ? distributable / scoredSpots.length : 0

  let suggestions: SpotPricingSuggestion[] = scoredSpots.map((row) => {
    const variableShare =
      totalScore > 0
        ? (Math.max(0, row.score) / totalScore) * distributable
        : equalShare

    const rawSuggestedPrice = minimumSpotPrice + variableShare
    const suggestedPrice = roundToIncrement(rawSuggestedPrice, roundTo)

    return {
      spotId: row.spot.id,
      spotName: row.spot.spotName,
      score: row.score,
      rawSuggestedPrice,
      suggestedPrice,
      breakdown: row.breakdown,
      topPlayerContributors: row.topPlayerContributors,
    }
  })

  /**
   * Rounding can move the total away from the requested target. Walk the
   * highest-value spots first and correct by one increment at a time so the
   * displayed total stays as close as practical to the target.
   */
  const targetRounded = roundToIncrement(
    Math.max(targetRevenue, minimumTotal),
    roundTo
  )

  let calculatedTotal = suggestions.reduce(
    (sum, row) => sum + row.suggestedPrice,
    0
  )

  let difference = targetRounded - calculatedTotal

  if (suggestions.length > 0 && Math.abs(difference) >= roundTo / 2) {
    const ranked = [...suggestions].sort((a, b) => b.score - a.score)
    const maxIterations = 10000
    let iteration = 0
    let index = 0

    while (Math.abs(difference) >= roundTo / 2 && iteration < maxIterations) {
      const row = ranked[index % ranked.length]

      if (difference > 0) {
        row.suggestedPrice += roundTo
      } else if (row.suggestedPrice - roundTo >= minimumSpotPrice) {
        row.suggestedPrice -= roundTo
      }

      calculatedTotal = suggestions.reduce(
        (sum, suggestion) => sum + suggestion.suggestedPrice,
        0
      )
      difference = targetRounded - calculatedTotal

      iteration += 1
      index += 1

      if (
        difference < 0 &&
        ranked.every(
          (suggestion) =>
            suggestion.suggestedPrice - roundTo < minimumSpotPrice
        )
      ) {
        break
      }
    }
  }

  suggestions = suggestions.sort((a, b) => {
    if (b.suggestedPrice !== a.suggestedPrice) {
      return b.suggestedPrice - a.suggestedPrice
    }

    return a.spotName.localeCompare(b.spotName, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  })

  calculatedTotal = suggestions.reduce(
    (sum, row) => sum + row.suggestedPrice,
    0
  )

  return {
    suggestions,
    minimumTotal,
    calculatedTotal,
    differenceFromTarget: calculatedTotal - targetRevenue,
  }
}

export function calculateBreakPricing(
  spots: SpotPricingInput[],
  checklistItems: BreakPricingChecklistItem[],
  options: BreakPricingOptions
): BreakPricingResult {
  const weights = mergeWeights(options.weights)
  const demandMap = buildDemandMap(options.playerDemandOverrides)

  const rawScoredSpots = spots.map((spot) => {
    const scored = scoreSpot(
      spot,
      checklistItems,
      weights,
      demandMap,
      options.mode
    )

    return {
      spot,
      breadthPoints: scored.breadthPoints,
      qualityPoints: scored.qualityPoints,
      breakdown: scored.breakdown,
      topPlayerContributors: scored.topPlayerContributors,
    }
  })

  const totalBreadth = rawScoredSpots.reduce(
    (sum, row) => sum + Math.max(0, row.breadthPoints),
    0
  )

  const totalQuality = rawScoredSpots.reduce(
    (sum, row) => sum + Math.max(0, row.qualityPoints),
    0
  )

  const breadthWeight = options.mode === 'pyp' ? 0.35 : 0.6
  const qualityWeight = 1 - breadthWeight

  const scoredSpots = rawScoredSpots.map((row) => {
    const breadthShare =
      totalBreadth > 0 ? Math.max(0, row.breadthPoints) / totalBreadth : 0

    const qualityShare =
      totalQuality > 0 ? Math.max(0, row.qualityPoints) / totalQuality : 0

    const blendedShare =
      breadthShare * breadthWeight + qualityShare * qualityWeight

    /**
     * Use the blended share directly as the pricing score.
     * This guarantees checklist breadth has a defined influence on PYT pricing
     * instead of competing indirectly against autos/rookies/etc.
     */
    const score = blendedShare

    return {
      spot: row.spot,
      score,
      breakdown: row.breakdown,
      topPlayerContributors: row.topPlayerContributors,
    }
  })

  const distributed = distributeTarget(scoredSpots, options)

  return {
    mode: options.mode,
    targetRevenue: nonNegativeNumber(options.targetRevenue),
    minimumTotal: distributed.minimumTotal,
    calculatedTotal: distributed.calculatedTotal,
    differenceFromTarget: distributed.differenceFromTarget,
    suggestions: distributed.suggestions,
    weights,
  }
}

export function getDemandMultiplier(
  playerName: string,
  overrides?: PlayerDemandOverride[]
) {
  const map = buildDemandMap(overrides)
  const result = map.get(normalizePricingName(playerName))

  return result?.multiplier ?? 1
}

export function describeSpotPricing(
  suggestion: SpotPricingSuggestion
) {
  const parts: string[] = []

  parts.push(`${suggestion.breakdown.checklistRows} checklist rows`)

  if (suggestion.breakdown.autos > 0) {
    parts.push(`${suggestion.breakdown.autos} autos`)
  }

  if (suggestion.breakdown.rookies > 0) {
    parts.push(`${suggestion.breakdown.rookies} rookies`)
  }

  if (suggestion.breakdown.relics > 0) {
    parts.push(`${suggestion.breakdown.relics} relics`)
  }

  if (suggestion.breakdown.serials > 0) {
    parts.push(`${suggestion.breakdown.serials} serial-marked`)
  }

  const demandPlayers = suggestion.topPlayerContributors.filter(
    (player) => player.demandMultiplier > 1
  )

  if (demandPlayers.length > 0) {
    parts.push(
      `demand: ${demandPlayers
        .slice(0, 3)
        .map(
          (player) =>
            `${player.playerName} ${player.demandMultiplier.toFixed(1)}× signal`
        )
        .join(', ')}`
    )
  }

  return parts.join(' • ')
}
