import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import App from "./App";
import "./index.css";
import { applyTheme, getStoredTheme, subscribeTheme } from "./lib/theme";

// 初始化主题(与 index.html 内联脚本一致)
const initialTheme = getStoredTheme();
const resolved = applyTheme(initialTheme);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ThemedToaster() {
  const [theme, setTheme] = React.useState(resolved);
  React.useEffect(() => subscribeTheme(setTheme), []);
  return (
    <Toaster position="top-right" theme={theme} richColors closeButton />
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <ThemedToaster />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
