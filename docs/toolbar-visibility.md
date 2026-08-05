# Toolbar visibility and interaction model

This note documents why the legacy numbered toolbar appeared to be permanent, and the state model used by the collapsible command palette.

## Legacy v1 behavior

The toolbar with the `1`–`6` badges was rendered whenever `isEnabled` was true:

```tsx
{isEnabled && <Toolbar ... />}
```

Each badge was rendered unconditionally by `Toolbar.tsx`; the numbers were shortcut hints, not a transient keyboard overlay.

`isEnabled` became true through any of these paths:

1. The extension action sent `TOGGLE_ANNOTATOR`.
2. The user pressed the backtick key.
3. `loadEnabledState(window.location.href)` restored a previously enabled value.
4. When no saved enabled value existed, `loadEnabledState` returned true if the page already had annotations.

The state was written to page `localStorage` under the full URL. Consequently, enabling the annotator on a page made the complete toolbar return after refresh or a later visit. A page containing annotations could also enable it automatically. Escape only selected the pointer tool; it did not disable the annotator. There was no collapse action, outside-click behavior, idle dismissal, or close control inside the toolbar.

This coupled three different concepts into one boolean:

- whether annotations should be rendered;
- whether an annotation tool is active;
- whether the large command palette should be visible.

It also used the raw `window.location.href`, so query-string variants had independent UI and annotation state.

## v2 behavior before this change

The v2 content script mounts the React app after an explicit extension toggle, an annotation navigation request, or a pending Handoff note. Once `isActive` was true, however, `CommandPalette` was always rendered at the bottom of the viewport. Proximity dimming reduced its opacity but did not remove its footprint or make it contextual.

## State model

The revised UI uses independent state:

| State | Meaning |
| --- | --- |
| `isActive` | The annotation overlay and selected tool may interact with the page. |
| `isPaletteExpanded` | The full command palette and contextual controls are visible. |
| `activeToolId` | The tool that receives page interaction. |

The intended transitions are:

- Extension action or backtick while closed: activate and expand.
- Select a tool by click or hotkey: keep the overlay active and collapse to a compact launcher.
- Click the launcher: expand without changing the active tool.
- Click outside the toolbar surfaces: collapse without changing the active tool.
- Escape: clear the active tool and collapse.
- Close button or backtick while active: deactivate, collapse, clear selection, and close search.
- Open search or feed: collapse the palette while the destination opens.

The compact launcher preserves discoverability by showing the active tool label and hotkey. It fades to low opacity while the pointer is far away and returns to full opacity on approach. The expanded palette remains fully opaque. The full palette is transient; annotation capability is not.

## Shadow DOM and outside-click handling

The extension UI is mounted inside a shadow root. Outside-click detection therefore uses `PointerEvent.composedPath()` rather than only `element.contains(event.target)`.

The command palette and contextual color/stroke panel both carry `data-annotator-toolbar-surface`. They form one interaction island. This prevents the capture-phase outside-click listener from unmounting a contextual control before its button click is delivered.

## Acceptance criteria

- Opening the annotator shows the full palette.
- Selecting a tool collapses it to a small launcher.
- The selected tool remains usable after collapse.
- The compact launcher dims while the pointer is far away and restores full opacity on approach.
- Tool hotkeys do not reopen the full palette.
- Clicking outside collapses only the palette, not the annotation overlay.
- Color and stroke controls remain clickable.
- Escape clears the active tool and collapses the palette.
- The close button and backtick fully deactivate the annotator.
- Palette expansion is not persisted across page reloads.
