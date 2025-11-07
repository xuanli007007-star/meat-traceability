// 主页 = 角色选单：Worker / Othermine（管理员）
// 无权访问 Othermine 时按钮禁用
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/router';
import '@/styles/globals.css';

type Role = 'admin'|'worker';
type Profile = { id:string; role:Role; org_id:string };

export default function Home() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile|null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { router.replace('/login'); return; }
      const uid = data.session.user.id;
      const { data: pf, error } = await supabase.from('profiles')
        .select('id, role, org_id').eq('id', uid).maybeSingle();
      if (error || !pf) { alert('读取用户信息失败，请联系管理员'); return; }
      setProfile(pf as Profile);
      setLoading(false);
    })();
  }, [router]);

  if (loading) return <div className="center" style={{height:'60vh'}}>加载中…</div>;

  const isAdmin = profile?.role === 'admin';

  return (
    <div className="wrap">
      <header className="hdr">
        <h1>肉厂系统 <small>{profile?.role === 'admin' ? '管理员' : '员工'}</small></h1>
      </header>

      <main style={{padding:18}}>
        <h2 style={{marginTop:0}}>请选择入口</h2>
        <div className="tiles">
          <div className="tile" onClick={()=>router.push('/worker')}>
            <h3>Worker（员工作业）</h3>
            <p className="muted">扫码录入、选择工种，进入相应工作页面。</p>
          </div>

          <div className={`tile ${!isAdmin ? 'disabled':''}`}
               onClick={()=>{ if(isAdmin) router.push('/admin'); }}>
            <h3>Othermine（管理员）</h3>
            <p className="muted">查看统计、追溯、全局数据。</p>
            {!isAdmin && <p className="hint">你没有权限进入此区域</p>}
          </div>
        </div>
      </main>
    </div>
  );
}
