# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GPX Viewer is a web application for displaying GPX (GPS Exchange Format) route files on an interactive map. It parses GPX XML files server-side and client-side, showing routes, waypoints, and track data using Leaflet.js with OpenStreetMap tiles.

## Commands

- **Start server:** `npm start` (runs on port 80, may require sudo)
- **Install dependencies:** `npm install`

There are no tests, linting, or build steps configured.

## Architecture

This is a simple Express.js (v5) application with no build tooling:

- **`server.js`** — Express server with three API endpoints:
  - `GET /api/gpx/list` — lists `.gpx` files from `gpx_files/` directory
  - `GET /api/gpx/:filename` — returns raw GPX XML
  - `GET /api/gpx/:filename/parsed` — returns parsed GPX as JSON (uses `@xmldom/xmldom`)
- **`public/index.html`** — Single-page frontend (all HTML, CSS, and JS in one file). Uses Leaflet.js via CDN. Includes its own client-side GPX parser (browser `DOMParser`) separate from the server-side parser. Features: route selector dropdown, map display, start/end markers, waypoint markers, distance calculation (Haversine), geolocation tracking, GPX file download, URL hash-based route linking (`#file:<filename>`).
- **`gpx_files/`** — Directory containing `.gpx` route files. Add new routes by placing `.gpx` files here.

Note: GPX parsing logic exists in both `server.js` (using `@xmldom/xmldom`) and `public/index.html` (using browser `DOMParser`). The frontend currently fetches raw XML and parses client-side rather than using the `/parsed` endpoint.

## Deployment

Includes Vercel Analytics script in the frontend. The server listens on port 80.
