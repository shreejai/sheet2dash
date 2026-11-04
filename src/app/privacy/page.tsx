import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy · Sheet2Dash",
  description: "What Sheet2Dash reads, stores and shares.",
};

const CONTACT = "shreejairaj@gmail.com";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="headline">{title}</h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed text-foreground/90">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10 sm:py-14">
      <div className="flex flex-col gap-1">
        <Link href="/" className="pressable w-fit text-sm text-tint">
          ‹ Sheet2Dash
        </Link>
        <h1 className="large-title">Privacy</h1>
        <p className="text-xs text-muted-foreground">Last updated 4 November 2026</p>
      </div>

      <div className="flex flex-col gap-6 rounded-2xl bg-card p-5 sm:p-6">
        <p className="text-sm leading-relaxed">
          Sheet2Dash turns an orders spreadsheet in Google Sheets into a dashboard. This page
          explains what it reads, what it keeps, and who else sees it.
        </p>

        <Section title="What it reads from Google">
          <p>
            When you sign in with Google, Sheet2Dash gets your name, email address and profile
            picture to create your account.
          </p>
          <p>
            It asks for one Google Drive permission, <em>drive.file</em>, which only lets it open
            files you pick yourself in the Google file picker. It can&apos;t see or list anything
            else in your Drive, and it never changes or deletes your spreadsheet — it only reads it.
          </p>
        </Section>

        <Section title="What it stores">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Your account (name, email, sign-in details), held by our sign-in provider, Clerk.
            </li>
            <li>The name and ID of the spreadsheet you connected, and which columns hold what.</li>
            <li>Your dashboard layout and the email addresses you choose to share it with.</li>
            <li>A daily count of questions you ask in Ask (not the questions themselves).</li>
          </ul>
          <p>
            The spreadsheet&apos;s contents are not saved to a database. They are read from Google
            when you open the dashboard and held in a short-lived cache (a few minutes) so the page
            loads quickly.
          </p>
        </Section>

        <Section title="Who else sees your data">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>People you share with.</strong> Anyone whose email you add under Sharing can
              view your dashboard and ask questions about it. You can remove them at any time.
            </li>
            <li>
              <strong>OpenAI, only when you use Ask.</strong> Your question and the orders needed to
              answer it are sent to OpenAI to write the answer. OpenAI doesn&apos;t use data sent
              through its API to train its models.
            </li>
            <li>
              <strong>The services that run the app:</strong> Vercel (hosting), Neon (database, in
              Sydney) and Clerk (sign-in). They process data only to provide the app.
            </li>
          </ul>
          <p>
            Sheet2Dash has no ads, doesn&apos;t sell data, and doesn&apos;t track you across sites.
          </p>
        </Section>

        <Section title="Google user data">
          <p>
            Sheet2Dash&apos;s use and transfer of information received from Google APIs adheres to
            the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              className="text-tint underline-offset-4 hover:underline"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements. Data from your spreadsheet is used only to
            show your dashboard and answer your questions, and is never used to train AI models.
          </p>
        </Section>

        <Section title="Removing your data">
          <p>
            <strong>Disconnect</strong> in the dashboard&apos;s settings removes the saved link to
            your spreadsheet. You can also remove Sheet2Dash&apos;s access at any time from your{" "}
            <a
              href="https://myaccount.google.com/permissions"
              className="text-tint underline-offset-4 hover:underline"
            >
              Google account permissions
            </a>
            . To delete your account and everything stored with it, email{" "}
            <a href={`mailto:${CONTACT}`} className="text-tint underline-offset-4 hover:underline">
              {CONTACT}
            </a>
            .
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy:{" "}
            <a href={`mailto:${CONTACT}`} className="text-tint underline-offset-4 hover:underline">
              {CONTACT}
            </a>
            .
          </p>
        </Section>
      </div>
    </main>
  );
}
