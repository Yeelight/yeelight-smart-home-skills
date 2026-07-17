Use ColorPicker for RGB-capable lights and scene actions instead of exposing integer color values.

```jsx
<ColorPicker label="灯光颜色" value={color} swatches={palette} onChange={setColor} />
```

Pass validated hex swatches from the theme or capability layer and retain the visible value output.
