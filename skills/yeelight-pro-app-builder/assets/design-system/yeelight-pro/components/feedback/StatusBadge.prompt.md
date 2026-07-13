Use StatusBadge for persistent state labels and InlineNotice for an actionable sync or capability message.

```jsx
<StatusBadge tone="offline">离线</StatusBadge>
<InlineNotice tone="error" title="部分设备同步失败">已保留最近一次数据</InlineNotice>
```

Never encode status through color alone; keep the visible text.
