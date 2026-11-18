"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { connectSheet, getPickerToken } from "./actions";

const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

let pickerLoaded: Promise<void> | undefined;

function loadPicker() {
  pickerLoaded ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.onload = () => window.gapi!.load("picker", { callback: resolve, onerror: reject });
    script.onerror = reject;
    document.head.append(script);
  }).catch((e) => {
    pickerLoaded = undefined; // allow a retry
    throw e;
  });
  return pickerLoaded;
}

export function ConnectSheetButton({
  children = "Connect Google Sheet",
  variant = "default",
  replaceSheetId,
}: {
  children?: React.ReactNode;
  variant?: "default" | "outline";
  /** Point this sheet at the picked file instead of adding another sheet. */
  replaceSheetId?: string;
}) {
  const router = useRouter();
  const { user } = useUser();
  const [opening, setOpening] = useState(false);
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setError(null);
    setOpening(true);
    try {
      const token = await getPickerToken();

      if (token.status === "no_google") {
        setError("Sign in with Google to connect a sheet.");
        return;
      }
      if (token.status === "needs_scope") {
        // Ask Google for Drive access on the existing account, then come back here.
        const google = user?.externalAccounts.find((a) => a.provider === "google");
        if (!google) {
          setError("Sign in with Google to connect a sheet.");
          return;
        }
        const updated = await google.reauthorize({
          additionalScopes: [DRIVE_FILE_SCOPE],
          redirectUrl: window.location.href,
        });
        const url = updated.verification?.externalVerificationRedirectURL;
        if (url) window.location.href = url.href;
        return;
      }

      await loadPicker();
      new google.picker.PickerBuilder()
        .addView(
          new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS)
            .setMode(google.picker.DocsViewMode.LIST)
            .setIncludeFolders(true),
        )
        .setTitle("Pick a spreadsheet")
        .setOAuthToken(token.token)
        .setDeveloperKey(process.env.NEXT_PUBLIC_GOOGLE_API_KEY!)
        // The project number. Lets drive.file grant access to the picked file.
        .setAppId(process.env.NEXT_PUBLIC_GOOGLE_APP_ID!)
        .setCallback((data) => {
          if (data.action !== google.picker.Action.PICKED || !data.docs?.[0]) return;
          const { id } = data.docs[0];
          startSaving(async () => {
            const result = await connectSheet(id, replaceSheetId);
            if (!result.ok) setError(result.error);
            else if (result.sheetId !== replaceSheetId) router.push(`/dashboard/${result.sheetId}`);
          });
        })
        .build()
        .setVisible(true);
    } catch (e) {
      console.error(e);
      setError("Couldn't open Google's file picker. Please try again.");
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant={variant} onClick={open} disabled={opening || saving}>
        {saving ? "Reading your sheet…" : opening ? "Opening…" : children}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
