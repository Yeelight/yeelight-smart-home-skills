Use Toast for brief operation feedback that does not require a blocking decision.

```jsx
<Toast tone="success" title="情景已保存" onDismiss={close}>9 个动作已同步</Toast>
```

Use `role="alert"` only for errors, keep recovery actions visible, and never move keyboard focus into a toast.
