# Moqira

A simpler Balsamiq-style desktop wireframing app built with React, Vite, and Tauri.

Project files contain multiple wireframes. Each wireframe has a canvas of draggable
components, with properties shown in the right pane when an item is selected.

## Development

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:1420/` for the browser demo.

To run the native desktop shell:

```bash
npm run tauri dev
```

The native shell requires Rust and the Tauri prerequisites for your platform.

## Verification

```bash
npm run build
```
- Add a small settings surface for attachment strategy and typography.
