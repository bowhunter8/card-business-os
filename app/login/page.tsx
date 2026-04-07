import { signInAction } from '@/app/actions/auth'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const error = params.error

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <h1 className="text-2xl font-semibold">Baseball Card Business</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Sign in to your standalone tracking system.
        </p>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        ) : null}

        <form action={signInAction} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm text-zinc-300">Email</label>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-zinc-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-zinc-300">Password</label>
            <input
              name="password"
              type="password"
              required
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-zinc-500"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-white px-4 py-2 font-medium text-black hover:bg-zinc-200"
          >
            Sign in
          </button>
        </form>
      </div>
    </main>
  )
}