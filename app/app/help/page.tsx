import Link from 'next/link'

type GuideSection = {
  id: string
  title: string
  description: string
  bullets: string[]
}

const guideSections: GuideSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    description:
      'Use HITS™ as your business record system for inventory, purchases, sales, expenses, reports, and year-end tax support.',
    bullets: [
      'Start by entering or importing inventory with a clear cost basis whenever possible.',
      'Use Orders, Breaks, or Purchases to track what you bought before items are entered into inventory.',
      'Use Sales to record completed sales only after the item actually sells.',
      'Use Expenses for business costs that are not already included in a sale or purchase record.',
      'Use Reports for review, printing, CSV exports, PDF exports, and CPA support.',
    ],
  },

  {
    id: 'starting-inventory',
    title: 'Starting Inventory and Existing Collections',
    description:
      'Starting inventory setup is one of the most important steps for accurate reporting, COGS calculations, and year-end tax preparation.',
    bullets: [
      'If you already owned inventory before using HITS™, enter it as starting inventory instead of pretending it was purchased today.',
      'Try to use real purchase records whenever possible, including receipts, marketplace purchase history, card show notes, spreadsheets, or screenshots.',
      'If exact cost basis is unknown, use a reasonable and consistent estimate method and document how the estimate was created.',
      'Do not mix personal collection items with resale inventory unless they are truly intended for resale business activity.',
      'Large bulk inventory can be entered as lots initially and broken down later as individual items are sorted or sold.',
      'If inventory was received for free, through promotions, or through refunded breaks, document that clearly and use $0 cost basis when appropriate.',
      'Beginning inventory matters because it affects future COGS calculations and year-end inventory reconciliation.',
      'The more consistent your inventory records are, the easier future tax reporting and CPA review becomes.',
    ],
  },
  {
    id: 'break-cost-allocation',
    title: 'Break Cost Allocation and Cost Basis',
    description:
      'Break allocation rules determine how purchase cost flows into inventory and eventually into realized COGS when items sell.',
    bullets: [
      'Example: a $100 break with 10 entered cards would normally allocate approximately $10 cost basis per card.',
      'The system uses consistent allocation methods to create a stable and defensible inventory history.',
      'Equal allocation is used because it creates consistent tracking even when some cards become more valuable later.',
      'Do not manually reduce cost basis after a sale just to make profit look better.',
      'When cards from a lot are sold individually, realized COGS should follow the allocated inventory cost.',
      'If a large lot contains junk cards, stars, inserts, and hits, document the workflow consistently instead of changing numbers later.',
      'Cost basis consistency matters more than trying to perfectly predict future card values.',
      'The goal is a clean, explainable inventory trail that remains understandable during year-end review or CPA analysis.',
    ],
  },
  {
    id: 'inventory',
    title: 'Inventory Basics',
    description:
      'Inventory is the foundation of tax-safe tracking because cost basis starts here and later flows into COGS when items sell.',
    bullets: [
      'Available means the item is owned by the business and can be sold, but may not be listed yet.',
      'Listed means the item is actively listed or offered for sale.',
      'Sold means the item has been sold and should be tied to a sale record.',
      'Personal means the item is being kept for your personal collection and should be separated from business resale inventory.',
      'Junk and disposed statuses help document items that are damaged, worthless, discarded, donated, or otherwise removed from active resale inventory.',
    ],
  },
  {
    id: 'breaks-orders-purchases',
    title: 'Breaks, Orders, and Purchases',
    description:
      'Breaks and purchase records support your inventory cost basis and help prove where inventory came from.',
    bullets: [
      'Record what you paid for breaks, lots, card show buys, direct purchases, or marketplace purchases.',
      'When cards are entered from a break or lot, allocate the cost consistently and keep notes when needed.',
      'If a break is refunded, remove or reverse the original break cost so it is not counted as a business purchase.',
      'If you receive giveaway cards from a refunded break, enter those items separately as $0-cost inventory with notes linking them to the refunded break.',
      'Keep marketplace purchase reports, receipts, screenshots, or CSV exports as backup documentation.',
    ],
  },
  {
    id: 'sales',
    title: 'Sales Workflow',
    description:
      'Sales are where gross receipts, selling costs, shipping, COGS, and profit/loss become realized.',
    bullets: [
      'Record the real gross sale amount. Do not change the sale amount to make profit look better.',
      'Record platform fees, shipping/postage cost, other selling costs, and supplies cost as accurately as possible.',
      'Record shipping charged separately from actual postage when applicable.',
      'When a sale is reversed or refunded, use the reversal workflow instead of deleting history.',
      'A sale at a loss is still recorded honestly. For example, a card bought for $100 and sold for $15 should show the $100 cost basis and the real loss.',
      'Marketplace fees, shipping costs, and supplies costs all affect real profitability and should be tracked consistently.',
      'If inventory is sold from a lot, the allocated lot cost should continue flowing into realized COGS.',
      'Keep notes for unusual situations such as partial refunds, replacements, damaged shipments, or giveaways tied to a sale.',
    ],
  },
  {
    id: 'shipping',
    title: 'Shipping and Supplies',
    description:
      'Shipping profiles provide defaults, while the actual postage cost should be entered per sale.',
    bullets: [
      'Use shipping charged to track what the buyer paid you for shipping.',
      'Use actual postage or shipping cost to track what you paid to ship the item.',
      'Use supplies cost for sleeves, top loaders, team bags, envelopes, labels, bubble mailers, and similar shipping materials.',
      'Shipping charged is income or part of receipts; postage and supplies are costs.',
      'Shipping reports help identify whether shipping is profitable, break-even, or costing the business money.',
    ],
  },
  {
    id: 'expenses',
    title: 'Expenses and Deductions',
    description:
      'Expenses are business costs that are ordinary, necessary, documented, and not already counted somewhere else.',
    bullets: [
      'Common expenses may include supplies, software, platform tools, subscriptions, postage supplies, advertising, grading, and business-related fees.',
      'Do not double count. If a cost is already included in inventory cost basis or sale-level costs, do not enter it again as a separate expense.',
      'Use notes to explain unclear entries, especially giveaways, marketing, write-offs, refunds, and corrections.',
      'Keep receipts, marketplace statements, order summaries, CSV exports, and screenshots as backup.',
      'For final tax filing, review expenses with a CPA or tax professional if you are unsure.',
    ],
  },
  {
    id: 'giveaways',
    title: 'Giveaways, Marketing, and Promotions',
    description:
      'Giveaways can be business marketing costs when used to attract viewers, increase followers, drive bids, retain buyers, or promote sales activity.',
    bullets: [
      'Giveaways may fit Advertising / Marketing expense when there is a clear business purpose.',
      'To safely deduct giveaways, keep clear notes such as “Whatnot stream giveaway,” “buyer retention giveaway,” or link the giveaway to a stream/order.',
      'The item must come from inventory or be recorded as an expense, but not both.',
      'If the giveaway item came from inventory, document the transfer/use so cost basis is not also counted again somewhere else.',
      'Avoid vague records. The safer entry explains why the giveaway happened and how it supported business activity.',
    ],
  },
  {
    id: 'losses-writeoffs',
    title: 'Losses, Write-Offs, Junk, and Disposal',
    description:
      'Business losses should be recorded honestly. Write-offs and disposals need clean records so they are not confused with missing inventory.',
    bullets: [
      'A loss on a sale is not a mistake. If you bought an item for $100 and sold it for $15, record the $100 cost and the $15 sale.',
      'Do not reduce cost basis just to avoid showing a loss.',
      'Junk status can be used for items that need review, have little value, or may later be disposed of.',
      'Disposed should be used when the item is finally removed from inventory due to damage, discard, donation, giveaway, or other documented reason.',
      'Use notes for the reason, date, and business explanation so the record is understandable later.',
    ],
  },
  {
    id: 'reports',
    title: 'Reports',
    description:
      'Reports are read-only views for reviewing business performance, exports, printouts, and CPA support.',
    bullets: [
      'Inventory Report reviews cost basis, value, aging, statuses, and action-needed items.',
      'Sales Report reviews gross sales, fees, shipping, net proceeds, COGS, and profit.',
      'Profit & Loss Statement summarizes income, COGS, selling costs, expenses, and net profit/loss.',
      'Sales Tax Report separates marketplace-handled tax from seller-collected tax that may need review.',
      'COGS Audit & Reconciliation compares beginning inventory, purchases, ending inventory, and realized COGS.',
    ],
  },
  {
    id: 'sales-tax',
    title: 'Sales Tax Responsibility',
    description:
      'Most marketplace sales may have sales tax collected and remitted by the marketplace, but local, direct, or card show sales may need separate review.',
    bullets: [
      'Marketplace handled means the platform collected/remitted sales tax and you are keeping a record for support.',
      'Seller remit means you collected tax or may be responsible for reviewing/remitting it.',
      'No tax collected means no sales tax was collected on that sale.',
      'Exempt or not taxable should be used only when you have a reason to treat the sale that way.',
      'Use tax state and tax notes when a sale needs extra clarification.',
    ],
  },
  {
    id: 'year-end',
    title: 'Year-End Tax Workflow',
    description:
      'Year-end review is where inventory, sales, COGS, expenses, disposals, and tax reports are checked before final filing.',
    bullets: [
      'Review beginning inventory for the year.',
      'Review purchases/imports/breaks for the year.',
      'Review realized COGS from sold items.',
      'Review ending inventory and lock or snapshot it when ready.',
      'Review disposed, junk, giveaway, refunded, and personal collection records before exporting final tax reports.',
      'Run Inventory, Sales, P&L, COGS, COGS Audit, and Sales Tax reports before final export.',
      'Review missing cost basis, unlinked sales, and reconciliation warnings.',
      'Create CSV, PDF, or print export packets for accountant or CPA review.',
      'Create backups before locking final year-end records or making large cleanup changes.',
      'Store source receipts, marketplace exports, and supporting documents outside the app as backup records.',
    ],
  },

  {
    id: 'common-mistakes',
    title: 'Common Mistakes and Recordkeeping Problems',
    description:
      'Most reporting issues come from inconsistent workflows, double counting, missing inventory links, or incomplete year-end review.',
    bullets: [
      'Do not double count expenses that already exist inside inventory cost basis or sale-level costs.',
      'Do not change historical cost basis after a sale simply to improve profitability numbers.',
      'Do not delete completed sales to handle refunds or reversals. Use proper reversal workflows instead.',
      'Do not ignore ending inventory. Unsold inventory still matters for tax calculations.',
      'Do not leave sold items marked as available forever because it creates inventory reconciliation problems.',
      'Do not count giveaway inventory both as inventory cost and separate marketing expense at the same time.',
      'Do not forget to track postage, shipping supplies, and platform fees.',
      'Do not treat personal collection items as resale inventory unless they truly belong to the business.',
      'Do not ignore junk, disposed, or damaged inventory because missing inventory creates confusion during reconciliation.',
      'Review missing COGS, unlinked sales, and audit warnings regularly instead of waiting until tax season.',
    ],
  },
  {
    id: 'cpa-export',
    title: 'CPA and Export Workflow',
    description:
      'Use CSV, PDF, and print exports to create accountant-friendly support packets.',
    bullets: [
      'Use CSV exports for spreadsheets, QuickBooks-style review, TurboTax preparation, and CPA analysis.',
      'Use PDF exports for readable summaries and backup packets.',
      'Use print views for paper records or save-to-PDF workflows.',
      'Do not rely on only one report. A good CPA packet usually includes sales, expenses, COGS, P&L, sales tax, inventory, and year-end tax center exports.',
      'Keep source receipts outside the app as backup whenever possible.',
    ],
  },
]

function SectionCard({ section }: { section: GuideSection }) {
  return (
    <section id={section.id} className="app-section space-y-3 scroll-mt-24">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">{section.title}</h2>
        <p className="mt-1 text-sm leading-6 text-zinc-400">{section.description}</p>
      </div>

      <ul className="space-y-2 text-sm leading-6 text-zinc-300">
        {section.bullets.map((bullet) => (
          <li key={bullet} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function HelpPage() {
  return (
    <main className="app-page space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Help</p>
          <h1 className="app-title">HITS™ User Guide</h1>
          <p className="app-subtitle">
            A practical onboarding guide for inventory, sales, expenses, reports, COGS, write-offs, giveaways, year-end review, and CPA exports.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/app" className="app-button" prefetch={false}>
            Back to Dashboard
          </Link>

          <Link href="/app/reports" className="app-button-primary" prefetch={false}>
            Open Reports
          </Link>
        </div>
      </div>

      <section className="app-section border-amber-900 bg-amber-950/20">
        <h2 className="text-base font-semibold text-amber-100">
          Important Tax Note
        </h2>
        <p className="mt-2 text-sm leading-6 text-amber-100/80">
          This guide is practical recordkeeping support, not legal or tax advice.
          Use the reports to keep cleaner records, then review final filing decisions with a qualified tax professional or CPA.
        </p>
      </section>

      <section className="app-section space-y-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-100">Guide Sections</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Jump to the area you are working on.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {guideSections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="rounded-xl border border-zinc-800 bg-black/30 px-3 py-2 text-sm font-medium text-zinc-100 transition hover:bg-zinc-900"
            >
              {section.title}
            </a>
          ))}
        </div>
      </section>

      {guideSections.map((section) => (
        <SectionCard key={section.id} section={section} />
      ))}

      <section className="app-section space-y-3 border-emerald-900 bg-emerald-950/20">
        <h2 className="text-base font-semibold text-emerald-100">
          Recommended First-Time Setup Checklist
        </h2>

        <div className="grid gap-3 md:grid-cols-2">
          {[
            'Enter or import starting inventory.',
            'Separate personal collection items from business inventory.',
            'Enter breaks, lots, purchases, or order records.',
            'Record sales with gross sale, fees, shipping charged, postage, supplies, COGS, and profit.',
            'Enter business expenses that are not already counted elsewhere.',
            'Run Inventory, Sales, P&L, COGS, Sales Tax, and COGS Audit reports.',
            'Review missing cost basis, unlinked sales, junk/disposed items, and ending inventory before year-end.',
            'Export CSV/PDF/print packets for CPA review.',
          ].map((item) => (
            <div
              key={item}
              className="rounded-xl border border-emerald-900/60 bg-black/20 p-3 text-sm text-emerald-50/90"
            >
              {item}
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
