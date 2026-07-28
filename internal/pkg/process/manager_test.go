package process

import (
	"os/exec"
	"sync"
	"testing"
)

func TestStartConcurrentSingleProcess(t *testing.T) {
	m := NewManager()
	opts := StartOptions{ServiceID: 42, Name: testProcessName(), Args: testProcessArgs()}
	const n = 8
	results := make(chan error, n)
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, err := m.Start(opts)
			results <- err
		}()
	}
	wg.Wait()
	close(results)
	var success int
	for err := range results {
		if err == nil {
			success++
		}
	}
	if success != 1 {
		t.Fatalf("successful starts = %d, want 1", success)
	}
	info, ok := m.Get(42)
	if !ok || info == nil {
		t.Fatal("process was not registered")
	}
	if err := m.Stop(42, info.PID, 1); err != nil {
		t.Fatal(err)
	}
}

func TestStopRejectsInvalidPID(t *testing.T) {
	m := NewManager()
	if err := m.Stop(1, 0, 1); err == nil {
		t.Fatal("PID 0 should be rejected")
	}
	if err := m.Stop(1, -1, 1); err == nil {
		t.Fatal("negative PID should be rejected")
	}
}

func testProcessName() string {
	return "go"
}

func testProcessArgs() []string {
	return []string{"test", "-run", "^TestNonexistentProcess$", "./internal/pkg/process"}
}

var _ = exec.ErrNotFound
