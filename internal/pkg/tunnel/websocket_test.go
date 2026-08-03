package tunnel

import (
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"testing"
	"time"

	"aluka_ops/internal/model"

	"github.com/gorilla/websocket"
)

func TestReverseTunnelForwardsWebSocket(t *testing.T) {
	const (
		agentID     = "ws-agent"
		agentToken  = "ws-token"
		subprotocol = "aluka-ws-test"
	)

	upgrader := websocket.Upgrader{
		CheckOrigin:  func(*http.Request) bool { return true },
		Subprotocols: []string{subprotocol},
	}
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()
		for {
			messageType, payload, err := conn.ReadMessage()
			if err != nil {
				return
			}
			if err := conn.WriteMessage(messageType, payload); err != nil {
				return
			}
		}
	}))
	defer upstream.Close()

	upstreamURL, err := url.Parse(upstream.URL)
	if err != nil {
		t.Fatal(err)
	}
	_, upstreamPortText, err := net.SplitHostPort(upstreamURL.Host)
	if err != nil {
		t.Fatal(err)
	}
	upstreamPort, err := strconv.Atoi(upstreamPortText)
	if err != nil {
		t.Fatal(err)
	}

	hub := NewHub(agentToken, "")
	defer hub.Close()
	controllerMux := http.NewServeMux()
	controllerMux.HandleFunc("/api/tunnel/ws", hub.HandleWS)
	controller := httptest.NewServer(controllerMux)
	defer controller.Close()

	agent := NewAgentClient(controller.URL, agentID, agentToken, false)
	agent.Start()
	defer agent.Stop()
	waitForTunnel(t, 5*time.Second, func() bool {
		_, ok := hub.GetSession(agentID)
		return ok
	}, "Agent tunnel session")

	listenPort := reserveTCPPort(t)
	hub.ApplyRules([]model.TunnelRule{{
		Base:       model.Base{ID: 1},
		Enabled:    true,
		Mode:       model.TunnelModeReverseTCP,
		AgentID:    agentID,
		ListenHost: "127.0.0.1",
		ListenPort: listenPort,
		RemoteHost: "127.0.0.1",
		RemotePort: upstreamPort,
		// 活跃的 WebSocket 流量必须刷新空闲超时，不能在固定时刻断开。
		IdleTimeoutSec: 1,
	}})
	waitForTunnel(t, 5*time.Second, func() bool {
		return hub.RuntimeStatus()[1].Listening
	}, "tunnel listener")

	dialer := websocket.Dialer{
		HandshakeTimeout: 5 * time.Second,
		Subprotocols:     []string{subprotocol},
	}
	wsURL := fmt.Sprintf("ws://127.0.0.1:%d/ws", listenPort)
	conn, response, err := dialer.Dial(wsURL, http.Header{
		"Origin": []string{fmt.Sprintf("http://127.0.0.1:%d", listenPort)},
	})
	if err != nil {
		if response != nil {
			t.Fatalf("WebSocket handshake through tunnel failed: %v (HTTP %d)", err, response.StatusCode)
		}
		t.Fatalf("WebSocket handshake through tunnel failed: %v", err)
	}
	defer conn.Close()
	if got := conn.Subprotocol(); got != subprotocol {
		t.Fatalf("subprotocol = %q, want %q", got, subprotocol)
	}

	for _, tc := range []struct {
		messageType int
		payload     []byte
	}{
		{messageType: websocket.TextMessage, payload: []byte("hello over tunnel")},
		{messageType: websocket.BinaryMessage, payload: []byte{0x00, 0x01, 0xfe, 0xff}},
	} {
		if err := conn.WriteMessage(tc.messageType, tc.payload); err != nil {
			t.Fatal(err)
		}
		_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
		messageType, payload, err := conn.ReadMessage()
		if err != nil {
			t.Fatal(err)
		}
		if messageType != tc.messageType || string(payload) != string(tc.payload) {
			t.Fatalf("echo = (%d, %x), want (%d, %x)", messageType, payload, tc.messageType, tc.payload)
		}
	}

	// 持续通信超过最初的 1 秒截止时间；旧实现会在这里断开连接。
	for i := 0; i < 4; i++ {
		time.Sleep(350 * time.Millisecond)
		payload := []byte(fmt.Sprintf("keepalive-%d", i))
		if err := conn.WriteMessage(websocket.TextMessage, payload); err != nil {
			t.Fatal(err)
		}
		_ = conn.SetReadDeadline(time.Now().Add(5 * time.Second))
		messageType, echoed, err := conn.ReadMessage()
		if err != nil {
			t.Fatal(err)
		}
		if messageType != websocket.TextMessage || string(echoed) != string(payload) {
			t.Fatalf("keepalive echo = (%d, %q), want (%d, %q)", messageType, echoed, websocket.TextMessage, payload)
		}
	}
}

func reserveTCPPort(t *testing.T) int {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	if err := listener.Close(); err != nil {
		t.Fatal(err)
	}
	return port
}

func waitForTunnel(t *testing.T, timeout time.Duration, ready func() bool, name string) {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if ready() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", name)
}
