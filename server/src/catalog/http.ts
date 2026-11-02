/**
 * Polite HTTP for catalog imports: identifies itself, honours robots.txt (the `User-agent: *` group),
 * waits between requests to the same site, and backs off on errors. One request at a time per host.
 */
import { gunzipSync } from 'node:zlib';

export const USER_AGENT = 'SaleeqaCatalogBot/0.1 (prototype; honours robots.txt)';
const DEFAULT_DELAY_MS = 1500;

const lastHit = new Map<string, number>();
const robotsCache = new Map<string, Promise<Rules>>();

interface Rules {
  allow: string[];
  disallow: string[];
  delayMs: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** robots.txt path pattern (with * and $) -> RegExp. */
function pattern(rule: string): RegExp {
  const anchored = rule.endsWith('$');
  const body = (anchored ? rule.slice(0, -1) : rule).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + body + (anchored ? '$' : ''));
}

/** Parses the rules that apply to every crawler (`User-agent: *`). */
export function parseRobots(text: string): Rules {
  const rules: Rules = { allow: [], disallow: [], delayMs: DEFAULT_DELAY_MS };
  let inStar = false;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const [k, ...rest] = line.split(':');
    const key = k.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') {
      // Consecutive User-agent lines share one group.
      inStar = (lastWasAgent && inStar) || value === '*';
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!inStar) continue;
    if (key === 'disallow' && value) rules.disallow.push(value);
    if (key === 'allow' && value) rules.allow.push(value);
    if (key === 'crawl-delay' && Number(value) > 0) rules.delayMs = Math.max(DEFAULT_DELAY_MS, Number(value) * 1000);
  }
  return rules;
}

/** Longest matching rule wins; Allow wins a tie (Google's interpretation). */
export function allowedBy(rules: Rules, pathAndQuery: string): boolean {
  let best = -1;
  let allowed = true;
  for (const r of rules.disallow) if (pattern(r).test(pathAndQuery) && r.length > best) { best = r.length; allowed = false; }
  for (const r of rules.allow) if (pattern(r).test(pathAndQuery) && r.length >= best) { best = r.length; allowed = true; }
  return allowed;
}

async function rulesFor(origin: string): Promise<Rules> {
  let p = robotsCache.get(origin);
  if (!p) {
    p = (async () => {
      try {
        const res = await fetch(`${origin}/robots.txt`, { headers: { 'user-agent': USER_AGENT } });
        return res.ok ? parseRobots(await res.text()) : parseRobots('');
      } catch {
        return parseRobots('');
      }
    })();
    robotsCache.set(origin, p);
  }
  return p;
}

export class Disallowed extends Error {}

/** GET a URL as text, if robots.txt allows it, after the polite delay for that host. */
export async function politeGet(url: string, { retries = 5 } = {}): Promise<string> {
  const u = new URL(url);
  const rules = await rulesFor(u.origin);
  if (!allowedBy(rules, u.pathname + u.search)) throw new Disallowed(`robots.txt disallows ${u.pathname}${u.search}`);
  for (let attempt = 0; ; attempt++) {
    const wait = (lastHit.get(u.host) ?? 0) + rules.delayMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastHit.set(u.host, Date.now());
    try {
      const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: '*/*', 'accept-encoding': 'gzip' }, redirect: 'follow' });
      if (res.status === 429 || res.status >= 500) {
        // Rate limited: wait as long as the site asks (Retry-After), and slow down for the rest of the run.
        const after = Number(res.headers.get('retry-after'));
        if (res.status === 429) rules.delayMs = Math.min(rules.delayMs * 2, 20000);
        throw Object.assign(new Error(`HTTP ${res.status}`), { waitMs: after > 0 ? after * 1000 : 0 });
      }
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { final: true });
      const buf = Buffer.from(await res.arrayBuffer());
      // Some sitemaps are served as raw .gz files.
      const body = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
      return body.toString('utf8');
    } catch (e: any) {
      if (e.final || attempt >= retries) throw e;
      await sleep(Math.max(e.waitMs ?? 0, rules.delayMs * 2 ** (attempt + 1))); // back off: 2x, 4x, 8x... the delay
    }
  }
}

export const locs = (xml: string) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);

/** Plain text from an HTML fragment. */
export function textOf(html: string): string {
  return html
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}
