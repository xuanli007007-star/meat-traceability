import { useEffect, useRef, useState } from 'react';

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
  scanFile(file: File, showImage?: boolean): Promise<string>;
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
  if (window.Html5Qrcode) return Promise.resolve(window.Html5Qrcode);

  if (!loaderPromise) {
    loaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/html5-qrcode@2.3.10/minified/html5-qrcode.min.js';
      script.async = true;
      script.onload = () => {
        if (window.Html5Qrcode) resolve(window.Html5Qrcode);
        else { loaderPromise = null; reject(new Error('扫码库加载失败')); }
      };
      script.onerror = () => { loaderPromise = null; reject(new Error('无法加载扫码库')); };
      document.body.appendChild(script);
    });
  }
  return loaderPromise;
}

// 简单环境探测
const getEnv = () => {
  const isBrowser = typeof window !== 'undefined';
  const ua = isBrowser ? navigator.userAgent : '';
  const isIOS = /iP(hone|ad|od)/.test(ua);
  const isIOSChrome = /CriOS/.test(ua);
  const isSecure = isBrowser && window.isSecureContext; // 必须 https
  const canMedia = isBrowser && !!navigator.mediaDevices?.getUserMedia;
  return { isBrowser, ua, isIOS, isIOSChrome, isSecure, canMedia };
};

export default function QRScanner({ onDetected, onClose, onError }: QRScannerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5QrcodeInstance | null>(null);
  const [fallback, setFallback] = useState(false); // 拍照/相册识别兜底
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hint, setHint] = useState<string>('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { isSecure, canMedia, isIOS, isIOSChrome } = getEnv();
        const Html5Qrcode = await loadHtml5Qrcode();

        if (!wrapperRef.current) return;

        // 不满足基本条件 → 直接兜底
        if (!isSecure || !canMedia) {
          setFallback(true);
          setHint('未获得摄像头权限或非 HTTPS 环境，已切换到拍照/相册识别。');
          return;
        }

        // 容器
        const elementId = `qr-reader-${Math.random().toString(36).slice(2)}`;
        wrapperRef.current.innerHTML = '';
        const host = document.createElement('div');
        host.id = elementId;
        host.style.width = '100%';
        wrapperRef.current.appendChild(host);

        const scanner = new Html5Qrcode(elementId, { verbose: false });
        scannerRef.current = scanner;

        // iOS Chrome 经常卡权限，这里先探测设备
        try {
          const devs = await navigator.mediaDevices.enumerateDevices();
          const hasCam = devs?.some(d => d.kind === 'videoinput');
          if ((isIOS && isIOSChrome) && !hasCam) {
            setFallback(true);
            setHint('未检测到可用摄像头，已切换到拍照/相册识别。');
            return;
          }
        } catch {
          // enumerateDevices 失败也不阻塞主流程
        }

        // 更保守的 iOS 参数（更稳）
        const fps = 5;
        const box = { width: 240, height: 240 };

        await scanner.start(
          { facingMode: { ideal: 'environment' } },
          { fps, qrbox: box },
          (decodedText: string) => {
            if (cancelled) return;
            const value = decodedText?.trim();
            if (!value) return;
            cancelled = true;
            scanner.stop().catch(() => undefined).finally(() => onDetected(value));
          },
          () => undefined
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        // 常见错误名处理
        if (/NotAllowedError/i.test(message)) {
          setHint('未授予相机权限：请到系统设置为 Safari/Chrome 打开“相机”权限后重试，已切换到拍照/相册识别。');
        } else if (/NotFoundError|OverconstrainedError/i.test(message)) {
          setHint('未找到可用摄像头或被占用，已切换到拍照/相册识别。');
        } else if (/NotSupportedError/i.test(message)) {
          setHint('当前环境不支持相机（可能是非 HTTPS / 无痕模式），已切换到拍照/相册识别。');
        } else {
          setHint(`无法打开摄像头（${message}），已切换到拍照/相册识别。`);
        }

        onError?.(message);
        setFallback(true);
      }
    })();

    return () => {
      cancelled = true;
      if (scannerRef.current) {
        scannerRef.current
          .stop()
          .catch(() => undefined)
          .then(() => scannerRef.current?.clear().catch(() => undefined))
          .finally(() => { scannerRef.current = null; });
      }
    };
  }, [onDetected, onClose, onError]);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const Html5Qrcode = await loadHtml5Qrcode();
      // 用文件识别模式
      const tmpId = `qr-file-${Math.random().toString(36).slice(2)}`;
      if (wrapperRef.current) wrapperRef.current.innerHTML = `<div id="${tmpId}" style="display:none"></div>`;
      const reader = new Html5Qrcode(tmpId);
      const text = await reader.scanFile(file, true);
      await reader.clear();
      onDetected(text.trim());
    } catch (err) {
      onError?.(err instanceof Error ? err.message : String(err));
      alert('无法识别该图片中的二维码，请重试或在光线充足处重新拍照。');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="qr-overlay">
      <div className="qr-dialog">
        {!fallback ? (
          <>
            <div ref={wrapperRef} className="qr-view" />
            <p className="qr-hint">若无法打开摄像头，请到 iPhone 设置 → Safari/Chrome → 相机 允许。</p>
            <div className="qr-actions">
              <button type="button" className="qr-close" onClick={onClose}>关闭</button>
            </div>
          </>
        ) : (
          <>
            <h3 className="qr-title">相机不可用，改用“拍照/相册识别”</h3>
            {hint && <p className="qr-hint">{hint}</p>}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"   // iOS 优先后置摄像头
              onChange={onPickFile}
              className="qr-input"
            />
            <div className="qr-actions">
              <button type="button" className="qr-close" onClick={onClose}>关闭</button>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        .qr-overlay{position:fixed;inset:0;background:rgba(0,0,0,.68);display:flex;align-items:center;justify-content:center;padding:20px;z-index:9999}
        .qr-dialog{width:100%;max-width:420px;background:#fff;border-radius:14px;padding:16px;box-shadow:0 20px 45px rgba(15,23,42,.2);display:flex;flex-direction:column;gap:12px}
        .qr-view{width:100%;min-height:260px;border-radius:12px;overflow:hidden}
        .qr-title{margin:4px 0 0 0}
        .qr-hint{font-size:12px;color:#64748b;margin:4px 2px}
        .qr-input{width:100%;padding:10px 14px;border-radius:10px;border:1px solid #e2e8f0;background:#f8fafc}
        .qr-actions{display:flex;gap:8px;flex-wrap:wrap}
        .qr-close{flex:1;padding:10px 14px;border-radius:10px;border:1px solid #cbd5f5;background:#f8fafc;cursor:pointer;font-size:14px}
        .qr-close:hover{background:#e2e8f0}
      `}</style>
    </div>
  );
}
