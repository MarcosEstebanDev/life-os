/** Marco común de las pantallas de acceso: la marca arriba, el formulario en una hoja. */
export function AuthCard({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return (
    <div className="auth-card">
      <div className="brand">life-os</div>
      <h1>{title}</h1>
      <p className="intro">{intro}</p>
      {children}
    </div>
  );
}
