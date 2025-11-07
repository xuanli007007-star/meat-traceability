// src/pages/login.tsx
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
    // 已登录就跳回首页
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/');
    });
  }, [router]);

  async function onSignIn() {
    setBusy(true); setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    router.replace('/');
  }

  async function onSignUp() {
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    // 成功后可能需要邮箱验证，按你的 Auth 设置而定
    setMsg('注册成功，请检查邮箱完成验证或直接登录。');
    setMode('signin');
  }

  async function onReset() {
    setBusy(true); setMsg(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: typeof window !== 'undefined'
        ? `${window.location.origin}/reset`
        : undefined
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setMsg('已发送重置邮件，请查收。');
  }

  return (
    <div style={{maxWidth:380,margin:'10vh auto',padding:24,background:'#12141a',color:'#e6e6e6',borderRadius:12,border:'1px solid #1e222b'}}>
      <h2 style={{marginTop:0}}>
        {mode==='signin' ? '账号密码登录'
         : mode==='signup' ? '注册新账号'
         : '找回密码'}
      </h2>

      <label style={{display:'block',margin:'8px 0 4px',color:'#9aa0a6'}}>邮箱</label>
      <input
        placeholder="you@example.com"
        value={email}
        onChange={e=>setEmail(e.target.value)}
        style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid #2a2f3a',background:'#0f1320',color:'#e6e6e6'}}
      />

      {mode!=='reset' && (
        <>
          <label style={{display:'block',margin:'12px 0 4px',color:'#9aa0a6'}}>密码</label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e=>setPassword(e.target.value)}
            style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid #2a2f3a',background:'#0f1320',color:'#e6e6e6'}}
          />
        </>
      )}

      {msg && <p style={{marginTop:12,color:'#ffb020'}}>{msg}</p>}

      {mode==='signin' && (
        <button disabled={busy} onClick={onSignIn}
          style={{marginTop:12,width:'100%',padding:'10px 12px',borderRadius:8,background:'#1f5a3f',border:'1px solid #297f57',color:'#fff',cursor:'pointer'}}>
          {busy ? '登录中…' : '登录'}
        </button>
      )}

      {mode==='signup' && (
        <button disabled={busy} onClick={onSignUp}
          style={{marginTop:12,width:'100%',padding:'10px 12px',borderRadius:8,background:'#1f5a3f',border:'1px solid #297f57',color:'#fff',cursor:'pointer'}}>
          {busy ? '注册中…' : '注册'}
        </button>
      )}

      {mode==='reset' && (
        <button disabled={busy} onClick={onReset}
          style={{marginTop:12,width:'100%',padding:'10px 12px',borderRadius:8,background:'#1f5a3f',border:'1px solid #297f57',color:'#fff',cursor:'pointer'}}>
          {busy ? '发送中…' : '发送重置邮件'}
        </button>
      )}

      <div style={{marginTop:12,display:'flex',justifyContent:'space-between',color:'#9aa0a6'}}>
        {mode!=='signin' ? (
          <a onClick={()=>setMode('signin')} style={{cursor:'pointer'}}>去登录</a>
        ) : (
          <a onClick={()=>setMode('reset')} style={{cursor:'pointer'}}>忘记密码？</a>
        )}
        {mode!=='signup' ? (
          <a onClick={()=>setMode('signup')} style={{cursor:'pointer'}}>没有账号？注册</a>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
