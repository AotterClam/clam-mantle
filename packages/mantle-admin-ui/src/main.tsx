import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { AdminApp } from "./app/admin-app";
import { queryClient } from "./app/query-client";
import { AdminRouterProvider } from "./app/router";
import "./styles/index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element.");
}

ReactDOM.createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AdminRouterProvider>
        <AdminApp />
      </AdminRouterProvider>
    </QueryClientProvider>
  </StrictMode>,
);
