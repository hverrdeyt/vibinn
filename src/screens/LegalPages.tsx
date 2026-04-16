import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';

function LegalShell({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-[100svh] bg-zinc-950 text-white">
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        <div className="mb-8 flex items-start justify-between gap-6">
          <div>
            <a
              href="/"
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white/80 hover:bg-white/14"
            >
              Vibinn
              <ExternalLink size={14} className="opacity-70" />
            </a>
            <h1 className="mt-6 text-3xl font-black tracking-tight">{title}</h1>
            <p className="mt-2 text-sm text-white/55">Last updated: {updatedAt}</p>
          </div>
        </div>

        <div className="space-y-6 text-sm leading-6 text-white/80">
          {children}
        </div>
      </div>
    </div>
  );
}

function H2({ children }: { children: ReactNode }) {
  return <h2 className="text-base font-black tracking-tight text-white">{children}</h2>;
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-white/75">{children}</p>;
}

function UL({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-6 text-white/75">{children}</ul>;
}

export function TermsOfServiceScreen() {
  return (
    <LegalShell title="Terms of Service" updatedAt="April 16, 2026">
      <P>
        These Terms of Service (the &quot;Terms&quot;) govern your access to and use of Vibinn (the
        &quot;Service&quot;), including our website, mobile apps, and related features. By using Vibinn,
        you agree to these Terms.
      </P>

      <div className="space-y-2">
        <H2>1. Who We Are</H2>
        <P>
          Vibinn helps people discover places, save favorites, and share moments. Some information
          shown in the Service comes from third parties (for example, place data and photos).
        </P>
      </div>

      <div className="space-y-2">
        <H2>2. Eligibility</H2>
        <P>
          You must be at least 13 years old (or the minimum age required in your country) to use
          Vibinn. If you are using Vibinn on behalf of an organization, you represent that you have
          authority to bind that organization.
        </P>
      </div>

      <div className="space-y-2">
        <H2>3. Accounts</H2>
        <P>
          You are responsible for your account and any activity under it. Please keep your login
          credentials secure and accurate.
        </P>
      </div>

      <div className="space-y-2">
        <H2>4. Your Content</H2>
        <P>
          You may submit content such as text, ratings, photos, and other media (&quot;User Content&quot;).
          You retain ownership of your User Content, but you grant Vibinn a worldwide, non-exclusive,
          royalty-free license to host, store, reproduce, modify (for formatting), and display it in
          connection with operating and improving the Service.
        </P>
        <P>You agree not to post User Content that:</P>
        <UL>
          <li>is illegal, hateful, harassing, or abusive</li>
          <li>infringes intellectual property or privacy rights</li>
          <li>contains malware or attempts to exploit the Service</li>
          <li>impersonates someone else or misleads users</li>
        </UL>
      </div>

      <div className="space-y-2">
        <H2>5. Place Data, Third-Party Services, and Accuracy</H2>
        <P>
          Vibinn may display information from third-party providers (for example, place names,
          addresses, photos, hours, prices). This information can change or be inaccurate. Vibinn is
          not responsible for third-party content, and we do not guarantee completeness or accuracy.
        </P>
      </div>

      <div className="space-y-2">
        <H2>6. Acceptable Use</H2>
        <P>You agree not to:</P>
        <UL>
          <li>scrape, crawl, or reverse engineer the Service except as allowed by law</li>
          <li>interfere with the Service, security, or other users</li>
          <li>use the Service to send spam or unsolicited messages</li>
          <li>attempt to access accounts or data you do not own</li>
        </UL>
      </div>

      <div className="space-y-2">
        <H2>7. Termination</H2>
        <P>
          You may stop using Vibinn at any time. We may suspend or terminate access to the Service
          if we reasonably believe you violated these Terms or to protect Vibinn, users, or the
          public.
        </P>
      </div>

      <div className="space-y-2">
        <H2>8. Disclaimers</H2>
        <P>
          The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind.
          Vibinn does not warrant that the Service will be uninterrupted, secure, or error-free.
        </P>
      </div>

      <div className="space-y-2">
        <H2>9. Limitation of Liability</H2>
        <P>
          To the maximum extent permitted by law, Vibinn will not be liable for indirect, incidental,
          special, consequential, or punitive damages, or any loss of profits or revenues, arising
          from your use of the Service.
        </P>
      </div>

      <div className="space-y-2">
        <H2>10. Changes to These Terms</H2>
        <P>
          We may update these Terms from time to time. If changes are material, we will take
          reasonable steps to notify you. Continued use of Vibinn after changes means you accept the
          updated Terms.
        </P>
      </div>

      <div className="space-y-2">
        <H2>11. Contact</H2>
        <P>
          Questions about these Terms? Contact us at{' '}
          <a className="underline decoration-white/30 hover:decoration-white/70" href="mailto:support@vibinn.club">
            support@vibinn.club
          </a>
          .
        </P>
      </div>
    </LegalShell>
  );
}

export function PrivacyPolicyScreen() {
  return (
    <LegalShell title="Privacy Policy" updatedAt="April 16, 2026">
      <P>
        This Privacy Policy explains how Vibinn collects, uses, and shares information when you use
        the Service.
      </P>

      <div className="space-y-2">
        <H2>1. Information We Collect</H2>
        <P>We may collect the following categories of information:</P>
        <UL>
          <li>
            <span className="font-black text-white/90">Account info</span>: email, username,
            display name, profile details.
          </li>
          <li>
            <span className="font-black text-white/90">Content you create</span>: places you save,
            ratings, notes, photos, and posts you submit.
          </li>
          <li>
            <span className="font-black text-white/90">Usage data</span>: app interactions, feature
            usage, and diagnostics to keep Vibinn reliable.
          </li>
          <li>
            <span className="font-black text-white/90">Approximate location (optional)</span>: if
            you grant location permission, we may use your location to show nearby recommendations.
          </li>
        </UL>
      </div>

      <div className="space-y-2">
        <H2>2. How We Use Information</H2>
        <UL>
          <li>Provide, maintain, and improve Vibinn</li>
          <li>Personalize discovery and recommendations</li>
          <li>Enable social features (for example, sharing and profiles)</li>
          <li>Detect, prevent, and respond to fraud, abuse, or security issues</li>
          <li>Communicate with you about updates or support</li>
        </UL>
      </div>

      <div className="space-y-2">
        <H2>3. How We Share Information</H2>
        <P>We may share information:</P>
        <UL>
          <li>With service providers that help us operate Vibinn (hosting, analytics, auth)</li>
          <li>When you choose to make content public (for example, public profiles or lists)</li>
          <li>To comply with law, enforce terms, or protect rights and safety</li>
        </UL>
      </div>

      <div className="space-y-2">
        <H2>4. Third-Party Content and Links</H2>
        <P>
          Vibinn may show place information and photos sourced from third parties and may link to
          external sites. Their privacy practices are governed by their own policies.
        </P>
      </div>

      <div className="space-y-2">
        <H2>5. Data Retention</H2>
        <P>
          We retain information as long as needed to provide the Service and for legitimate business
          purposes (such as security, dispute resolution, and enforcing agreements). You can request
          deletion of your account in the app settings.
        </P>
      </div>

      <div className="space-y-2">
        <H2>6. Your Choices</H2>
        <UL>
          <li>Update profile settings and privacy settings in the app</li>
          <li>Control location permission in your device settings</li>
          <li>Request account deletion in the app settings</li>
        </UL>
      </div>

      <div className="space-y-2">
        <H2>7. Security</H2>
        <P>
          We use reasonable safeguards designed to protect your information. No system is 100%
          secure, so we cannot guarantee absolute security.
        </P>
      </div>

      <div className="space-y-2">
        <H2>8. Changes to This Policy</H2>
        <P>
          We may update this Privacy Policy from time to time. We will update the &quot;Last updated&quot;
          date and, if changes are material, take reasonable steps to notify you.
        </P>
      </div>

      <div className="space-y-2">
        <H2>9. Contact</H2>
        <P>
          Questions about privacy? Contact us at{' '}
          <a className="underline decoration-white/30 hover:decoration-white/70" href="mailto:support@vibinn.club">
            support@vibinn.club
          </a>
          .
        </P>
      </div>
    </LegalShell>
  );
}
