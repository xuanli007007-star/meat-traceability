export {};

declare global {
  interface BarcodeDetectorOptions {
    formats?: string[];
  }

  type BarcodeDetectorSource =
    | HTMLImageElement
    | HTMLVideoElement
    | HTMLCanvasElement
    | ImageBitmap
    | OffscreenCanvas
    | Blob
    | ImageData;

  interface BarcodeDetectorResult {
    rawValue: string;
    format?: string;
  }

  class BarcodeDetector {
    constructor(options?: BarcodeDetectorOptions);
    static getSupportedFormats(): Promise<string[]>;
    detect(source: BarcodeDetectorSource): Promise<BarcodeDetectorResult[]>;
  }

  interface Window {
    BarcodeDetector?: typeof BarcodeDetector;
  }
}
