import { useState } from 'react';
import { ContactRound, Loader2 } from 'lucide-react';

type PickedContact = { name?: string[]; tel?: string[] };
type ContactPickerNavigator = Navigator & {
  contacts?: {
    select: (properties: Array<'name' | 'tel'>, options?: { multiple?: boolean }) => Promise<PickedContact[]>;
  };
};

type Props = {
  onSelect: (contact: { name: string; phone: string }) => void;
  lang: string;
  className?: string;
};

/**
 * Uses the browser Contact Picker API only after an explicit user click.
 * Selected values stay in component memory and are passed to the form only;
 * this component does not persist or upload contact-book data.
 */
export default function ContactPickerButton({ onSelect, lang, className = '' }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const ar = lang === 'ar';

  async function chooseContact() {
    setMessage('');
    const contactNavigator = navigator as ContactPickerNavigator;
    if (!window.isSecureContext || !contactNavigator.contacts?.select) {
      setMessage(ar
        ? 'اختيار جهات الاتصال غير مدعوم في هذا المتصفح. يمكنك إدخال الاسم والرقم يدويًا.'
        : 'Contact Picker is not supported in this browser. Enter the name and phone manually.');
      return;
    }

    setBusy(true);
    try {
      // The browser opens its native picker after this user gesture.
      const selected = await contactNavigator.contacts.select(['name', 'tel'], { multiple: false });
      const contact = selected?.[0];
      const name = contact?.name?.find(value => value.trim())?.trim() ?? '';
      const phone = contact?.tel?.find(value => value.trim())?.trim() ?? '';
      if (!name && !phone) {
        setMessage(ar ? 'لم تتضمن جهة الاتصال المختارة اسمًا أو رقم هاتف.' : 'The selected contact did not contain a name or phone number.');
        return;
      }
      onSelect({ name, phone });
    } catch (error) {
      // Cancellation is normal and must not be treated as a permission failure.
      if (error instanceof Error && error.name !== 'AbortError') {
        setMessage(ar ? 'تعذر فتح جهات الاتصال. تحقق من إذن المتصفح أو أدخل البيانات يدويًا.' : 'Could not open contacts. Check browser support/permission or enter details manually.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => void chooseContact()}
        disabled={busy}
        className="btn-secondary inline-flex items-center justify-center gap-2"
        aria-label={ar ? 'اختيار من جهات اتصال الهاتف' : 'Choose from phone contacts'}
        title={ar ? 'اختيار من جهات اتصال الهاتف' : 'Choose from phone contacts'}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ContactRound className="h-4 w-4" />}
        <span>{ar ? 'جهات الاتصال' : 'Contacts'}</span>
      </button>
      {message && <p role="status" className="mt-1 text-xs text-[var(--color-text-muted)]">{message}</p>}
    </div>
  );
}
