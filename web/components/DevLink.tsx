/**
 * Only on the owner's laptop, where no email service is set up: the link the email would carry, as
 * a button, so sign-up and password reset can be tested without an inbox. The live site never
 * receives such a link from the server, so this never shows there.
 */
export default function DevLink({ href, label }: { href?: string | null; label: string }) {
  if (!href) return null;
  return (
    <div className="mt-4 rounded-2xl border border-dashed border-gold bg-ivory p-3 text-left text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/70">Testing on your laptop</p>
      <p className="mt-1 text-ink/75">Email isn’t set up here, so the link is shown instead. Players never see this.</p>
      <a className="btn btn-primary mt-2 w-full" href={href}>{label}</a>
    </div>
  );
}
