Use Select for a bounded set of mutually exclusive device or automation options.

```jsx
<Select label="目标房间" value={roomId} options={rooms} onChange={setRoomId} />
```

Keep option labels user-facing and stable; do not expose raw identifiers as the visible label.
