package gateway

import (
	"net"
	"net/http"
	"testing"
)

func TestParseAndFilter(t *testing.T) {
	f, err := NewIPFilter("10.0.0.0/8\n192.168.1.1", "1.2.3.4, 5.5.5.5/32")
	if err != nil {
		t.Fatal(err)
	}
	if !f.Allowed(net.ParseIP("10.1.2.3")) {
		t.Fatal("10.x should allow")
	}
	if !f.Allowed(net.ParseIP("192.168.1.1")) {
		t.Fatal("exact allow")
	}
	if f.Allowed(net.ParseIP("8.8.8.8")) {
		t.Fatal("not in whitelist")
	}
	// 黑名单优先:即便在白名单段内
	f2, _ := NewIPFilter("10.0.0.0/8", "10.0.0.1")
	if f2.Allowed(net.ParseIP("10.0.0.1")) {
		t.Fatal("blacklist wins")
	}
	if !f2.Allowed(net.ParseIP("10.0.0.2")) {
		t.Fatal("other 10.x ok")
	}
}

func TestBlacklistOnly(t *testing.T) {
	f, err := NewIPFilter("", "203.0.113.0/24")
	if err != nil {
		t.Fatal(err)
	}
	if f.Allowed(net.ParseIP("203.0.113.10")) {
		t.Fatal("should deny")
	}
	if !f.Allowed(net.ParseIP("8.8.8.8")) {
		t.Fatal("others ok")
	}
}

func TestClientIP(t *testing.T) {
	r, _ := http.NewRequest("GET", "/", nil)
	r.RemoteAddr = "1.1.1.1:1234"
	r.Header.Set("X-Forwarded-For", "9.9.9.9, 8.8.8.8")
	ip := ClientIP(r)
	if ip == nil || ip.String() != "9.9.9.9" {
		t.Fatalf("got %v", ip)
	}
}

func TestInvalidList(t *testing.T) {
	if _, err := NewIPFilter("not-an-ip", ""); err == nil {
		t.Fatal("expect error")
	}
}
