Use AppShell once per generated application; feature modules contribute page content and never create a second shell.

```jsx
<AppShell title="全屋管理" navigation={<AppNavigation ... />} status={<StatusBadge>在线</StatusBadge>}>...</AppShell>
```

The CSS adapts sidebar to rail and bottom tabs without changing page semantics.
