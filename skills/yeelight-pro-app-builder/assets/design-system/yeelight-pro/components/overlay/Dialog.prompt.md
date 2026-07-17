Use Dialog for focused confirmations or short forms that must preserve and restore keyboard focus.

```jsx
<Dialog open={open} title="保存自动化" onClose={close}>...</Dialog>
```

Provide an explicit close action; use `closeOnBackdrop={false}` when dismissing could lose work.
