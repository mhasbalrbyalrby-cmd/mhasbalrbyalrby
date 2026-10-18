import { useEffect, useRef, useState } from 'react';
import { Camera, Flashlight, X, AlertCircle } from 'lucide-react';

type SupportedBarcodeFormat = 'ean_13' | 'code_128';
interface DetectedBarcode { rawValue: string; format: string }
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
function isValidEan13(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  const digits = value.split('').map(Number);
  const sum = digits.slice(0, 12).reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

function isSupportedValue(barcode: DetectedBarcode): boolean {
  if (barcode.format === 'ean_13') return isValidEan13(barcode.rawValue);
  if (barcode.format === 'code_128') return barcode.rawValue.length > 0 && barcode.rawValue.length <= 128 && /^[\x20-\x7E]+$/.test(barcode.rawValue);
  return false;
}

interface BarcodeDetectorConstructorLike {
  new (options: { formats: SupportedBarcodeFormat[] }): BarcodeDetectorLike;
}
interface TorchCapabilities extends MediaTrackCapabilities { torch?: boolean }
interface TorchConstraintSet extends MediaTrackConstraintSet { torch?: boolean }

interface BarcodeScannerProps {
  lang: 'ar' | 'en';
  onDetected: (value: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ lang, onDetected, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const lastValueRef = useRef('');
  const matchCountRef = useRef(0);
  const lastAcceptedAtRef = useRef(0);
  const onDetectedRef = useRef(onDetected);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);
  const [error, setError] = useState('');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [starting, setStarting] = useState(true);

  const ar = lang === 'ar';

  useEffect(() => {
    let disposed = false;

    async function startCamera() {
      try {
        const Detector = (window as Window & { BarcodeDetector?: BarcodeDetectorConstructorLike }).BarcodeDetector;
        if (!Detector) {
          throw new Error(ar
            ? 'المتصفح لا يدعم قراءة الباركود مباشرة. استخدم متصفحاً حديثاً أو أدخل الرقم يدوياً.'
            : 'This browser does not support native barcode scanning. Use a modern browser or enter the code manually.');
        }

        detectorRef.current = new Detector({ formats: ['ean_13', 'code_128'] });
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (disposed) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities() as TorchCapabilities;
        setTorchSupported(capabilities.torch === true);

        const video = videoRef.current;
        if (!video) throw new Error(ar ? 'تعذر تشغيل عرض الكاميرا.' : 'Could not initialize camera preview.');
        video.srcObject = stream;
        await video.play();
        if (!disposed) {
          setStarting(false);
          scanFrame();
        }
      } catch (cause) {
        if (!disposed) {
          setStarting(false);
          setError(cause instanceof Error ? cause.message : (ar ? 'تعذر تشغيل الكاميرا.' : 'Could not start the camera.'));
        }
      }
    }

    async function scanFrame() {
      if (disposed) return;
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        frameRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      try {
        const results = await detector.detect(video);
        const match = results.find(isSupportedValue);
        if (match && match.rawValue) {
          if (lastValueRef.current === match.rawValue) {
            matchCountRef.current += 1;
          } else {
            lastValueRef.current = match.rawValue;
            matchCountRef.current = 1;
          }
          const now = Date.now();
          if (matchCountRef.current >= 2 && now - lastAcceptedAtRef.current >= 1200) {
            lastAcceptedAtRef.current = now;
            onDetectedRef.current(match.rawValue);
            return;
          }
        } else {
          lastValueRef.current = '';
          matchCountRef.current = 0;
        }
      } catch {
        // A single frame can fail while focus/exposure adjusts; keep scanning.
      }
      if (!disposed) frameRef.current = requestAnimationFrame(scanFrame);
    }

    void startCamera();
    return () => {
      disposed = true;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    };
  }, [ar]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as TorchConstraintSet] } as MediaTrackConstraints);
      setTorchOn(next);
      setError('');
    } catch {
      setTorchSupported(false);
      setTorchOn(false);
      setError(ar ? 'تعذر تشغيل الفلاش على هذا الجهاز؛ يمكنك متابعة المسح دون فلاش.' : 'The device could not enable the torch. You can continue scanning without it.');
    }
  }

  return (
    <div className="space-y-3" role="region" aria-label={ar ? 'قارئ الباركود' : 'Barcode scanner'}>
      <div className="relative overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} className="block w-full max-h-72 object-contain" autoPlay muted playsInline aria-label={ar ? 'معاينة الكاميرا لقراءة الباركود' : 'Camera preview for barcode scanning'} />
        {starting && <div className="absolute inset-0 flex items-center justify-center text-white text-sm"><Camera className="w-5 h-5 me-2 animate-pulse" />{ar ? 'جارٍ تشغيل الكاميرا…' : 'Starting camera…'}</div>}
        <div className="absolute top-3 end-3 flex gap-2">
          <button type="button" onClick={() => void toggleTorch()} disabled={!torchSupported} aria-label={ar ? (torchOn ? 'إيقاف الفلاش' : 'تشغيل الفلاش') : (torchOn ? 'Turn torch off' : 'Turn torch on')} title={torchSupported ? (ar ? 'الفلاش' : 'Torch') : (ar ? 'الفلاش غير مدعوم على هذا الجهاز' : 'Torch not supported on this device')} className="rounded-lg bg-white/90 text-gray-900 p-2 disabled:opacity-50">
            <Flashlight className="w-5 h-5" />
          </button>
          <button type="button" onClick={onClose} aria-label={ar ? 'إغلاق قارئ الباركود' : 'Close barcode scanner'} className="rounded-lg bg-white/90 text-gray-900 p-2">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      <p className="text-sm text-[var(--color-text-muted)]">{ar ? 'وجّه الكاميرا نحو باركود EAN-13 أو CODE-128 وثبّت الصورة لحظة.' : 'Point the camera at an EAN-13 or CODE-128 barcode and hold it steady.'}</p>
      {error && <div role="alert" className="flex items-start gap-2 rounded-lg bg-error-50 dark:bg-error-900/30 p-3 text-sm text-error-700 dark:text-error-300"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span></div>}
    </div>
  );
}
