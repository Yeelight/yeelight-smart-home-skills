export function AppShell({ title, navigation, status, children }) {
  return <div className="yp-app-shell"><aside><div className="yp-brand"><small>Yeelight PRO</small><strong>{title}</strong></div>{navigation}</aside><main className="yp-app-main"><header className="yp-app-header"><div><h1>{title}</h1></div>{status}</header><div className="yp-app-content">{children}</div></main></div>;
}
