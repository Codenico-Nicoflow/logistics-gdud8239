import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { EmptyState, Panel, SearchField, Tag } from '../../components/ui';
import { he } from '../../i18n/he';
import {
  GUIDE_DAY,
  GUIDE_GROUPS,
  topicsFor,
  topicText,
  type GuideTopic,
} from '../../i18n/guide';
import { normalizeSearch } from '../../lib/search';
import type { AuthUser } from '../../lib/types';

/**
 * מדריך — how to work with the app, written for the people who use it every day. The text lives in
 * `i18n/guide.ts`; this page only lays it out: search, a typical day, and one collapsible card per topic.
 * A topic can be linked to directly as `/help#kits`.
 */
export function HelpPage({ user }: { user: AuthUser }) {
  const { hash } = useLocation();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(hash ? [hash.slice(1)] : []));

  const visible = useMemo(() => topicsFor(user.role), [user.role]);
  const matching = useMemo(() => {
    const q = normalizeSearch(query);
    if (!q) return visible;
    return visible.filter((t) => normalizeSearch(topicText(t)).includes(q));
  }, [visible, query]);

  // A link into a topic (from the typical-day strip, the address bar, or the contents) opens it and scrolls to it.
  useEffect(() => {
    if (!hash) return;
    const id = hash.slice(1);
    setOpen((cur) => new Set(cur).add(id));
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [hash]);

  const toggle = (id: string): void =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const searching = query.trim() !== '';
  const reachable = new Set(visible.map((t) => t.id));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-display font-bold">{he.help.title}</h1>
        <p className="mt-1 text-ink-soft">{he.help.subtitle}</p>
      </div>

      <SearchField value={query} onSearch={setQuery} placeholder={he.help.searchPlaceholder} debounceMs={0} />

      {!searching && (
        <Panel title={he.help.dayTitle}>
          <ol className="divide-y divide-rule">
            {GUIDE_DAY.filter((d) => reachable.has(d.topicId)).map((d) => (
              <li key={`${d.when}-${d.topicId}-${d.text}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
                <span className="w-24 shrink-0 text-meta font-semibold text-field-dark">{d.when}</span>
                <Link to={{ hash: d.topicId }} className="text-body hover:underline">
                  {d.text}
                </Link>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      {matching.length === 0 ? (
        <Panel>
          <EmptyState>{he.help.none}</EmptyState>
        </Panel>
      ) : (
        GUIDE_GROUPS.map((group) => {
          const topics = matching.filter((t) => t.group === group.id);
          if (topics.length === 0) return null;
          return (
            <section key={group.id} className="space-y-3" aria-labelledby={`group-${group.id}`}>
              <h2 id={`group-${group.id}`} className="text-title font-bold">
                {group.title}
              </h2>
              {topics.map((topic) => (
                <TopicCard
                  key={topic.id}
                  topic={topic}
                  open={searching || open.has(topic.id)}
                  onToggle={() => toggle(topic.id)}
                />
              ))}
            </section>
          );
        })
      )}
    </div>
  );
}

function TopicCard({ topic, open, onToggle }: { topic: GuideTopic; open: boolean; onToggle: () => void }) {
  const panelId = `topic-${topic.id}`;
  return (
    <Panel>
      <div id={topic.id} className="scroll-mt-20">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-start"
        >
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-lead font-semibold">{topic.title}</span>
              {topic.audience === 'admin' && <Tag tone="brass">{he.help.adminOnly}</Tag>}
            </span>
            <span className="mt-0.5 block text-meta text-ink-soft">{topic.summary}</span>
          </span>
          <span aria-hidden="true" className={`shrink-0 text-graphite transition-transform ${open ? 'rotate-180' : ''}`}>
            ▾
          </span>
        </button>

        {open && (
          <div id={panelId} className="space-y-4 border-t border-rule px-4 py-4">
            <div>
              <h3 className="mb-2 text-meta font-semibold text-ink-soft">{he.help.stepsLabel}</h3>
              <ol className="list-decimal space-y-2 ps-5 marker:font-semibold marker:text-field-dark">
                {topic.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>

            {topic.tips && topic.tips.length > 0 && (
              <div className="rounded-ctl bg-field-wash px-3 py-2">
                <h3 className="text-meta font-semibold text-field-dark">{he.help.tipsLabel}</h3>
                <ul className="mt-1 list-inside list-disc space-y-1 text-meta text-ink-soft">
                  {topic.tips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </div>
            )}

            {topic.warnings && topic.warnings.length > 0 && (
              <div className="rounded-ctl bg-oxide-wash px-3 py-2">
                <h3 className="text-meta font-semibold text-oxide">{he.help.warningsLabel}</h3>
                <ul className="mt-1 list-inside list-disc space-y-1 text-meta text-ink-soft">
                  {topic.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <Link to={topic.to} className="inline-block text-meta font-semibold text-field-dark hover:underline">
              {he.help.openScreen} ←
            </Link>
          </div>
        )}
      </div>
    </Panel>
  );
}
