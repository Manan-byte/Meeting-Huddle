/**
 * @file Application entry point for the Huddle web client.
 *
 * Mounts the React app into the DOM using React 18's createRoot API.
 * Wraps App in StrictMode for development warnings about side effects.
 * Imports global CSS styles.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

// Mount the React app to the #root element in index.html
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
