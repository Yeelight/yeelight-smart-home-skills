Use DeviceTile for a repeated physical device with status, room context, a concise reading, and at most one quick control.

```jsx
<DeviceTile name="客厅主灯" room="客厅" category="灯光" summary="68% / 4000 K" power={true} />
```

Keep diagnostics in the detail surface; offline and read-only states must include text, not color alone.
