package gateway

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
)

// ScriptStep 一条 when/then 规则。
type ScriptStep struct {
	When ScriptWhen `json:"when"`
	Then ScriptThen `json:"then"`
}

// ScriptWhen 匹配条件(均可选,全部满足才命中)。
type ScriptWhen struct {
	Method     string            `json:"method"`
	PathPrefix string            `json:"path_prefix"`
	PathExact  string            `json:"path_exact"`
	PathRegex  string            `json:"path_regex"`
	Header     map[string]string `json:"header"`
}

// ScriptThen 动作。
// deny > redirect > proxy > static > rewrite(改 path 后 continue) > break
type ScriptThen struct {
	Rewrite     string            `json:"rewrite"`
	Redirect    string            `json:"redirect"`
	Status      int               `json:"status"`
	Deny        int               `json:"deny"`
	Body        string            `json:"body"`
	Proxy       string            `json:"proxy"`
	StripPrefix string            `json:"strip_prefix"`
	Static      string            `json:"static"`
	SPA         bool              `json:"spa"`
	Break       bool              `json:"break"`
	SetHeader   map[string]string `json:"set_header"`
}

// CompiledScript 编译后的脚本。
type CompiledScript struct {
	ID         uint
	Code       string
	Name       string
	PathPrefix string
	Priority   int
	Steps      []compiledStep
}

type compiledStep struct {
	method     string
	pathPrefix string
	pathExact  string
	re         *regexp.Regexp
	header     map[string]string
	then       ScriptThen
}

// ParseScriptJSON 解析并校验脚本 JSON。
func ParseScriptJSON(raw string) ([]ScriptStep, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, fmt.Errorf("script 不能为空")
	}
	var steps []ScriptStep
	if err := json.Unmarshal([]byte(raw), &steps); err != nil {
		return nil, fmt.Errorf("script JSON 无效: %w", err)
	}
	if len(steps) == 0 {
		return nil, fmt.Errorf("script 至少一条规则")
	}
	for i, st := range steps {
		if st.When.PathRegex != "" {
			if _, err := regexp.Compile(st.When.PathRegex); err != nil {
				return nil, fmt.Errorf("第 %d 条 path_regex 无效: %w", i+1, err)
			}
		}
		t := st.Then
		has := t.Rewrite != "" || t.Redirect != "" || t.Deny > 0 || t.Proxy != "" || t.Static != "" || t.Break
		if !has {
			return nil, fmt.Errorf("第 %d 条 then 需包含 rewrite/redirect/deny/proxy/static/break 之一", i+1)
		}
		if t.Proxy != "" && !strings.HasPrefix(t.Proxy, "http://") && !strings.HasPrefix(t.Proxy, "https://") {
			return nil, fmt.Errorf("第 %d 条 proxy 须 http(s)://", i+1)
		}
	}
	return steps, nil
}

// CompileScript 编译脚本供运行时使用。
func CompileScript(id uint, code, name, pathPrefix string, priority int, raw string) (*CompiledScript, error) {
	steps, err := ParseScriptJSON(raw)
	if err != nil {
		return nil, err
	}
	cs := &CompiledScript{
		ID:         id,
		Code:       code,
		Name:       name,
		PathPrefix: normalizePrefix(pathPrefix),
		Priority:   priority,
		Steps:      make([]compiledStep, 0, len(steps)),
	}
	for _, st := range steps {
		var re *regexp.Regexp
		if st.When.PathRegex != "" {
			re, _ = regexp.Compile(st.When.PathRegex)
		}
		cs.Steps = append(cs.Steps, compiledStep{
			method:     strings.ToUpper(strings.TrimSpace(st.When.Method)),
			pathPrefix: st.When.PathPrefix,
			pathExact:  st.When.PathExact,
			re:         re,
			header:     st.When.Header,
			then:       st.Then,
		})
	}
	return cs, nil
}

// ScriptAction 脚本执行结果。
type ScriptAction struct {
	Kind        string // none | break | deny | redirect | proxy | static
	Path        string
	Status      int
	Body        string
	Location    string
	ProxyURL    string
	StripPrefix string
	StaticRoot  string
	SPA         bool
	Headers     map[string]string
}

// RunScripts 按 priority 顺序执行;返回最终动作与可能改写后的 path。
func RunScripts(scripts []CompiledScript, r *http.Request, path string) ScriptAction {
	cur := path
	if cur == "" {
		cur = "/"
	}
	for _, sc := range scripts {
		pf := normalizePrefix(sc.PathPrefix)
		if pf != "/" {
			if cur != pf && !strings.HasPrefix(cur, pf+"/") {
				continue
			}
		}
		for _, st := range sc.Steps {
			if !matchWhen(st, r, cur) {
				continue
			}
			act := applyThen(st.then, cur, st.re)
			switch act.Kind {
			case "continue":
				cur = act.Path
				continue
			case "break":
				return ScriptAction{Kind: "break", Path: cur}
			default:
				if act.Path == "" {
					act.Path = cur
				}
				return act
			}
		}
	}
	return ScriptAction{Kind: "none", Path: cur}
}

func matchWhen(st compiledStep, r *http.Request, path string) bool {
	if st.method != "" && !strings.EqualFold(st.method, r.Method) {
		return false
	}
	if st.pathExact != "" && path != st.pathExact {
		return false
	}
	if st.pathPrefix != "" {
		p := st.pathPrefix
		if !strings.HasPrefix(p, "/") {
			p = "/" + p
		}
		p = strings.TrimRight(p, "/")
		if p == "" {
			p = "/"
		}
		if p != "/" && path != p && !strings.HasPrefix(path, p+"/") {
			return false
		}
	}
	if st.re != nil && !st.re.MatchString(path) {
		return false
	}
	for k, v := range st.header {
		hv := r.Header.Get(k)
		if v == "" {
			if hv == "" {
				return false
			}
			continue
		}
		if !strings.Contains(hv, v) {
			return false
		}
	}
	return true
}

func applyThen(t ScriptThen, path string, re *regexp.Regexp) ScriptAction {
	expand := func(s string) string {
		if s == "" {
			return s
		}
		if re == nil {
			return s
		}
		m := re.FindStringSubmatch(path)
		if m == nil {
			return s
		}
		out := s
		for i := 1; i < len(m) && i <= 9; i++ {
			out = strings.ReplaceAll(out, fmt.Sprintf("$%d", i), m[i])
		}
		out = strings.ReplaceAll(out, "$0", m[0])
		return out
	}
	hdr := t.SetHeader
	if hdr == nil {
		hdr = map[string]string{}
	}

	if t.Deny > 0 {
		return ScriptAction{Kind: "deny", Status: t.Deny, Body: t.Body, Headers: hdr, Path: path}
	}
	if t.Redirect != "" {
		st := t.Status
		if st < 300 || st >= 400 {
			st = http.StatusFound
		}
		return ScriptAction{Kind: "redirect", Status: st, Location: expand(t.Redirect), Headers: hdr, Path: path}
	}
	if t.Proxy != "" {
		return ScriptAction{
			Kind:        "proxy",
			ProxyURL:    expand(t.Proxy),
			StripPrefix: t.StripPrefix,
			Headers:     hdr,
			Path:        path,
		}
	}
	if t.Static != "" {
		return ScriptAction{
			Kind:       "static",
			StaticRoot: expand(t.Static),
			SPA:        t.SPA,
			Headers:    hdr,
			Path:       path,
		}
	}
	if t.Rewrite != "" {
		np := expand(t.Rewrite)
		if np == "" {
			np = "/"
		}
		if !strings.HasPrefix(np, "/") {
			np = "/" + np
		}
		return ScriptAction{Kind: "continue", Path: np, Headers: hdr}
	}
	if t.Break {
		return ScriptAction{Kind: "break", Path: path}
	}
	return ScriptAction{Kind: "none", Path: path}
}
