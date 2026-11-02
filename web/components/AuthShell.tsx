/** Login / sign-up frame: form alone on phones; brand panel beside the form on large screens. */
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="page py-10 lg:grid lg:min-h-[calc(100vh-4rem)] lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-12">
      <section className="hidden rounded-3xl bg-gradient-to-br from-plum to-plum-dark p-10 text-white lg:block xl:p-14">
        <div className="font-display text-4xl font-bold leading-tight xl:text-5xl">Your personal stylist for Pakistani fashion</div>
        <ul className="mt-8 space-y-4 text-lg text-white/90">
          <li>✦ Complete head-to-toe looks, built from real products</li>
          <li>✦ Modest-friendly, with coverage you choose</li>
          <li>✦ Budgets in PKR, from everyday lawn to wedding wear</li>
        </ul>
      </section>
      <div className="mx-auto w-full max-w-md">{children}</div>
    </main>
  );
}
