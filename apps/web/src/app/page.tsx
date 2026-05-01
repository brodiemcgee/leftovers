export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-between px-6 py-16">
      <header className="flex items-center justify-between">
        <span className="font-display text-xl font-semibold tracking-tight">Leftovers</span>
        <span className="text-sm text-ink/60">iOS · Australia</span>
      </header>

      <section className="my-24 space-y-6">
        <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
          How much can I spend this month without going backwards?
        </h1>
        <p className="max-w-xl text-lg text-ink/70">
          One number on the home screen. Pay-cycle aware, internal transfers stripped out, fixed
          bills already accounted for. Built for salaried Australians with multiple accounts.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href="#waitlist"
            className="rounded-full bg-ink px-5 py-3 text-sm font-medium text-canvas hover:bg-accent"
          >
            Join the TestFlight waitlist
          </a>
          <a
            href="https://github.com/brodie-mcgee/leftovers"
            className="rounded-full border border-ink/20 px-5 py-3 text-sm font-medium hover:border-ink"
          >
            Read the build log
          </a>
        </div>
      </section>

      <footer className="text-sm text-ink/50">
        © {new Date().getFullYear()} Leftovers. Read-only by design — never moves money.
      </footer>
    </main>
  );
}
