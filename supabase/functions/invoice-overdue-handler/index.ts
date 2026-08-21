import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { overdueInvoiceTemplate } from "./invoice.template.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

/**
 * Exchanges the Google refresh token for an access token.
 *
 * Called ONCE per invocation. It used to run inside `sendGmail`, so a run covering fifty
 * invoices performed fifty OAuth grants on top of fifty sends — serially. That is what made
 * the function slow enough to outlive the cron's timeout, and it draws Google's rate limiter
 * for no reason. Access tokens last an hour; one run cannot outlive one.
 */
async function getGmailAccessToken(): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("G_CLIENT_ID")!,
      client_secret: Deno.env.get("G_CLIENT_SECRET")!,
      refresh_token: Deno.env.get("G_REFRESH_TOKEN")!,
      grant_type: "refresh_token",
    }),
  });

  const tokenData = await response.json();
  if (!tokenData.access_token) {
    throw new Error("Failed to get access token: " + JSON.stringify(tokenData));
  }
  return tokenData.access_token as string;
}

/** RFC 2047-safe base64url of a UTF-8 MIME message, without the deprecated `unescape`. */
function encodeMessage(raw: string): string {
  const bytes = new TextEncoder().encode(raw);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sendGmail(accessToken: string, to: string, subject: string, message: string) {
  const rawMessage = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    message,
  ].join("\r\n");

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: encodeMessage(rawMessage) }),
  });

  // Checked BEFORE logging success — the old version logged "message sent" above this test,
  // so failures were reported as sends.
  if (!response.ok) {
    throw new Error("Failed to send email: " + (await response.text()));
  }
}

type OverdueInvoice = {
  id: string;
  invoice_number: string;
  amount: number | string;
  currency: string;
  due_date: string | null;
  projects: { name: string; client_id: string | null } | null;
  organizations: { name: string | null } | null;
};

function formatAmount(amount: number | string, currency: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${amount} ${currency}`;
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(value);
  } catch {
    // `currency` is only constrained to three characters, so it need not be a real ISO code.
    return `${value.toFixed(2)} ${currency}`;
  }
}

function formatDueDate(dueDate: string | null): string {
  if (!dueDate) return "";
  return new Date(dueDate).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

Deno.serve(async () => {
  // One query, with the project and organisation embedded, instead of a second round trip
  // for projects. Named columns rather than `select('*')`.
  const { data: invoices, error } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, amount, currency, due_date, projects(name, client_id), organizations(name)",
    )
    .eq("status", "due")
    .lt("due_date", new Date().toISOString())
    .returns<OverdueInvoice[]>();

  if (error) return new Response(JSON.stringify(error), { status: 200 });

  if (!invoices || invoices.length === 0) {
    return new Response(JSON.stringify({ message: "No overdue invoices", processed: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Resolve each distinct client ONCE. Previously this was one admin call per project on
  // every run, repeated for clients appearing on several projects.
  const clientIds = new Set<string>();
  for (const invoice of invoices) {
    const clientId = invoice.projects?.client_id;
    if (clientId) clientIds.add(clientId);
  }

  const emailByClientId = new Map<string, string>();
  for (const clientId of clientIds) {
    const { data, error: userError } = await supabase.auth.admin.getUserById(clientId);
    if (!userError && data.user?.email) emailByClientId.set(clientId, data.user.email);
  }

  let accessToken: string;
  try {
    accessToken = await getGmailAccessToken();
  } catch (err) {
    console.error("Could not obtain a Gmail access token:", err);
    return new Response(JSON.stringify({ error: "Mail auth failed" }), { status: 200 });
  }

  let emailed = 0;
  let marked = 0;
  let skipped = 0;

  for (const invoice of invoices) {
    const clientId = invoice.projects?.client_id;
    const email = clientId ? emailByClientId.get(clientId) : undefined;

    if (email) {
      try {
        await sendGmail(
          accessToken,
          email,
          `Invoice ${invoice.invoice_number} is overdue`,
          overdueInvoiceTemplate({
            orgName: invoice.organizations?.name ?? "Foxy HUB",
            projectName: invoice.projects?.name ?? "your project",
            invoiceNumber: invoice.invoice_number,
            amountLabel: formatAmount(invoice.amount, invoice.currency),
            dueDateLabel: formatDueDate(invoice.due_date),
          }),
        );
        emailed++;
      } catch (err) {
        console.error(`Failed to email invoice ${invoice.invoice_number}:`, err);
      }
    } else {
      // No client on the project, or no address on the account. The old code still called
      // sendGmail here, producing a literal `To: undefined` that Gmail rejected every run.
      // The invoice is still genuinely overdue, so it is still marked below.
      console.warn(`No client email for invoice ${invoice.invoice_number} not emailed`);
      skipped++;
    }

    // Marked one at a time, immediately after its own email attempt — NOT once at the end.
    //
    // Two bugs died here. The old statement was
    //   .update({ status: 'overdue' }).in('project_id', projectId)
    // which filtered on PROJECT ids, so every invoice on an affected project was rewritten:
    // paid ones became overdue, drafts became overdue, cancelled ones came back. Filtering
    // on this invoice's own id confines the write to the row that earned it.
    //
    // And doing it per invoice means a run that dies partway leaves the invoices it already
    // handled marked, so the next night starts from the remainder instead of re-emailing
    // everyone who was already contacted.
    //
    // The transition is a fact about time, not about delivery, so it applies even when the
    // email could not be sent — otherwise a clientless invoice would sit at 'due' forever
    // and be retried nightly.
    const { error: updateError } = await supabase
      .from("invoices")
      .update({ status: "overdue" })
      .eq("id", invoice.id);

    if (updateError) {
      console.error(
        `Failed to mark invoice ${invoice.invoice_number} overdue:`,
        updateError.message,
      );
    } else {
      marked++;
    }
  }

  return new Response(
    JSON.stringify({ message: "Done", found: invoices.length, emailed, marked, skipped }),
    { headers: { "Content-Type": "application/json" } },
  );
});
