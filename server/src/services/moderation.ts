import type { Repos } from '../db/index.js';
import { AppError } from '../errors.js';
import type { Report, ReportReason } from '../types.js';
import { challengeTitle, isPublished } from './game.js';

/**
 * Players report a look or a comment; an admin reviews the open reports and hides the look, deletes
 * the comment, or closes the report with no action. One report per player and thing: reporting it
 * again only updates the reason.
 */
export async function reportThing(repos: Repos, reporterId: string, input: { target: 'look' | 'comment'; id: string; reason: ReportReason; note?: string }) {
  let designId: string;
  if (input.target === 'look') {
    const d = await repos.designs.findOne({ id: input.id });
    if (!d || !isPublished(d)) throw new AppError(404, 'Look not found');
    if (d.userId === reporterId) throw new AppError(400, 'That’s your own look: you can delete it instead.');
    designId = d.id;
  } else {
    const c = await repos.comments.findOne({ id: input.id });
    const d = c ? await repos.designs.findOne({ id: c.designId }) : null;
    if (!c || !d || !isPublished(d)) throw new AppError(404, 'Comment not found');
    if (c.userId === reporterId) throw new AppError(400, 'That’s your own comment: you can delete it instead.');
    designId = d.id;
  }
  const id = `${reporterId}:${input.target}:${input.id}`;
  const note = input.note?.trim().slice(0, 300) || undefined;
  await repos.reports.upsert({ id, reporterId, target: input.target, targetId: input.id, designId, reason: input.reason, ...(note ? { note } : {}), status: 'open', at: new Date().toISOString() });
}

/** Reports for the admin page, newest first, with what was reported and how many others reported the same thing. */
export async function listReports(repos: Repos, status: Report['status'] = 'open') {
  const reports = await repos.reports.find({ status }, { sort: { at: -1 }, limit: 200 });
  const designIds = [...new Set(reports.map((r) => r.designId))];
  const commentIds = [...new Set(reports.filter((r) => r.target === 'comment').map((r) => r.targetId))];
  const [designs, comments, open] = await Promise.all([
    designIds.length ? repos.designs.find({ id: { $in: designIds } }) : [],
    commentIds.length ? repos.comments.find({ id: { $in: commentIds } }) : [],
    repos.reports.find({ status: 'open' }),
  ]);
  const challenges = designs.length ? await repos.challenges.find({ id: { $in: [...new Set(designs.map((d) => d.challengeId))] } }) : [];
  const userIds = [...new Set([...reports.map((r) => r.reporterId), ...designs.map((d) => d.userId), ...comments.map((c) => c.userId)])];
  const users = userIds.length ? await repos.users.find({ id: { $in: userIds } }) : [];
  const name = (id?: string) => {
    const u = users.find((x) => x.id === id);
    return u ? (u.username ? `@${u.username}` : u.name.split(/\s+/)[0]) : 'a deleted player';
  };
  const sameThing = (r: Report) => open.filter((o) => o.target === r.target && o.targetId === r.targetId).length;
  return reports.map((r) => {
    const d = designs.find((x) => x.id === r.designId);
    const c = r.target === 'comment' ? comments.find((x) => x.id === r.targetId) : undefined;
    const ch = d ? challenges.find((x) => x.id === d.challengeId) : undefined;
    return {
      id: r.id,
      target: r.target,
      targetId: r.targetId,
      reason: r.reason,
      note: r.note ?? null,
      status: r.status,
      outcome: r.outcome ?? null,
      at: r.at,
      reportedBy: name(r.reporterId),
      reports: sameThing(r),
      look: d ? { id: d.id, title: ch ? challengeTitle(ch) : 'A look', by: name(d.userId), hidden: Boolean(d.hidden), previewUrl: d.previewId ? `/api/previews/${d.previewId}` : null } : null,
      comment: r.target === 'comment' ? (c ? { text: c.text, by: name(c.userId) } : null) : undefined,
    };
  });
}

/** Closes every open report about one thing, noting what was done. */
async function closeAbout(repos: Repos, target: Report['target'], targetIds: string[], outcome: NonNullable<Report['outcome']>) {
  const open = await repos.reports.find({ status: 'open', target, targetId: { $in: targetIds } });
  const at = new Date().toISOString();
  for (const r of open) await repos.reports.update({ id: r.id }, { status: 'closed', closedAt: at, outcome });
}

export async function closeReport(repos: Repos, id: string) {
  const r = await repos.reports.findOne({ id });
  if (!r) throw new AppError(404, 'Report not found');
  await repos.reports.update({ id }, { status: 'closed', closedAt: new Date().toISOString(), outcome: r.outcome ?? 'no-action' });
}

/** Takes a look down (or puts it back). Hiding it closes the open reports about it. */
export async function setLookHidden(repos: Repos, designId: string, hidden: boolean) {
  const d = await repos.designs.findOne({ id: designId });
  if (!d || d.status === 'draft') throw new AppError(404, 'Look not found');
  await repos.designs.update({ id: d.id }, { hidden });
  if (hidden) await closeAbout(repos, 'look', [d.id], 'hidden');
}

/** Deletes a comment (and its replies) for an admin, and closes the open reports about them. */
export async function adminDeleteComment(repos: Repos, commentId: string) {
  const c = await repos.comments.findOne({ id: commentId });
  if (!c) throw new AppError(404, 'Comment not found');
  const gone = [c.id, ...(await repos.comments.find({ parentId: c.id })).map((r) => r.id)];
  await repos.notifications.delete({ commentId: { $in: gone } });
  await repos.comments.delete({ parentId: c.id });
  await repos.comments.delete({ id: c.id });
  await closeAbout(repos, 'comment', gone, 'deleted');
}
