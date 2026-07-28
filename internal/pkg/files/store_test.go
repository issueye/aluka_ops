package files

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestResolveBlocksTraversal(t *testing.T) {
	root := t.TempDir()
	s, err := NewStore(root)
	if err != nil {
		t.Fatal(err)
	}
	cases := []string{
		"..",
		"../etc",
		"foo/../../etc",
		`C:\Windows`,
		`\\server\share`,
	}
	for _, c := range cases {
		if _, _, err := s.resolve(c); err == nil {
			t.Errorf("resolve(%q) should fail", c)
		}
	}
	// 以 / 开头的相对段在 Windows 上不是绝对路径,会落到 root 下,这是允许的
	if _, rel, err := s.resolve("/nested"); err != nil || rel != "nested" {
		t.Errorf("leading slash should normalize: rel=%q err=%v", rel, err)
	}
	// 合法路径
	abs, rel, err := s.resolve("a/b")
	if err != nil {
		t.Fatal(err)
	}
	if rel != "a/b" {
		t.Errorf("rel=%q", rel)
	}
	if !strings.HasPrefix(strings.ToLower(abs), strings.ToLower(filepath.Clean(root))) {
		t.Errorf("abs not under root: %s", abs)
	}
}

func TestJoinRelPath(t *testing.T) {
	cases := []struct {
		parent, rel, want string
	}{
		{"", "a/b.txt", "a/b.txt"},
		{"apps", "web/index.html", "apps/web/index.html"},
		{"apps", "web\\index.html", "apps/web/index.html"},
		{"", "../x", ""},
		{"", "a/../b", ""},
		{"", "", ""},
	}
	for _, c := range cases {
		got := JoinRelPath(c.parent, c.rel)
		if got != c.want {
			t.Errorf("JoinRelPath(%q,%q)=%q want %q", c.parent, c.rel, got, c.want)
		}
	}
}

func TestCRUD(t *testing.T) {
	root := t.TempDir()
	s, err := NewStore(root)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Mkdir("logs", false); err != nil {
		t.Fatal(err)
	}
	if err := s.WriteFile("logs/app.txt", []byte("hello")); err != nil {
		t.Fatal(err)
	}
	content, ent, err := s.ReadText("logs/app.txt")
	if err != nil || content != "hello" || ent.Name != "app.txt" {
		t.Fatalf("read: content=%q err=%v", content, err)
	}
	if err := s.Rename("logs/app.txt", "logs/app2.txt"); err != nil {
		t.Fatal(err)
	}
	list, err := s.List("logs")
	if err != nil || len(list.Entries) != 1 || list.Entries[0].Name != "app2.txt" {
		t.Fatalf("list: %+v err=%v", list, err)
	}
	if err := s.Remove("logs", true); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "logs")); !os.IsNotExist(err) {
		t.Fatal("logs should be removed")
	}
}
