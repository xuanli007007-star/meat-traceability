import React, { useEffect, useMemo, useRef, useState } from 'react';
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

  // 作业输入
  const [qr, setQr] = useState('');
  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');
  const qrRef = useRef<HTMLInputElement>(null);

  const mustWeight = useMemo(()=> trade === 'INBOUND_WEIGHT', [trade]);

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
      if (saved) setOperator(saved);
    })();
  }, [router]);

  function onLoginOperator() {
    const op = opManual.trim() || operator.trim();
    if (!op) { alert('请选择或输入操作员'); return; }
    localStorage.setItem('current_operator', op);
    setOperator(op);
    setOpManual('');
    qrRef.current?.focus();
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

  return (
    <div className={styles.wrap}>
      <header className={styles.hdr}>
        <h1>Worker 作业 <small>{profile ? `组织：${profile.org_id}` : ''}</small></h1>
      </header>

      <main className={styles.grid}>
        {/* 选择工种 */}
        <section className={styles.card}>
          <h2>① 选择工种</h2>
          <div className={styles.pills} style={{marginTop:8}}>
            {TRADES.map(t => (
              <button
                key={t.id}
                className={styles.pill}
                style={{borderColor: trade===t.id ? '#2563eb' : undefined}}
                onClick={()=>setTrade(t.id)}
              >
                {t.name}
              </button>
            ))}
          </div>
          <p className={styles.hint} style={{marginTop:8}}>选择后，下面的作业表单会按该工种要求显示。</p>
        </section>

        {/* 操作员 */}
        <section className={styles.card}>
          <h2>② 操作员</h2>
          <label>已有操作员（可选）</label>
          <select value={operator} onChange={e=>setOperator(e.target.value)}>
            <option value="">请选择</option>
            <option value="EMP-001">EMP-001</option>
            <option value="EMP-002">EMP-002</option>
            <option value="EMP-023">EMP-023</option>
          </select>
          <label className={styles.muted}>或手动输入新操作员ID</label>
          <input value={opManual} onChange={e=>setOpManual(e.target.value)} placeholder="如 EMP-023 / 张三"/>
          <button className={cx(styles.btn, styles.primary)} onClick={onLoginOperator} style={{marginTop:8}}>确认</button>
          <p className={styles.hint}>该“操作员”仅用于追责显示；权限由账号角色控制。</p>
        </section>

        {/* 作业表单 */}
        <section className={styles.card}>
          <h2>③ 作业表单 {trade ? <small className={styles.muted}>（{TRADES.find(t=>t.id===trade)?.name}）</small> : null}</h2>
          <div className={styles.row}>
            <div>
              <label>原厂二维码（扫码或粘贴）</label>
              <input ref={qrRef} value={qr} onChange={e=>setQr(e.target.value)}
                     placeholder="例：CH-20251107A-001（扫码回车）"
                     onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); onSave(); }}}/>
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
          {!trade && <p className={styles.hint} style={{marginTop:8}}>请先选择工种。</p>}
        </section>
      </main>
    </div>
  );
}
