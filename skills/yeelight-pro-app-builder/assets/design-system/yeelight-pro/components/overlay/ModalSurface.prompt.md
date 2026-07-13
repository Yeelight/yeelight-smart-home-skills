Use ModalSurface for focused editing; it becomes a bottom sheet on mobile through the shared CSS contract.

```jsx
<ModalSurface open={open} title="管理设备组" onClose={close} footer={<Button>保存</Button>}>...</ModalSurface>
```

The trigger owner must restore focus after close in production integration.
