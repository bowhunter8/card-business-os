export function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : fallback
}

export function sumBy<T>(
  rows: T[],
  selector: (row: T) => number | null | undefined
) {
  return rows.reduce(
    (sum, row) => sum + safeNumber(selector(row)),
    0
  )
}

export function averageBy<T>(
  rows: T[],
  selector: (row: T) => number | null | undefined
) {
  if (rows.length === 0) {
    return 0
  }

  return sumBy(rows, selector) / rows.length
}

export function countBy<T>(
  rows: T[],
  selector: (row: T) => string | null | undefined
) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const key = String(selector(row) ?? 'unknown').trim() || 'unknown'

    counts[key] = (counts[key] ?? 0) + 1

    return counts
  }, {})
}

export function groupSumBy<T>(
  rows: T[],
  groupSelector: (row: T) => string | null | undefined,
  valueSelector: (row: T) => number | null | undefined
) {
  return rows.reduce<Record<string, number>>((totals, row) => {
    const key = String(groupSelector(row) ?? 'unknown').trim() || 'unknown'

    totals[key] = (totals[key] ?? 0) + safeNumber(valueSelector(row))

    return totals
  }, {})
}

export function calculateInventoryTotals<
  T extends {
    quantity?: number | null
    available_quantity?: number | null
    cost_basis_total?: number | null
    estimated_value_total?: number | null
  }
>(
  rows: T[]
) {
  const totalItems = rows.length

  const totalQuantity = sumBy(
    rows,
    (row) => row.available_quantity ?? row.quantity ?? 0
  )

  const totalCostBasis = sumBy(
    rows,
    (row) => row.cost_basis_total
  )

  const totalEstimatedValue = sumBy(
    rows,
    (row) => row.estimated_value_total
  )

  const estimatedGainLoss =
    totalEstimatedValue - totalCostBasis

  return {
    totalItems,
    totalQuantity,
    totalCostBasis,
    totalEstimatedValue,
    estimatedGainLoss,
  }
}

export function calculateSalesTotals<
  T extends {
    sale_price?: number | null
    shipping_charged?: number | null
    fees_total?: number | null
    net_profit?: number | null
    cost_basis_total?: number | null
  }
>(
  rows: T[]
) {
  const totalSales = rows.length

  const grossSales = sumBy(
    rows,
    (row) => row.sale_price
  )

  const shippingCollected = sumBy(
    rows,
    (row) => row.shipping_charged
  )

  const totalFees = sumBy(
    rows,
    (row) => row.fees_total
  )

  const totalCOGS = sumBy(
    rows,
    (row) => row.cost_basis_total
  )

  const totalNetProfit = sumBy(
    rows,
    (row) => row.net_profit
  )

  return {
    totalSales,
    grossSales,
    shippingCollected,
    totalFees,
    totalCOGS,
    totalNetProfit,
  }
}

export function calculateExpenseTotals<
  T extends {
    amount?: number | null
  }
>(
  rows: T[]
) {
  const totalExpenses = rows.length

  const totalExpenseAmount = sumBy(
    rows,
    (row) => row.amount
  )

  return {
    totalExpenses,
    totalExpenseAmount,
  }
}

export function calculateOpenLotTotals<
  T extends {
    quantity?: number | null
    available_quantity?: number | null
    cost_basis_total?: number | null
  }
>(
  rows: T[]
) {
  const openLots = rows.filter((row) => {
    const quantity = safeNumber(row.quantity)
    const available = safeNumber(row.available_quantity)

    return quantity > 1 && available > 0 && available < quantity
  })

  return {
    openLotCount: openLots.length,
    openLotQuantity: sumBy(
      openLots,
      (row) => row.available_quantity
    ),
    openLotCostBasis: sumBy(
      openLots,
      (row) => row.cost_basis_total
    ),
  }
}

export function calculateStatusTotals<
  T extends {
    status?: string | null
  }
>(
  rows: T[]
) {
  return countBy(
    rows,
    (row) => row.status
  )
}

export function calculateCategoryTotals<
  T extends {
    category?: string | null
    amount?: number | null
  }
>(
  rows: T[]
) {
  return groupSumBy(
    rows,
    (row) => row.category,
    (row) => row.amount
  )
}

export function calculateAverageSalePrice<
  T extends {
    sale_price?: number | null
  }
>(
  rows: T[]
) {
  return averageBy(
    rows,
    (row) => row.sale_price
  )
}

export function calculateAverageInventoryValue<
  T extends {
    estimated_value_total?: number | null
  }
>(
  rows: T[]
) {
  return averageBy(
    rows,
    (row) => row.estimated_value_total
  )
}
