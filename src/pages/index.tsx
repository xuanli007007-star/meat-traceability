import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, ORG_ID } from '@/lib/supabase';
import { useRouter } from 'next/router';

type Role = 'admin'|'worker';
type Profile = { id: string; role: Role; org_id: string; };
type EventRow = {
  id: number; created_at: string; org_id: string; operator: string;
  step: 'INBOUND_WEIGHT'|'CUTTING'|'PACK'|'OUTBOUND';
  qr: string; weight_kg: number|null; note: string|null; created_by: string|null;
};

const DEFAULT_OPERATORS = ['EMP-001','EMP-002','EMP-023'] as const;
const STEPS = [
  { id:'INBOUND_WEIGHT', name:'入库称重', pill:'in' },
  { id:'CUTTING', name:'分割', pill:'cut' },
  { id:'PACK', name:'包装', pill:'pack' },
  { id:'OUTBOUND', name:'出库', pill:'out' }
] as const;

export default function Home() {
  const router = useRouter();
  const [userId, setUserId] = useState<string>('');
  const [profile, setProfile] = useState<Profile|null>(null);
  const [operator, setOperator] = useState<string>('');
  const [opManual, setOpManual] = useState('');
  const [qr, setQr] = useState('');
  const [step, setStep] = useState<string>('INBOUND_WEIGHT');
  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');
  const [recent, setRecent] = useState<EventRow[]>([]);
  const [traceQR, setTraceQR] = useState('');
  const [traceRows, setTraceRows] = useState<EventRow[]>([]);
  const qrInputRef = useRef<HTMLInputElement>(null);

  const mustWeight = useMemo(()=> step==='INBOUND_WEIGHT', [step]);
  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    // 检查登录
    supabase.auth.getSession().then(async ({ data }) => {
      const sess = data.session;
      if (!sess) { router.replace('/login'); return; }
      const uid = sess.user.id;
      setUserId(uid);

      // 取 profile
      const { data: pf, error } = await supabase
        .from('profiles')
        .select('id, role, org_id')
        .eq('id', uid)
        .maybeSingle();
      if (error) { alert('读取用户信息失败：'+error.message); return; }
      if (!pf) { alert('未找到用户资料（profiles），请联系管理员'); return; }
      setProfile(pf as Profile);

      // 恢复登录的操作员显示
      const saved = localStorage.getItem('current_operator');
      if (saved) setOperator(saved);

      refreshRecent(pf.org_id);
    });
  }, [router]);

  function todayISO() {
    const d = new Date();
    return d.toISOString().slice(0,10);
  }

  async function refreshRecent(orgId: string) {
    const from = todayISO();
    const to = from + 'T23:59:59.999Z';
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('org_id', orgId)
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending:false });
    if (!error && data) setRecent(data as EventRow[]);
  }

  async function onLoginOperator() {
    const op = opManual.trim() || operator.trim();
    if (!op) { alert('请选择或输入操作员'); return; }
    localStorage.setItem('current_operator', op);
    setOperator(op);
    setOpManual('');
    qrInputRef.current?.focus();
  }

  function parseWeight(txt: string): number | null {
    if (!txt.trim()) return null;
    const v = Number(txt);
    if (Number.isNaN(v)) return null;
    return Math.round(v * 1000) / 1000;
  }

  async function onSave() {
    if (!profile) return;
    const op = localStorage.getItem('current_operator') || '';
    if (!op) { alert('请先登录操作员'); return; }
    if (!qr.trim()) { alert('请先扫描/输入原厂码'); qrInputRef.current?.focus(); return; }
    const w = parseWeight(weight);
    if (mustWeight && w==null) { alert('入库称重必须填写重量'); return; }

    // RLS 要求：created_by 必须等于 auth.uid()；org_id 匹配 profile.org_id
    const payload = {
      org_id: profile.org_id,
      operator: op,
      step,
      qr: qr.trim(),
      weight_kg: w,
      note: note.trim() || null,
      created_by: userId
    };
    const { error } = await supabase.from('events').insert(payload);
    if (error) { alert('保存失败：' + error.message); return; }

    setQr(''); setWeight(''); setNote('');
    qrInputRef.current?.focus();
    refreshRecent(profile.org_id);
  }

  async function onTrace() {
    if (!profile) return;
    const code = traceQR.trim();
    if (!code) { alert('请输入原厂码'); return; }
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('org_id', profile.org_id)
      .eq('qr', code)
      .order('created_at', { ascending:true });
    if (!error && data) setTraceRows(data as EventRow[]);
  }

  function exportCSV(rows: EventRow[]) {
    if (!rows.length) { alert('暂无数据'); return; }
    const headers = ['id','created_at','operator','step','qr','weight_kg','note'];
    const esc = (v: any) => (v==null?'':String(v).replace(/"/g,'""'));
    const lines = [ headers.join(','), ...rows.map(r => headers.map(h => `"${esc((r as any)[h])}"`).join(',')) ];
    const blob = new Blob([lines.join('\n')], { type:'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `export_${todayISO()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <div className="wrap">
      <header className="hdr">
        <h1>肉厂扫码追溯管理 · 云端版
          <small>{profile ? `（${profile.role} · 组织：${profile.org_id}）` : ''}</small>
        </h1>
        <div style={{marginTop:8}}>
          <button className="btn" onClick={logout}>退出</button>
        </div>
      </header>

      <main className="grid">
        {/* 登录操作员（本机记忆） */}
        <section className="card">
          <h2>👤 操作员登录</h2>
          <label>选择操作员</label>
          <select value={operator} onChange={e=>setOperator(e.target.value)}>
            <option value="">请选择</option>
            {DEFAULT_OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
          </select>
          <label className="muted">或手动输入新操作员ID</label>
          <input value={opManual} onChange={e=>setOpManual(e.target.value)} placeholder="如 EMP-023 / 张三"/>
          <button className="btn primary" onClick={onLoginOperator}>登录</button>
          <p className="hint">该“操作员”仅用于记录追责显示；系统权限由账号角色决定。</p>
        </section>

        {/* 处理区（所有登录用户可用） */}
        <section className="card">
          <h2>⚙️ 开始处理 <small className="muted">{operator ? `当前：${operator}` : ''}</small></h2>
          <div className="row">
            <div>
              <label>原厂二维码（扫码或粘贴）</label>
              <input ref={qrInputRef} value={qr} onChange={e=>setQr(e.target.value)}
                     placeholder="例：CH-20251107A-001（扫码回车）"
                     onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); onSave(); }}}/>
            </div>
            <div>
              <label>步骤</label>
              <select value={step} onChange={e=>setStep(e.target.value)}>
                {STEPS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="row">
            <div>
              <label>重量（kg）<span className="muted">{mustWeight ? '（必填）':'（可空）'}</span></label>
              <input value={weight} onChange={e=>setWeight(e.target.value)} placeholder="例：11.52"/>
            </div>
            <div>
              <label>备注（可选）</label>
              <input value={note} onChange={e=>setNote(e.target.value)} placeholder="异常/说明"/>
            </div>
          </div>
          <div className="row">
            <button className="btn primary" onClick={onSave}>保存（Enter）</button>
            <button className="btn" onClick={()=>{ setQr(''); setWeight(''); setNote(''); qrInputRef.current?.focus(); }}>清空</button>
          </div>
          <p className="hint">扫描后按 Enter 保存并进入下一条。</p>
        </section>

        {/* 以下模块：仅 admin 可见 */}
        {isAdmin && (
          <>
            <section className="card">
              <h2>📊 今日统计</h2>
              <div className="stats">
                <div className="stat"><div className="muted">今日记录</div><div className="big">{recent.length}</div></div>
                <div className="stat"><div className="muted">入库称重</div><div className="big">{recent.filter(r=>r.step==='INBOUND_WEIGHT').length}</div></div>
                <div className="stat"><div className="muted">分割</div><div className="big">{recent.filter(r=>r.step==='CUTTING').length}</div></div>
                <div className="stat"><div className="muted">包装</div><div className="big">{recent.filter(r=>r.step==='PACK').length}</div></div>
              </div>
              <div className="row" style={{marginTop:10}}>
                <button className="btn" onClick={()=>exportCSV(recent)}>导出今日CSV</button>
              </div>
            </section>

            <section className="card">
              <h2>🧾 最近记录（今日）</h2>
              <table className="table">
                <thead><tr><th>时间</th><th>操作员</th><th>步骤</th><th>原厂码</th><th>重量(kg)</th><th>备注</th></tr></thead>
                <tbody>
                  {recent.map(r => (
                    <tr key={r.id}>
                      <td>{new Date(r.created_at).toLocaleString()}</td>
                      <td>{r.operator}</td>
                      <td><span className={`pill ${r.step.toLowerCase().includes('inbound')?'in': r.step==='CUTTING'?'cut': r.step==='PACK'?'pack':'out'}`}>
                        {STEPS.find(s => s.id===r.step)?.name || r.step}</span></td>
                      <td>{r.qr}</td>
                      <td>{r.weight_kg ?? ''}</td>
                      <td>{r.note ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="card">
              <h2>🔍 追溯查询</h2>
              <div className="row">
                <input value={traceQR} onChange={e=>setTraceQR(e.target.value)} placeholder="输入/扫码原厂码"/>
                <button className="btn" onClick={onTrace}>查询</button>
              </div>
              <table className="table" style={{marginTop:10}}>
                <thead><tr><th>时间</th><th>操作员</th><th>步骤</th><th>重量(kg)</th><th>备注</th></tr></thead>
                <tbody>
                  {traceRows.length===0
                    ? <tr><td colSpan={5} className="muted">未找到记录</td></tr>
                    : traceRows.map(r=>(
                      <tr key={r.id}>
                        <td>{new Date(r.created_at).toLocaleString()}</td>
                        <td>{r.operator}</td>
                        <td><span className={`pill ${r.step.toLowerCase().includes('inbound')?'in': r.step==='CUTTING'?'cut': r.step==='PACK'?'pack':'out'}`}>
                          {STEPS.find(s => s.id===r.step)?.name || r.step}</span></td>
                        <td>{r.weight_kg ?? ''}</td>
                        <td>{r.note ?? ''}</td>
                      </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
