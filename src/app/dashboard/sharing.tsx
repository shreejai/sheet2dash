"use client";

import { useActionState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addViewer, removeViewer, type ShareState } from "./actions";

export function Sharing({ viewers }: { viewers: string[] }) {
  const [state, add, adding] = useActionState<ShareState, FormData>(addViewer, undefined);
  const [removing, startRemove] = useTransition();

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-medium">Sharing</h2>
        <p className="text-xs text-muted-foreground">
          People you add can sign in with that email to view this dashboard and ask questions. They
          can&apos;t change settings, and they don&apos;t need access to the sheet.
        </p>
      </div>

      {viewers.length > 0 && (
        <ul className="divide-y rounded-lg border text-sm">
          {viewers.map((email) => (
            <li key={email} className="flex items-center justify-between gap-2 py-1 pr-1 pl-3">
              <span className="min-w-0 truncate">{email}</span>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                disabled={removing}
                onClick={() => startRemove(() => removeViewer(email))}
                aria-label={`Stop sharing with ${email}`}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form action={add} className="flex flex-wrap gap-2">
        <input
          type="email"
          name="email"
          required
          placeholder="name@example.com"
          aria-label="Email to share with"
          autoComplete="off"
          className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-8 sm:text-sm"
        />
        <Button type="submit" variant="outline" disabled={adding}>
          {adding ? "Adding…" : "Share"}
        </Button>
      </form>
      {state?.error && <p className="text-xs text-destructive">{state.error}</p>}
      {state?.added && (
        <p className="text-xs text-muted-foreground">
          Shared with {state.added}. They can now sign in at this site with that email.
        </p>
      )}
    </section>
  );
}
