package controller

import (
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"

	"aluka_ops/internal/pkg/shell"
)

// ShellController 服务器级 Web 控制台。
type ShellController struct {
	mgr *shell.Manager
}

func NewShellController(mgr *shell.Manager) *ShellController {
	return &ShellController{mgr: mgr}
}

var shellUpgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		return true // 管理面同源/内网;鉴权已在中间件完成
	},
}

// Info GET /api/shell/info
func (h *ShellController) Info(c *gin.Context) {
	OK(c, gin.H{
		"default":   shell.DefaultShell(),
		"shells":    shell.AvailableShells(),
		"sessions":  h.mgr.List(),
		"note":      "Windows 推荐 powershell;输入按行发送(CRLF)。",
		"websocket": "/api/shell/ws?shell=powershell",
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

// WS GET /api/shell/ws?shell=powershell
// 文本帧:客户端发送命令行;服务端推送 shell 输出。
// 控制帧(JSON 文本,以 \x00 前缀可选):简化为纯文本行协议。
//
// 协议:
//   - 客户端 → 服务端:一行命令(可无换行,服务端补 CRLF/LF)
//   - 客户端 → 服务端:特殊 "\x03" 表示中断(尽力写入 Ctrl+C 字节)
//   - 服务端 → 客户端:原始输出字节(UTF-8 文本帧)
//   - 服务端 → 客户端:以 "\x1eMETA:" 开头的元信息行(会话 id 等)
func (h *ShellController) WS(c *gin.Context) {
	shellType := c.Query("shell")
	if shellType == "" {
		shellType = shell.DefaultShell()
	}

	conn, err := shellUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	sess, err := h.mgr.Create(shellType)
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("\x1eERROR:"+err.Error()+"\n"))
		return
	}
	defer func() { _ = h.mgr.Close(sess.ID) }()

	_ = conn.WriteMessage(websocket.TextMessage, []byte(
		"\x1eMETA:session="+sess.ID+";shell="+sess.Shell+"\n",
	))
	_ = conn.WriteMessage(websocket.TextMessage, []byte(
		"# Aluka Ops 服务器控制台 · "+sess.Shell+" · session "+sess.ID+"\r\n",
	))

	// 输出:shell stdout → websocket
	outDone := make(chan struct{})
	go func() {
		defer close(outDone)
		buf := make([]byte, 4096)
		for {
			n, rerr := sess.Stdout().Read(buf)
			if n > 0 {
				// 写超时保护
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

	// 输入:websocket → shell stdin
	conn.SetReadLimit(64 << 10)
	_ = conn.SetReadDeadline(time.Now().Add(30 * time.Minute))
	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(30 * time.Minute))
		return nil
	})

	// 心跳 ping
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

	for {
		mt, data, err := conn.ReadMessage()
		if err != nil {
			break
		}
		if mt != websocket.TextMessage && mt != websocket.BinaryMessage {
			continue
		}
		if len(data) == 0 {
			continue
		}
		// Ctrl+C
		if len(data) == 1 && data[0] == 3 {
			_, _ = sess.Write([]byte{3})
			continue
		}
		// 特殊关闭
		if string(data) == "\x1eCLOSE" || strings.TrimSpace(string(data)) == "__CLOSE__" {
			break
		}
		// 按文本行写入(Windows 自动 CRLF)
		line := string(data)
		// 去掉客户端可能带的换行,由 WriteLine 统一补
		line = strings.TrimRight(line, "\r\n")
		if err := sess.WriteLine(line); err != nil {
			_ = conn.WriteMessage(websocket.TextMessage, []byte("\r\n\x1eERROR:write: "+err.Error()+"\r\n"))
			break
		}
	}

	<-outDone
}
