import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-4xl">
        <div className="app-card">
          <div className="mb-6">
            <p className="app-subtitle">HITS™</p>
            <h1 className="app-title mt-2">Privacy Policy</h1>
            <p className="app-muted mt-2">Effective version: 2026-05-11</p>
          </div>

          <div className="space-y-6 text-sm leading-6 text-zinc-300">
            <section>
              <h2 className="text-lg font-semibold text-zinc-100">1. Information We Collect</h2>
              <p className="mt-2">
                HITS may collect account information, email addresses, inventory data, sales records,
                order information, uploaded/imported data, backup/export files, and usage information.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-100">2. How Information Is Used</h2>
              <p className="mt-2">
                Information may be used to provide app functionality, authenticate accounts, generate
                reports, improve features, maintain backups, support users, and secure the platform.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-100">3. Third-Party Services</h2>
              <p className="mt-2">
                HITS may use third-party providers including Supabase, Vercel, payment processors,
                analytics providers, and authentication services. These providers may process data as
                necessary to operate the Service.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-100">4. Data Security</h2>
              <p className="mt-2">
                Reasonable efforts are made to protect stored information, but no online service can
                guarantee absolute security. Users are responsible for maintaining secure passwords and
                protecting account access.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-100">5. Cookies & Local Storage</h2>
              <p className="mt-2">
                HITS may use cookies, local storage, and session storage to maintain login sessions,
                preferences, and app functionality.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-100">6. User Data Responsibility</h2>
              <p className="mt-2">
                Users remain responsible for reviewing stored information, exporting backups, and
                maintaining records required for tax or legal purposes.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-100">7. Data Retention</h2>
              <p className="mt-2">
                Data may be retained while accounts remain active, as required for operational or legal
                purposes, and for backup and recovery processes.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-100">8. Account Deletion</h2>
              <p className="mt-2">
                Users may request account deletion subject to operational, backup, legal, or billing
                requirements. Some records may persist temporarily in backups or logs.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-100">9. Children’s Privacy</h2>
              <p className="mt-2">
                HITS is not intended for users under 18 years old.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-100">10. Changes to Privacy Policy</h2>
              <p className="mt-2">
                This Privacy Policy may be updated periodically. Continued use of the Service after
                updates constitutes acceptance of revised policies.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-zinc-100">11. Contact</h2>
              <p className="mt-2">
                Questions regarding privacy may be directed through official HITS support channels.
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
