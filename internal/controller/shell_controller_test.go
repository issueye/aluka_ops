package controller

import (
	"net/http"
	"testing"

	"aluka_ops/internal/pkg/shell"
)

func TestShellOriginCheck(t *testing.T) {
	for _, tc := range []struct {
		name   string
		allow  string
		origin string
		want   bool
	}{
		{name: "fixed allowed", allow: "https://console.example", origin: "https://console.example", want: true},
		{name: "fixed rejected", allow: "https://console.example", origin: "https://evil.example", want: false},
		{name: "wildcard", allow: "*", origin: "https://any.example", want: true},
		{name: "no origin", allow: "https://console.example", origin: "", want: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := NewShellController((*shell.Manager)(nil), tc.allow)
			r := &http.Request{Header: make(http.Header)}
			if tc.origin != "" {
				r.Header.Set("Origin", tc.origin)
			}
			got := h.upgrader.CheckOrigin(r)
			if got != tc.want {
				t.Fatalf("CheckOrigin = %v, want %v", got, tc.want)
			}
		})
	}
}
