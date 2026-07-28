// Package auth 提供简单 Token 鉴权(单管理员密码)。
package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"sync"
	"time"
)

// Store 内存 Token 存储。
type Store struct {
	mu       sync.RWMutex
	tokens   map[string]time.Time // token -> expireAt
	password string
	ttl      time.Duration
}

// NewStore 构造。password 为空表示鉴权关闭。
func NewStore(password string, ttlHours int) *Store {
	if ttlHours <= 0 {
		ttlHours = 24
	}
	return &Store{
		tokens:   make(map[string]time.Time),
		password: password,
		ttl:      time.Duration(ttlHours) * time.Hour,
	}
}

// Enabled 是否启用鉴权。
func (s *Store) Enabled() bool {
	return s != nil && s.password != ""
}

// Login 校验密码并签发 Token。
func (s *Store) Login(password string) (token string, expireAt time.Time, ok bool) {
	if !s.Enabled() {
		return "", time.Time{}, false
	}
	if subtle.ConstantTimeCompare([]byte(password), []byte(s.password)) != 1 {
		return "", time.Time{}, false
	}
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", time.Time{}, false
	}
	token = hex.EncodeToString(b)
	expireAt = time.Now().Add(s.ttl)
	s.mu.Lock()
	s.tokens[token] = expireAt
	// 顺带清理过期 token
	now := time.Now()
	for t, exp := range s.tokens {
		if now.After(exp) {
			delete(s.tokens, t)
		}
	}
	s.mu.Unlock()
	return token, expireAt, true
}

// Valid 校验 Token 是否有效。
func (s *Store) Valid(token string) bool {
	if !s.Enabled() {
		return true // 未启用鉴权时一律放行
	}
	if token == "" {
		return false
	}
	s.mu.RLock()
	exp, ok := s.tokens[token]
	s.mu.RUnlock()
	if !ok {
		return false
	}
	if time.Now().After(exp) {
		s.mu.Lock()
		delete(s.tokens, token)
		s.mu.Unlock()
		return false
	}
	return true
}

// Revoke 注销 Token。
func (s *Store) Revoke(token string) {
	if s == nil {
		return
	}
	s.mu.Lock()
	delete(s.tokens, token)
	s.mu.Unlock()
}
