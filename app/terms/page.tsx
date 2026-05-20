import Link from 'next/link'

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-4xl">
        <div className="app-card">
          <div className="mb-6">
            <p className="app-subtitle">HITS™</p>
            <h1 className="app-title mt-2">Terms & Conditions</h1>
            <p className="app-muted mt-2">Effective version: 2026-05-11</p>
          </div>

          <div className="space-y-6 text-sm leading-6 text-zinc-300">
            <section>
              <h2 className="text-lg font-semibold text-zinc-100">1. Acceptance of Terms</h2>
              <p className="mt-2">
                By creating an account, accessing, or using HITS – Hobby Inventory Tracking System™
                (“HITS”, “we”, “our”, or “the Service”), you agree to these Terms & Conditions. If
                you do not agree to these Terms, do not use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-100">2. Description of Service</h2>
              <p className="mt-2">
                HITS is inventory, sales, accounting assistance, and organizational software designed
                for hobby businesses, collectors, resellers, breakers, and related users. Features may
                include inventory tracking, sales tracking, break/order management, tax reporting
                assistance, shipping tracking, backup/export functionality, analytics, and reporting
                tools. The Service may change, improve, or discontinue features at any time.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-100">3. No Tax, Legal, or Accounting Advice</h2>
              <p className="mt-2">
                HITS is software only. HITS does not provide tax advice, legal advice, accounting
                advice, financial advice, or IRS representation. Users are solely responsible for
                verifying calculations, maintaining accurate records, determining deductible expenses,
                confirming tax compliance, and consulting qualified professionals when necessary.
                Reports, exports, summaries, categories, and calculations are provided for
                organizational assistance only.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-100">4. User Responsibility</h2>
              <p className="mt-2">
                You are responsible for the accuracy of all entered data, maintaining backups of
                important information, reviewing generated reports before filing taxes, securing your
                account credentials, and complying with all applicable laws and marketplace policies.
                You acknowledge that errors in entered data may affect reports, exports, valuations,
                and calculations.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-100">5. Beta Features & Experimental Functionality</h2>
              <p className="mt-2">
                Certain features may be marked as beta, experimental, preview, or early access. These
                features may change without notice, contain bugs, become unavailable, or produce
                inaccurate results. Use of beta features is at your own risk.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-100">6. Account Access</h2>
              <p className="mt-2">
                We reserve the right to suspend accounts, terminate accounts, limit access, remove
                content, or revoke beta access for violations of these Terms or misuse of the Service.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-100">7. Subscription & Trial Access</h2>
              <p className="mt-2">
                HITS may offer free trials, beta access, paid subscriptions, and promotional access.
                Access may expire automatically unless renewed or upgraded. Subscription fees, billing
                terms, and refund policies may change in the future.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-100">8. Data & Backups</h2>
              <p className="mt-2">
                While HITS may provide backup/export tools, users remain responsible for maintaining
                their own backups of critical business data. We do not guarantee uninterrupted
                availability, permanent storage, data recovery, or prevention of data loss.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-100">9. Limitation of Liability</h2>
              <p className="mt-2">
                To the maximum extent permitted by law, HITS and its operators shall not be liable for
                lost profits, tax penalties, business interruption, inventory discrepancies, inaccurate
                reports, data loss, missed deductions, accounting errors, or indirect or consequential
                damages. Use of the Service is at your own risk.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-100">10. No Warranty</h2>
              <p className="mt-2">
                The Service is provided “AS IS” and “AS AVAILABLE” without warranties of any kind,
                express or implied. We do not guarantee error-free operation, uninterrupted access,
                perfect accuracy, or compatibility with all devices or browsers.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-100">11. Intellectual Property</h2>
              <p className="mt-2">
                HITS branding, logos, interface designs, and software functionality remain the property
                of HITS unless otherwise stated. Users may not copy, resell, reverse engineer,
                redistribute, or exploit the Service without permission.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-100">12. Acceptable Use</h2>
              <p className="mt-2">
                Users agree not to abuse the platform, attempt unauthorized access, upload malicious
                code, interfere with system operation, or use the Service for unlawful activity.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-100">13. Changes to Terms</h2>
              <p className="mt-2">
                These Terms may be updated periodically. Continued use of the Service after updates
                constitutes acceptance of revised Terms.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-100">14. Contact</h2>
              <p className="mt-2">
                Questions regarding these Terms may be directed through official HITS support channels.
              </p>
            </section>
          </div>

          <div className="mt-8 border-t border-zinc-800 pt-5">
            <Link href="/signup" className="app-button">
              Back to signup
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
