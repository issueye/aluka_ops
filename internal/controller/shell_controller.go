package controller

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"

	"aluka_ops/internal/config"
	"aluka_ops/internal/pkg/shell"
)

// ShellController 服务器级 Web 控制台(PTY/ConPTY)。
type ShellController struct {
	mgr         *shell.Manager
	allowOrigin string
	upgrader    websocket.Upgrader
}

func NewShellController(mgr *shell.Manager, allowOrigin string) *ShellController {
	return &ShellController{
		mgr:         mgr,
		allowOrigin: allowOrigin,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  8192,
			WriteBufferSize: 8192,
			CheckOrigin: func(r *http.Request) bool {
				return config.OriginAllowed(allowOrigin, r.Header.Get("Origin"))
			},
		},
	}
}

// Info GET /api/shell/info
func (h *ShellController) Info(c *gin.Context) {
	OK(c, gin.H{
		"default":   shell.DefaultShell(),
		"shells":    shell.AvailableShells(),
		"sessions":  h.mgr.List(),
		"backend":   shell.Backend(),
		"note":      "Linux/macOS=pty, Windows=ConPTY; xterm 原始按键透传。",
		"websocket": "/api/shell/ws?shell=powershell_noprofile&cols=120&rows=30",
	})
}

// ListSessions GET /api/shell/sessions
func (h *ShellController) ListSessions(c *gin.Context) {
	OK(c, gin.H{"items": h.mgr.List()})
}

// CloseSession DELETE /api/shell/sessions/:id
func (h *ShellController) CloseSession(c *gin.Context) {
	id := c.Param("id")
	if err := h.mgr.Close(id); err != nil {
		if err == shell.ErrSessionNotFound {
			FailNotFound(c, "会话")
			return
		}
		FailServer(c, err)
		return
	}
	OKMsg(c, "已关闭")
}

// clientMsg 前端 → 后端控制消息(JSON 文本帧)。
// type:
//   - input: data 为原始按键(也可直接发 Binary/纯文本按键)
//   - resize: cols/rows
//   - close
type clientMsg struct {
	Type string `json:"type"`
	Data string `json:"data,omitempty"`
	Cols int    `json:"cols,omitempty"`
	Rows int    `json:"rows,omitempty"`
}

// WS GET /api/shell/ws?shell=&cols=&rows=
//
// 协议:
//   - 服务端 → 客户端 Binary: PTY 原始输出
//   - 服务端 → 客户端 Text 以 \x1eMETA: / \x1eERROR: 开头:元信息
//   - 客户端 → 服务端 Binary 或 Text: 原始输入(按键)
//   - 客户端 → 服务端 JSON Text: {"type":"resize","cols":120,"rows":30} / {"type":"close"}
func (h *ShellController) WS(c *gin.Context) {
	shellType := c.Query("shell")
	if shellType == "" {
		shellType = shell.DefaultShell()
	}
	cols := parseU16(c.Query("cols"), 120)
	rows := parseU16(c.Query("rows"), 30)

	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	sess, err := h.mgr.Create(shellType, cols, rows)
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("\x1eERROR:"+err.Error()+"\n"))
		return
	}
	defer func() { _ = h.mgr.Close(sess.ID) }()

	_ = conn.WriteMessage(websocket.TextMessage, []byte(
		"\x1eMETA:session="+sess.ID+";shell="+sess.Shell+";backend="+shell.Backend()+
			";cols="+itoa(int(cols))+";rows="+itoa(int(rows))+"\n",
	))

	// PTY 输出 → WebSocket
	outDone := make(chan struct{})
	go func() {
		defer close(outDone)
		buf := make([]byte, 8192)
		for {
			n, rerr := sess.Read(buf)
			if n > 0 {
				_ = conn.SetWriteDeadline(time.Now().Add(30 * time.Second))
				if werr := conn.WriteMessage(websocket.BinaryMessage, buf[:n]); werr != nil {
					return
				}
			}
			if rerr != nil {
				if rerr != io.EOF && sess.Alive() {
					_ = conn.WriteMessage(websocket.TextMessage, []byte("\r\n\x1eERROR:read: "+rerr.Error()+"\r\n"))
				}
				return
			}
		}
	}()

	// 心跳
	pingDone := make(chan struct{})
	go func() {
		t := time.NewTicker(20 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-pingDone:
				return
			case <-t.C:
				_ = conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
				if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					return
				}
			}
		}
	}()
	defer close(pingDone)

	conn.SetReadLimit(256 << 10)
	_ = conn.SetReadDeadline(time.Now().Add(30 * time.Minute))
	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(30 * time.Minute))
		return nil
	})

	// WebSocket 输入 → PTY
	for {
		mt, data, err := conn.ReadMessage()
		if err != nil {
			break
		}
		if mt == websocket.BinaryMessage {
			if len(data) > 0 {
				_, _ = sess.Write(data)
			}
			continue
		}
		if mt != websocket.TextMessage {
			continue
		}
		if len(data) == 0 {
			continue
		}
		// JSON 控制消息
		if data[0] == '{' {
			var msg clientMsg
			if json.Unmarshal(data, &msg) == nil {
				switch strings.ToLower(msg.Type) {
				case "resize":
					_ = sess.Resize(uint16(msg.Cols), uint16(msg.Rows))
					continue
				case "close":
					goto done
				case "input":
					if msg.Data != "" {
						_, _ = sess.Write([]byte(msg.Data))
					}
					continue
				}
			}
		}
		// 兼容旧协议:纯文本一行 / __CLOSE__ / Ctrl+C 单字节
		if string(data) == "__CLOSE__" || string(data) == "\x1eCLOSE" {
			break
		}
		_, _ = sess.Write(data)
	}
done:
	<-outDone
}

func parseU16(s string, def uint16) uint16 {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil || n <= 0 || n > 65535 {
		return def
	}
	return uint16(n)
}

func itoa(n int) string {
	return strconv.Itoa(n)
}
