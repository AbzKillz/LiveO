export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return (
    <main className="login">
      <form method="post" action="/api/auth/login">
        <div className="brand"><span className="brand-dot" />LiveO</div>
        <p className="hint" style={{ margin: 0 }}>Staff sign in</p>
        <input className="text" name="email" type="email" placeholder="Email" required autoFocus />
        <input className="text" name="password" type="password" placeholder="Password" required />
        <input type="hidden" name="next" value={next ?? '/'} />
        {error && <div className="error" style={{ margin: 0 }}>Wrong email or password.</div>}
        <button className="btn primary block" type="submit">Sign in</button>
      </form>
    </main>
  );
}
