Use Checkbox for independent selections such as device-group membership.

```jsx
<Checkbox label="客厅主灯" description="在线" checked={selected} onChange={setSelected} />
```

Use `indeterminate` only for a real partial-selection state and always keep the text label visible.
