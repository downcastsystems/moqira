# Mockups App Notes

This repository contains a React + Vite + Tauri desktop wireframing app.

## Current Shape

- `src/App.tsx`: main application shell, component library, canvas, properties pane, context menu, and keyboard interactions.
- `src/types.ts`: project, wireframe, and canvas node data model.
- `src/lib/mockupsApi.ts`: frontend wrapper for project file load/save commands.
- `src-tauri/src/main.rs`: small Tauri backend for opening, saving, and revealing project files.
- `src/styles/app.css`: three-pane desktop UI styling.

## Product Model

Project files are JSON documents saved as `.dsmockup` or `.json`. A project contains multiple wireframes, and each wireframe contains ordered canvas nodes. Array order is currently the layer order.

## Development

```bash
npm install
npm run dev
```

Use `npm run build` for the frontend build and `cargo check` in `src-tauri` for the Rust side.
