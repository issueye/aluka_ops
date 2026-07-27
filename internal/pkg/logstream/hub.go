package logstream

import (
	"path/filepath"
	"sync"
	"time"
)

// Event 日志事件类型,对应 SSE 的 event 字段。
type Event string

const (
	EventHistory Event = "history" // 历史尾部(连接建立时下发)
	EventLog     Event = "log"     // 实时新增
	EventMeta    Event = "meta"    // 元信息(文件路径等)
	EventEnd     Event = "end"     // 流结束(如文件消失)
)

// Message 推送给订阅者的消息。
type Message struct {
	Event Event
	Data  []byte
}

// Subscriber 订阅者。
type Subscriber struct {
	id   int64
	ch   chan Message
	quit chan struct{}
}

// Next 取下一条消息(阻塞)。ok=false 表示通道已关闭。
func (s *Subscriber) Next() (Message, bool) {
	msg, ok := <-s.ch
	return msg, ok
}

// C 返回消息 channel,供 select 直接接收(避免在 select case 里调用方法)。
func (s *Subscriber) C() <-chan Message {
	return s.ch
}

// Done 返回订阅关闭信号 channel(在 Close 后解除阻塞)。
// 供订阅者 select 监听,以便在订阅被移除时及时退出。
func (s *Subscriber) Done() <-chan struct{} {
	return s.quit
}

// Close 关闭订阅。
func (s *Subscriber) Close() {
	select {
	case <-s.quit: // 已关闭
	default:
		close(s.quit)
	}
}

// LogHub 日志流分发中心。
//
// 每个 serviceID 对应一个 tail goroutine,负责:
//  1. 跟踪当前日志文件路径(服务重启会生成新文件)
//  2. 200ms 轮询文件新增内容 → 广播给所有订阅者
//
// 订阅者通过 Subscribe 加入时,会立即收到历史尾部(EventHistory),
// 之后持续收到增量(EventLog)。
type LogHub struct {
	dataDir string

	mu          sync.Mutex
	subs        map[uint][]*Subscriber // serviceID -> 订阅者列表
	tailers     map[uint]*tailer       // serviceID -> tail 状态
	nextSubID   int64
}

// tailer 单个服务的文件 tail 状态。
type tailer struct {
	serviceID  uint
	code       string
	currentLog string // 当前 tail 的日志文件绝对路径
	offset     int64  // 当前已读偏移
	hub        *LogHub
	stop       chan struct{}
	started    bool
}

// NewLogHub 构造。
func NewLogHub(dataDir string) *LogHub {
	return &LogHub{
		dataDir: dataDir,
		subs:    make(map[uint][]*Subscriber),
		tailers: make(map[uint]*tailer),
	}
}

// Subscribe 订阅某服务的日志流。
//   - historyLines:连接建立时下发的历史尾部行数(<=0 则用默认 200)
//   - logFile    :当前日志文件路径(由业务层解析,通常为最新日志文件)
//
// 返回订阅者;调用方应在结束(如 HTTP 断开)时调用 sub.Close()。
func (h *LogHub) Subscribe(serviceID uint, code, logFile string, historyLines int) *Subscriber {
	if historyLines <= 0 {
		historyLines = 200
	}

	h.mu.Lock()
	h.nextSubID++
	sub := &Subscriber{
		id:   h.nextSubID,
		ch:   make(chan Message, 256),
		quit: make(chan struct{}),
	}
	h.subs[serviceID] = append(h.subs[serviceID], sub)

	// 确保 tailer 存在并运行(同 code 复用)
	t, ok := h.tailers[serviceID]
	if !ok {
		t = &tailer{
			serviceID: serviceID,
			code:      code,
			hub:       h,
			stop:      make(chan struct{}),
		}
		h.tailers[serviceID] = t
	}
	t.code = code
	t.currentLog = logFile
	h.mu.Unlock()

	// 先下发历史尾部与元信息(同步,小数据)
	h.sendHistory(sub, logFile, historyLines)
	h.broadcast(serviceID, Message{Event: EventMeta, Data: []byte(metaJSON(logFile, serviceID))})

	// 启动 tail 循环(仅一次)
	t.ensureStarted()

	return sub
}

// Unsubscribe 移除订阅者并关闭其通道。
func (h *LogHub) Unsubscribe(serviceID uint, sub *Subscriber) {
	h.mu.Lock()
	subs := h.subs[serviceID]
	for i, s := range subs {
		if s.id == sub.id {
			h.subs[serviceID] = append(subs[:i], subs[i+1:]...)
			break
		}
	}
	if len(h.subs[serviceID]) == 0 {
		delete(h.subs, serviceID)
		// 无订阅者时停止 tailer,释放资源
		if t, ok := h.tailers[serviceID]; ok {
			select {
			case <-t.stop:
			default:
				close(t.stop)
			}
			delete(h.tailers, serviceID)
		}
	}
	h.mu.Unlock()

	close(sub.ch)
}

// sendHistory 下发日志文件尾部作为历史。
// 文件不存在则跳过(不报错,等待 tailer 发现新文件)。
func (h *LogHub) sendHistory(sub *Subscriber, logFile string, n int) {
	if logFile == "" {
		return
	}
	lines, err := TailLines(logFile, n)
	if err != nil {
		return // 文件不存在等,忽略
	}
	for _, line := range lines {
		select {
		case <-sub.quit:
			return
		case sub.ch <- Message{Event: EventHistory, Data: []byte(line)}:
		}
	}
}

// broadcast 向某服务的所有订阅者广播消息(非阻塞,缓冲满则丢弃)。
func (h *LogHub) broadcast(serviceID uint, msg Message) {
	h.mu.Lock()
	subs := h.subs[serviceID]
	// 复制一份避免持有锁发送
	cp := make([]*Subscriber, len(subs))
	copy(cp, subs)
	h.mu.Unlock()

	for _, s := range cp {
		select {
		case s.ch <- msg:
		default:
			// 缓冲满:丢弃(慢消费者);避免阻塞 tailer
		}
	}
}

// UpdateLogPath 更新某服务的当前日志文件路径(服务启动/重启时由业务层调用)。
// 若新文件不同于当前文件,重置 offset 从头读。
func (h *LogHub) UpdateLogPath(serviceID uint, code, logFile string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	t, ok := h.tailers[serviceID]
	if !ok {
		return
	}
	if t.currentLog != logFile {
		t.currentLog = logFile
		t.offset = 0 // 新文件从 0 读
	}
	t.code = code
}

// ensureStarted 启动 tail 循环(幂等)。
func (t *tailer) ensureStarted() {
	if t.started {
		return
	}
	t.started = true
	go t.run()
}

// run tail 循环:轮询当前日志文件的新增内容并广播。
func (t *tailer) run() {
	ticker := time.NewTicker(200 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-t.stop:
			return
		case <-ticker.C:
			t.pollOnce()
		}
	}
}

// pollOnce 执行一次文件增量读取。
func (t *tailer) pollOnce() {
	t.hub.mu.Lock()
	logFile := t.currentLog
	offset := t.offset
	t.hub.mu.Unlock()

	if logFile == "" {
		return
	}

	data, newOffset, truncated, err := ReadFromOffset(logFile, offset)
	if err != nil {
		// 文件不存在(服务未启动过或日志已删),静默等待
		return
	}
	if truncated {
		// 文件被重建(轮转/重启生成新文件),重置 offset
		t.hub.mu.Lock()
		t.offset = 0
		t.hub.mu.Unlock()
		return
	}

	if len(data) > 0 {
		t.hub.broadcast(t.serviceID, Message{Event: EventLog, Data: data})
		t.hub.mu.Lock()
		t.offset = newOffset
		t.hub.mu.Unlock()
	}
}

// metaJSON 生成 meta 事件的 data(JSON 字符串)。
func metaJSON(logFile string, serviceID uint) string {
	// 简单拼接,避免引入 encoding/json 的开销
	fileName := ""
	if logFile != "" {
		fileName = filepath.Base(logFile)
	}
	return `{"service_id":` + itoa(int(serviceID)) + `,"file":` + jsonString(fileName) + `,"path":` + jsonString(logFile) + `}`
}

// itoa 简单整数转字符串。
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}

// jsonString 简单 JSON 字符串转义(仅处理常见转义)。
func jsonString(s string) string {
	out := make([]byte, 0, len(s)+2)
	out = append(out, '"')
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch c {
		case '"':
			out = append(out, '\\', '"')
		case '\\':
			out = append(out, '\\', '\\')
		case '\n':
			out = append(out, '\\', 'n')
		case '\r':
			out = append(out, '\\', 'r')
		case '\t':
			out = append(out, '\\', 't')
		default:
			out = append(out, c)
		}
	}
	out = append(out, '"')
	return string(out)
}
