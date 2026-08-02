/**
 * Test setup file - loads jest-dom matchers for RTL assertions.
 *
 * Unlike apps/extension, no chrome.* mocking is needed here: this app's
 * browser-fallback code paths (see App.tsx's `isTauri` check) already
 * behave correctly under jsdom without a Tauri window - `isTauri` is false,
 * so components fall back to plain `fetch()` against the HTTP bridge, and
 * the components under test in this harness (confidence.ts,
 * FillPlanReviewDialog) take that data via props/callbacks rather than
 * calling Tauri or fetch themselves.
 */

import '@testing-library/jest-dom';
