// API 层:封装 fetch,统一处理 {code,message,data} 响应结构与错误。
// baseURL 留空,使用相对路径(/api),由 Vite 代理或后端同源托管处理。

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
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  };
  if (opts.body && typeof opts.body !== "string") {
    opts.body = JSON.stringify(opts.body);
  }

  let resp;
  try {
    resp = await fetch(path, opts);
  } catch (e) {
    throw new ApiError(-1, `网络错误: ${e.message}`, 0);
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

// 运行环境
export const runtimeApi = {
  list: () => api.get("/api/runtimes"),
  get: (id) => api.get(`/api/runtimes/${id}`),
  create: (data) => api.post("/api/runtimes", data),
  update: (id, data) => api.put(`/api/runtimes/${id}`, data),
  remove: (id) => api.del(`/api/runtimes/${id}`),
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
