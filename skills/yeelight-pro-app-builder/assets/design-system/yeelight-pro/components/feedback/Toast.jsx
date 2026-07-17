export function Toast({ open = true, tone = "info", title, children, action, duration = 4000, dismissLabel = "关闭通知", onDismiss }) {
  React.useEffect(() => {
    if (!open || duration <= 0 || !onDismiss) return undefined;
    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [duration, onDismiss, open]);
  if (!open) return null;
  const liveRole = tone === "error" ? "alert" : "status";
  return <aside className={`yp-toast yp-toast--${tone}`} role={liveRole} aria-live={tone === "error" ? "assertive" : "polite"}><div><strong>{title}</strong>{children ? <span>{children}</span> : null}</div>{action}<button type="button" className="yp-toast-dismiss" aria-label={dismissLabel} onClick={onDismiss}>x</button></aside>;
}
