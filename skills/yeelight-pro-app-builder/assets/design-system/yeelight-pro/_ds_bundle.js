/* @ds-bundle: {"format":3,"namespace":"YeelightPro_2d6edd","components":[{"name":"Button","sourcePath":"components/actions/Button.jsx"},{"name":"IconButton","sourcePath":"components/actions/IconButton.jsx"},{"name":"ControllerSurface","sourcePath":"components/domain/ControllerSurface.jsx"},{"name":"DeviceTile","sourcePath":"components/domain/DeviceTile.jsx"},{"name":"InlineNotice","sourcePath":"components/feedback/InlineNotice.jsx"},{"name":"StatusBadge","sourcePath":"components/feedback/StatusBadge.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Tooltip","sourcePath":"components/feedback/Tooltip.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"ColorPicker","sourcePath":"components/forms/ColorPicker.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Slider","sourcePath":"components/forms/Slider.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"AppNavigation","sourcePath":"components/navigation/AppNavigation.jsx"},{"name":"Menu","sourcePath":"components/navigation/Menu.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"},{"name":"Dialog","sourcePath":"components/overlay/Dialog.jsx"},{"name":"ModalSurface","sourcePath":"components/overlay/ModalSurface.jsx"},{"name":"Sheet","sourcePath":"components/overlay/Sheet.jsx"},{"name":"AppShell","sourcePath":"components/shell/AppShell.jsx"}],"sourceHashes":{"components/actions/Button.jsx":"2b20a03ac8ae","components/actions/IconButton.jsx":"4921c5a1bc1c","components/domain/ControllerSurface.jsx":"8b0f78379887","components/domain/DeviceTile.jsx":"4491ba65f922","components/feedback/InlineNotice.jsx":"772111ae2cf2","components/feedback/StatusBadge.jsx":"f5d830e93122","components/feedback/Toast.jsx":"8b975dbd312a","components/feedback/Tooltip.jsx":"77f2a819a3a2","components/forms/Checkbox.jsx":"c4ce01a87413","components/forms/ColorPicker.jsx":"bbad8c31d40b","components/forms/Input.jsx":"6dfd7a7e0d48","components/forms/Select.jsx":"3ec1e547fb9a","components/forms/Slider.jsx":"4d58922614e8","components/forms/Switch.jsx":"0c7c2e33d47e","components/navigation/AppNavigation.jsx":"bff8c0865a2f","components/navigation/Menu.jsx":"1cb08369b471","components/navigation/Tabs.jsx":"524b5a220dd9","components/overlay/Dialog.jsx":"4eff94aa3680","components/overlay/ModalSurface.jsx":"ed73ace5a1d0","components/overlay/Sheet.jsx":"8773a91579c0","components/shell/AppShell.jsx":"259289416d56"},"inlinedExternals":[],"unexposedExports":[]} */

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

// components/domain/ControllerSurface.jsx
try { (() => {
const {
  StatusBadge
} = __ds_scope;
function ControllerSurface({
  title,
  subtitle,
  status = "success",
  statusLabel = "在线",
  value,
  unit,
  children,
  actions
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: "yp-controller-surface"
  }, /*#__PURE__*/React.createElement("header", null, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", null, title), subtitle ? /*#__PURE__*/React.createElement("p", null, subtitle) : null), /*#__PURE__*/React.createElement(StatusBadge, {
    tone: status
  }, statusLabel)), value !== undefined ? /*#__PURE__*/React.createElement("div", {
    className: "yp-controller-reading"
  }, /*#__PURE__*/React.createElement("strong", null, value), unit ? /*#__PURE__*/React.createElement("span", null, unit) : null) : null, /*#__PURE__*/React.createElement("div", {
    className: "yp-controller-controls"
  }, children), actions ? /*#__PURE__*/React.createElement("footer", null, actions) : null);
}
Object.assign(__ds_scope, { ControllerSurface });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/domain/ControllerSurface.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function Switch({
  label,
  description,
  checked = false,
  disabled = false,
  onChange
}) {
  return /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: `yp-switch${checked ? " yp-switch--on" : ""}`,
    role: "switch",
    "aria-checked": checked,
    disabled: disabled,
    onClick: () => onChange?.(!checked)
  }, /*#__PURE__*/React.createElement("span", {
    className: "yp-switch-track",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("i", null)), /*#__PURE__*/React.createElement("span", {
    className: "yp-switch-copy"
  }, /*#__PURE__*/React.createElement("strong", null, label), description ? /*#__PURE__*/React.createElement("small", null, description) : null), /*#__PURE__*/React.createElement("b", null, checked ? "开启" : "关闭"));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/domain/DeviceTile.jsx
try { (() => {
const {
  StatusBadge
} = __ds_scope;
const {
  Switch
} = __ds_scope;
function DeviceTile({
  name,
  room,
  category,
  summary,
  status = "success",
  statusLabel = "在线",
  power,
  disabled = false,
  onOpen,
  onPowerChange
}) {
  return /*#__PURE__*/React.createElement("article", {
    className: `yp-device-tile${disabled ? " yp-device-tile--disabled" : ""}`
  }, /*#__PURE__*/React.createElement("header", null, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "yp-device-category"
  }, category), /*#__PURE__*/React.createElement("h3", null, name), /*#__PURE__*/React.createElement("p", null, room)), /*#__PURE__*/React.createElement(StatusBadge, {
    tone: status
  }, statusLabel)), /*#__PURE__*/React.createElement("div", {
    className: "yp-device-summary"
  }, summary), /*#__PURE__*/React.createElement("footer", null, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "yp-button yp-button--secondary",
    disabled: disabled,
    onClick: onOpen
  }, "\u67E5\u770B\u63A7\u5236"), typeof power === "boolean" ? /*#__PURE__*/React.createElement(Switch, {
    label: `${name}电源`,
    checked: power,
    disabled: disabled || status === "offline",
    onChange: onPowerChange
  }) : null));
}
Object.assign(__ds_scope, { DeviceTile });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/domain/DeviceTile.jsx", error: String((e && e.message) || e) }); }

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

// components/feedback/Toast.jsx
try { (() => {
function Toast({
  open = true,
  tone = "info",
  title,
  children,
  action,
  duration = 4000,
  dismissLabel = "关闭通知",
  onDismiss
}) {
  React.useEffect(() => {
    if (!open || duration <= 0 || !onDismiss) return undefined;
    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [duration, onDismiss, open]);
  if (!open) return null;
  const liveRole = tone === "error" ? "alert" : "status";
  return /*#__PURE__*/React.createElement("aside", {
    className: `yp-toast yp-toast--${tone}`,
    role: liveRole,
    "aria-live": tone === "error" ? "assertive" : "polite"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", null, title), children ? /*#__PURE__*/React.createElement("span", null, children) : null), action, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "yp-toast-dismiss",
    "aria-label": dismissLabel,
    onClick: onDismiss
  }, "x"));
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Tooltip.jsx
try { (() => {
function Tooltip({
  content,
  children,
  placement = "top"
}) {
  const tooltipId = React.useId();
  const child = React.isValidElement(children) ? React.cloneElement(children, {
    "aria-describedby": tooltipId
  }) : /*#__PURE__*/React.createElement("span", {
    tabIndex: 0,
    "aria-describedby": tooltipId
  }, children);
  return /*#__PURE__*/React.createElement("span", {
    className: `yp-tooltip yp-tooltip--${placement}`
  }, child, /*#__PURE__*/React.createElement("span", {
    id: tooltipId,
    className: "yp-tooltip-bubble",
    role: "tooltip"
  }, content));
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Tooltip.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function Checkbox({
  label,
  description,
  checked = false,
  disabled = false,
  indeterminate = false,
  onChange
}) {
  const inputRef = React.useRef(null);
  React.useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return /*#__PURE__*/React.createElement("label", {
    className: "yp-checkbox"
  }, /*#__PURE__*/React.createElement("input", {
    ref: inputRef,
    type: "checkbox",
    checked: checked,
    disabled: disabled,
    "aria-checked": indeterminate ? "mixed" : checked,
    onChange: event => onChange?.(event.target.checked)
  }), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", null, label), description ? /*#__PURE__*/React.createElement("small", null, description) : null));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/ColorPicker.jsx
try { (() => {
function ColorPicker({
  label,
  value,
  swatches = [],
  disabled = false,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "yp-color-picker"
  }, /*#__PURE__*/React.createElement("span", null, label), /*#__PURE__*/React.createElement("div", {
    className: "yp-color-picker-field"
  }, /*#__PURE__*/React.createElement("input", {
    type: "color",
    value: value,
    disabled: disabled,
    "aria-label": label,
    onChange: event => onChange?.(event.target.value)
  }), /*#__PURE__*/React.createElement("output", null, value.toUpperCase())), swatches.length ? /*#__PURE__*/React.createElement("div", {
    className: "yp-color-swatches",
    role: "group",
    "aria-label": `${label}常用颜色`
  }, swatches.map(swatch => /*#__PURE__*/React.createElement("button", {
    type: "button",
    key: swatch,
    disabled: disabled,
    "aria-label": `选择颜色 ${swatch}`,
    "aria-pressed": swatch.toUpperCase() === value.toUpperCase(),
    style: {
      background: swatch
    },
    onClick: () => onChange?.(swatch)
  }))) : null);
}
Object.assign(__ds_scope, { ColorPicker });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/ColorPicker.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function Input({
  label,
  value = "",
  type = "text",
  placeholder,
  helper,
  error,
  disabled = false,
  readOnly = false,
  onChange
}) {
  const id = React.useId();
  const messageId = `${id}-message`;
  return /*#__PURE__*/React.createElement("label", {
    className: `yp-field${error ? " yp-field--error" : ""}`,
    htmlFor: id
  }, /*#__PURE__*/React.createElement("span", null, label), /*#__PURE__*/React.createElement("input", {
    id: id,
    type: type,
    value: value,
    placeholder: placeholder,
    disabled: disabled,
    readOnly: readOnly,
    "aria-invalid": Boolean(error),
    "aria-describedby": helper || error ? messageId : undefined,
    onChange: event => onChange?.(event.target.value)
  }), helper || error ? /*#__PURE__*/React.createElement("small", {
    id: messageId
  }, error || helper) : null);
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function Select({
  label,
  value,
  options,
  helper,
  error,
  disabled = false,
  onChange
}) {
  const id = React.useId();
  const messageId = `${id}-message`;
  return /*#__PURE__*/React.createElement("label", {
    className: `yp-field${error ? " yp-field--error" : ""}`,
    htmlFor: id
  }, /*#__PURE__*/React.createElement("span", null, label), /*#__PURE__*/React.createElement("select", {
    id: id,
    value: value,
    disabled: disabled,
    "aria-invalid": Boolean(error),
    "aria-describedby": helper || error ? messageId : undefined,
    onChange: event => onChange?.(event.target.value)
  }, options.map(option => /*#__PURE__*/React.createElement("option", {
    key: option.value,
    value: option.value,
    disabled: option.disabled
  }, option.label))), helper || error ? /*#__PURE__*/React.createElement("small", {
    id: messageId
  }, error || helper) : null);
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Slider.jsx
try { (() => {
function Slider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  unit = "",
  disabled = false,
  onChange,
  onCommit
}) {
  const handleKeyDown = event => {
    const nextValue = keyboardValue(event.key, Number(value), Number(min), Number(max), Number(step));
    if (nextValue === null) return;
    event.preventDefault();
    onChange?.(nextValue);
    onCommit?.(nextValue);
  };
  return /*#__PURE__*/React.createElement("label", {
    className: "yp-slider"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("strong", null, label), /*#__PURE__*/React.createElement("output", null, value, unit)), /*#__PURE__*/React.createElement("input", {
    type: "range",
    value: value,
    min: min,
    max: max,
    step: step,
    disabled: disabled,
    "aria-label": label,
    onChange: event => onChange?.(Number(event.target.value)),
    onPointerUp: event => onCommit?.(Number(event.currentTarget.value)),
    onKeyDown: handleKeyDown
  }));
}
function keyboardValue(key, value, min, max, step) {
  if (key === "Home") return min;
  if (key === "End") return max;
  if (["ArrowRight", "ArrowUp"].includes(key)) return Math.min(max, value + step);
  if (["ArrowLeft", "ArrowDown"].includes(key)) return Math.max(min, value - step);
  return null;
}
Object.assign(__ds_scope, { Slider });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Slider.jsx", error: String((e && e.message) || e) }); }

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

// components/navigation/Menu.jsx
try { (() => {
function Menu({
  label,
  items,
  align = "start"
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const triggerRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const menuId = React.useId();
  React.useEffect(() => {
    if (!isOpen) return undefined;
    const firstItem = menuRef.current?.querySelector("button:not(:disabled)");
    firstItem?.focus();
    const dismiss = event => {
      if (event.type === "keydown" && event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      } else if (event.type === "pointerdown" && !menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", dismiss);
    document.addEventListener("pointerdown", dismiss);
    return () => {
      document.removeEventListener("keydown", dismiss);
      document.removeEventListener("pointerdown", dismiss);
    };
  }, [isOpen]);
  const move = (event, offset) => {
    const enabled = [...menuRef.current.querySelectorAll("button:not(:disabled)")];
    const index = enabled.indexOf(document.activeElement);
    enabled[(index + offset + enabled.length) % enabled.length]?.focus();
    event.preventDefault();
  };
  return /*#__PURE__*/React.createElement("div", {
    className: `yp-menu yp-menu--${align}`
  }, /*#__PURE__*/React.createElement("button", {
    ref: triggerRef,
    type: "button",
    className: "yp-button yp-button--secondary",
    "aria-haspopup": "menu",
    "aria-controls": menuId,
    "aria-expanded": isOpen,
    onClick: () => setIsOpen(current => !current),
    onKeyDown: event => {
      if (["ArrowDown", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        setIsOpen(true);
      }
    }
  }, label, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true"
  }, "...")), isOpen ? /*#__PURE__*/React.createElement("div", {
    ref: menuRef,
    id: menuId,
    className: "yp-menu-popover",
    role: "menu",
    "aria-label": label,
    onKeyDown: event => {
      if (event.key === "ArrowDown") move(event, 1);
      if (event.key === "ArrowUp") move(event, -1);
    }
  }, items.map(item => /*#__PURE__*/React.createElement("button", {
    key: item.id,
    type: "button",
    role: "menuitem",
    className: item.destructive ? "yp-menu-item--destructive" : undefined,
    disabled: item.disabled,
    onClick: () => {
      setIsOpen(false);
      item.onSelect?.();
      triggerRef.current?.focus();
    }
  }, /*#__PURE__*/React.createElement("span", null, item.label), item.description ? /*#__PURE__*/React.createElement("small", null, item.description) : null))) : null);
}
Object.assign(__ds_scope, { Menu });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Menu.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
function Tabs({
  items,
  value,
  onChange,
  ariaLabel = "页面视图"
}) {
  const tabRefs = React.useRef(new Map());
  const enabledItems = items.filter(item => !item.disabled);
  const selected = items.find(item => item.value === value) || enabledItems[0];
  const moveFocus = (currentValue, offset) => {
    const currentIndex = enabledItems.findIndex(item => item.value === currentValue);
    const nextItem = enabledItems[(currentIndex + offset + enabledItems.length) % enabledItems.length];
    if (!nextItem) return;
    onChange?.(nextItem.value);
    tabRefs.current.get(nextItem.value)?.focus();
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "yp-tabs"
  }, /*#__PURE__*/React.createElement("div", {
    className: "yp-tab-list",
    role: "tablist",
    "aria-label": ariaLabel
  }, items.map(item => /*#__PURE__*/React.createElement("button", {
    ref: node => node ? tabRefs.current.set(item.value, node) : tabRefs.current.delete(item.value),
    key: item.value,
    type: "button",
    role: "tab",
    id: `yp-tab-${item.value}`,
    "aria-controls": `yp-panel-${item.value}`,
    "aria-selected": item.value === selected?.value,
    tabIndex: item.value === selected?.value ? 0 : -1,
    disabled: item.disabled,
    onClick: () => onChange?.(item.value),
    onKeyDown: event => {
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        moveFocus(item.value, 1);
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        moveFocus(item.value, -1);
      }
      if (event.key === "Home" && enabledItems[0]) {
        event.preventDefault();
        onChange?.(enabledItems[0].value);
        tabRefs.current.get(enabledItems[0].value)?.focus();
      }
      if (event.key === "End" && enabledItems.at(-1)) {
        event.preventDefault();
        onChange?.(enabledItems.at(-1).value);
        tabRefs.current.get(enabledItems.at(-1).value)?.focus();
      }
    }
  }, item.label, item.count === undefined ? null : /*#__PURE__*/React.createElement("span", null, item.count)))), selected ? /*#__PURE__*/React.createElement("section", {
    className: "yp-tab-panel",
    role: "tabpanel",
    id: `yp-panel-${selected.value}`,
    "aria-labelledby": `yp-tab-${selected.value}`
  }, selected.content) : null);
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/overlay/ModalSurface.jsx
try { (() => {
function ModalSurface({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  closeLabel = "关闭",
  variant = "dialog",
  closeOnBackdrop = true
}) {
  const surfaceRef = React.useRef(null);
  const titleId = React.useId();
  const descriptionId = React.useId();
  React.useEffect(() => {
    if (!open) return undefined;
    let previousFocus = document.activeElement;
    while (previousFocus?.shadowRoot?.activeElement) previousFocus = previousFocus.shadowRoot.activeElement;
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
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: `yp-modal-backdrop yp-modal-backdrop--${variant}`,
    role: "presentation",
    onMouseDown: event => {
      if (closeOnBackdrop && event.target === event.currentTarget) onClose?.();
    }
  }, /*#__PURE__*/React.createElement("section", {
    ref: surfaceRef,
    className: `yp-modal yp-modal--${variant}`,
    role: "dialog",
    "aria-modal": "true",
    "aria-labelledby": titleId,
    "aria-describedby": description ? descriptionId : undefined,
    tabIndex: -1
  }, /*#__PURE__*/React.createElement("header", null, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    id: titleId
  }, title), description ? /*#__PURE__*/React.createElement("p", {
    id: descriptionId
  }, description) : null), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "yp-button yp-button--ghost",
    "aria-label": closeLabel,
    onClick: onClose
  }, closeLabel)), /*#__PURE__*/React.createElement("div", {
    className: "yp-modal-content"
  }, children), footer ? /*#__PURE__*/React.createElement("footer", null, footer) : null));
}
Object.assign(__ds_scope, { ModalSurface });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlay/ModalSurface.jsx", error: String((e && e.message) || e) }); }

// components/overlay/Dialog.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  ModalSurface
} = __ds_scope;
function Dialog(props) {
  return /*#__PURE__*/React.createElement(ModalSurface, _extends({}, props, {
    variant: "dialog"
  }));
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlay/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/overlay/Sheet.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  ModalSurface
} = __ds_scope;
function Sheet(props) {
  return /*#__PURE__*/React.createElement(ModalSurface, _extends({}, props, {
    variant: "sheet"
  }));
}
Object.assign(__ds_scope, { Sheet });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlay/Sheet.jsx", error: String((e && e.message) || e) }); }

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

__ds_ns.ControllerSurface = __ds_scope.ControllerSurface;

__ds_ns.DeviceTile = __ds_scope.DeviceTile;

__ds_ns.InlineNotice = __ds_scope.InlineNotice;

__ds_ns.StatusBadge = __ds_scope.StatusBadge;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Tooltip = __ds_scope.Tooltip;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.ColorPicker = __ds_scope.ColorPicker;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Slider = __ds_scope.Slider;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.AppNavigation = __ds_scope.AppNavigation;

__ds_ns.Menu = __ds_scope.Menu;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.ModalSurface = __ds_scope.ModalSurface;

__ds_ns.Sheet = __ds_scope.Sheet;

__ds_ns.AppShell = __ds_scope.AppShell;

})();
