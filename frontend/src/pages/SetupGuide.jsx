import { Link } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import {
  ArrowRight, NumberCircleOne, NumberCircleTwo, NumberCircleThree,
  NumberCircleFour, NumberCircleFive, NumberCircleSix, ListChecks,
  PlugsConnected, FileArrowUp, Globe, Phone,
} from "@phosphor-icons/react";

function Step({ icon: Icon, n, title, children, cta }) {
  return (
    <div className="card p-6 space-y-3" data-testid={`guide-step-${n}`}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-[var(--brand)] text-white flex items-center justify-center font-display text-sm">{n}</div>
        {Icon && <Icon size={20} weight="duotone" className="text-[var(--brand)]" />}
        <h3 className="font-display text-xl tracking-tight">{title}</h3>
      </div>
      <div className="text-[13px] leading-relaxed text-[var(--text)] space-y-2">{children}</div>
      {cta && <div className="pt-2">{cta}</div>}
    </div>
  );
}

export default function SetupGuide() {
  return (
    <div className="px-8 py-10 max-w-3xl mx-auto" data-testid="setup-guide-page">
      <PageHeader
        eyebrow="Welcome"
        title="Setup guide"
        subtitle="Six clear steps to take LeaseFlow from zero to capturing real rental leads from your Vapi agent."
      />

      <div className="space-y-5">
        <Step n={1} icon={Phone} title="Make sure you have a Vapi assistant">
          <p>You need an existing Vapi assistant — the one that answers your rental inquiries. If you haven't built one yet:</p>
          <ol className="list-decimal pl-5 space-y-1 text-[var(--text-muted)]">
            <li>Sign up at <a className="underline text-[var(--brand)]" href="https://vapi.ai" target="_blank" rel="noreferrer">vapi.ai</a></li>
            <li>Create a new assistant — give it a leasing-specialist system prompt</li>
            <li>Note the assistant ID (looks like <code className="font-mono">agent_abb6aa93...</code>)</li>
          </ol>
        </Step>

        <Step n={2} icon={PlugsConnected} title="Register your agent in LeaseFlow"
              cta={<Link to="/vapi-setup" className="btn-primary"><PlugsConnected size={14} weight="duotone" /> Open Vapi Setup <ArrowRight size={14} weight="bold" /></Link>}>
          <p>Open <strong>Vapi Setup</strong> and click <strong>Register agent</strong>. Paste the assistant ID from Vapi and give it a friendly name. LeaseFlow generates a per-agent webhook secret on the spot.</p>
        </Step>

        <Step n={3} icon={ListChecks} title="Add the capture_rental_lead tool in Vapi">
          <p>In your Vapi dashboard:</p>
          <ol className="list-decimal pl-5 space-y-1 text-[var(--text-muted)]">
            <li><strong>Tools → Create tool → Function</strong></li>
            <li>Name: <code className="font-mono">capture_rental_lead</code></li>
            <li>Server URL: copy from the Vapi Setup page</li>
            <li>Add a custom header <code className="font-mono">x-vapi-secret</code> with the value from Vapi Setup</li>
            <li>Paste the JSON schema from the Vapi Setup page</li>
            <li>Open your <strong>Assistant</strong> → Tools → attach <code className="font-mono">capture_rental_lead</code></li>
            <li>In your assistant's system prompt, add: <em>"At the end of every qualifying call, call the capture_rental_lead function with everything you've extracted from the caller."</em></li>
          </ol>
          <div className="card p-3 text-[12px] mt-3" style={{ background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" }}>
            ⚠️ This was the bug from your audit: the tool was created but never attached to the assistant. Make sure step 6 above is done.
          </div>
        </Step>

        <Step n={4} icon={Phone} title="Send a test"
              cta={<Link to="/vapi-setup" className="btn-secondary">Run test from Vapi Setup <ArrowRight size={14} weight="bold" /></Link>}>
          <p>On the Vapi Setup page, click <strong>Send test (valid secret)</strong>. You should see a 200 with a lead_id, and a new lead pop into your Leads page in real time.</p>
          <p>Then click <strong>Send with bad secret</strong> — must return 401 (this confirms auth is enforced).</p>
        </Step>

        <Step n={5} icon={FileArrowUp} title="Optional: Connect Google Sheets"
              cta={<Link to="/settings" className="btn-secondary">Open Settings <ArrowRight size={14} weight="bold" /></Link>}>
          <p>Want every lead also synced to a Google Sheet for your team's pipeline reviews?</p>
          <ol className="list-decimal pl-5 space-y-1 text-[var(--text-muted)]">
            <li>Go to <a className="underline text-[var(--brand)]" href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noreferrer">Google Cloud → Service Accounts</a></li>
            <li>Create a service account → grant Editor role → Keys → Add JSON key → download</li>
            <li>Enable the <a className="underline text-[var(--brand)]" href="https://console.cloud.google.com/apis/library/sheets.googleapis.com" target="_blank" rel="noreferrer">Sheets API</a></li>
            <li>Create or open a Google Sheet → Share it with the service account email (Editor)</li>
            <li>Open Settings → Google Sheets → paste sheet ID + the JSON key → Save → Sync</li>
          </ol>
        </Step>

        <Step n={6} icon={Globe} title="Optional: point form.rentals at LeaseFlow">
          <p>When you're ready to use your custom domain:</p>
          <ol className="list-decimal pl-5 space-y-1 text-[var(--text-muted)]">
            <li>In the Emergent dashboard → this app → <strong>Domains</strong></li>
            <li>Add <code className="font-mono">form.rentals</code> as a custom domain</li>
            <li>At your DNS provider, add the CNAME record Emergent gives you</li>
            <li>Update the Vapi tool's Server URL to <code className="font-mono">https://form.rentals/api/public/vapi-webhook</code></li>
            <li>That's it — your secret stays the same.</li>
          </ol>
        </Step>

        <div className="card p-6 text-center" style={{ background: "var(--brand-soft)", borderColor: "rgba(42,75,65,0.2)" }}>
          <h3 className="font-display text-2xl tracking-tight mb-2">You're all set</h3>
          <p className="text-[var(--text-muted)] text-[13px] mb-4">Every Vapi call ends with a clean lead in your dashboard, in real time.</p>
          <Link to="/" className="btn-primary">Go to Dashboard <ArrowRight size={14} weight="bold" /></Link>
        </div>
      </div>
    </div>
  );
}
