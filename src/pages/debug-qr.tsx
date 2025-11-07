import { useEffect, useRef, useState } from 'react';

export default function DebugQR() {
  const [log, setLog] = useState<string[]>([]);
  const [env, setEnv] = useState<any>({});
  const [scanOpen, setScanOpen] = useState(false);
  const [fallback, setFallback] = useState(false);
  const mountRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<any>(null);
  const p = (s: string) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${s}`, ...prev]);

  useEffect(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    setEnv({
      href: typeof location !== 'undefined' ? location.href : '',
      secure: typeof window !== 'undefined' && window.isSecureContext,
      media: typeof navigator !== 'undefined' && !!navigator.mediaDevices,
      gum: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
      ua,
      isIOS: /iP(hone|ad|od)/.test(ua),
      isIOSChrome: /CriOS/.test(ua),
    });
  }, []);

  async function testGetUserMedia() {
    p('开始测试 getUserMedia...');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      p('getUserMedia: ✅ OK');
      s.getTracks().forEach(t => t.stop());
    } catch (e: any) {
      p(`getUserMedia: ❌ ${e?.name || 'Error'} - ${e?.message || e}`);
    }
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      p('enumerateDevices: ' + JSON.stringify(devs.map(d => ({ kind: d.kind, label: d.label?.slice(0,20) }))));
    } catch (e: any) {
      p('enumerateDevices error: ' + (e?.message || e));
    }
  }

  async function openScanner() {
    setScanOpen(true);
    p('尝试加载 html5-qrcode...');
    try {
      const Html5Qrcode = await loadHtml5Qrcode();
      if (!mountRef.current) return;

      const id = 'qr-' + Math.random().toString(36).slice(2);
      mountRef.current.innerHTML = `<div id="${id}" style="width:100%"></div>`;
      const inst = new Html5Qrcode(id);
      scannerRef.current = inst;

      if (!env.secure || !env.gum) {
        setFallback(true);
        p('不满足 HTTPS 或 getUserMedia 不可用，启用拍照识别兜底');
        return;
      }

      await inst.start(
        { facingMode: { ideal: 'environment' } },
        { fps: 5, qrbox: { width: 240, height: 240 } },
        (txt: string) => { p('识别成功：' + txt); stopScanner(); alert('识别成功：' + txt); },
        () => {}
      );
      p('html5-qrcode 相机启动✅');
    } catch (e: any) {
      p('html5-qrcode 启动失败：' + (e?.message || e));
      setFallback(true);
    }
  }

  async function stopScanner() {
    try { await scannerRef.current?.stop(); } catch {}
    try { await scannerRef.current?.clear(); } catch {}
    scannerRef.current = null;
    setScanOpen(false);
  }

  async function scanFromFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const Html5Qrcode = await loadHtml5Qrcode();
      const id = 'qr-file-' + Math.random().toString(36).slice(2);
      if (mountRef.current) mountRef.current.innerHTML = `<div id="${id}" style="display:none"></div>`;
      const r = new Html5Qrcode(id);
      const txt = await r.scanFile(file, true);
      await r.clear();
      p('图片识别成功：' + txt);
      alert('图片识别成功：' + txt);
      stopScanner();
    } catch (e: any) {
      p('图片识别失败：' + (e?.message || e));
      alert('无法识别该图片中的二维码，请重试');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div style={{padding:16,maxWidth:860,margin:'0 auto'}}>
      <h1>QR 调试页</h1>
      <div style={{fontSize:13,opacity:.8,whiteSpace:'pre-wrap'}}>
        <b>URL:</b> {env.href}{'\n'}
        <b>HTTPS:</b> {String(env.secure)}{'\n'}
        <b>UA:</b> {env.ua}{'\n'}
        <b>isIOS:</b> {String(env.isIOS)} | isIOSChrome: {String(env.isIOSChrome)}{'\n'}
        <b>mediaDevices:</b> {String(env.media)} | getUserMedia: {String(env.gum)}
      </div>

      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}>
        <button onClick={testGetUserMedia}>📋 测试 getUserMedia</button>
        {!scanOpen && <button onClick={openScanner}>📷 打开扫码（相机）</button>}
        {scanOpen && <button onClick={stopScanner}>⏹ 停止相机</button>}
      </div>

      {scanOpen && (
        <div style={{marginTop:14,border:'1px solid #e2e8f0',borderRadius:12,padding:12}}>
          {!fallback ? (
            <>
              <div ref={mountRef} style={{width:'100%',minHeight:260,borderRadius:12,overflow:'hidden'}} />
              <p style={{fontSize:12,opacity:.7,marginTop:8}}>
                若无法打开相机：到 设置→Safari/Chrome→相机 允许；确认 HTTPS；非无痕；别在内置 WebView。
              </p>
            </>
          ) : (
            <>
              <h3 style={{margin:'6px 0'}}>相机不可用，改用拍照/相册识别</h3>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={scanFromFile}
                     style={{width:'100%',padding:'10px 12px',border:'1px solid #e2e8f0',borderRadius:8}} />
              <p style={{fontSize:12,opacity:.7,marginTop:8}}>拍一张二维码清晰照片进行识别。</p>
            </>
          )}
        </div>
      )}

      <h3 style={{marginTop:18}}>日志</h3>
      <pre style={{whiteSpace:'pre-wrap',fontSize:12,background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8,padding:10,maxHeight:320,overflow:'auto'}}>
{log.join('\n')}
      </pre>
    </div>
  );
}

let html5Loader: Promise<any> | null = null;
function loadHtml5Qrcode(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('仅限浏览器环境'));
  if ((window as any).Html5Qrcode) return Promise.resolve((window as any).Html5Qrcode);
  if (!html5Loader) {
    html5Loader = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/html5-qrcode@2.3.10/minified/html5-qrcode.min.js';
      s.async = true;
      s.onload = () => (window as any).Html5Qrcode ? resolve((window as any).Html5Qrcode) : reject(new Error('加载失败'));
      s.onerror = () => reject(new Error('无法加载 html5-qrcode'));
      document.body.appendChild(s);
    });
  }
  return html5Loader;
}
import { useEffect, useRef, useState } from 'react';

export default function DebugQR() {
  const [log, setLog] = useState<string[]>([]);
  const [env, setEnv] = useState<any>({});
  const [scanOpen, setScanOpen] = useState(false);
  const [fallback, setFallback] = useState(false);
  const mountRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<any>(null);
  const p = (s: string) => setLog(prev => [`[${new Date().toLocaleTimeString()}] ${s}`, ...prev]);

  useEffect(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    setEnv({
      href: typeof location !== 'undefined' ? location.href : '',
      secure: typeof window !== 'undefined' && window.isSecureContext,
      media: typeof navigator !== 'undefined' && !!navigator.mediaDevices,
      gum: typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
      ua,
      isIOS: /iP(hone|ad|od)/.test(ua),
      isIOSChrome: /CriOS/.test(ua),
    });
  }, []);

  async function testGetUserMedia() {
    p('开始测试 getUserMedia...');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      p('getUserMedia: ✅ OK');
      s.getTracks().forEach(t => t.stop());
    } catch (e: any) {
      p(`getUserMedia: ❌ ${e?.name || 'Error'} - ${e?.message || e}`);
    }
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      p('enumerateDevices: ' + JSON.stringify(devs.map(d => ({ kind: d.kind, label: d.label?.slice(0,20) }))));
    } catch (e: any) {
      p('enumerateDevices error: ' + (e?.message || e));
    }
  }

  async function openScanner() {
    setScanOpen(true);
    p('尝试加载 html5-qrcode...');
    try {
      const Html5Qrcode = await loadHtml5Qrcode();
      if (!mountRef.current) return;

      const id = 'qr-' + Math.random().toString(36).slice(2);
      mountRef.current.innerHTML = `<div id="${id}" style="width:100%"></div>`;
      const inst = new Html5Qrcode(id);
      scannerRef.current = inst;

      if (!env.secure || !env.gum) {
        setFallback(true);
        p('不满足 HTTPS 或 getUserMedia 不可用，启用拍照识别兜底');
        return;
      }

      await inst.start(
        { facingMode: { ideal: 'environment' } },
        { fps: 5, qrbox: { width: 240, height: 240 } },
        (txt: string) => { p('识别成功：' + txt); stopScanner(); alert('识别成功：' + txt); },
        () => {}
      );
      p('html5-qrcode 相机启动✅');
    } catch (e: any) {
      p('html5-qrcode 启动失败：' + (e?.message || e));
      setFallback(true);
    }
  }

  async function stopScanner() {
    try { await scannerRef.current?.stop(); } catch {}
    try { await scannerRef.current?.clear(); } catch {}
    scannerRef.current = null;
    setScanOpen(false);
  }

  async function scanFromFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const Html5Qrcode = await loadHtml5Qrcode();
      const id = 'qr-file-' + Math.random().toString(36).slice(2);
      if (mountRef.current) mountRef.current.innerHTML = `<div id="${id}" style="display:none"></div>`;
      const r = new Html5Qrcode(id);
      const txt = await r.scanFile(file, true);
      await r.clear();
      p('图片识别成功：' + txt);
      alert('图片识别成功：' + txt);
      stopScanner();
    } catch (e: any) {
      p('图片识别失败：' + (e?.message || e));
      alert('无法识别该图片中的二维码，请重试');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div style={{padding:16,maxWidth:860,margin:'0 auto'}}>
      <h1>QR 调试页</h1>
      <div style={{fontSize:13,opacity:.8,whiteSpace:'pre-wrap'}}>
        <b>URL:</b> {env.href}{'\n'}
        <b>HTTPS:</b> {String(env.secure)}{'\n'}
        <b>UA:</b> {env.ua}{'\n'}
        <b>isIOS:</b> {String(env.isIOS)} | isIOSChrome: {String(env.isIOSChrome)}{'\n'}
        <b>mediaDevices:</b> {String(env.media)} | getUserMedia: {String(env.gum)}
      </div>

      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}>
        <button onClick={testGetUserMedia}>📋 测试 getUserMedia</button>
        {!scanOpen && <button onClick={openScanner}>📷 打开扫码（相机）</button>}
        {scanOpen && <button onClick={stopScanner}>⏹ 停止相机</button>}
      </div>

      {scanOpen && (
        <div style={{marginTop:14,border:'1px solid #e2e8f0',borderRadius:12,padding:12}}>
          {!fallback ? (
            <>
              <div ref={mountRef} style={{width:'100%',minHeight:260,borderRadius:12,overflow:'hidden'}} />
              <p style={{fontSize:12,opacity:.7,marginTop:8}}>
                若无法打开相机：到 设置→Safari/Chrome→相机 允许；确认 HTTPS；非无痕；别在内置 WebView。
              </p>
            </>
          ) : (
            <>
              <h3 style={{margin:'6px 0'}}>相机不可用，改用拍照/相册识别</h3>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={scanFromFile}
                     style={{width:'100%',padding:'10px 12px',border:'1px solid #e2e8f0',borderRadius:8}} />
              <p style={{fontSize:12,opacity:.7,marginTop:8}}>拍一张二维码清晰照片进行识别。</p>
            </>
          )}
        </div>
      )}

      <h3 style={{marginTop:18}}>日志</h3>
      <pre style={{whiteSpace:'pre-wrap',fontSize:12,background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:8,padding:10,maxHeight:320,overflow:'auto'}}>
{log.join('\n')}
      </pre>
    </div>
  );
}

let html5Loader: Promise<any> | null = null;
function loadHtml5Qrcode(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('仅限浏览器环境'));
  if ((window as any).Html5Qrcode) return Promise.resolve((window as any).Html5Qrcode);
  if (!html5Loader) {
    html5Loader = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/html5-qrcode@2.3.10/minified/html5-qrcode.min.js';
      s.async = true;
      s.onload = () => (window as any).Html5Qrcode ? resolve((window as any).Html5Qrcode) : reject(new Error('加载失败'));
      s.onerror = () => reject(new Error('无法加载 html5-qrcode'));
      document.body.appendChild(s);
    });
  }
  return html5Loader;
}
