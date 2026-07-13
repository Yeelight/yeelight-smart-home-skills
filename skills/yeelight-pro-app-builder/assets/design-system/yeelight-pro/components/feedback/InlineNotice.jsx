export function InlineNotice({ title, children, tone = "info", action = null }) {
  return <div className={`yp-notice yp-notice--${tone}`} role={tone === "error" ? "alert" : "status"}>
    <div><strong>{title}</strong>{children ? <span>{children}</span> : null}</div>{action}
  </div>;
}
