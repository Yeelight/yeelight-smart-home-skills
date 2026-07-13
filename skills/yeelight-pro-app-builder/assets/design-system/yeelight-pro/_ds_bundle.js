/* @ds-bundle: {"format":3,"namespace":"YeelightPro_2d6edd","components":[{"name":"Button","sourcePath":"components/actions/Button.jsx"},{"name":"IconButton","sourcePath":"components/actions/IconButton.jsx"},{"name":"InlineNotice","sourcePath":"components/feedback/InlineNotice.jsx"},{"name":"StatusBadge","sourcePath":"components/feedback/StatusBadge.jsx"},{"name":"AppNavigation","sourcePath":"components/navigation/AppNavigation.jsx"},{"name":"ModalSurface","sourcePath":"components/overlay/ModalSurface.jsx"},{"name":"AppShell","sourcePath":"components/shell/AppShell.jsx"}],"sourceHashes":{"components/actions/Button.jsx":"2b20a03ac8ae","components/actions/IconButton.jsx":"e7bc67317f4b","components/feedback/InlineNotice.jsx":"13322e7e3227","components/feedback/StatusBadge.jsx":"f5d830e93122","components/navigation/AppNavigation.jsx":"be05214e3c20","components/overlay/ModalSurface.jsx":"e34ef00fc14b","components/shell/AppShell.jsx":"84713733112e"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.YeelightPro_2d6edd = window.YeelightPro_2d6edd || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/actions/Button.jsx
try { (() => {
function Button({
  children,
  variant = "primary",
  disabled = false,
  busy = false,
  onClick,
  type = "button"
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: type,
    className: `yp-button yp-button--${variant}`,
    disabled: disabled || busy,
    "aria-busy": busy || undefined,
    onClick: onClick
  }, busy ? "处理中" : children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/Button.jsx", error: String((e && e.message) || e) }); }

// components/actions/IconButton.jsx
try { (() => {
function IconButton({
  label,
  children,
  disabled = false,
  onClick
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "yp-button yp-button--secondary yp-icon-button",
    "aria-label": label,
    title: label,
    disabled: disabled,
    onClick: onClick
  }, children);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/feedback/InlineNotice.jsx
try { (() => {
function InlineNotice({
  title,
  children,
  tone = "info",
  action = null
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: `yp-notice yp-notice--${tone}`,
    role: tone === "error" ? "alert" : "status"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, title), children ? /*#__PURE__*/React.createElement("span", null, children) : null), action);
}
Object.assign(__ds_scope, { InlineNotice });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/InlineNotice.jsx", error: String((e && e.message) || e) }); }

// components/feedback/StatusBadge.jsx
try { (() => {
function StatusBadge({
  children,
  tone = "success"
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: `yp-badge yp-badge--${tone}`
  }, children);
}
Object.assign(__ds_scope, { StatusBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/StatusBadge.jsx", error: String((e && e.message) || e) }); }

// components/navigation/AppNavigation.jsx
try { (() => {
function AppNavigation({
  items,
  activeId,
  onNavigate
}) {
  return /*#__PURE__*/React.createElement("nav", {
    className: "yp-navigation",
    "aria-label": "\u4E3B\u5BFC\u822A"
  }, items.map((item, index) => /*#__PURE__*/React.createElement("button", {
    key: item.id,
    type: "button",
    "aria-current": item.id === activeId ? "page" : undefined,
    onClick: () => onNavigate?.(item.id)
  }, /*#__PURE__*/React.createElement("span", {
    className: "yp-navigation-index",
    "aria-hidden": "true"
  }, String(index + 1).padStart(2, "0")), /*#__PURE__*/React.createElement("span", {
    className: "yp-navigation-label"
  }, item.label))));
}
Object.assign(__ds_scope, { AppNavigation });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/AppNavigation.jsx", error: String((e && e.message) || e) }); }

// components/overlay/ModalSurface.jsx
try { (() => {
function ModalSurface({
  open,
  title,
  children,
  footer,
  onClose,
  closeLabel = "关闭"
}) {
  const surfaceRef = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    surfaceRef.current?.focus();
    const onKeyDown = event => {
      if (event.key === "Escape") onClose?.();
      if (event.key !== "Tab" || !surfaceRef.current) return;
      const focusable = [...surfaceRef.current.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter(node => !node.disabled);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "yp-modal-backdrop",
    role: "presentation",
    onMouseDown: event => {
      if (event.target === event.currentTarget) onClose?.();
    }
  }, /*#__PURE__*/React.createElement("section", {
    ref: surfaceRef,
    className: "yp-modal",
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": "yp-modal-title",
    tabIndex: -1
  }, /*#__PURE__*/React.createElement("header", null, /*#__PURE__*/React.createElement("h2", {
    id: "yp-modal-title"
  }, title), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "yp-button yp-button--ghost",
    onClick: onClose
  }, closeLabel)), /*#__PURE__*/React.createElement("div", null, children), footer ? /*#__PURE__*/React.createElement("footer", null, footer) : null));
}
Object.assign(__ds_scope, { ModalSurface });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlay/ModalSurface.jsx", error: String((e && e.message) || e) }); }

// components/shell/AppShell.jsx
try { (() => {
function AppShell({
  title,
  navigation,
  status,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "yp-app-shell"
  }, /*#__PURE__*/React.createElement("aside", null, /*#__PURE__*/React.createElement("div", {
    className: "yp-brand"
  }, /*#__PURE__*/React.createElement("small", null, "Yeelight PRO"), /*#__PURE__*/React.createElement("strong", null, title)), navigation), /*#__PURE__*/React.createElement("main", {
    className: "yp-app-main"
  }, /*#__PURE__*/React.createElement("header", {
    className: "yp-app-header"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", null, title)), status), /*#__PURE__*/React.createElement("div", {
    className: "yp-app-content"
  }, children)));
}
Object.assign(__ds_scope, { AppShell });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/shell/AppShell.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.InlineNotice = __ds_scope.InlineNotice;

__ds_ns.StatusBadge = __ds_scope.StatusBadge;

__ds_ns.AppNavigation = __ds_scope.AppNavigation;

__ds_ns.ModalSurface = __ds_scope.ModalSurface;

__ds_ns.AppShell = __ds_scope.AppShell;

})();
