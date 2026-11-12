import { PublicPage } from '@/components/SiteChrome';
import { ForgotForm } from '@/components/AuthForms';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Reset your password — CES Essentials' };

export default function Page() {
  return (
    <PublicPage title="Reset your password">
      <p className="mb-6 text-lg text-muted">Enter your account email and we’ll send you a link to choose a new password.</p>
      <ForgotForm />
    </PublicPage>
  );
}
