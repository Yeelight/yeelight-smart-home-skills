export function Tooltip({ content, children, placement = "top" }) {
  const tooltipId = React.useId();
  const child = React.isValidElement(children)
    ? React.cloneElement(children, { "aria-describedby": tooltipId })
    : <span tabIndex={0} aria-describedby={tooltipId}>{children}</span>;
  return <span className={`yp-tooltip yp-tooltip--${placement}`}>{child}<span id={tooltipId} className="yp-tooltip-bubble" role="tooltip">{content}</span></span>;
}
