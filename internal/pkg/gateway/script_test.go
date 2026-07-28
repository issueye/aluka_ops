package gateway

import (
	"net/http"
	"testing"
)

func TestParseAndRunRewriteRedirect(t *testing.T) {
	raw := `[
	  {"when":{"path_regex":"^/old/(.*)$"},"then":{"rewrite":"/new/$1"}},
	  {"when":{"path_prefix":"/blocked"},"then":{"deny":403,"body":"no"}},
	  {"when":{"path_exact":"/go"},"then":{"redirect":"/home","status":302}}
	]`
	cs, err := CompileScript(1, "s1", "test", "/", 10, raw)
	if err != nil {
		t.Fatal(err)
	}
	req, _ := http.NewRequest("GET", "/old/abc", nil)
	act := RunScripts([]CompiledScript{*cs}, req, "/old/abc")
	// rewrite 后无其它命中 → none, path=/new/abc
	if act.Kind != "none" || act.Path != "/new/abc" {
		t.Fatalf("rewrite: %+v", act)
	}

	req2, _ := http.NewRequest("GET", "/blocked/x", nil)
	act2 := RunScripts([]CompiledScript{*cs}, req2, "/blocked/x")
	if act2.Kind != "deny" || act2.Status != 403 {
		t.Fatalf("deny: %+v", act2)
	}

	req3, _ := http.NewRequest("GET", "/go", nil)
	act3 := RunScripts([]CompiledScript{*cs}, req3, "/go")
	if act3.Kind != "redirect" || act3.Location != "/home" {
		t.Fatalf("redirect: %+v", act3)
	}
}

func TestParseInvalid(t *testing.T) {
	if _, err := ParseScriptJSON(`[]`); err == nil {
		t.Fatal("empty should fail")
	}
	if _, err := ParseScriptJSON(`[{"when":{},"then":{}}]`); err == nil {
		t.Fatal("empty then should fail")
	}
}
