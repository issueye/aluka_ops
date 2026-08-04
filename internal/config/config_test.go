package config

import (
	"strings"
	"testing"
)

func TestValidateAuthPasswordRequirement(t *testing.T) {
	tests := []struct {
		name         string
		authPassword string
		allowNoAuth  bool
		wantErr      string
	}{
		{
			name:    "empty password rejected by default",
			wantErr: "未配置管理密码",
		},
		{
			name:         "whitespace password rejected by default",
			authPassword: "   ",
			wantErr:      "未配置管理密码",
		},
		{
			name:        "empty password allowed with explicit development override",
			allowNoAuth: true,
		},
		{
			name:         "non-empty password allowed",
			authPassword: "secret",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := minimalValidConfig()
			cfg.AuthPassword = tt.authPassword
			cfg.AllowNoAuth = tt.allowNoAuth

			err := cfg.Validate()
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("Validate() error = %v, want nil", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("Validate() error = %v, want containing %q", err, tt.wantErr)
			}
		})
	}
}

func TestValidateAgentTokenRequirement(t *testing.T) {
	tests := []struct {
		name                 string
		mode                 Mode
		agentToken           string
		allowEmptyAgentToken bool
		wantErr              string
	}{
		{
			name:    "standalone allows empty agent token",
			mode:    ModeStandalone,
			wantErr: "",
		},
		{
			name:    "agent rejects empty token by default",
			mode:    ModeAgent,
			wantErr: "未配置 Agent 共享密钥",
		},
		{
			name:    "controller rejects empty token by default",
			mode:    ModeController,
			wantErr: "未配置 Agent 共享密钥",
		},
		{
			name:                 "agent allows empty token with explicit development override",
			mode:                 ModeAgent,
			allowEmptyAgentToken: true,
		},
		{
			name:       "controller allows non-empty token",
			mode:       ModeController,
			agentToken: "shared-secret",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := minimalValidConfig()
			cfg.Mode = tt.mode
			cfg.AgentToken = tt.agentToken
			cfg.AllowEmptyAgentToken = tt.allowEmptyAgentToken

			err := cfg.Validate()
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("Validate() error = %v, want nil", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("Validate() error = %v, want containing %q", err, tt.wantErr)
			}
		})
	}
}

func TestValidatePortRange(t *testing.T) {
	cfg := minimalValidConfig()
	cfg.HTTPPort = 0

	err := cfg.Validate()
	if err == nil || !strings.Contains(err.Error(), "无效端口") {
		t.Fatalf("Validate() error = %v, want invalid port error", err)
	}
}

func minimalValidConfig() *Config {
	return &Config{
		HTTPPort:     18080,
		DataDir:      "./data",
		DBPath:       "data/aluka_ops.db",
		Mode:         ModeStandalone,
		AuthPassword: "secret",
	}
}
