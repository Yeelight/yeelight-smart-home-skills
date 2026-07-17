Use Input for labeled text, search, and numeric values with local helper or error feedback.

```jsx
<Input label="设备名称" value={name} error={error} onChange={setName} />
```

Do not replace the visible label with a placeholder; use `readOnly` for terminal values and `disabled` only when the action is unavailable.
