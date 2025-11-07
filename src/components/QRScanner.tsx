import { useEffect, useRef } from 'react';

export type QRScannerProps = {
  onDetected: (text: string) => void;
  onClose: () => void;
  onError?: (message: string) => void;
};

type Html5QrcodeInstance = {
  start(
    cameraConfig: { facingMode: string | { ideal: string } },
    config: { fps: number; qrbox: { width: number; height: number } },
    onSuccess: (decodedText: string) => void,
    onError?: (err: string) => void
  ): Promise<void>;
  stop(): Promise<void>;
  clear(): Promise<void>;
};

type Html5QrcodeCtor = new (elementId: string, config?: { verbose?: boolean }) => Html5QrcodeInstance;

declare global {
  interface Window {
    Html5Qrcode?: Html5QrcodeCtor;
  }
}

let loaderPromise: Promise<Html5QrcodeCtor> | null = null;

function loadHtml5Qrcode(): Promise<Html5QrcodeCtor> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('仅限浏览器环境加载扫码库'));
  }
  if (window.Html5Qrcode) {
    return Promise.resolve(window.Html5Qrcode);
  }
  if (!loaderPromise) {
    loaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/html5-qrcode@2.3.10/minified/html5-qrcode.min.js';
      script.async = true;
      script.onload = () => {
        if (window.Html5Qrcode) {
          resolve(window.Html5Qrcode);
        } else {
          loaderPromise = null;
          reject(new Error('扫码库加载失败'));
        }
      };
      script.onerror = () => {
        loaderPromise = null;
        reject(new Error('无法加载扫码库'));
      };
      document.body.appendChild(script);
    });
  }
  return loaderPromise;
}

export default function QRScanner({ onDetected, onClose, onError }: QRScannerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5QrcodeInstance | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const Html5Qrcode = await loadHtml5Qrcode();
        if (!wrapperRef.current) return;

        const elementId = `qr-reader-${Math.random().toString(36).slice(2)}`;
        const host = document.createElement('div');
        host.id = elementId;
        host.style.width = '100%';
        wrapperRef.current.innerHTML = '';
        wrapperRef.current.appendChild(host);

        const scanner = new Html5Qrcode(elementId, { verbose: false });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: { ideal: 'environment' } },
          { fps: 10, qrbox: { width: 260, height: 260 } },
          (decodedText: string) => {
            if (cancelled) return;
            const value = decodedText?.trim();
            if (!value) return;
            cancelled = true;
            scanner
              .stop()
              .catch(() => undefined)
              .finally(() => {
                onDetected(value);
              });
          },
          () => undefined
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        window.alert(`无法打开摄像头：${message}`);
        onError?.(message);
        onClose();
      }
    })();

    return () => {
      cancelled = true;
      if (scannerRef.current) {
        scannerRef.current
          .stop()
          .catch(() => undefined)
          .then(() => scannerRef.current?.clear().catch(() => undefined))
          .finally(() => {
            scannerRef.current = null;
          });
      }
    };
  }, [onDetected, onClose, onError]);

  return (
    <div className="qr-overlay">
      <div className="qr-dialog">
        <div ref={wrapperRef} className="qr-view" />
        <button type="button" className="qr-close" onClick={onClose}>
          关闭
        </button>
      </div>
      <style jsx>{`
        .qr-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.68);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          z-index: 9999;
        }
        .qr-dialog {
          width: 100%;
          max-width: 420px;
          background: #fff;
          border-radius: 14px;
          padding: 16px;
          box-shadow: 0 20px 45px rgba(15, 23, 42, 0.2);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .qr-view {
          width: 100%;
          min-height: 260px;
          border-radius: 12px;
          overflow: hidden;
        }
        .qr-close {
          width: 100%;
          padding: 10px 14px;
          border-radius: 10px;
          border: 1px solid #cbd5f5;
          background: #f8fafc;
          cursor: pointer;
          font-size: 14px;
        }
        .qr-close:hover {
          background: #e2e8f0;
        }
      `}</style>
    </div>
  );
}
