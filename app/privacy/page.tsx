import { createClient } from '@/lib/supabase/server';
import { LEGAL_LAST_UPDATED, MIN_AGE } from '@/lib/legal';

// Kept as a standalone constants object (no component imports) so this page
// stays lightweight and renders fine for logged-out visitors and app-store
// review crawlers, without pulling in the full app shell.
const C = {
  bg: '#0D0D0D',
  surface: '#1A1A1A',
  border: '#444444',
  text: '#EDEDED',
  muted: '#9A9A9A',
  xp: '#A8FF00',
};

export const metadata = {
  title: 'Privacy Policy — WODXP',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold" style={{ color: C.text, fontFamily: "'Oswald', sans-serif" }}>{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed" style={{ color: C.muted }}>
        {children}
      </div>
    </section>
  );
}

export default async function PrivacyPage() {
  // Check auth status server-side so "Back to WODXP" always lands on the
  // right place. Plain <a> tag (not next/link) so this is a full browser
  // navigation/reload — the most reliable option across browsers,
  // including Safari with strict cookie/tracking settings.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const backHref = user ? '/' : '/login';

  return (
    <div className="min-h-screen w-full px-5 py-10" style={{ backgroundColor: C.bg, color: C.text, fontFamily: "'Inter', sans-serif" }}>
      <div className="mx-auto max-w-2xl">
        <a href={backHref} className="text-xs font-medium uppercase tracking-wider" style={{ color: C.xp }}>
          ← Back to WODXP
        </a>

        <h1 className="mt-4 text-3xl font-bold" style={{ fontFamily: "'Oswald', sans-serif" }}>Privacy Policy</h1>
        <p className="mt-1 text-sm" style={{ color: C.muted }}>Last updated: {LEGAL_LAST_UPDATED}</p>

        <p className="mt-6 text-sm leading-relaxed" style={{ color: C.muted }}>
          This Privacy Policy explains how WODXP (&quot;the App,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) collects, uses, stores, and
          protects your information when you use our mobile and web application.
        </p>

        <Section title="1. Who We Are">
          <p>
            WODXP is developed and operated by Pontus Melin, based in Sweden. If you have questions about this
            policy or your data, you can contact us at:
          </p>
          <p style={{ color: C.text }}>Email: pontus.melin@gmail.com</p>
        </Section>

        <Section title="2. Information We Collect">
          <p style={{ color: C.text, fontWeight: 600 }}>2.1 Account Information</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Email address (used for login and account recovery)</li>
            <li>Username</li>
            <li>Password (stored securely as a hashed value by our authentication provider — we never see or store your plain-text password)</li>
            <li>A record that you confirmed you meet the minimum age ({MIN_AGE}) and accepted our Terms of Service, including the date and version. The year of birth you enter at registration is used only for this check and is not stored.</li>
          </ul>
          <p style={{ color: C.text, fontWeight: 600 }} className="pt-2">2.2 Fitness &amp; Activity Data</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Workouts you log (exercises, weight, reps, sets)</li>
            <li>Personal bests and training history</li>
            <li>Experience points (XP), levels, and streaks</li>
            <li>Boss challenge attempts and results (if applicable)</li>
          </ul>
          <p style={{ color: C.text, fontWeight: 600 }} className="pt-2">2.3 Social Data (if you use social features)</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Friends/connections you add within the App</li>
            <li>Challenges sent or received between users</li>
            <li>Leaderboard rankings</li>
          </ul>
          <p style={{ color: C.text, fontWeight: 600 }} className="pt-2">2.4 Information We Do Not Currently Collect</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>We do not use third-party advertising trackers.</li>
            <li>We do not collect precise location data.</li>
            <li>We do not access your device&apos;s camera, microphone, or contacts.</li>
            <li>We do not currently process payments (this section will be updated if paid features are introduced).</li>
            <li>The App&apos;s BMI calculator (age, gender, height, weight) runs entirely on your device. Those values are never sent to our servers. To save you re-typing them, the App remembers them in your device&apos;s local browser storage until you change them or tap &quot;Clear saved&quot; (or clear your browser data).</li>
          </ul>
        </Section>

        <Section title="3. How We Use Your Information">
          <p>We use the information described above to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Create and manage your account</li>
            <li>Save and display your workout history, progression, and stats</li>
            <li>Calculate XP, levels, and streaks</li>
            <li>Power social features such as leaderboards and friend challenges (if enabled)</li>
            <li>Maintain the security and functionality of the App</li>
            <li>Communicate with you about your account (e.g., password resets)</li>
          </ul>
          <p>We do not sell your personal data, and we do not share it with third parties for advertising or marketing purposes.</p>
        </Section>

        <Section title="4. Where Your Data Is Stored">
          <p>
            Your data is stored using Supabase, a third-party database and authentication provider, hosted in the
            European Union. Supabase acts as our data processor and maintains its own security and privacy
            practices, available at{' '}
            <a href="https://supabase.com/privacy" className="underline" style={{ color: C.xp }} target="_blank" rel="noopener noreferrer">
              supabase.com/privacy
            </a>.
          </p>
          <p>We take reasonable technical measures (such as access controls and encryption in transit) to protect your data, but no system can guarantee complete security.</p>
        </Section>

        <Section title="5. Your Rights">
          <p>Depending on where you live, you may have the right to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Access the personal data we hold about you</li>
            <li>Correct inaccurate data</li>
            <li>Delete your account and associated data</li>
            <li>Export your data in a portable format</li>
            <li>Object to or restrict certain processing of your data</li>
          </ul>
          <p>
            If you are located in the European Economic Area (EEA), these rights are provided under the General
            Data Protection Regulation (GDPR). To exercise any of these rights, contact us at pontus.melin@gmail.com.
            We will respond within a reasonable timeframe, and no later than required by applicable law.
          </p>
          <p>You can delete your account directly in the App under Profile → Delete account. This permanently removes your account and all data linked to it, including your workout history, progress, and friend connections. You can also email us at pontus.melin@gmail.com to request deletion.</p>
        </Section>

        <Section title="6. Data Retention">
          <p>
            We retain your account and fitness data for as long as your account is active. If you delete your
            account, we will delete or anonymize your personal data within 90 days, except where we are required
            to retain it for legal or security purposes.
          </p>
        </Section>

        <Section title="7. Children's Privacy">
          <p>
            The App is not intended for children under the age of {MIN_AGE}. When you register we ask for your year
            of birth and do not create an account if you are under {MIN_AGE}. We use the year only for this check and
            do not store it; we keep only the confirmation that you meet the age limit. We do not knowingly collect
            personal data from children under {MIN_AGE}. If you believe a child has provided us with personal data,
            please contact us so we can remove it.
          </p>
        </Section>

        <Section title="8. Sale, Merger or Transfer of the Business">
          <p>
            If WODXP is sold, merged, reorganized, or transferred, in whole or in part, your personal data may be
            transferred to the new owner as part of that transaction. This is limited to the data needed to keep running
            the App for you, and the new owner may only use it for the purposes described in this policy.
          </p>
          <p>
            The new owner becomes responsible for your personal data (the data controller) and must follow this policy,
            or tell you about any changes before they apply to you, as described in section 9.
          </p>
          <p>
            We will inform you in advance through the App or by email, before the transfer takes effect. You can delete
            your account before the transfer, and your data will then not be transferred (see section 5).
          </p>
        </Section>

        <Section title="9. Changes to This Policy">
          <p>
            Our <a href="/terms" className="underline" style={{ color: C.xp }}>Terms of Service</a> also apply when you use the App.
          </p>
          <p>
            We may update this Privacy Policy from time to time. If we make material changes, we will notify you
            through the App or by email before the changes take effect. The &quot;Last updated&quot; date at the top of
            this document will always reflect the most recent version.
          </p>
        </Section>

        <Section title="10. Contact Us">
          <p style={{ color: C.text }}>Pontus Melin</p>
          <p>Email: pontus.melin@gmail.com</p>
        </Section>

        <div className="mt-10 border-t pt-6" style={{ borderColor: C.border }}>
          <p className="text-xs" style={{ color: C.muted }}>
            This policy is a starting template and has not been reviewed by a lawyer. It should be reviewed by a
            qualified legal professional before being relied upon for full legal compliance.
          </p>
        </div>
      </div>
    </div>
  );
}
