// API 层:封装 fetch,统一处理 {code,message,data} 响应结构与错误。
// baseURL 留空,使用相对路径(/api),由 Vite 代理或后端同源托管处理。

import { authHeaders, clearToken } from "./auth";

// ApiError 业务错误,携带后端返回的 code 与 message。
export class ApiError extends Error {
  constructor(code, message, status) {
    super(message || `请求失败(${code})`);
    this.code = code;
    this.status = status;
  }
}

async function request(path, options = {}) {
  const opts = {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(options.headers || {}),
    },
  };
  // FormData 时不要强制 Content-Type(需浏览器带 boundary)
  if (opts.body instanceof FormData) {
    delete opts.headers["Content-Type"];
  } else if (opts.body && typeof opts.body !== "string") {
    opts.body = JSON.stringify(opts.body);
  }

  let resp;
  try {
    resp = await fetch(path, opts);
  } catch (e) {
    throw new ApiError(-1, `网络错误: ${e.message}`, 0);
  }

  // 401:清除本地 Token,抛出以便上层跳转登录
  if (resp.status === 401) {
    clearToken();
    let msg = "未登录或登录已过期";
    try {
      const j = await resp.json();
      if (j?.message) msg = j.message;
    } catch {
      /* ignore */
    }
    throw new ApiError(40100, msg, 401);
  }

  let payload = null;
  const text = await resp.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError(resp.status, `响应解析失败: ${text.slice(0, 200)}`, resp.status);
    }
  }

  // 后端统一结构 {code,message,data};code=0 视为成功。
  if (payload && typeof payload.code === "number") {
    if (payload.code === 0) return payload.data;
    throw new ApiError(payload.code, payload.message, resp.status);
  }
  // 兼容非标准响应。
  if (!resp.ok) {
    throw new ApiError(resp.status, payload?.message || `HTTP ${resp.status}`, resp.status);
  }
  return payload;
}

export const api = {
  get: (p) => request(p, { method: "GET" }),
  post: (p, body) => request(p, { method: "POST", body }),
  put: (p, body) => request(p, { method: "PUT", body }),
  del: (p) => request(p, { method: "DELETE" }),
};

// ===== 业务 API(按模块组织,随阶段扩充)=====

// 健康检查
export const healthApi = {
  check: () => api.get("/api/health"),
};

// 本机系统信息(CPU/内存/磁盘),仪表盘定时拉取
export const systemApi = {
  host: () => api.get("/api/system/host"),
};

// 文件管理(仅 data 目录)
export const filesApi = {
  list: (path = "") =>
    api.get(`/api/files?path=${encodeURIComponent(path || "")}`),
  stat: (path) => api.get(`/api/files/stat?path=${encodeURIComponent(path)}`),
  read: (path) => api.get(`/api/files/read?path=${encodeURIComponent(path)}`),
  mkdir: (body) => api.post("/api/files/mkdir", body),
  write: (body) => api.put("/api/files/write", body),
  rename: (body) => api.put("/api/files/rename", body),
  remove: (path, recursive = false) =>
    api.del(
      `/api/files?path=${encodeURIComponent(path)}&recursive=${recursive ? "1" : "0"}`
    ),
  downloadUrl: (path) =>
    `/api/files/download?path=${encodeURIComponent(path)}`,
  // name 可为多层相对路径(文件夹上传时传 webkitRelativePath)
  upload: async (parentPath, file, name) => {
    const fd = new FormData();
    fd.append("path", parentPath || "");
    fd.append("file", file);
    if (name) fd.append("name", name);
    return request("/api/files/upload", { method: "POST", body: fd });
  },
  // 批量上传(串行);items: [{file, name?}]
  uploadMany: async (parentPath, items, onProgress) => {
    const results = [];
    const total = items.length;
    for (let i = 0; i < total; i++) {
      const it = items[i];
      const name = it.name || it.file?.name;
      // eslint-disable-next-line no-await-in-loop
      const ent = await filesApi.upload(parentPath, it.file, name);
      results.push(ent);
      if (onProgress) onProgress(i + 1, total, ent);
    }
    return results;
  },
};

// 网关:代理端口 + APP + 端口反代
export const gatewayApi = {
  status: () => api.get("/api/gateway/status"),
  reload: () => api.post("/api/gateway/reload"),
  // 代理端口
  listPorts: () => api.get("/api/gateway/ports"),
  getPort: (id) => api.get(`/api/gateway/ports/${id}`),
  createPort: (data) => api.post("/api/gateway/ports", data),
  updatePort: (id, data) => api.put(`/api/gateway/ports/${id}`, data),
  removePort: (id, force = false) =>
    api.del(`/api/gateway/ports/${id}?force=${force ? "1" : "0"}`),
  // APP(静态前端)
  listApps: () => api.get("/api/gateway/apps"),
  getApp: (id) => api.get(`/api/gateway/apps/${id}`),
  createApp: (data) => api.post("/api/gateway/apps", data),
  updateApp: (id, data) => api.put(`/api/gateway/apps/${id}`, data),
  removeApp: (id) => api.del(`/api/gateway/apps/${id}`),
  // 反代(挂在端口下)
  listProxies: (portId) =>
    api.get(
      portId
        ? `/api/gateway/proxies?port_id=${portId}`
        : "/api/gateway/proxies"
    ),
  getProxy: (id) => api.get(`/api/gateway/proxies/${id}`),
  createProxy: (data) => api.post("/api/gateway/proxies", data),
  updateProxy: (id, data) => api.put(`/api/gateway/proxies/${id}`, data),
  removeProxy: (id) => api.del(`/api/gateway/proxies/${id}`),
  // 路由脚本(挂在端口下)
  listScripts: (portId) =>
    api.get(
      portId
        ? `/api/gateway/scripts?port_id=${portId}`
        : "/api/gateway/scripts"
    ),
  getScript: (id) => api.get(`/api/gateway/scripts/${id}`),
  createScript: (data) => api.post("/api/gateway/scripts", data),
  updateScript: (id, data) => api.put(`/api/gateway/scripts/${id}`, data),
  removeScript: (id) => api.del(`/api/gateway/scripts/${id}`),
  // 内置脚本模板
  listScriptTemplates: () => api.get("/api/gateway/script-templates"),
  getScriptTemplate: (id) => api.get(`/api/gateway/script-templates/${id}`),
};

// 流量隧道(反向 TCP:中心端口 → Agent 本机服务)
export const tunnelApi = {
  list: () => api.get("/api/tunnels"),
  sessions: () => api.get("/api/tunnels/sessions"),
  get: (id) => api.get(`/api/tunnels/${id}`),
  create: (data) => api.post("/api/tunnels", data),
  update: (id, data) => api.put(`/api/tunnels/${id}`, data),
  remove: (id) => api.del(`/api/tunnels/${id}`),
  enable: (id, enabled) => api.post(`/api/tunnels/${id}/enable`, { enabled }),
  reload: () => api.post("/api/tunnels/reload"),
};

// 集群角色与中心连接(可前端切换 mode / 主动连接)
export const clusterApi = {
  status: () => api.get("/api/cluster/status"),
  update: (data) => api.put("/api/cluster/config", data),
  connect: () => api.post("/api/cluster/connect"),
  disconnect: () => api.post("/api/cluster/disconnect"),
};

// 认证
export const authApi = {
  status: () => api.get("/api/auth/status"),
  login: (password) => api.post("/api/auth/login", { password }),
  logout: () => api.post("/api/auth/logout"),
};

// 运行环境
export const runtimeApi = {
  list: () => api.get("/api/runtimes"),
  get: (id) => api.get(`/api/runtimes/${id}`),
  create: (data) => api.post("/api/runtimes", data),
  update: (id, data) => api.put(`/api/runtimes/${id}`, data),
  remove: (id) => api.del(`/api/runtimes/${id}`),
  detect: () => api.get("/api/runtimes/detect"),
};

// 审计日志
export const auditApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== "")
    ).toString();
    return api.get(`/api/audit-logs${qs ? "?" + qs : ""}`);
  },
  get: (id) => api.get(`/api/audit-logs/${id}`),
};

// 服务管理
export const serviceApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== "")
    ).toString();
    return api.get(`/api/services${qs ? "?" + qs : ""}`);
  },
  get: (id) => api.get(`/api/services/${id}`),
  create: (data) => api.post("/api/services", data),
  update: (id, data) => api.put(`/api/services/${id}`, data),
  remove: (id) => api.del(`/api/services/${id}`),
  // 生命周期动作
  start: (id) => api.post(`/api/services/${id}/start`),
  stop: (id) => api.post(`/api/services/${id}/stop`),
  restart: (id) => api.post(`/api/services/${id}/restart`),
  status: (id) => api.get(`/api/services/${id}/status`),
  config: (id) => api.get(`/api/services/${id}/config`),
  updateConfig: (id, data) => api.put(`/api/services/${id}/config`, data),
  operations: (id, limit = 50) =>
    api.get(`/api/services/${id}/operations?limit=${limit}`),
  // 安装/卸载(M4)
  install: (id, artifactId) =>
    api.post(`/api/services/${id}/install?artifact_id=${artifactId}`),
  uninstall: (id, keepData = false) =>
    api.post(`/api/services/${id}/uninstall?keep_data=${keepData}`),
  // 升级/回滚(M5)
  upgrade: (id, artifactId) =>
    api.post(`/api/services/${id}/upgrade?artifact_id=${artifactId}`),
  rollback: (id, artifactId) =>
    api.post(`/api/services/${id}/rollback?artifact_id=${artifactId}`),
  // 控制台:向进程 stdin 写入(配合 xterm + 日志 SSE)
  consoleInput: (id, input) =>
    api.post(`/api/services/${id}/console`, { input }),
};

// 制品管理(M4)
export const artifactApi = {
  list: (serviceId) => api.get(`/api/services/${serviceId}/artifacts`),
  get: (serviceId, aid) => api.get(`/api/services/${serviceId}/artifacts/${aid}`),
  // 上传使用 multipart/form-data,需单独处理(不经 JSON 序列化)
  upload: (serviceId, { file, version, description }) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("version", version);
    if (description) fd.append("description", description);
    return request(`/api/services/${serviceId}/artifacts`, {
      method: "POST",
      // 注意:不要手动设 Content-Type,让浏览器自动带 boundary
      headers: {},
      body: fd,
    });
  },
  remove: (serviceId, aid) =>
    api.del(`/api/services/${serviceId}/artifacts/${aid}`),
  downloadURL: (serviceId, aid) =>
    `/api/services/${serviceId}/artifacts/${aid}/download`,
};

// 操作记录
export const operationApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== "")
    ).toString();
    return api.get(`/api/operations${qs ? "?" + qs : ""}`);
  },
  get: (id) => api.get(`/api/operations/${id}`),
};

// 仪表盘
export const dashboardApi = {
  stats: () => api.get("/api/dashboard/stats"),
};

