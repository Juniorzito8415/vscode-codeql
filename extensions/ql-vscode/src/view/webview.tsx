import * as React from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { vscode } from "./vscode-api";

import { WebviewDefinition } from "./webview-definition";

// Allow all views to use Codicons
import "@vscode/codicons/dist/codicon.css";
import { registerUnhandledErrorListener } from "./common/errors";

const render = () => {
  registerUnhandledErrorListener();

  const element = document.getElementById("root");

  if (!element) {
    console.error('Could not find element with id "root"');
    return;
  }

  const viewName = element.dataset.view;
  if (!viewName) {
    console.error("Could not find view name in data-view attribute");
    return;
  }

  // It's a lot harder to use dynamic imports since those don't import the CSS
  // and require a less strict CSP policy
  // eslint-disable-next-line @typescript-eslint/no-var-requires,import/no-dynamic-require
  const view: WebviewDefinition = require(`./${viewName}/index.tsx`).default;

  const root = createRoot(element);
  root.render(
    <StrictMode>
      <div ref={() => vscode.postMessage({ t: "viewLoaded", viewName })}>
        {view.component}
      </div>
    </StrictMode>,
  );
};

render();
