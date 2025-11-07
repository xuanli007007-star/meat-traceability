import { useEffect, useRef } from 'react';

export type QRScannerProps = {
  onDetected: (text: string) => void;
  onClose: () => void;
  onError?: (message: string) => void;
};

type CameraDevice = { id: string; label: string };

type StartSource = { facingMode: string | { ideal: string } } | string;

type Html5QrcodeInstance = {
  start(
    cameraConfig: StartSource,
    config: { fps: number; qrbox: { width: number; height: number } },
    onSuccess: (decodedText: string) => void,
    onError?: (err: string) => void
  ): Promise<void>;
  stop(): Promise<void>;
  clear(): Promise<void>;
};

type ScannerModule = {
  create: (elementId: string) => Html5QrcodeInstance;
  getCameras?: () => Promise<CameraDevice[]>;
};

let loaderPromise: Promise<ScannerModule> | null = null;

type BarcodeDetectorDetection = { rawValue: string; format?: string };

type BarcodeDetectorInstance = {
  detect(source: CanvasImageSource | Blob | ImageData): Promise<BarcodeDetectorDetection[]>;
};

type BarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance;
  getSupportedFormats(): Promise<string[]>;
};

class NativeBarcodeScanner implements Html5QrcodeInstance {
  private host: HTMLElement;
  private video: HTMLVideoElement;
  private stream: MediaStream | null = null;
  private detector: BarcodeDetectorInstance | null = null;
  private running = false;
  private frameRequest: number | null = null;
  private detectionErrorNotified = false;

  constructor(elementId: string) {
    const host = document.getElementById(elementId);
    if (!host) {
      throw new Error('扫码容器未准备就绪');
    }
    this.host = host;
    this.host.innerHTML = '';

    const video = document.createElement('video');
    video.playsInline = true;
    video.autoplay = true;
    video.muted = true;
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    this.video = video;

    const tips = document.createElement('div');
    tips.style.position = 'absolute';
    tips.style.left = '50%';
    tips.style.bottom = '16px';
    tips.style.transform = 'translateX(-50%)';
    tips.style.padding = '6px 12px';
    tips.style.background = 'rgba(15, 23, 42, 0.55)';
    tips.style.color = '#fff';
    tips.style.fontSize = '12px';
    tips.style.borderRadius = '999px';
    tips.textContent = '请对准二维码，系统会自动识别';

    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    wrapper.appendChild(video);
    wrapper.appendChild(tips);

    this.host.appendChild(wrapper);
  }

  private stopLoop() {
    if (this.frameRequest !== null) {
      cancelAnimationFrame(this.frameRequest);
      this.frameRequest = null;
    }
    this.running = false;
  }

  async start(
    cameraConfig: StartSource,
    _config: { fps: number; qrbox: { width: number; height: number } },
    onSuccess: (decodedText: string) => void,
    onError?: (err: string) => void
  ): Promise<void> {
    if (typeof window === 'undefined') {
      throw new Error('仅限浏览器环境');
    }
    if (!('mediaDevices' in navigator) || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('当前浏览器不支持摄像头调用');
    }
    const barcodeDetectorCtor = (window as Window & {
      BarcodeDetector?: BarcodeDetectorConstructor;
    }).BarcodeDetector;

    if (!barcodeDetectorCtor) {
      throw new Error('当前浏览器不支持原生扫码，请升级浏览器或改用 Chrome/Edge 最新版');
    }

    if (this.running) {
      await this.stop();
    }

    this.detectionErrorNotified = false;
    const videoConstraints: MediaTrackConstraints =
      typeof cameraConfig === 'string'
        ? { deviceId: { exact: cameraConfig } }
        : (cameraConfig as MediaTrackConstraints);

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: {
        ...videoConstraints,
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '摄像头权限获取失败';
      throw new Error(message);
    }

    this.video.srcObject = this.stream;
    await this.video.play().catch(() => undefined);

    try {
      this.detector = new barcodeDetectorCtor({ formats: ['qr_code'] });
    } catch (error) {
      await this.stop();
      const message =
        error instanceof Error ? error.message : '初始化扫码器失败';
      throw new Error(message);
    }

    this.running = true;

    const scanFrame = async () => {
      if (!this.running || !this.detector) {
        return;
      }
      try {
        const results = await this.detector.detect(this.video);
        if (results.length > 0) {
          const value = results[0]?.rawValue?.trim();
          if (value) {
            this.stopLoop();
            onSuccess(value);
            return;
          }
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        if (!this.detectionErrorNotified) {
          onError?.(message);
          this.detectionErrorNotified = true;
        }
      }
      if (this.running) {
        this.frameRequest = requestAnimationFrame(scanFrame);
      }
    };

    this.frameRequest = requestAnimationFrame(scanFrame);
  }

  async stop(): Promise<void> {
    this.stopLoop();
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.detector = null;
    this.detectionErrorNotified = false;
  }

  async clear(): Promise<void> {
    this.stopLoop();
    this.host.innerHTML = '';
    this.detectionErrorNotified = false;
  }

  static async getCameras(): Promise<CameraDevice[]> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return [];
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((item) => item.kind === 'videoinput')
        .map((item, index) => ({
          id: item.deviceId,
          label: item.label || `摄像头${index + 1}`,
        }));
    } catch (error) {
      console.warn('[QRScanner] enumerateDevices error', error);
      return [];
    }
  }
}

async function loadScanner(): Promise<ScannerModule> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('仅限浏览器环境加载扫码库'));
  }

  if (!loaderPromise) {
    loaderPromise = Promise.resolve({
      create: (elementId: string) => new NativeBarcodeScanner(elementId),
      getCameras: NativeBarcodeScanner.getCameras,
    });
  }

  return loaderPromise;
}

function pickCameraSource(cameras: CameraDevice[] | undefined): StartSource {
  if (!cameras || cameras.length === 0) {
    return { facingMode: { ideal: 'environment' } };
  }

  const back = cameras.find(({ label }) => /back|rear|environment|后置/i.test(label));
  return (back ?? cameras[0]).id;
}

export default function QRScanner({ onDetected, onClose, onError }: QRScannerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5QrcodeInstance | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const scannerModule = await loadScanner();
        if (!wrapperRef.current) return;

        const elementId = `qr-reader-${Math.random().toString(36).slice(2)}`;
        const host = document.createElement('div');
        host.id = elementId;
        host.style.width = '100%';
        wrapperRef.current.innerHTML = '';
        wrapperRef.current.appendChild(host);

        let cameras: CameraDevice[] | undefined;
        if (typeof scannerModule.getCameras === 'function') {
          try {
            cameras = await scannerModule.getCameras();
          } catch (cameraErr) {
            console.warn('[QRScanner] 获取摄像头列表失败', cameraErr);
          }
        }

        const scanner = scannerModule.create(elementId);
        scannerRef.current = scanner;

        const startSource = pickCameraSource(cameras);

        await scanner.start(
          startSource,
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
