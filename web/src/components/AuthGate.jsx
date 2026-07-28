import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { authApi } from "@/lib/api";
import { getToken } from "@/lib/auth";

// AuthGate 鉴权门禁:鉴权启用且无 Token 时跳转登录页。
export function AuthGate({ children }) {
  const location = useLocation();
  const [state, setState] = useState({ loading: true, needLogin: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const st = await authApi.status();
        if (cancelled) return;
        if (!st?.auth_enabled) {
          setState({ loading: false, needLogin: false });
          return;
        }
        // 鉴权启用:需要有效 token
        const token = getToken();
        if (!token) {
          setState({ loading: false, needLogin: true });
          return;
        }
        // status 在带 token 时会返回 authenticated
        if (st.authenticated) {
          setState({ loading: false, needLogin: false });
        } else {
          setState({ loading: false, needLogin: true });
        }
      } catch (e) {
        // 401 或网络错误:若有 token 可能已失效
        if (e?.status === 401 || !getToken()) {
          setState({ loading: false, needLogin: true });
        } else {
          // 鉴权未启用时 status 也应 200;其他错误先放行避免卡死
          setState({ loading: false, needLogin: false });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (state.loading) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center text-sm text-muted-foreground">
        加载中...
      </div>
    );
  }
  if (state.needLogin) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}
