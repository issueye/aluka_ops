package gateway

// ScriptTemplate 内置路由脚本预设。
type ScriptTemplate struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Category    string `json:"category"` // rewrite / redirect / deny / proxy / static / combo
	Description string `json:"description"`
	// 建议默认值(用户可改)
	SuggestCode     string `json:"suggest_code"`
	SuggestName     string `json:"suggest_name"`
	SuggestPrefix   string `json:"suggest_path_prefix"`
	SuggestPriority int    `json:"suggest_priority"`
	// Script 为 pretty JSON 字符串
	Script string `json:"script"`
	// Vars 说明脚本中可替换占位(前端提示用)
	Vars []ScriptTemplateVar `json:"vars,omitempty"`
}

// ScriptTemplateVar 模板变量说明。
type ScriptTemplateVar struct {
	Key     string `json:"key"`
	Label   string `json:"label"`
	Example string `json:"example"`
}

// BuiltinScriptTemplates 内置预设列表。
func BuiltinScriptTemplates() []ScriptTemplate {
	return []ScriptTemplate{
		{
			ID:              "rewrite_path",
			Name:            "路径重写",
			Category:        "rewrite",
			Description:     "将 /old/* 重写为 /new/*，捕获组 $1 可用；改写后继续匹配后续 APP/反代。",
			SuggestCode:     "rewriteOld",
			SuggestName:     "旧路径重写",
			SuggestPrefix:   "/",
			SuggestPriority: 50,
			Script: `[
  {
    "when": { "path_regex": "^/old/(.*)$" },
    "then": { "rewrite": "/new/$1" }
  }
]`,
			Vars: []ScriptTemplateVar{
				{Key: "path_regex", Label: "匹配正则", Example: "^/old/(.*)$"},
				{Key: "rewrite", Label: "目标路径", Example: "/new/$1"},
			},
		},
		{
			ID:              "redirect_exact",
			Name:            "精确跳转",
			Category:        "redirect",
			Description:     "访问固定路径时 302 跳转到新地址。",
			SuggestCode:     "redirectHome",
			SuggestName:     "首页跳转",
			SuggestPrefix:   "/",
			SuggestPriority: 40,
			Script: `[
  {
    "when": { "path_exact": "/go" },
    "then": { "redirect": "/home", "status": 302 }
  }
]`,
			Vars: []ScriptTemplateVar{
				{Key: "path_exact", Label: "原路径", Example: "/go"},
				{Key: "redirect", Label: "目标", Example: "/home"},
			},
		},
		{
			ID:              "redirect_www",
			Name:            "前缀跳转",
			Category:        "redirect",
			Description:     "匹配路径前缀后整段跳转(常用于废弃目录)。",
			SuggestCode:     "redirectLegacy",
			SuggestName:     "废弃目录跳转",
			SuggestPrefix:   "/",
			SuggestPriority: 45,
			Script: `[
  {
    "when": { "path_prefix": "/legacy" },
    "then": { "redirect": "/docs", "status": 301 }
  }
]`,
		},
		{
			ID:              "deny_path",
			Name:            "拒绝访问",
			Category:        "deny",
			Description:     "拦截敏感路径，返回 403。",
			SuggestCode:     "denyAdmin",
			SuggestName:     "拦截敏感路径",
			SuggestPrefix:   "/",
			SuggestPriority: 10,
			Script: `[
  {
    "when": { "path_prefix": "/.git" },
    "then": { "deny": 403, "body": "forbidden" }
  },
  {
    "when": { "path_prefix": "/.env" },
    "then": { "deny": 403, "body": "forbidden" }
  }
]`,
		},
		{
			ID:              "deny_method",
			Name:            "限制方法",
			Category:        "deny",
			Description:     "仅允许 GET/HEAD，其它方法 405。",
			SuggestCode:     "readonlyMethods",
			SuggestName:     "只读方法",
			SuggestPrefix:   "/",
			SuggestPriority: 20,
			Script: `[
  {
    "when": { "method": "POST" },
    "then": { "deny": 405, "body": "method not allowed" }
  },
  {
    "when": { "method": "PUT" },
    "then": { "deny": 405, "body": "method not allowed" }
  },
  {
    "when": { "method": "DELETE" },
    "then": { "deny": 405, "body": "method not allowed" }
  }
]`,
		},
		{
			ID:              "proxy_api",
			Name:            "API 反代",
			Category:        "proxy",
			Description:     "将 /api/* 反代到上游，并去掉 /api 前缀。适合把后端挂到同一端口。",
			SuggestCode:     "proxyApi",
			SuggestName:     "API 反代",
			SuggestPrefix:   "/",
			SuggestPriority: 30,
			Script: `[
  {
    "when": { "path_prefix": "/api" },
    "then": {
      "proxy": "http://127.0.0.1:8080",
      "strip_prefix": "/api"
    }
  }
]`,
			Vars: []ScriptTemplateVar{
				{Key: "proxy", Label: "上游地址", Example: "http://127.0.0.1:8080"},
				{Key: "path_prefix / strip_prefix", Label: "对外前缀", Example: "/api"},
			},
		},
		{
			ID:              "proxy_upload",
			Name:            "上传友好反代",
			Category:        "proxy",
			Description:     "将 /upload/* 转到上游；脚本层不截断 body（配合端口反代的 max_body=0）。",
			SuggestCode:     "proxyUpload",
			SuggestName:     "上传反代",
			SuggestPrefix:   "/",
			SuggestPriority: 30,
			Script: `[
  {
    "when": { "path_prefix": "/upload" },
    "then": {
      "proxy": "http://127.0.0.1:8080",
      "strip_prefix": ""
    }
  }
]`,
		},
		{
			ID:              "static_docs",
			Name:            "静态文档站",
			Category:        "static",
			Description:     "将 /docs 指向 data 下目录并开启 SPA fallback。",
			SuggestCode:     "staticDocs",
			SuggestName:     "文档站",
			SuggestPrefix:   "/",
			SuggestPriority: 60,
			Script: `[
  {
    "when": { "path_prefix": "/docs" },
    "then": {
      "static": "apps/docs",
      "spa": true
    }
  }
]`,
			Vars: []ScriptTemplateVar{
				{Key: "static", Label: "相对 data 的目录", Example: "apps/docs"},
			},
		},
		{
			ID:              "combo_spa_api",
			Name:            "SPA + API 组合",
			Category:        "combo",
			Description:     "先反代 /api，再把其余路径交给静态 SPA（脚本 static 动作）。也可拆成「API 反代脚本 + APP」。",
			SuggestCode:     "spaWithApi",
			SuggestName:     "SPA+API",
			SuggestPrefix:   "/",
			SuggestPriority: 30,
			Script: `[
  {
    "when": { "path_prefix": "/api" },
    "then": {
      "proxy": "http://127.0.0.1:8080",
      "strip_prefix": "/api"
    }
  },
  {
    "when": { "path_prefix": "/" },
    "then": {
      "static": "apps/web",
      "spa": true
    }
  }
]`,
		},
		{
			ID:              "combo_maintenance",
			Name:            "维护模式",
			Category:        "combo",
			Description:     "全站返回 503；health 放行可继续探活。",
			SuggestCode:     "maintenance",
			SuggestName:     "维护模式",
			SuggestPrefix:   "/",
			SuggestPriority: 1,
			Script: `[
  {
    "when": { "path_exact": "/health" },
    "then": { "break": true }
  },
  {
    "when": { "path_prefix": "/" },
    "then": {
      "deny": 503,
      "body": "service under maintenance"
    }
  }
]`,
		},
		{
			ID:              "header_gate",
			Name:            "请求头校验",
			Category:        "deny",
			Description:     "缺少指定 Header 时拒绝（示例要求 X-Token 非空）。",
			SuggestCode:     "requireToken",
			SuggestName:     "Header 门禁",
			SuggestPrefix:   "/api",
			SuggestPriority: 15,
			Script: `[
  {
    "when": {
      "path_prefix": "/api",
      "header": { "X-Token": "" }
    },
    "then": {
      "deny": 401,
      "body": "missing X-Token"
    }
  }
]`,
		},
	}
}

// FindScriptTemplate 按 id 查找。
func FindScriptTemplate(id string) *ScriptTemplate {
	for _, t := range BuiltinScriptTemplates() {
		if t.ID == id {
			cp := t
			return &cp
		}
	}
	return nil
}
