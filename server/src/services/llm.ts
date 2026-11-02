/**
 * Language-model layer. Everything the app asks a model to do goes through this
 * interface, so models can be swapped by configuration:
 *   - "rules":  no model; keyword and pattern parsing plus template explanations (works offline)
 *   - "openai": any OpenAI-compatible server (Ollama, vLLM, Groq, OpenRouter, ...)
 *
 * The model never chooses products. It only (1) turns free text into structured
 * constraints, (2) turns free-text feedback into taste updates, and (3) writes the
 * short "why this suits you" lines from facts we pass in.
 */
import { z } from 'zod';
import { config } from '../config.js';
import { COLOR_NAMES, PALETTE } from '../data/palette.js';
import { OCCASIONS, type Brand, type ChatConstraints, type Occasion, type Profile, type Product } from '../types.js';

export interface ParseContext {
  brands: Brand[];
}

export interface Feedback {
  likeColors: string[];
  dislikeColors: string[];
  wantsMoreCoverage: boolean;
  wantsLessEmbellishment: boolean;
  wantsMoreEmbellishment: boolean;
}

export interface LookFacts {
  label: string;
  occasion: Occasion | null;
  total: number;
  items: Array<{ slot: string; title: string; brand: string; price: number; colors: string[] }>;
  tasteHits: string[]; // short, verified reasons computed by code
}

export interface Llm {
  readonly name: string;
  parseRequest(message: string, ctx: ParseContext): Promise<ChatConstraints>;
  parseFeedback(text: string): Promise<Feedback>;
  explain(looks: LookFacts[], profile: Profile): Promise<string[]>;
}

/* ------------------------------ rule-based provider ------------------------------ */

const OCCASION_WORDS: Array<[Occasion, RegExp]> = [
  ['mehndi', /\b(mehndi|mehendi|mayun|mayoon|dholki)\b/i],
  ['walima', /\b(walima|valima)\b/i],
  ['baraat', /\b(baraat|barat|nikkah|nikah|wedding|shaadi|shadi|shadi ki)\b/i],
  ['eid', /\b(eid|chand raat)\b/i],
  ['party', /\b(party|dinner|birthday|get[- ]?together|date night)\b/i],
  ['office', /\b(office|work|job|meeting|interview|presentation)\b/i],
  ['university', /\b(university|uni|college|campus|class)\b/i],
  ['casual', /\b(casual|everyday|daily|roz|roz marra|outing|shopping)\b/i],
];

const COLOR_WORDS: Array<[RegExp, string[]]> = [
  [/\b(green|hara|hari|sabz)\b/i, ['emerald', 'sage', 'mint', 'olive']],
  [/\b(yellow|peela|peeli|zard)\b/i, ['mustard', 'lemon']],
  [/\b(blue|neela|neeli|aasmani)\b/i, ['royal', 'navy', 'sky', 'teal']],
  [/\b(pink|gulabi)\b/i, ['pink', 'blush']],
  [/\b(purple|jamni|jamuni|baingani)\b/i, ['plum', 'lilac']],
  [/\b(orange|narangi)\b/i, ['orange', 'rust', 'peach']],
  [/\b(red|laal|lal|surkh)\b/i, ['red', 'maroon']],
  [/\b(black|kala|kaala|kali)\b/i, ['black']],
  [/\b(white|safed|safaid)\b/i, ['white', 'ivory']],
  [/\b(gold|golden|sunehri)\b/i, ['gold', 'mustard']],
  [/\b(pastel|pastels)\b/i, ['blush', 'mint', 'lilac', 'sky', 'peach', 'lemon']],
  [/\b(brown|bhura)\b/i, ['brown', 'beige']],
  [/\b(grey|gray|slate)\b/i, ['grey']],
];

function parseBudget(text: string): number | undefined {
  const t = text.toLowerCase().replace(/,/g, '');
  const lakh = t.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lac)/);
  if (lakh) return Math.round(Number(lakh[1]) * 100000);
  const k = t.match(/(\d+(?:\.\d+)?)\s*(?:k|hazar|hazaar|thousand)\b/);
  if (k) return Math.round(Number(k[1]) * 1000);
  const plain = t.match(/(?:under|below|budget|max|upto|up to|within|around|rs\.?|pkr)\s*(\d{4,6})/);
  if (plain) return Number(plain[1]);
  const bare = t.match(/\b(\d{4,6})\b/);
  return bare ? Number(bare[1]) : undefined;
}

export function parseRequestRules(message: string, ctx: ParseContext): ChatConstraints {
  const out: ChatConstraints = { colors: [], brands: [] };
  for (const [occ, re] of OCCASION_WORDS) {
    if (re.test(message)) {
      out.occasion = occ;
      break;
    }
  }
  for (const name of COLOR_NAMES) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(message)) out.colors.push(name);
  }
  for (const [re, names] of COLOR_WORDS) {
    if (re.test(message)) for (const n of names) if (!out.colors.includes(n)) out.colors.push(n);
  }
  for (const b of ctx.brands) {
    const short = b.name.replace(/^Demo\s+/i, '');
    if (new RegExp(`\\b${short}\\b`, 'i').test(message) || new RegExp(`\\b${b.name}\\b`, 'i').test(message)) {
      out.brands.push(b.id);
    }
  }
  const budget = parseBudget(message);
  if (budget) out.budgetMax = budget;
  if (/\b(modest|covered|full sleeve|full sleeves|hijab|abaya|sleeves)\b/i.test(message)) out.extraModesty = true;
  return out;
}

export function parseFeedbackRules(text: string): Feedback {
  const f: Feedback = {
    likeColors: [],
    dislikeColors: [],
    wantsMoreCoverage: /\b(too (revealing|short|tight|fitted|transparent|sheer)|more (coverage|modest)|covered|sleeves)\b/i.test(text),
    wantsLessEmbellishment: /\b(too (heavy|much|busy|loud|shiny)|simpler|plainer|less (work|embroidery))\b/i.test(text),
    wantsMoreEmbellishment: /\b(too (plain|simple|boring)|more (work|embroidery|detail|shine))\b/i.test(text),
  };
  const sentences = text.split(/[.;!\n]+/);
  for (const s of sentences) {
    const negative = /\b(hate|dislike|never|don't like|do not like|not|avoid|too)\b/i.test(s);
    const positive = /\b(love|like|favourite|favorite|beautiful|gorgeous|perfect)\b/i.test(s) && !/\b(don't|do not|not)\b/i.test(s);
    for (const name of COLOR_NAMES) {
      if (new RegExp(`\\b${name}\\b`, 'i').test(s)) {
        if (positive) f.likeColors.push(name);
        else if (negative) f.dislikeColors.push(name);
      }
    }
  }
  return f;
}

export function explainRules(looks: LookFacts[], profile: Profile): string[] {
  return looks.map((l) => {
    const main = l.items[0];
    const pieces = l.items.slice(1).map((i) => `${i.title} (${i.brand})`);
    const lead = l.tasteHits.length ? l.tasteHits.slice(0, 2).join(' and ') : 'fits your style profile';
    const coverage = profile.coverage >= 3 ? ' and respects your coverage preference' : '';
    const accessories = pieces.length ? ` Paired with ${pieces.slice(0, 3).join(', ')}.` : '';
    const title = main.title.charAt(0).toUpperCase() + main.title.slice(1);
    return `${title} from ${main.brand} ${lead}; the full look is Rs. ${l.total.toLocaleString('en-PK')}${coverage}.${accessories}`;
  });
}

export class RulesLlm implements Llm {
  readonly name = 'rules';
  async parseRequest(message: string, ctx: ParseContext) {
    return parseRequestRules(message, ctx);
  }
  async parseFeedback(text: string) {
    return parseFeedbackRules(text);
  }
  async explain(looks: LookFacts[], profile: Profile) {
    return explainRules(looks, profile);
  }
}

/* --------------------------- OpenAI-compatible provider --------------------------- */

const constraintsSchema = z.object({
  occasion: z.enum(OCCASIONS as [Occasion, ...Occasion[]]).nullish(),
  colors: z.array(z.string()).default([]),
  brands: z.array(z.string()).default([]),
  budgetMax: z.number().positive().nullish(),
  extraModesty: z.boolean().default(false),
});

const feedbackSchema = z.object({
  likeColors: z.array(z.string()).default([]),
  dislikeColors: z.array(z.string()).default([]),
  wantsMoreCoverage: z.boolean().default(false),
  wantsLessEmbellishment: z.boolean().default(false),
  wantsMoreEmbellishment: z.boolean().default(false),
});

export class OpenAiCompatibleLlm implements Llm {
  readonly name = 'openai';
  private fallback = new RulesLlm();

  constructor(
    private readonly baseUrl = config.llm.baseUrl,
    private readonly model = config.llm.model,
    private readonly apiKey = config.llm.apiKey,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async chatJson(system: string, user: string): Promise<unknown> {
    const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const data: any = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? '';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    // Small models sometimes wrap JSON in prose; extract the first object.
    return JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
  }

  async parseRequest(message: string, ctx: ParseContext): Promise<ChatConstraints> {
    const rules = parseRequestRules(message, ctx);
    try {
      const raw = await this.chatJson(
        `You extract shopping constraints from a Pakistani woman's message (English, Urdu or Roman Urdu). ` +
          `Reply with ONLY a JSON object: {"occasion": one of ${OCCASIONS.join('|')} or null, ` +
          `"colors": array of colour names from [${COLOR_NAMES.join(', ')}], "brands": array of brand ids from ` +
          `${JSON.stringify(ctx.brands.map((b) => ({ id: b.id, name: b.name })))}, "budgetMax": number in PKR or null, ` +
          `"extraModesty": boolean}. Never invent values that the message does not imply.`,
        message,
      );
      const parsed = constraintsSchema.parse(raw);
      const valid = new Set(COLOR_NAMES);
      const brandIds = new Set(ctx.brands.map((b) => b.id));
      return {
        occasion: parsed.occasion ?? rules.occasion, // rules act as a safety net
        colors: [...new Set([...parsed.colors.filter((c) => valid.has(c)), ...rules.colors])],
        brands: [...new Set([...parsed.brands.filter((b) => brandIds.has(b)), ...rules.brands])],
        budgetMax: parsed.budgetMax ?? rules.budgetMax,
        extraModesty: parsed.extraModesty || rules.extraModesty,
      };
    } catch {
      return rules;
    }
  }

  async parseFeedback(text: string): Promise<Feedback> {
    try {
      const raw = await this.chatJson(
        `Read a shopper's feedback about outfits. Reply with ONLY JSON: {"likeColors": [], "dislikeColors": [], ` +
          `"wantsMoreCoverage": bool, "wantsLessEmbellishment": bool, "wantsMoreEmbellishment": bool}. ` +
          `Colour names must come from [${COLOR_NAMES.join(', ')}].`,
        text,
      );
      const f = feedbackSchema.parse(raw);
      const valid = new Set(COLOR_NAMES);
      return { ...f, likeColors: f.likeColors.filter((c) => valid.has(c)), dislikeColors: f.dislikeColors.filter((c) => valid.has(c)) };
    } catch {
      return parseFeedbackRules(text);
    }
  }

  async explain(looks: LookFacts[], profile: Profile): Promise<string[]> {
    try {
      const raw: any = await this.chatJson(
        `Write one friendly sentence (max 30 words) per outfit explaining why it suits the shopper. ` +
          `Use ONLY the facts provided. Do not mention products or prices that are not in the facts. ` +
          `Reply with ONLY JSON: {"reasons": [string, ...]} with exactly ${looks.length} items, in order.`,
        JSON.stringify({ shopperSummary: profile.summary, looks }),
      );
      const reasons = z.array(z.string().min(5).max(400)).length(looks.length).parse(raw.reasons);
      return reasons;
    } catch {
      return this.fallback.explain(looks, profile);
    }
  }
}

export function createLlm(): Llm {
  return config.llm.provider === 'openai' ? new OpenAiCompatibleLlm() : new RulesLlm();
}

/** Short, verified reasons derived from real attributes (never from model text). */
export function tasteHits(main: Product, profile: Profile): string[] {
  const hits: string[] = [];
  const liked = main.colors.find((c) => profile.colorsLiked.includes(c));
  if (liked) hits.push(`is in ${liked}, one of your favourite colours`);
  if (profile.silhouettes.includes(main.silhouette)) hits.push(`has the ${main.silhouette} cut you like`);
  if (profile.brandsLiked.includes(main.brandId)) hits.push(`comes from a brand you like`);
  const fam = PALETTE[main.colors[0]]?.family;
  if (!liked && fam && profile.styleWords.includes('minimal') && fam === 'neutral') hits.push('has a calm neutral palette');
  if (profile.fabrics.includes(main.fabric)) hits.push(`uses ${main.fabric}, a fabric you enjoy`);
  return hits;
}
