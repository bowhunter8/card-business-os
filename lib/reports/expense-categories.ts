export type ExpenseCategoryDefinition = {
  category: string
  scheduleCArea: string
  keywords: string[]
}

export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategoryDefinition[] = [
  {
    category: 'Advertising / Marketing',
    scheduleCArea: 'Advertising',
    keywords: ['advertising', 'marketing', 'promo'],
  },
  {
    category: 'Giveaways',
    scheduleCArea: 'Advertising',
    keywords: ['giveaway', 'freebie'],
  },
  {
    category: 'Postage / Shipping',
    scheduleCArea: 'Other expenses / Postage and shipping',
    keywords: ['shipping', 'postage'],
  },
  {
    category: 'Shipping Supplies',
    scheduleCArea: 'Supplies',
    keywords: ['supplies', 'mailer', 'toploader'],
  },
  {
    category: 'Office Expense',
    scheduleCArea: 'Office expense',
    keywords: ['office'],
  },
  {
    category: 'Software / Subscriptions',
    scheduleCArea: 'Other expenses / Software and subscriptions',
    keywords: ['software', 'subscription'],
  },
  {
    category: 'Equipment',
    scheduleCArea: 'Other expenses / Equipment review',
    keywords: ['equipment'],
  },
  {
    category: 'Grading / Authentication',
    scheduleCArea: 'Other expenses / Grading and authentication',
    keywords: ['grading', 'authentication'],
  },
  {
    category: 'Travel',
    scheduleCArea: 'Travel',
    keywords: ['travel'],
  },
  {
    category: 'Education',
    scheduleCArea: 'Other expenses / Education',
    keywords: ['education'],
  },
  {
    category: 'Utilities',
    scheduleCArea: 'Utilities',
    keywords: ['utilities'],
  },
  {
    category: 'Insurance',
    scheduleCArea: 'Insurance',
    keywords: ['insurance'],
  },
  {
    category: 'Legal / Professional',
    scheduleCArea: 'Legal and professional services',
    keywords: ['legal', 'professional'],
  },
  {
    category: 'Taxes / Licenses',
    scheduleCArea: 'Taxes and licenses',
    keywords: ['tax', 'license'],
  },
  {
    category: 'Repairs / Maintenance',
    scheduleCArea: 'Repairs and maintenance',
    keywords: ['repair', 'maintenance'],
  },
  {
    category: 'Uncategorized',
    scheduleCArea: 'Other expenses',
    keywords: [],
  },
]

export function getExpenseScheduleCArea(category: string) {
  const normalized = category.trim().toLowerCase()

  const match = DEFAULT_EXPENSE_CATEGORIES.find((item) =>
    item.keywords.some((keyword) => normalized.includes(keyword))
  )

  return match?.scheduleCArea ?? 'Other expenses'
}

export function getExpenseCategoryOptions(existing: string[] = []) {
  const defaults = DEFAULT_EXPENSE_CATEGORIES.map((item) => item.category)

  return Array.from(new Set([...defaults, ...existing])).sort((a, b) =>
    a.localeCompare(b, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  )
}