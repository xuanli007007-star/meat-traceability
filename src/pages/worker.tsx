import React, { useEffect, useMemo, useRef, useState } from 'react';

type Html5QrcodeInstance = {
  start(
    cameraConfig: any,
    config: { fps?: number; qrbox?: number | { width: number; height: number } },
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
import { supabase } from '@/lib/supabase';
import { cx } from '@/lib/cx';
import styles from '@/styles/layout.module.css';
import { useRouter } from 'next/router';

type Profile = { id:string; role:'admin'|'worker'; org_id:string };
type StepId = 'INBOUND_WEIGHT'|'CUTTING'|'PACK'|'OUTBOUND';
type EventRow = {
  id:number; created_at:string; org_id:string; operator:string;
  step:StepId; qr:string; weight_kg:number|null; note:string|null; created_by:string|null;
};

type StageId = 'TRADE'|'OPERATOR'|'FORM';

const STAGES: { id:StageId; label:string }[] = [
  { id: 'TRADE', label: '① 选择工种' },
  { id: 'OPERATOR', label: '② 操作员' },
  { id: 'FORM', label: '③ 作业表单' },
];

const TRADES: {id:StepId; name:string}[] = [
  { id:'INBOUND_WEIGHT', name:'入库称重' },
  { id:'CUTTING',        name:'分割' },
  { id:'PACK',           name:'包装' },
  { id:'OUTBOUND',       name:'出库' },
];

export default function Worker() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile|null>(null);
  const [userId, setUserId] = useState<string>('');
  const [operator, setOperator] = useState('');
  const [opManual, setOpManual] = useState('');
  const [trade, setTrade] = useState<StepId | null>(null);
  const [stage, setStage] = useState<StageId>('TRADE');

  // 作业输入
  const [qr, setQr] = useState('');
  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');
  const qrRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream|null>(null);
  const frameRef = useRef<number>();
  const [canScan, setCanScan] = useState(false);
  const [scannerMode, setScannerMode] = useState<'BARCODE' | 'HTML5_QRCODE' | null>(null);
  const [scanActive, setScanActive] = useState(false);
  const [scanError, setScanError] = useState<string|null>(null);
  const html5QrRef = useRef<Html5QrcodeInstance | null>(null);
  const html5QrPromiseRef = useRef<Promise<Html5QrcodeCtor> | null>(null);
  const html5ContainerId = useMemo(() => `qr-fallback-${Math.random().toString(36).slice(2)}`, []);
  const html5ContainerRef = useRef<HTMLDivElement|null>(null);
  
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace('/login'); return; }
      setUserId(data.session.user.id);
      const { data: pf } = await supabase.from('profiles')
        .select('id, role, org_id').eq('id', data.session.user.id).maybeSingle();
      if (!pf) { alert('未找到用户资料'); router.replace('/'); return; }
      setProfile(pf as Profile);
      const saved = localStorage.getItem('current_operator');
      if (saved) setOperator(saved.trim());
    })();
  }, [router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const detector = (window as any).BarcodeDetector;
    const hasMedia = typeof navigator !== 'undefined'
      && !!navigator.mediaDevices
      && typeof navigator.mediaDevices.getUserMedia === 'function';
    if (detector && hasMedia) {
      setCanScan(true);
      setScannerMode('BARCODE');
      return;
    }
    if (hasMedia) {
      setCanScan(true);
      setScannerMode('HTML5_QRCODE');
      return;
    }
    setScannerMode(null);
  }, []);

  useEffect(() => {
    if (stage !== 'TRADE' && !trade) {
      setStage('TRADE');
    }
  }, [stage, trade]);

  useEffect(() => {
    if (stage === 'FORM' && !operator.trim()) {
      setStage('OPERATOR');
    }
  }, [stage, operator]);

  useEffect(() => {
    if (stage !== 'FORM' && scanActive) {
      setScanActive(false);
    }
  }, [stage, scanActive]);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  useEffect(() => {
    if (!scanActive) {
      stopScanner();
      return;
    }
    if (!canScan) {
      setScanError('当前设备或浏览器不支持摄像头扫码');
      setScanActive(false);
      return;
    }
    startScanner();
  }, [scanActive, canScan, scannerMode]);

  async function startScanner() {
    setScanError(null);
    try {
      if (scannerMode === 'BARCODE') {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
        if (!videoRef.current) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        runDetection();
        return;
      }

      if (scannerMode === 'HTML5_QRCODE') {
        if (!html5ContainerRef.current) {
          throw new Error('缺少扫码渲染容器');
        }
        html5ContainerRef.current.innerHTML = '';
        const Html5Qrcode = await loadHtml5Qrcode();
        const html5Qr = new Html5Qrcode(html5ContainerId, { verbose: false });
        html5QrRef.current = html5Qr;
        await html5Qr.start(
          { facingMode: { ideal: 'environment' } },
          { fps: 8, qrbox: { width: 240, height: 240 } },
          (decodedText: string) => {
            const value = decodedText?.trim();
            if (value) {
              setQr(value);
              setScanActive(false);
              setTimeout(() => qrRef.current?.focus(), 0);
            }
          },
          () => {
            // 连续扫描下会频繁抛出 not found 错误，这里忽略即可
          }
        );
        return;
      }

      throw new Error('未检测到可用的扫码方式');
    } catch (err) {
      const message = err instanceof Error ? err.message : '无法访问摄像头';
      setScanError(message);
      setScanActive(false);
      stopScanner();
    }
  }

  function stopScanner() {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = undefined;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (html5QrRef.current) {
      html5QrRef.current
        .stop()
        .catch(() => undefined)
        .then(() => html5QrRef.current?.clear().catch(() => undefined))
        .finally(() => {
          html5QrRef.current = null;
        });
    }
  }

  function runDetection() {
    const detectorCtor = typeof window !== 'undefined' ? (window as any).BarcodeDetector : undefined;
    if (!detectorCtor || !videoRef.current) return;
    const detector = new detectorCtor({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8'] });

    const detectLoop = async () => {
      if (!videoRef.current || !scanActive) return;
      if (videoRef.current.readyState < 2) {
        frameRef.current = requestAnimationFrame(detectLoop);
        return;
      }
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes.length > 0) {
          const value = codes[0].rawValue?.trim();
          if (value) {
            setQr(value);
            setScanActive(false);
            setTimeout(() => qrRef.current?.focus(), 0);
            return;
          }
        }
      } catch (err) {
        console.warn('Barcode detect error', err);
      }
      frameRef.current = requestAnimationFrame(detectLoop);
    };

    frameRef.current = requestAnimationFrame(detectLoop);
  }

  function loadHtml5Qrcode(): Promise<Html5QrcodeCtor> {
    if (typeof window === 'undefined') {
      return Promise.reject(new Error('仅客户端可加载扫码库'));
    }
    if (window.Html5Qrcode) {
      return Promise.resolve(window.Html5Qrcode);
    }
    if (!html5QrPromiseRef.current) {
      html5QrPromiseRef.current = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/html5-qrcode@2.3.10/minified/html5-qrcode.min.js';
        script.async = true;
        script.onload = () => {
          if (window.Html5Qrcode) {
            resolve(window.Html5Qrcode);
          } else {
            html5QrPromiseRef.current = null;
            reject(new Error('扫码库加载失败'));
          }
        };
        script.onerror = () => {
          html5QrPromiseRef.current = null;
          reject(new Error('无法加载扫码库'));
        };
        document.body.appendChild(script);
      });
    }
    return html5QrPromiseRef.current;
  }

  function onLoginOperator() {
    const op = opManual.trim() || operator.trim();
    if (!op) { alert('请选择或输入操作员'); return; }
    localStorage.setItem('current_operator', op);
    setOperator(op);
    setOpManual('');
    qrRef.current?.focus();
    setScanActive(false);
    setStage('FORM');
  }

  function parseW(s:string){ if(!s.trim())return null; const v=Number(s); return Number.isNaN(v)?null:Math.round(v*1000)/1000; }

  async function onSave() {
    if (!profile) return;
    if (!trade) { alert('请选择工种'); return; }
    const op = localStorage.getItem('current_operator') || '';
    if (!op) { alert('请先登录操作员'); return; }
    if (!qr.trim()) { alert('请先扫描/输入原厂码'); qrRef.current?.focus(); return; }
    const w = parseW(weight);
    if (trade==='INBOUND_WEIGHT' && w==null) { alert('入库称重必须填写重量'); return; }

    const payload = {
      org_id: profile.org_id,
      operator: op,
      step: trade,
      qr: qr.trim(),
      weight_kg: w,
      note: note.trim() || null,
      created_by: userId
    };
    const { error } = await supabase.from('events').insert(payload);
    if (error) { alert('保存失败：'+error.message); return; }

    setQr(''); setWeight(''); setNote('');
    qrRef.current?.focus();
  }

  const currentStageIndex = STAGES.findIndex(item => item.id === stage);
  const currentTrade = trade ? TRADES.find(t => t.id === trade) : null;

  return (
    <div className={styles.wrap}>
      <header className={styles.hdr}>
        <h1>Worker 作业 <small>{profile ? `组织：${profile.org_id}` : ''}</small></h1>
      </header>

      <main className={styles.stack}>
        <div className={styles.steps}>
          {STAGES.map((s, idx) => (
            <span
              key={s.id}
              className={cx(
                styles.step,
                idx === currentStageIndex && styles.stepActive,
                idx < currentStageIndex && styles.stepDone
              )}
            >
              {s.label}
            </span>
          ))}
        </div>

        {stage === 'TRADE' && (
          <section className={cx(styles.card, styles.wide)}>
            <h2>① 选择工种</h2>
            <p className={styles.hint}>请选择当次作业对应的工种，系统将根据工种调整后续表单。</p>
            <div className={styles.pills} style={{marginTop:12}}>
              {TRADES.map(t => (
                <button
                  key={t.id}
                  className={cx(styles.pill, trade===t.id && styles.selected)}
                  onClick={()=>{ setTrade(t.id); setStage('OPERATOR'); }}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </section>
        )}

        {stage === 'OPERATOR' && (
          <section className={cx(styles.card, styles.wide)}>
            <h2>② 操作员</h2>
            <p className={styles.hint}>当前工种：{currentTrade?.name ?? '未选择'}</p>
            <label>已有操作员（可选）</label>
            <select value={operator} onChange={e=>setOperator(e.target.value)}>
              <option value="">请选择</option>
              <option value="EMP-001">EMP-001</option>
              <option value="EMP-002">EMP-002</option>
              <option value="EMP-023">EMP-023</option>
            </select>
            <label className={styles.muted}>或手动输入新操作员ID</label>
            <input value={opManual} onChange={e=>setOpManual(e.target.value)} placeholder="如 EMP-023 / 张三"/>
            <div className={styles.actions}>
              <button className={cx(styles.btn, styles.primary)} onClick={onLoginOperator}>确认并进入下一步</button>
              <button className={styles.btn} onClick={()=>setStage('TRADE')}>返回选择工种</button>
            </div>
            <p className={styles.hint}>该“操作员”仅用于追责显示，权限由账号角色控制。</p>
          </section>
        )}

        {stage === 'FORM' && (
          <section className={cx(styles.card, styles.wide)}>
            <h2>③ 作业表单 {currentTrade ? <small className={styles.muted}>（{currentTrade.name}）</small> : null}</h2>
            <p className={styles.hint}>当前操作员：{operator || '未确认'}</p>
            <div className={styles.row}>
              <div>
                <label>原厂二维码（扫码或粘贴）</label>
                <input ref={qrRef} value={qr} onChange={e=>setQr(e.target.value)}
                       placeholder="例：CH-20251107A-001（扫码回车）"
                       onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); onSave(); }}}/>
                <div className={styles.scanner}>
                  <div className={styles.scanToolbar}>
                    <button
                      type="button"
                      className={cx(styles.btn, scanActive && styles.primary)}
                      onClick={()=>setScanActive(prev => !prev)}
                      disabled={!canScan}
                    >
                      {scanActive ? '停止摄像头扫码' : '启动摄像头扫码'}
                    </button>
                    <button
                      type="button"
                      className={styles.btn}
                      onClick={()=>{ setQr(''); setScanActive(false); setScanError(null); qrRef.current?.focus(); }}
                    >
                      清除扫码结果
                    </button>
                  </div>
                  {scanError ? (
                    <p className={styles.scanError}>{scanError}</p>
                  ) : (
                    <div className={styles.scanViewport}>
                      <video
                        ref={videoRef}
                        className={styles.scanVideo}
                        muted
                        playsInline
                        autoPlay
                        style={{ display: scanActive && scannerMode === 'BARCODE' ? 'block' : 'none' }}
                      />
                      <div
                        ref={html5ContainerRef}
                        id={html5ContainerId}
                        className={styles.scanVideo}
                        style={{ display: scanActive && scannerMode === 'HTML5_QRCODE' ? 'block' : 'none' }}
                      />
                      {!scanActive && (
                        <p className={styles.scanTip}>
                          {canScan
                            ? scannerMode === 'HTML5_QRCODE'
                              ? '点击“启动摄像头扫码”后系统会加载兼容性更好的扫码模块，亦可手动输入。'
                              : '点击“启动摄像头扫码”启用后置摄像头读取二维码，也可直接手动输入。'
                            : '当前浏览器不支持摄像头扫码，请改用手动输入原厂码。'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label>重量（kg）<span className={styles.muted}>{trade==='INBOUND_WEIGHT' ? '（必填）' : '（可空）'}</span></label>
                <input value={weight} onChange={e=>setWeight(e.target.value)} placeholder="例：11.52"/>
              </div>
            </div>
            <div className={styles.row}>
              <div>
                <label>备注（可选）</label>
                <input value={note} onChange={e=>setNote(e.target.value)} placeholder="异常/说明"/>
              </div>
              <div>
                <label>当前操作员</label>
                <input value={operator} disabled />
              </div>
            </div>
            <div className={styles.row} style={{marginTop:10}}>
              <button className={cx(styles.btn, styles.primary)} onClick={onSave}>保存（Enter）</button>
              <button className={styles.btn} onClick={()=>{ setQr(''); setWeight(''); setNote(''); qrRef.current?.focus(); }}>清空</button>
            </div>
            <div className={styles.actions}>
              <button className={styles.btn} onClick={()=>setStage('OPERATOR')}>返回操作员</button>
              <button className={styles.btn} onClick={()=>setStage('TRADE')}>重新选择工种</button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
