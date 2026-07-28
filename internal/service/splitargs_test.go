package service

import (
	"reflect"
	"testing"
)

func TestSplitArgs(t *testing.T) {
	cases := []struct {
		in   string
		want []string
	}{
		{"", nil},
		{"  ", nil},
		{`-h 0.0.0.0 -p 6380`, []string{"-h", "0.0.0.0", "-p", "6380"}},
		{`-h "0.0.0.0" -p 6380`, []string{"-h", "0.0.0.0", "-p", "6380"}},
		{`-h '0.0.0.0' -p 6380`, []string{"-h", "0.0.0.0", "-p", "6380"}},
		{`-Dloader.path=resources,lib -Xms1024m`, []string{"-Dloader.path=resources,lib", "-Xms1024m"}},
		{`--name "hello world"`, []string{"--name", "hello world"}},
		{`path\"with\"q`, []string{`path"with"q`}},
	}
	for _, c := range cases {
		got := splitArgs(c.in)
		if !reflect.DeepEqual(got, c.want) {
			t.Errorf("splitArgs(%q) = %#v, want %#v", c.in, got, c.want)
		}
	}
}
