package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"gorm.io/gorm"

	"aluka_ops/internal/model"
	"aluka_ops/internal/repository"
)

// TemplateService 服务模板业务。
type TemplateService struct {
	repo    *repository.TemplateRepository
	svcRepo *repository.ServiceRepository
	db      *gorm.DB
}

// NewTemplateService 构造。
func NewTemplateService(
	db *gorm.DB,
	repo *repository.TemplateRepository,
	svcRepo *repository.ServiceRepository,
) *TemplateService {
	return &TemplateService{db: db, repo: repo, svcRepo: svcRepo}
}

// List 列表。
func (s *TemplateService) List() ([]model.Template, error) {
	return s.repo.List()
}

// Get 详情。
func (s *TemplateService) Get(id uint) (*model.Template, error) {
	t, err := s.repo.GetByID(id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return t, nil
}

// CreateTemplateInput 创建模板。
type CreateTemplateInput struct {
	Name             string            `json:"name" binding:"required"`
	Type             model.ServiceType `json:"type"`
	Description      string            `json:"description"`
	InstallSteps     string            `json:"install_steps"`
	ConfigTemplate   string            `json:"config_template"` // JSON,支持 {{var}}
	DefaultRuntimeID *uint             `json:"default_runtime_id"`
}

// Create 新建模板。
func (s *TemplateService) Create(in CreateTemplateInput) (*model.Template, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, ErrInvalidName
	}
	t := in.Type
	if t == "" {
		t = model.ServiceTypeJar
	}
	if err := validateConfigTemplate(in.ConfigTemplate); err != nil {
		return nil, err
	}
	tpl := &model.Template{
		Name:             name,
		Type:             t,
		Description:      in.Description,
		InstallSteps:     in.InstallSteps,
		ConfigTemplate:   strings.TrimSpace(in.ConfigTemplate),
		DefaultRuntimeID: in.DefaultRuntimeID,
	}
	if err := s.repo.Create(tpl); err != nil {
		return nil, err
	}
	return tpl, nil
}

// UpdateTemplateInput 更新模板。
type UpdateTemplateInput struct {
	Name             *string            `json:"name"`
	Type             *model.ServiceType `json:"type"`
	Description      *string            `json:"description"`
	InstallSteps     *string            `json:"install_steps"`
	ConfigTemplate   *string            `json:"config_template"`
	DefaultRuntimeID *uint              `json:"default_runtime_id"`
}

// Update 更新。
func (s *TemplateService) Update(id uint, in UpdateTemplateInput) (*model.Template, error) {
	tpl, err := s.Get(id)
	if err != nil {
		return nil, err
	}
	if in.Name != nil {
		name := strings.TrimSpace(*in.Name)
		if name == "" {
			return nil, ErrInvalidName
		}
		tpl.Name = name
	}
	if in.Type != nil {
		tpl.Type = *in.Type
	}
	if in.Description != nil {
		tpl.Description = *in.Description
	}
	if in.InstallSteps != nil {
		tpl.InstallSteps = *in.InstallSteps
	}
	if in.ConfigTemplate != nil {
		if err := validateConfigTemplate(*in.ConfigTemplate); err != nil {
			return nil, err
		}
		tpl.ConfigTemplate = strings.TrimSpace(*in.ConfigTemplate)
	}
	if in.DefaultRuntimeID != nil {
		// 0 表示清空
		if *in.DefaultRuntimeID == 0 {
			tpl.DefaultRuntimeID = nil
		} else {
			tpl.DefaultRuntimeID = in.DefaultRuntimeID
		}
	}
	if err := s.repo.Update(tpl); err != nil {
		return nil, err
	}
	return tpl, nil
}

// Delete 删除。
func (s *TemplateService) Delete(id uint) error {
	if _, err := s.Get(id); err != nil {
		return err
	}
	return s.repo.Delete(id)
}

// ApplyTemplateInput 从模板创建服务。
type ApplyTemplateInput struct {
	Code        string            `json:"code" binding:"required"`
	Name        string            `json:"name" binding:"required"`
	Description string            `json:"description"`
	RuntimeID   *uint             `json:"runtime_id"` // 覆盖模板默认 Runtime
	WorkDir     string            `json:"work_dir"`
	Vars        map[string]string `json:"vars"` // 替换 ConfigTemplate 中的 {{key}}
}

// Apply 用模板渲染配置并创建服务。
func (s *TemplateService) Apply(templateID uint, in ApplyTemplateInput) (*model.Service, error) {
	tpl, err := s.Get(templateID)
	if err != nil {
		return nil, err
	}
	code := strings.TrimSpace(in.Code)
	name := strings.TrimSpace(in.Name)
	if code == "" || name == "" {
		return nil, ErrInvalidName
	}

	// 渲染配置
	vars := map[string]string{}
	for k, v := range in.Vars {
		vars[k] = v
	}
	// 内置变量
	vars["code"] = code
	vars["name"] = name
	if in.WorkDir != "" {
		vars["work_dir"] = in.WorkDir
	}

	rendered := renderTemplate(tpl.ConfigTemplate, vars)
	cfgFields, err := parseConfigTemplate(rendered)
	if err != nil {
		return nil, fmt.Errorf("%w: 配置模板渲染结果无效: %v", ErrInvalidConfig, err)
	}

	runtimeID := in.RuntimeID
	if runtimeID == nil {
		runtimeID = tpl.DefaultRuntimeID
	}
	if tpl.Type == model.ServiceTypeJar && runtimeID == nil {
		return nil, ErrRuntimeRequired
	}

	shutdown := cfgFields.ShutdownTimeout
	if shutdown <= 0 {
		shutdown = 30
	}

	svc := &model.Service{
		Code:        code,
		Name:        name,
		Type:        tpl.Type,
		Description: in.Description,
		Status:      model.StatusCreated,
		RuntimeID:   runtimeID,
		WorkDir:     in.WorkDir,
		TemplateID:  &tpl.ID,
		NodeID:      1,
	}
	cfg := &model.ServiceConfig{
		IsCurrent:       true,
		Command:         cfgFields.Command,
		Args:            cfgFields.Args,
		JVMArgs:         cfgFields.JVMArgs,
		EnvVars:         cfgFields.EnvVars,
		Port:            cfgFields.Port,
		HealthCheck:     cfgFields.HealthCheck,
		AutoRestart:     cfgFields.AutoRestart,
		MaxRestarts:     cfgFields.MaxRestarts,
		ShutdownTimeout: shutdown,
	}
	if cfg.MaxRestarts == 0 && cfgFields.MaxRestarts == 0 {
		cfg.MaxRestarts = 3
	}

	err = s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(svc).Error; err != nil {
			return err
		}
		cfg.ServiceID = svc.ID
		return tx.Create(cfg).Error
	})
	if err != nil {
		return nil, err
	}
	return svc, nil
}

// configTemplateFields 配置模板解析结构。
type configTemplateFields struct {
	Command         string `json:"command"`
	Args            string `json:"args"`
	JVMArgs         string `json:"jvm_args"`
	EnvVars         string `json:"env_vars"`
	Port            int    `json:"port"`
	HealthCheck     string `json:"health_check"`
	AutoRestart     bool   `json:"auto_restart"`
	MaxRestarts     int    `json:"max_restarts"`
	ShutdownTimeout int    `json:"shutdown_timeout"`
}

func validateConfigTemplate(raw string) error {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil // 允许空模板
	}
	// 未替换的 {{x}} 用 null 占位,保证数字/字符串位置都是合法 JSON
	probe := varPattern.ReplaceAllString(raw, "null")
	var tmp map[string]any
	if err := json.Unmarshal([]byte(probe), &tmp); err != nil {
		return fmt.Errorf("%w: config_template 须为 JSON 对象(变量用 {{name}}): %v", ErrInvalidConfig, err)
	}
	return nil
}

func parseConfigTemplate(raw string) (configTemplateFields, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return configTemplateFields{}, nil
	}
	// port 等字段渲染后可能是字符串,用宽松解析
	var rawMap map[string]any
	if err := json.Unmarshal([]byte(raw), &rawMap); err != nil {
		return configTemplateFields{}, err
	}
	// 规范化:数字字段若为字符串则转换
	if v, ok := rawMap["port"]; ok {
		switch t := v.(type) {
		case string:
			var n int
			fmt.Sscanf(strings.TrimSpace(t), "%d", &n)
			rawMap["port"] = n
		case float64:
			rawMap["port"] = int(t)
		}
	}
	if v, ok := rawMap["max_restarts"]; ok {
		switch t := v.(type) {
		case string:
			var n int
			fmt.Sscanf(strings.TrimSpace(t), "%d", &n)
			rawMap["max_restarts"] = n
		case float64:
			rawMap["max_restarts"] = int(t)
		}
	}
	if v, ok := rawMap["shutdown_timeout"]; ok {
		switch t := v.(type) {
		case string:
			var n int
			fmt.Sscanf(strings.TrimSpace(t), "%d", &n)
			rawMap["shutdown_timeout"] = n
		case float64:
			rawMap["shutdown_timeout"] = int(t)
		}
	}
	// health_check 若为对象则序列化回字符串
	if v, ok := rawMap["health_check"]; ok {
		switch t := v.(type) {
		case map[string]any:
			b, _ := json.Marshal(t)
			rawMap["health_check"] = string(b)
		}
	}
	b, err := json.Marshal(rawMap)
	if err != nil {
		return configTemplateFields{}, err
	}
	var f configTemplateFields
	if err := json.Unmarshal(b, &f); err != nil {
		return f, err
	}
	return f, nil
}

// varPattern 匹配 {{ key }} 占位符。
var varPattern = regexp.MustCompile(`\{\{\s*([a-zA-Z0-9_]+)\s*\}\}`)

// renderTemplate 简单变量替换。未提供的变量替换为空字符串。
func renderTemplate(tpl string, vars map[string]string) string {
	if tpl == "" {
		return ""
	}
	return varPattern.ReplaceAllStringFunc(tpl, func(m string) string {
		sub := varPattern.FindStringSubmatch(m)
		if len(sub) < 2 {
			return ""
		}
		if v, ok := vars[sub[1]]; ok {
			return v
		}
		return ""
	})
}

// ExtractTemplateVars 从配置模板中提取变量名列表(供前端展示)。
func ExtractTemplateVars(configTemplate string) []string {
	matches := varPattern.FindAllStringSubmatch(configTemplate, -1)
	seen := map[string]bool{}
	var out []string
	// 内置变量不要求用户填写
	builtin := map[string]bool{"code": true, "name": true, "work_dir": true}
	for _, m := range matches {
		if len(m) < 2 {
			continue
		}
		k := m[1]
		if builtin[k] || seen[k] {
			continue
		}
		seen[k] = true
		out = append(out, k)
	}
	return out
}
