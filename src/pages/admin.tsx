import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/router';
import '@/styles/globals.css';

type Profile = { id:string; role:'admin'|'worker'; org_id:string };
type EventRow = {
  id:number; created_at:string; org_id:string; operator:string;
  step:'INBOUND_WEIGHT'|'CUTTING'|'PACK'|'OUTBOUND';
  qr:string; weight_kg:number|null; note:string|null; created_by:string|null;
};

export default function Admin() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile|null>(null);
  const [recent, setRecent] = useState<EventRow[]>([]);
  const [traceQR, setTraceQR] = useState('');
  const [traceRows, setTraceRows] = useState<EventRow[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace('/login'); return; }
      const uid = data.session.user.id;
      const { data: pf } = await supabase.from('profiles')
        .select('id, role, org_id').eq('id', uid).maybeSingle();
      if (!pf || pf.role !== 'admin') { router.replace('/'); return; }
      setProfile(pf as Profile);
      refreshRecent((pf as Profile).org_id);
    })();
  }, [router]);

  function todayISO(){ return new Date().toISOString().slice(0,10); }

  async function refreshRecent(orgId:string){
    const from = todayISO(); const to = from + 'T23:59:59.999Z';
    const { data } = await supabase.from('events').select('*')
      .eq('org_id', orgId).gte('created_at', from).lte('created_at', to)
      .order('created_at', { ascending:false });
    if (data) setRecent(data as EventRow[]);
  }

  async function onTrace(){
    if (!profile) return;
    const code = traceQR.trim(); if (!code){ alert('请输入原厂码'); return; }
    const { data } = await supabase.from('events').select('*')
      .eq('org_id', profile.org_id).eq('qr', code).order('created_at', { ascending:true });
    if (data) setTraceRows(data as EventRow[]);
  }

  function stat(k:EventRow['step']){ return recent.filter(r=>r.step===k).length; }

  function exportCSV(rows: EventRow[]) {
    if (!rows.length) { alert('暂无数据'); return; }
    const headers = ['id','created_at','operator','step','qr','weight_kg','note'];
    const esc = (v:any)=>v==null?'':String(v).replace(/"/g,'""');
    const lines = [headers.join(','), ...rows.map(r=>headers.map(h=>`"${esc((r as any)[h])}"`).join(','))];
    const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href=url; a.download=`export_${todayISO()}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  if (!profile) return <div className="center" style={{height:'60vh'}}>加载中…</div>;

  return (
    <div className="wrap">
      <header className="hdr">
        <h1>Othermine（管理员） <small>组织：{profile.org_id}</small></h1>
      </header>

      <main className="grid">
        {/* 今日统计 */}
        <section className="card">
          <h2>📊 今日统计</h2>
          <div className="stats">
            <div className="stat"><div className="muted">今日记录</div><div className="big">{recent.length}</div></div>
            <div className="stat"><div className="muted">入库称重</div><div className="big">{stat('INBOUND_WEIGHT')}</div></div>
            <div className="stat"><div className="muted">分割</div><div className="big">{stat('CUTTING')}</div></div>
            <div className="stat"><div className="muted">包装</div><div className="big">{stat('PACK')}</div></div>
          </div>
          <div className="row" style={{marginTop:10}}>
            <button className="btn" onClick={()=>exportCSV(recent)}>导出今日CSV</button>
          </div>
        </section>

        {/* 最近记录 */}
        <section className="card">
          <h2>🧾 最近记录（今日）</h2>
          <table className="table">
            <thead><tr><th>时间</th><th>操作员</th><th>步骤</th><th>原厂码</th><th>重量(kg)</th><th>备注</th></tr></thead>
            <tbody>
              {recent.map(r=>(
                <tr key={r.id}>
                  <td>{new Date(r.created_at).toLocaleString()}</td>
                  <td>{r.operator}</td>
                  <td>
                    <span className={`pill ${
                      r.step==='INBOUND_WEIGHT'?'in': r.step==='CUTTING'?'cut': r.step==='PACK'?'pack':'out'
                    }`}>
                      {r.step==='INBOUND_WEIGHT'?'入库称重': r.step==='CUTTING'?'分割': r.step==='PACK'?'包装':'出库'}
                    </span>
                  </td>
                  <td>{r.qr}</td>
                  <td>{r.weight_kg ?? ''}</td>
                  <td>{r.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* 追溯查询 */}
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
                    <td>
                      <span className={`pill ${
                        r.step==='INBOUND_WEIGHT'?'in': r.step==='CUTTING'?'cut': r.step==='PACK'?'pack':'out'
                      }`}>
                        {r.step==='INBOUND_WEIGHT'?'入库称重': r.step==='CUTTING'?'分割': r.step==='PACK'?'包装':'出库'}
                      </span>
                    </td>
                    <td>{r.weight_kg ?? ''}</td>
                    <td>{r.note ?? ''}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
