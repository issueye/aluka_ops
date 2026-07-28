package auth

import "testing"

func TestNewStoreWhitespacePasswordDisablesAuth(t *testing.T) {
	store := NewStore("  \t\n", 24)
	if store.Enabled() {
		t.Fatal("whitespace password should disable authentication")
	}
	if !store.Valid("anything") {
		t.Fatal("disabled authentication should accept tokens")
	}
}

func TestStoreLoginAndRevoke(t *testing.T) {
	store := NewStore("secret", 24)
	if _, _, ok := store.Login("wrong"); ok {
		t.Fatal("wrong password was accepted")
	}
	token, _, ok := store.Login("secret")
	if !ok || token == "" {
		t.Fatal("valid password did not issue a token")
	}
	if !store.Valid(token) {
		t.Fatal("issued token is invalid")
	}
	store.Revoke(token)
	if store.Valid(token) {
		t.Fatal("revoked token remains valid")
	}
}
