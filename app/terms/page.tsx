import { createClient } from '@/lib/supabase/server';
import { LEGAL_LAST_UPDATED, MIN_AGE } from '@/lib/legal';

// Standalone (no component imports) so this page stays lightweight and renders
// for logged-out visitors, the signup form and app-store review crawlers.
const C = {
  bg: '#0D0D0D',
  surface: '#1A1A1A',
  border: '#444444',
  text: '#EDEDED',
  muted: '#9A9A9A',
  xp: '#A8FF00',
};

export const metadata = {
  title: 'Terms of Service — WODXP',
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

export default async function TermsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const backHref = user ? '/' : '/login';

  return (
    <div className="min-h-screen w-full px-5 py-10" style={{ backgroundColor: C.bg, color: C.text, fontFamily: "'Inter', sans-serif" }}>
      <div className="mx-auto max-w-2xl">
        <a href={backHref} className="text-xs font-medium uppercase tracking-wider" style={{ color: C.xp }}>
          ← Back to WODXP
        </a>

        <h1 className="mt-4 text-3xl font-bold" style={{ fontFamily: "'Oswald', sans-serif" }}>Terms of Service</h1>
        <p className="mt-1 text-sm" style={{ color: C.muted }}>Last updated: {LEGAL_LAST_UPDATED}</p>

        <p className="mt-6 text-sm leading-relaxed" style={{ color: C.muted }}>
          These Terms of Service (&quot;Terms&quot;) govern your use of WODXP (&quot;the App,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;).
          By creating an account or using the App you agree to these Terms and to our{' '}
          <a href="/privacy" className="underline" style={{ color: C.xp }}>Privacy Policy</a>.
          If you do not agree, please do not use the App.
        </p>

        <Section title="1. Who Can Use WODXP">
          <p>
            You must be at least {MIN_AGE} years old to create an account. By registering you confirm that you meet this
            age requirement. If we learn that someone under {MIN_AGE} has an account, we may close it.
          </p>
        </Section>

        <Section title="2. Your Account">
          <ul className="list-disc pl-5 space-y-1">
            <li>You are responsible for keeping your password safe and for what happens under your account.</li>
            <li>Give accurate information at registration and keep your email address up to date.</li>
            <li>One person, one account. Do not share your account or create accounts to get around a restriction.</li>
            <li>You can stop using the App and request deletion of your account at any time (see the Privacy Policy).</li>
          </ul>
        </Section>

        <Section title="3. Training Is At Your Own Risk">
          <p>
            WODXP is a game-style training tracker. It is not medical advice, and we are not your doctor or personal
            trainer. Exercise involves a risk of injury. Check with a doctor before starting a new training program,
            especially if you have a health condition, are pregnant, or have not trained for a long time.
          </p>
          <p>
            Choose weights and intensity that are safe for you, stop if something hurts, and use proper technique.
            Illustrations, instructions, XP values, levels, challenges and Boss battles are for motivation and
            guidance only. You decide what you do.
          </p>
        </Section>

        <Section title="4. Acceptable Use">
          <p>When you use the App, including social features such as friends and challenges, you agree not to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Use offensive, hateful, or misleading usernames or messages, or harass other users.</li>
            <li>Send spam or unwanted invitations.</li>
            <li>Attempt to hack, overload, scrape, or reverse engineer the App, or access data that is not yours.</li>
            <li>Cheat in ways that harm other users or the integrity of the App, or use the App for anything unlawful.</li>
          </ul>
          <p>We may remove content, limit features, or suspend accounts that break these rules.</p>
        </Section>

        <Section title="5. Content and Ownership">
          <p>
            The App, its design, text, illustrations, and software belong to us or our licensors and are protected by
            law. We give you a personal, non-exclusive, non-transferable right to use the App for your own training.
          </p>
          <p>
            The data you enter (such as workouts and messages) stays yours. You give us the right to store and display it
            as needed to run the App for you and your connections.
          </p>
        </Section>

        <Section title="6. The App Is Provided As Is">
          <p>
            We work to keep WODXP available and accurate, but it is provided &quot;as is&quot; and may change, contain errors, or
            be unavailable at times. We may add, change, or remove features. We are not liable for indirect or
            consequential loss. Nothing in these Terms limits rights you have as a consumer under mandatory law, or
            liability that cannot be limited by law.
          </p>
        </Section>

        <Section title="7. Suspension and Ending">
          <p>
            You may stop using the App and delete your account at any time. We may suspend or close an account that
            breaks these Terms or puts the App or other users at risk. If we close an account for another reason, we will
            give you reasonable notice where possible.
          </p>
        </Section>

        <Section title="8. Transfer of the Service or These Terms">
          <p>
            We may transfer or assign these Terms, together with our rights and obligations under them and the operation
            of WODXP, to another person or company, for example in connection with a sale, merger, reorganization, or
            transfer of the business or its assets. The new owner will take over our responsibilities to you under these
            Terms and the Privacy Policy.
          </p>
          <p>
            We will tell you in advance through the App or by email. You may close your account before the transfer takes
            effect, as described in the Privacy Policy. You may not transfer your account or these Terms to anyone else
            without our written consent.
          </p>
        </Section>

        <Section title="9. Changes to These Terms">
          <p>
            We may update these Terms. If we make material changes, we will notify you through the App or by email before
            they take effect. If you keep using the App after the changes take effect, you accept the updated Terms. If you
            do not agree, you can delete your account.
          </p>
        </Section>

        <Section title="10. Governing Law">
          <p>
            These Terms are governed by Swedish law. If you are a consumer, you also keep the protection of the mandatory
            consumer laws of the country where you live, and you may bring a dispute in the courts of that country.
          </p>
        </Section>

        <Section title="11. Contact">
          <p style={{ color: C.text }}>Pontus Melin</p>
          <p>Email: pontus.melin@gmail.com</p>
        </Section>

        <div className="mt-10 border-t pt-6" style={{ borderColor: C.border }}>
          <p className="text-xs" style={{ color: C.muted }}>
            These terms are a starting template and have not been reviewed by a lawyer. They should be reviewed by a
            qualified legal professional before being relied upon for full legal compliance.
          </p>
        </div>
      </div>
    </div>
  );
}
