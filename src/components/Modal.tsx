```tsx
import { type ReactNode, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
}: ModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    closeButtonRef.current?.focus();
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  let maxWClass = 'max-w-md';

  if (size === 'sm') {
    maxWClass = 'max-w-sm';
  } else if (size === 'lg') {
    maxWClass = 'max-w-2xl';
  }

  const modalClassName =
    'relative w-full ' +
    maxWClass +
    ' card shadow-xl animate-scale-in max-h-[90vh] overflow-y-auto';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={modalClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--color-border)]">
          <h3
            id="modal-title"
            className="font-semibold text-[var(--color-text)]"
          >
            {title}
          </h3>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="btn-secondary !p-1.5"
            aria-label="إغلاق النافذة"
            title="إغلاق"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

export default Modal;
```
