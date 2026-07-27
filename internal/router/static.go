package router

import (
	"io/fs"
	"os"
	"strings"

	"github.com/gin-gonic/gin"

	"aluka_ops/web"
)

// registerStatic 注册前端静态资源与 SPA fallback。
//
// 策略:
//  1. 优先从内嵌 FS 读取文件;
//  2. 为支持开发期热更新,若环境变量 ALUKA_WEB_DIR 指向真实 dist(如 web/dist),
//     则优先从磁盘读取——便于前端改动后无需重新编译后端。
//  3. 找不到文件时回退到 index.html,以支持前端客户端路由(如 /services)。
func registerStatic(r *gin.Engine) {
	indexBytes := mustReadIndex() // SPA 入口,用于 fallback

	r.NoRoute(func(c *gin.Context) {
		path := strings.TrimPrefix(c.Request.URL.Path, "/")

		// 仅对非 API 请求提供前端资源;API 404 返回标准 JSON。
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.JSON(404, gin.H{"code": 40400, "message": "接口不存在: " + c.Request.URL.Path, "data": nil})
			return
		}

		// 命中静态文件则直接返回。
		if path != "" {
			if data, ctype, ok := tryReadFile(path); ok {
				c.Data(200, ctype, data)
				return
			}
		}

		// 其余路径:返回 SPA index,交由前端路由处理。
		c.Data(200, "text/html; charset=utf-8", indexBytes)
	})
}

// mustReadIndex 读取 index.html,优先磁盘,其次内嵌。
func mustReadIndex() []byte {
	if b, ok := tryReadFileFromDisk("index.html"); ok {
		return b
	}
	b, err := fs.ReadFile(web.DistFS(), "index.html")
	if err != nil {
		panic("web: 内嵌 index.html 读取失败: " + err.Error())
	}
	return b
}

// tryReadFile 按优先级(磁盘 > 内嵌)读取单个文件,并推断 Content-Type。
func tryReadFile(name string) ([]byte, string, bool) {
	if b, ok := tryReadFileFromDisk(name); ok {
		return b, contentType(name), true
	}
	if b, err := fs.ReadFile(web.DistFS(), name); err == nil {
		return b, contentType(name), true
	}
	return nil, "", false
}

// tryReadFileFromDisk 当 ALUKA_WEB_DIR 设置时,从该目录读取文件。
func tryReadFileFromDisk(name string) ([]byte, bool) {
	dir := strings.TrimSpace(os.Getenv("ALUKA_WEB_DIR"))
	if dir == "" {
		return nil, false
	}
	b, err := os.ReadFile(dir + string(os.PathSeparator) + name)
	if err != nil {
		return nil, false
	}
	return b, true
}

// contentType 按扩展名推断。
func contentType(name string) string {
	switch {
	case strings.HasSuffix(name, ".html"):
		return "text/html; charset=utf-8"
	case strings.HasSuffix(name, ".js"):
		return "application/javascript; charset=utf-8"
	case strings.HasSuffix(name, ".css"):
		return "text/css; charset=utf-8"
	case strings.HasSuffix(name, ".svg"):
		return "image/svg+xml"
	case strings.HasSuffix(name, ".png"):
		return "image/png"
	case strings.HasSuffix(name, ".jpg"), strings.HasSuffix(name, ".jpeg"):
		return "image/jpeg"
	case strings.HasSuffix(name, ".ico"):
		return "image/x-icon"
	case strings.HasSuffix(name, ".json"):
		return "application/json; charset=utf-8"
	case strings.HasSuffix(name, ".woff2"):
		return "font/woff2"
	default:
		return "application/octet-stream"
	}
}
