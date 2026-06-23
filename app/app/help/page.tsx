import Link from 'next/link'

type HelpSection = {
  id: string
  eyebrow: string
  title: string
  summary: string
  bullets: string[]
  href?: string
  linkLabel?: string
}

type QuickLink = {
  label: string
  href: string
  description: string
}

type FaqItem = {
  question: string
  answer: string
}

const quickLinks: QuickLink[] = [
  {
    label: 'Dashboard',
    href: '/app',
    description: 'Start here for your business snapshot and current activity.',
  },
  {
    label: 'Inventory',
    href: '/app/inventory',
    description: 'Add, manage, sell, give away, or dispose of items.',
  },
  {
    label: 'Orders',
    href: '/app/orders',
    description: 'Import Whatnot orders and process received purchases.',
  },
  {
    label: 'Reports Center',
    href: '/app/reports',
    description: 'Review tax, profit, sales, inventory, and CPA-ready reports.',
  },
  {
    label: 'Utilities',
    href: '/app/utilities',
    description: 'Use backups, exports, restore points, and app utilities.',
  },
  {
    label: 'Settings',
    href: '/app/settings',
    description: 'Manage shipping profiles, account options, and tax settings.',
  },
]

const helpSections: HelpSection[] = [
  {
    id: 'getting-started',
    eyebrow: 'Start here',
    title: 'Getting Started with HITS™',
    summary:
      'HITS™ is your record system for inventory, purchases, sales, expenses, reports, and year-end tax support.',
    bullets: [
      'Add inventory manually, through bulk CSV import, or from imported orders.',
      'Record completed sales only after the item actually sells.',
      'Track cost basis, sale price, platform fees, postage, supplies, and shipping charged.',
      'Use reports to review profit, expenses, COGS, sales tax, write-offs, and CPA support.',
    ],
    href: '/app/inventory',
    linkLabel: 'Go to Inventory',
  },
  {
    id: 'inventory',
    eyebrow: 'Items',
    title: 'Inventory Basics',
    summary:
      'Inventory is where available items live before they are sold, given away, disposed of, or otherwise removed from stock.',
    bullets: [
      'Use Player/Item Name as the main required name field.',
      'Cost basis is important for profit, COGS, and tax reporting.',
      'Available items can be sold from inventory when ready.',
      'Items marked as sold, giveaway, or disposed should no longer be treated as available stock.',
    ],
    href: '/app/inventory',
    linkLabel: 'Open Inventory',
  },
  {
    id: 'bulk-import',
    eyebrow: 'CSV',
    title: 'Add Inventory in Bulk',
    summary:
      'Bulk upload is the fastest way to add multiple inventory items from a spreadsheet.',
    bullets: [
      'Download the template from the bulk import page.',
      'Required fields are intentionally minimal: Item/Player Name and Cost.',
      'Optional details like brand, year, card number, condition, purchase date, platform, and order number reduce later data entry.',
      'Duplicate protection helps prevent re-importing the same order or sheet rows by mistake.',
    ],
    href: '/app/inventory/import',
    linkLabel: 'Add Inventory in Bulk',
  },
  {
    id: 'orders',
    eyebrow: 'Purchases',
    title: 'Orders and Orders Received',
    summary:
      'Use Orders for imported marketplace purchases and Orders Received for processing items into inventory.',
    bullets: [
      'Import Whatnot order files when available.',
      'Combine related order lines when needed before creating inventory.',
      'Use the Orders Received tray to track what has been received, entered, and still remains.',
      'HITS™ keeps original platform data while also assigning its own internal tracking information.',
    ],
    href: '/app/orders',
    linkLabel: 'Open Orders',
  },
  {
    id: 'sales',
    eyebrow: 'Revenue',
    title: 'Recording Sales',
    summary:
      'The sale page captures the numbers needed for accurate profit and tax reporting.',
    bullets: [
      'Confirm the Player/Item Name before saving the sale.',
      'Enter sale price, platform fees, postage, supplies cost, shipping charged, platform, and notes as needed.',
      'Category is required at sale so HITS Pulse™ can use anonymous app-wide sales trends.',
      'Shipping profiles can auto-fill common shipping charged and supplies cost amounts.',
    ],
    href: '/app/sales',
    linkLabel: 'View Sales',
  },
  {
    id: 'giveaways',
    eyebrow: 'Givvies',
    title: 'Giveaways',
    summary:
      'Giveaways remove an item from available inventory and record the cost as a business marketing expense.',
    bullets: [
      'Use giveaways for promotional items, stream givvies, customer bonuses, or marketing-related items.',
      'Giveaway cost basis is treated as Advertising/Marketing support.',
      'Add notes so you can explain why the item was given away later.',
      'Once marked as a giveaway, the item should not be sold again.',
    ],
    href: '/app/inventory/giveaway',
    linkLabel: 'Record Giveaway',
  },
  {
    id: 'disposal',
    eyebrow: 'Write-offs',
    title: 'Disposed and Written-Off Items',
    summary:
      'Disposed items are removed from inventory when they can no longer be sold or used in the business.',
    bullets: [
      'Use disposal for damaged, lost, discarded, or otherwise unsellable items.',
      'Always include notes explaining why the item was disposed.',
      'Disposed items should be locked from normal sale flow.',
      'Write-off and disposal activity appears in supporting reports.',
    ],
    href: '/app/reports/write-offs',
    linkLabel: 'View Write-Off Reports',
  },
  {
    id: 'expenses',
    eyebrow: 'Costs',
    title: 'Expenses',
    summary:
      'Expenses track business costs that are not already captured directly inside a sale.',
    bullets: [
      'Common categories include shipping supplies, postage, platform fees, subscriptions, equipment, advertising, and other business costs.',
      'Use clear notes so the expense makes sense later.',
      'Avoid double-entering costs already included on a sale record.',
      'Expenses flow into profit and loss and tax support reports.',
    ],
    href: '/app/expenses',
    linkLabel: 'Open Expenses',
  },
  {
    id: 'reports',
    eyebrow: 'Review',
    title: 'Reports Center',
    summary:
      'Reports are designed to help you understand performance and prepare cleaner records for tax time.',
    bullets: [
      'Use date filters such as daily, weekly, monthly, quarterly, yearly, and custom ranges.',
      'Review sales, inventory, expenses, realized COGS, profit and loss, sales tax, shipping, platform, operations, open lots, and CPA packet reports.',
      'Export CSV, PDF, or print reports when needed.',
      'Use reports regularly so issues are easier to catch before year-end.',
    ],
    href: '/app/reports',
    linkLabel: 'Open Reports Center',
  },
  {
    id: 'tax',
    eyebrow: 'Year-end',
    title: 'Starting Inventory and Tax Year Locking',
    summary:
      'Starting inventory and tax-year locks help preserve year-end records and support beginning inventory carryover.',
    bullets: [
      'Set beginning inventory for the tax year you are working in.',
      'Lock a tax year only after reviewing the numbers carefully.',
      'Unlocking should be used only when corrections are needed.',
      'Inventory snapshots and tax-year activity support later review.',
    ],
    href: '/app/settings/tax-year',
    linkLabel: 'Open Tax Year Settings',
  },
  {
    id: 'shipping',
    eyebrow: 'Defaults',
    title: 'Shipping Profiles',
    summary:
      'Shipping profiles save common shipping charged and supplies cost defaults so sales can be entered faster.',
    bullets: [
      'Create profiles for common situations like eBay standard envelope, ground advantage, or card-show pickup.',
      'Profiles can auto-fill shipping charged and supplies cost on the sale page.',
      'You can still adjust values on individual sales when needed.',
      'Keep profiles simple and named clearly so they are easy to pick during sale entry.',
    ],
    href: '/app/settings/shipping',
    linkLabel: 'Manage Shipping Profiles',
  },
  {
    id: 'backups',
    eyebrow: 'Safety',
    title: 'Backup and Restore Points',
    summary:
      'Restore points help protect your work before major changes and during scheduled backup processing.',
    bullets: [
      'Manual restore points can be created before important changes.',
      'Automatic restore points may be created after major activity such as imports, sales, inventory changes, deletes, restores, or tax locks.',
      'Scheduled processing means a sale or edit may not show a restore point immediately.',
      'Use restore carefully because it is meant to bring records back to an earlier checkpoint.',
    ],
    href: '/app/utilities/backup',
    linkLabel: 'Open Backup Utilities',
  },
  {
    id: 'pulse',
    eyebrow: 'Trends',
    title: 'HITS Pulse™',
    summary:
      'HITS Pulse™ shows anonymous app-wide hobby trends based on completed HITS™ sales activity.',
    bullets: [
      'Pulse data is anonymous and does not show usernames, emails, or seller identity.',
      'Completed sales activity powers trend lists and movement over time.',
      'Category at sale helps improve trend accuracy.',
      'Use Pulse as a general hobby trend signal, not as a guaranteed pricing tool.',
    ],
    href: '/app/hits-pulse',
    linkLabel: 'Open HITS Pulse™',
  },
]

const faqItems: FaqItem[] = [
  {
    question: 'What is HITS™?',
    answer:
      'HITS™ stands for Hobby Inventory & Profit Tax Tracking. It is built to help card sellers and hobby businesses track inventory, purchases, sales, expenses, profit, and tax-support records in one place.',
  },
  {
    question: 'What should I enter first?',
    answer:
      'Start with inventory. Add items manually, import a CSV, or process purchases from Orders Received. The most important starting point is a clear item name and cost basis.',
  },
  {
    question: 'Why is cost basis important?',
    answer:
      'Cost basis is what you paid for the item. HITS™ uses it to calculate profit, realized COGS, inventory value, and tax-support reports.',
  },
  {
    question: 'Why is category required when recording a sale?',
    answer:
      'Category helps organize reports and supports anonymous HITS Pulse™ trend data. Inventory can be entered quickly, but final sale records should be more complete.',
  },
  {
    question: 'I made a sale but do not see a restore point immediately. Is something wrong?',
    answer:
      'Not necessarily. Some restore points are created during scheduled processing, so there may be a delay before the restore point appears.',
  },
  {
    question: 'Should I use giveaways for stream givvies?',
    answer:
      'Yes. Use the giveaway flow for promotional items or givvies. HITS™ removes the item from available inventory and records supporting marketing expense information.',
  },
  {
    question: 'Can I export information for my CPA?',
    answer:
      'Yes. Use the Reports Center and CPA-related reports to export CSV, PDF, or printed records for review.',
  },
]

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 shadow-2xl shadow-black/30">
          <div className="grid gap-8 p-6 md:grid-cols-[1.3fr_0.7fr] md:p-8">
            <div className="flex flex-col justify-center gap-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">
                  HITS™ Help Center
                </p>
                <h1 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
                  Quick help for running your hobby business
                </h1>
              </div>

              <p className="max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
                Use this page as your in-app guide for inventory, orders, sales, giveaways,
                expenses, reports, backups, tax-year tools, shipping profiles, and HITS Pulse™.
              </p>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/app/inventory"
                  className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                >
                  Start with Inventory
                </Link>
                <Link
                  href="/app/reports"
                  className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-cyan-300 hover:text-cyan-200"
                >
                  Open Reports
                </Link>
                <Link
                  href="/app/utilities/backup"
                  className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-cyan-300 hover:text-cyan-200"
                >
                  Backup Utilities
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
              <h2 className="text-lg font-semibold text-white">Quick reminder</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                The more accurate your purchase cost, sale details, shipping amounts, fees,
                expenses, and notes are now, the easier year-end review will be later.
              </p>
              <div className="mt-5 rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-4 text-sm text-cyan-100">
                HITS™ is a recordkeeping tool. Use your reports as support material and review
                final tax decisions with a qualified tax professional.
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group rounded-2xl border border-slate-800 bg-slate-900/70 p-5 transition hover:border-cyan-400/70 hover:bg-slate-900"
            >
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-base font-semibold text-white group-hover:text-cyan-200">
                  {link.label}
                </h2>
                <span className="text-slate-500 group-hover:text-cyan-300">→</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">{link.description}</p>
            </Link>
          ))}
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          {helpSections.map((section) => (
            <article
              key={section.id}
              id={section.id}
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-lg shadow-black/10"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
                {section.eyebrow}
              </p>
              <h2 className="mt-2 text-xl font-bold text-white">{section.title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">{section.summary}</p>

              <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-300">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-3">
                    <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-cyan-300" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>

              {section.href && section.linkLabel ? (
                <Link
                  href={section.href}
                  className="mt-5 inline-flex rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-cyan-300 hover:text-cyan-200"
                >
                  {section.linkLabel}
                </Link>
              ) : null}
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 md:p-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">
              Common Questions
            </p>
            <h2 className="mt-3 text-2xl font-bold text-white">FAQ</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              These answers cover the most common places users get stuck while testing or
              running daily workflow inside HITS™.
            </p>
          </div>

          <div className="mt-6 divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-950/50">
            {faqItems.map((item) => (
              <details key={item.question} className="group p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-sm font-semibold text-white">
                  <span>{item.question}</span>
                  <span className="text-slate-500 transition group-open:rotate-45 group-open:text-cyan-300">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-6 text-slate-300">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-cyan-400/30 bg-cyan-400/10 p-6 md:p-8">
          <h2 className="text-xl font-bold text-cyan-100">Need the full user guide?</h2>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-cyan-50/90">
            This page is the quick in-app help center. Use the downloadable Quick Start Guide
            and full User Guide when you want a deeper walkthrough, screenshots, examples, or
            step-by-step onboarding instructions for beta testers.
          </p>
        </section>
      </div>
    </main>
  )
}
