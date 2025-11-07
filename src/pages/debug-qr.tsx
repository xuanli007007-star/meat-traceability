import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { detectCameraSupport } from '@/lib/camera';

const QRScanner = dynamic(() => import('@/components/QRScanner'), { ssr: false });

type SupportState = 'unknown' | 'supported' | 'maybe';

type LogEntry = { time: string; message: string };

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour12: false });
}

export default function DebugQR() {
  const [support, setSupport] = useState<SupportState>('unknown');
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [lastResult, setLastResult] = useState<string>('');

  const appendLog = useCallback((message: string) => {
    setLogs(prev => [{ time: formatTime(new Date()), message }, ...prev].slice(0, 50));
  }, []);

  useEffect(() => {
    const supported = detectCameraSupport();
    setSupport(supported ? 'supported' : 'maybe');
    appendLog(supported ? '检测到 getUserMedia 能力。' : '未探测到 getUserMedia，仍可尝试唤起。');
  }, [appendLog]);

  const handleOpen = () => {
    appendLog('尝试打开摄像头扫码 overlay。');
    setOverlayOpen(true);
  };

  const handleClose = () => {
    appendLog('关闭摄像头 overlay。');
    setOverlayOpen(false);
  };

  const handleDetected = (value: string) => {
    appendLog(`识别成功：${value}`);
    setLastResult(value);
    setOverlayOpen(false);
  };

  const handleError = (message: string) => {
    appendLog(`扫码失败：${message}`);
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <h1>摄像头扫码调试页</h1>
      <p>此页面用于检查浏览器的摄像头/扫码能力，方便排查移动端无法扫码的问题。</p>

      <section style={{ marginTop: 24, padding: 20, border: '1px solid #e2e8f0', borderRadius: 12, background: '#f8fafc' }}>
        <h2 style={{ marginTop: 0 }}>能力探测</h2>
        <p>getUserMedia 探测结果：
          <strong style={{ marginLeft: 6 }}>
            {support === 'supported' && '已检测到（绿色）'}
            {support === 'maybe' && '未直接检测到，可继续尝试'}
            {support === 'unknown' && '检测中...'}
          </strong>
        </p>
        <button onClick={handleOpen} style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>
          打开摄像头扫码
        </button>
        {lastResult && (
          <p style={{ marginTop: 12, color: '#047857' }}>最近一次识别结果：{lastResult}</p>
        )}
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ marginBottom: 12 }}>调试日志</h2>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, maxHeight: 280, overflowY: 'auto', background: '#0f172a', color: '#e2e8f0', padding: 12 }}>
          {logs.length === 0 ? (
            <p style={{ margin: 0, color: '#94a3b8' }}>暂无日志，请先尝试打开摄像头。</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
              {logs.map((log, idx) => (
                <li key={`${log.time}-${idx}`} style={{ fontFamily: 'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', fontSize: 13 }}>
                  <span style={{ color: '#38bdf8' }}>[{log.time}]</span> {log.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {overlayOpen && (
        <QRScanner
          onDetected={handleDetected}
          onClose={handleClose}
          onError={handleError}
        />
      )}
    </div>
  );
}
