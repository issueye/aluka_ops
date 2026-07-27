// Package web 内嵌前端构建产物(web/dist),供后端作为静态资源托管。
//
// embed 指令路径相对于本文件(web/embed.go)所在目录,因此可覆盖 web/dist。
// 若 web/dist 尚未构建,占位的 dist/index.html(已纳入)仍可保证编译通过。
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var distFS embed.FS

// DistFS 返回去掉 "dist/" 前缀后的前端文件系统,可直接用于 http.FS。
func DistFS() fs.FS {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		// dist 由 embed 保证存在,理论不会到达此处。
		panic("web: 无法访问内嵌 dist: " + err.Error())
	}
	return sub
}
