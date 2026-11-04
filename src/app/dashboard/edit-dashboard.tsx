"use client";

import { useRef, useState, useTransition } from "react";
import { ChevronDown, GripVertical, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/segmented-control";
import {
  WIDGETS,
  WIDGET_TYPES,
  generateSpec,
  missingColumns,
  newWidget,
  setting,
  type DashboardSpec,
  type SettingDef,
  type Widget,
} from "@/lib/dashboard-spec";
import { ROLES, type ColumnMapping } from "@/lib/orders";
import { saveDashboard } from "./actions";

/*
 * Edit the dashboard the way iOS edits Control Center or Health favourites:
 * a sheet with Cancel and Done, the shown widgets in order (drag the handle
 * to reorder, red minus to hide, tap a row for its options), then the
 * hidden ones with a green plus. Nothing is saved until Done.
 */

type Drag = { index: number; startY: number; dy: number; rects: DOMRect[]; target: number };

export function EditDashboard({ spec, mapping }: { spec: DashboardSpec; mapping: ColumnMapping }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Widget[]>(spec.widgets);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [saving, startSave] = useTransition();

  function open() {
    setDraft(spec.widgets);
    setExpanded(null);
    setError(null);
    dialog.current?.showModal();
  }

  function done() {
    startSave(async () => {
      const result = await saveDashboard({ version: 3, widgets: draft });
      if (result.ok) dialog.current?.close();
      else setError(result.error);
    });
  }

  const shown = new Set(draft.map((w) => w.type));
  const hidden = WIDGET_TYPES.filter((t) => !shown.has(t));

  return (
    <>
      <Button variant="ghost" size="sm" onClick={open}>
        Edit
      </Button>

      <dialog
        ref={dialog}
        aria-labelledby="edit-dashboard-title"
        className="m-0 mt-auto max-h-[92dvh] w-full max-w-none flex-col overflow-hidden rounded-t-[1.25rem] bg-background p-0 text-foreground shadow-2xl transition-[translate,opacity] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] backdrop:bg-black/40 open:flex motion-reduce:transition-none sm:m-auto sm:max-h-[85dvh] sm:max-w-lg sm:rounded-[1.25rem] starting:open:translate-y-10 starting:open:opacity-0"
      >
        <header className="material-bar grid shrink-0 grid-cols-[1fr_auto_1fr] items-center px-2 py-1.5 shadow-[0_0.5px_0_var(--separator)]">
          <Button
            variant="ghost"
            className="justify-self-start"
            onClick={() => dialog.current?.close()}
          >
            Cancel
          </Button>
          <h2 id="edit-dashboard-title" className="headline">
            Edit Dashboard
          </h2>
          <Button
            variant="ghost"
            className="justify-self-end font-semibold"
            disabled={saving}
            onClick={done}
          >
            {saving ? "Saving…" : "Done"}
          </Button>
        </header>

        <div className="flex flex-col gap-6 overflow-y-auto px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {error && (
            <p role="alert" className="rounded-xl bg-card px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <section className="flex flex-col gap-1.5">
            <h3 className="px-4 text-xs font-semibold text-muted-foreground">Shown</h3>
            {draft.length ? (
              <ShownList
                widgets={draft}
                expanded={expanded}
                onExpand={setExpanded}
                onChange={setDraft}
                onAnnounce={setAnnouncement}
              />
            ) : (
              <p className="rounded-2xl bg-card px-4 py-3 text-sm text-muted-foreground">
                Nothing shown. Add a widget below.
              </p>
            )}
            <p className="px-4 text-xs text-muted-foreground">
              Drag ≡ to reorder. The date range applies to everything below Upcoming pickups.
            </p>
          </section>

          {hidden.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <h3 className="px-4 text-xs font-semibold text-muted-foreground">More widgets</h3>
              <ul className="divide-y divide-separator rounded-2xl bg-card">
                {hidden.map((type) => {
                  const missing = missingColumns(type, mapping);
                  return (
                    <li key={type} className="flex items-center gap-3 py-2 pr-4 pl-3">
                      <button
                        type="button"
                        disabled={missing.length > 0}
                        onClick={() => {
                          setDraft((d) => [...d, newWidget(type)]);
                          setAnnouncement(`${WIDGETS[type].title} added`);
                        }}
                        aria-label={`Show ${WIDGETS[type].title}`}
                        className="pressable flex size-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
                      >
                        <span className="flex size-6 items-center justify-center rounded-full bg-[#248a3d] text-white dark:bg-[#30d158] dark:text-black">
                          <Plus className="size-4" strokeWidth={3} aria-hidden />
                        </span>
                      </button>
                      <div className="min-w-0">
                        <p className="text-sm">{WIDGETS[type].title}</p>
                        <p className="text-xs text-muted-foreground">
                          {missing.length
                            ? `Needs a ${ROLES[missing[0]].label.toLowerCase()} column`
                            : WIDGETS[type].blurb}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <Button
            variant="ghost"
            className="self-center"
            onClick={() => {
              setDraft(generateSpec(mapping).widgets);
              setExpanded(null);
              setAnnouncement("Reset to the default layout");
            }}
          >
            Reset to default
          </Button>
        </div>

        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </dialog>
    </>
  );
}

function ShownList({
  widgets,
  expanded,
  onExpand,
  onChange,
  onAnnounce,
}: {
  widgets: Widget[];
  expanded: string | null;
  onExpand: (id: string | null) => void;
  onChange: (widgets: Widget[]) => void;
  onAnnounce: (text: string) => void;
}) {
  const rows = useRef<(HTMLLIElement | null)[]>([]);
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const [drag, setDrag] = useState<Drag | null>(null);

  function move(from: number, to: number) {
    if (from === to) return;
    const next = [...widgets];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
    onAnnounce(`${WIDGETS[item.type].title} moved to position ${to + 1} of ${next.length}`);
  }

  // Pointer drag: the row follows the finger 1:1 from where it was grabbed,
  // and the others slide aside as it passes their midpoints.
  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>, index: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    onExpand(null);
    const rects = rows.current.slice(0, widgets.length).map((r) => r!.getBoundingClientRect());
    setDrag({ index, startY: e.clientY, dy: 0, rects, target: index });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    const r = drag.rects[drag.index];
    const center = r.top + r.height / 2 + dy;
    let target = 0;
    drag.rects.forEach((rect, j) => {
      if (j !== drag.index && rect.top + rect.height / 2 < center) target++;
    });
    setDrag({ ...drag, dy, target });
  }

  function onPointerUp() {
    if (!drag) return;
    move(drag.index, drag.target);
    setDrag(null);
  }

  function offset(j: number) {
    if (!drag) return 0;
    const { index, target, dy, rects } = drag;
    if (j === index) return dy;
    const h = rects[index].height;
    if (index < target && j > index && j <= target) return -h;
    if (target < index && j >= target && j < index) return h;
    return 0;
  }

  function onHandleKey(e: React.KeyboardEvent, index: number, id: string) {
    const to = e.key === "ArrowUp" ? index - 1 : e.key === "ArrowDown" ? index + 1 : null;
    if (to === null || to < 0 || to >= widgets.length) return;
    e.preventDefault();
    move(index, to);
    requestAnimationFrame(() => handles.current.get(id)?.focus());
  }

  return (
    <ul className="rounded-2xl bg-card">
      {widgets.map((w, i) => {
        const def = WIDGETS[w.type];
        const settings = Object.entries(def.settings as Record<string, SettingDef>);
        const isOpen = expanded === w.id;
        const lifted = drag?.index === i;
        return (
          <li
            key={w.id}
            ref={(el) => {
              rows.current[i] = el;
            }}
            className={`relative bg-card first:rounded-t-2xl last:rounded-b-2xl ${
              lifted
                ? "z-10 rounded-2xl shadow-[0_8px_24px_rgb(0_0_0/0.18)]"
                : drag
                  ? "transition-transform duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none"
                  : ""
            } ${i > 0 && !lifted ? "shadow-[0_-0.5px_0_var(--separator)]" : ""}`}
            style={{
              transform: `translateY(${offset(i)}px)${lifted ? " scale(1.02)" : ""}`,
            }}
          >
            <div className="flex items-center gap-1 py-1 pr-1 pl-3">
              <button
                type="button"
                onClick={() => {
                  onChange(widgets.filter((x) => x.id !== w.id));
                  onAnnounce(`${def.title} hidden`);
                }}
                aria-label={`Hide ${def.title}`}
                className="pressable flex size-11 shrink-0 items-center justify-center rounded-full"
              >
                <span className="flex size-6 items-center justify-center rounded-full bg-[#d70015] text-white dark:bg-[#ff453a]">
                  <Minus className="size-4" strokeWidth={3} aria-hidden />
                </span>
              </button>
              <button
                type="button"
                disabled={!settings.length}
                aria-expanded={settings.length ? isOpen : undefined}
                onClick={() => onExpand(isOpen ? null : w.id)}
                className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-default"
              >
                <span className="min-w-0">
                  <span className="block text-sm">{def.title}</span>
                  {settings.length > 0 && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {settings
                        .map(([key, d]) => {
                          const value = setting(w, key);
                          return `${d.label}: ${d.options.find((o) => o.value === value)?.label}`;
                        })
                        .join(" · ")}
                    </span>
                  )}
                </span>
                {settings.length > 0 && (
                  <ChevronDown
                    aria-hidden
                    className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                )}
              </button>
              <button
                type="button"
                ref={(el) => {
                  if (el) handles.current.set(w.id, el);
                  else handles.current.delete(w.id);
                }}
                aria-label={`Reorder ${def.title}, position ${i + 1} of ${widgets.length}. Use the up and down arrow keys.`}
                onPointerDown={(e) => onPointerDown(e, i)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => setDrag(null)}
                onKeyDown={(e) => onHandleKey(e, i, w.id)}
                className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:cursor-grabbing"
              >
                <GripVertical className="size-5" aria-hidden />
              </button>
            </div>

            {isOpen && (
              <div className="flex flex-col gap-3 px-4 pt-1 pb-4">
                {settings.map(([key, d]) => (
                  <div key={key} className="flex flex-col gap-1.5">
                    <span className="text-xs text-muted-foreground">{d.label}</span>
                    <SegmentedControl
                      label={`${def.title}: ${d.label}`}
                      value={String(setting(w, key))}
                      options={d.options.map((o) => ({ value: String(o.value), label: o.label }))}
                      onChange={(v) => {
                        const value = d.options.find((o) => String(o.value) === v)!.value;
                        onChange(
                          widgets.map((x) =>
                            x.id === w.id ? { ...x, settings: { ...x.settings, [key]: value } } : x,
                          ),
                        );
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
