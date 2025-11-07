import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/router';

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin'|'signup'|'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/');
    });
  }, [router]);

  async function onSignIn() {
    setBusy(true); setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setMsg(error.message);
    else router.replace('/');
  }

  async function onSignUp() {
    setBusy(true); setMsg(null);
    const { error } = await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    setMsg(error ? error.message : '注册成功，请到邮箱验证后登录。');
    if (!error) setMode('signin');
  }

  async function onReset() {
    setBusy(true); setMsg(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset`
    });
    setBusy(false);
    setMsg(error ? error.message : '重置邮件已发送，请查收。');
  }

  return (
    <div style={{
      display:'flex',justifyContent:'center',alignItems:'center',
      minHeight:'100vh',background:'#f5f6f8'
    }}>
      <div style={{
        width:360,background:'#fff',padding:32,
        borderRadius:12,boxShadow:'0 4px 20px rgba(0,0,0,0.05)'
      }}>
        <h2 style={{marginTop:0,color:'#1e293b'}}>
          {mode==='signin' ? '账号登录'
           : mode==='signup' ? '注册新账号'
           : '找回密码'}
        </h2>

        <label style={{display:'block',margin:'10px 0 4px',color:'#475569'}}>邮箱</label>
        <input
          type="email"
          value={email}
          onChange={e=>setEmail(e.target.value)}
          placeholder="you@example.com"
          style={{
            width:'100%',padding:'10px 12px',
            border:'1px solid #cbd5e1',borderRadius:8,
            background:'#fff',color:'#1e293b'
          }}
        />

        {mode!=='reset' && (
          <>
            <label style={{display:'block',margin:'10px 0 4px',color:'#475569'}}>密码</label>
            <input
              type="password"
              value={password}
              onChange={e=>setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width:'100%',padding:'10px 12px',
                border:'1px solid #cbd5e1',borderRadius:8,
                background:'#fff',color:'#1e293b'
              }}
            />
          </>
        )}

        {msg && <p style={{marginTop:12,color:'#ef4444',fontSize:13}}>{msg}</p>}

        {mode==='signin' && (
          <button
            disabled={busy}
            onClick={onSignIn}
            style={{
              width:'100%',marginTop:16,padding:'10px 12px',
              borderRadius:8,border:'none',
              background:'#2563eb',color:'#fff',fontSize:15,cursor:'pointer'
            }}>
            {busy ? '登录中…' : '登录'}
          </button>
        )}

        {mode==='signup' && (
          <button
            disabled={busy}
            onClick={onSignUp}
            style={{
              width:'100%',marginTop:16,padding:'10px 12px',
              borderRadius:8,border:'none',
              background:'#2563eb',color:'#fff',fontSize:15,cursor:'pointer'
            }}>
            {busy ? '注册中…' : '注册'}
          </button>
        )}

        {mode==='reset' && (
          <button
            disabled={busy}
            onClick={onReset}
            style={{
              width:'100%',marginTop:16,padding:'10px 12px',
              borderRadius:8,border:'none',
              background:'#2563eb',color:'#fff',fontSize:15,cursor:'pointer'
            }}>
            {busy ? '发送中…' : '发送重置邮件'}
          </button>
        )}

        <div style={{
          display:'flex',justifyContent:'space-between',
          marginTop:14,fontSize:13,color:'#64748b'
        }}>
          {mode!=='signin' ? (
            <a onClick={()=>setMode('signin')} style={{cursor:'pointer',color:'#2563eb'}}>返回登录</a>
          ) : (
            <a onClick={()=>setMode('reset')} style={{cursor:'pointer',color:'#2563eb'}}>忘记密码？</a>
          )}
          {mode!=='signup' ? (
            <a onClick={()=>setMode('signup')} style={{cursor:'pointer',color:'#2563eb'}}>注册新账号</a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
