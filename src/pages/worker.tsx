import React, { useEffect, useRef, useState } from 'react';
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
    if (stage !== 'TRADE' && !trade) {
      setStage('TRADE');
    }
  }, [stage, trade]);

  useEffect(() => {
    if (stage === 'FORM' && !operator.trim()) {
      setStage('OPERATOR');
    }
  }, [stage, operator]);

  function onLoginOperator() {
    const op = opManual.trim() || operator.trim();
    if (!op) { alert('请选择或输入操作员'); return; }
    localStorage.setItem('current_operator', op);
    setOperator(op);
    setOpManual('');
    qrRef.current?.focus();
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
