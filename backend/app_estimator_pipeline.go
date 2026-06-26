//go:build autopipe
// +build autopipe

package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	appEstimatorSkillRootEnv          = "APP_ESTIMATOR_SKILL_ROOT"
	appEstimatorPipelineEnv           = "APP_ESTIMATOR_PIPELINE_ENABLED"
	appEstimatorPipelineIntervalEnv   = "APP_ESTIMATOR_PIPELINE_INTERVAL_SEC"
	appEstimatorPipelineStateFilename = "pipeline_runner_state.json"
)

var (
	appEstimatorPipelineMu      sync.Mutex
	appEstimatorPipelineSteps   = []appEstimatorPipelineStepDef{
		{ID: "collect", Label: "Rating Collect", Script: "run_daily_collect.py"},
		{ID: "velocity", Label: "Velocity", Script: "calc_velocity.py"},
		{ID: "calibrate", Label: "K Calibration", Script: "calibrate_k.py"},
		{
			ID:            "estimate",
			Label:         "Download Estimates",
			Script:        "estimate_downloads.py",
			WrapperScript: "batch_estimate_downloads.py",
			Args:          []string{"--date", "{date}"},
		},
	}
)

type appEstimatorPipelineStepDef struct {
	ID            string   `json:"id"`
	Label         string   `json:"label"`
	Script        string   `json:"script"`
	WrapperScript string   `json:"wrapperScript,omitempty"`
	Args          []string `json:"args,omitempty"`
}

type appEstimatorPipelineStepStatus struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Status      string `json:"status"`
	StartedAt   string `json:"startedAt,omitempty"`
	FinishedAt  string `json:"finishedAt,omitempty"`
	Error       string `json:"error,omitempty"`
	VerifiedBy  string `json:"verifiedBy,omitempty"` // runner | db | manual
}

type appEstimatorPipelineStatus struct {
	Enabled      bool                             `json:"enabled"`
	RunDate      string                           `json:"runDate"`
	Timezone     string                           `json:"timezone"`
	Overall      string                           `json:"overall"` // pending | running | completed | failed
	Running      bool                             `json:"running"`
	StartedAt    string                           `json:"startedAt,omitempty"`
	FinishedAt   string                           `json:"finishedAt,omitempty"`
	LastError    string                           `json:"lastError,omitempty"`
	LastTickAt   string                           `json:"lastTickAt,omitempty"`
	SkillRoot    string                           `json:"skillRoot,omitempty"`
	Steps        []appEstimatorPipelineStepStatus `json:"steps"`
	NextStep     string                           `json:"nextStep,omitempty"`
}

type appEstimatorPipelineStateFile struct {
	RunDate    string                                       `json:"runDate"`
	Running    bool                                         `json:"running"`
	StartedAt  string                                       `json:"startedAt,omitempty"`
	FinishedAt string                                       `json:"finishedAt,omitempty"`
	LastError  string                                       `json:"lastError,omitempty"`
	LastTickAt string                                       `json:"lastTickAt,omitempty"`
	Steps      map[string]appEstimatorPipelineStepStatus    `json:"steps"`
}

func appEstimatorPipelineLocation() *time.Location {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return time.UTC
	}
	return loc
}

func appEstimatorTodayDate() string {
	return time.Now().In(appEstimatorPipelineLocation()).Format("2006-01-02")
}

func appEstimatorSkillRoot() string {
	if v := strings.TrimSpace(os.Getenv(appEstimatorSkillRootEnv)); v != "" {
		return v
	}
	// .../skills/app-download-estimator/data/app_estimator.db -> skill root
	return filepath.Dir(filepath.Dir(appEstimatorDBPath()))
}

func appEstimatorPipelineEnabled() bool {
	v := strings.TrimSpace(os.Getenv(appEstimatorPipelineEnv))
	if v == "" {
		return true
	}
	switch strings.ToLower(v) {
	case "0", "false", "no", "off":
		return false
	default:
		return true
	}
}

func appEstimatorPipelineInterval() time.Duration {
	sec := 300
	if v := strings.TrimSpace(os.Getenv(appEstimatorPipelineIntervalEnv)); v != "" {
		if n, err := parsePositiveInt(v); err == nil && n >= 60 {
			sec = n
		}
	}
	return time.Duration(sec) * time.Second
}

func parsePositiveInt(s string) (int, error) {
	var n int
	_, err := fmt.Sscanf(s, "%d", &n)
	return n, err
}

func appEstimatorPipelineStatePath() string {
	return filepath.Join(appEstimatorSkillRoot(), "data", appEstimatorPipelineStateFilename)
}

func appEstimatorPythonBin(skillRoot string) string {
	venv := filepath.Join(skillRoot, ".venv", "bin", "python")
	if st, err := os.Stat(venv); err == nil && !st.IsDir() {
		return venv
	}
	if v := strings.TrimSpace(os.Getenv("APP_ESTIMATOR_PYTHON")); v != "" {
		return v
	}
	return "python3"
}

func appEstimatorBackendScriptsDir() string {
	if v := strings.TrimSpace(os.Getenv("APP_ESTIMATOR_SCRIPTS_DIR")); v != "" {
		return v
	}
	if exe, err := os.Executable(); err == nil {
		dir := filepath.Join(filepath.Dir(exe), "scripts")
		if st, err := os.Stat(dir); err == nil && st.IsDir() {
			return dir
		}
	}
	return filepath.Join(appEstimatorSkillRoot(), "scripts")
}

func appEstimatorExpandPipelineArgs(args []string, runDate string) []string {
	if len(args) == 0 {
		return nil
	}
	out := make([]string, len(args))
	for i, a := range args {
		out[i] = strings.ReplaceAll(a, "{date}", runDate)
	}
	return out
}

func appEstimatorResolvePipelineScript(def appEstimatorPipelineStepDef, runDate string) (scriptPath string, extraArgs []string, err error) {
	extraArgs = appEstimatorExpandPipelineArgs(def.Args, runDate)
	if def.WrapperScript != "" {
		scriptPath = filepath.Join(appEstimatorBackendScriptsDir(), def.WrapperScript)
		if _, statErr := os.Stat(scriptPath); statErr != nil {
			return "", nil, fmt.Errorf("wrapper script not found: %s", scriptPath)
		}
		return scriptPath, extraArgs, nil
	}
	scriptPath = filepath.Join(appEstimatorSkillRoot(), "scripts", def.Script)
	if _, statErr := os.Stat(scriptPath); statErr != nil {
		return "", nil, fmt.Errorf("script not found: %s", scriptPath)
	}
	return scriptPath, extraArgs, nil
}

func appEstimatorNewDayState(runDate string) *appEstimatorPipelineStateFile {
	steps := map[string]appEstimatorPipelineStepStatus{}
	for _, s := range appEstimatorPipelineSteps {
		steps[s.ID] = appEstimatorPipelineStepStatus{
			ID:     s.ID,
			Label:  s.Label,
			Status: "pending",
		}
	}
	return &appEstimatorPipelineStateFile{
		RunDate: runDate,
		Steps:   steps,
	}
}

func appEstimatorLoadPipelineState(runDate string) (*appEstimatorPipelineStateFile, error) {
	path := appEstimatorPipelineStatePath()
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return appEstimatorNewDayState(runDate), nil
		}
		return nil, err
	}
	var st appEstimatorPipelineStateFile
	if err := json.Unmarshal(b, &st); err != nil {
		return appEstimatorNewDayState(runDate), nil
	}
	if st.RunDate != runDate {
		return appEstimatorNewDayState(runDate), nil
	}
	if st.Steps == nil {
		st.Steps = map[string]appEstimatorPipelineStepStatus{}
	}
	for _, def := range appEstimatorPipelineSteps {
		if _, ok := st.Steps[def.ID]; !ok {
			st.Steps[def.ID] = appEstimatorPipelineStepStatus{
				ID: def.ID, Label: def.Label, Status: "pending",
			}
		}
	}
	return &st, nil
}

func appEstimatorSavePipelineState(st *appEstimatorPipelineStateFile) error {
	dir := filepath.Dir(appEstimatorPipelineStatePath())
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return err
	}
	tmp := appEstimatorPipelineStatePath() + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, appEstimatorPipelineStatePath())
}

func appEstimatorPipelineStepSatisfied(db *sql.DB, stepID, runDate string) (bool, string) {
	if db == nil {
		return false, ""
	}
	switch stepID {
	case "collect":
		var maxDate sql.NullString
		_ = db.QueryRow(`SELECT MAX(snapshot_date) FROM rating_snapshots`).Scan(&maxDate)
		if maxDate.Valid && maxDate.String >= runDate {
			return true, "snapshots"
		}
	case "velocity":
		var maxDate sql.NullString
		_ = db.QueryRow(`SELECT MAX(as_of_date) FROM rating_velocity`).Scan(&maxDate)
		if maxDate.Valid && maxDate.String >= runDate {
			return true, "velocity"
		}
	case "calibrate":
		var cnt int
		var maxUpdated sql.NullString
		_ = db.QueryRow(`SELECT COUNT(*), MAX(updated_at) FROM k_calibration`).Scan(&cnt, &maxUpdated)
		if cnt > 0 && maxUpdated.Valid && strings.HasPrefix(maxUpdated.String, runDate) {
			return true, "k_calibration"
		}
	case "estimate":
		var cnt int
		_ = db.QueryRow(`SELECT COUNT(*) FROM download_estimates WHERE estimate_date = ?`, runDate).Scan(&cnt)
		if cnt > 0 {
			return true, "download_estimates"
		}
	}
	return false, ""
}

func appEstimatorPipelineOverall(st *appEstimatorPipelineStateFile) string {
	if st == nil {
		return "pending"
	}
	if st.Running {
		return "running"
	}
	hasFailed := false
	pending := 0
	for _, def := range appEstimatorPipelineSteps {
		s := st.Steps[def.ID]
		switch s.Status {
		case "failed":
			hasFailed = true
		case "pending", "running":
			pending++
		}
	}
	if pending == 0 && !hasFailed {
		return "completed"
	}
	if hasFailed {
		return "failed"
	}
	return "pending"
}

func appEstimatorBuildPipelineStatus(st *appEstimatorPipelineStateFile) appEstimatorPipelineStatus {
	runDate := appEstimatorTodayDate()
	if st == nil {
		st = appEstimatorNewDayState(runDate)
	}
	steps := make([]appEstimatorPipelineStepStatus, 0, len(appEstimatorPipelineSteps))
	var nextStep string
	for _, def := range appEstimatorPipelineSteps {
		s := st.Steps[def.ID]
		if s.ID == "" {
			s = appEstimatorPipelineStepStatus{ID: def.ID, Label: def.Label, Status: "pending"}
		}
		if s.Label == "" {
			s.Label = def.Label
		}
		if s.Status == "pending" {
			s.StartedAt = ""
			s.FinishedAt = ""
			s.Error = ""
			s.VerifiedBy = ""
		}
		steps = append(steps, s)
		if nextStep == "" && (s.Status == "pending" || s.Status == "failed") {
			nextStep = def.ID
		}
	}
	return appEstimatorPipelineStatus{
		Enabled:    appEstimatorPipelineEnabled(),
		RunDate:    st.RunDate,
		Timezone:   "Asia/Shanghai",
		Overall:    appEstimatorPipelineOverall(st),
		Running:    st.Running,
		StartedAt:  st.StartedAt,
		FinishedAt: st.FinishedAt,
		LastError:  st.LastError,
		LastTickAt: st.LastTickAt,
		SkillRoot:  appEstimatorSkillRoot(),
		Steps:      steps,
		NextStep:   nextStep,
	}
}

func appEstimatorGetPipelineStatus() appEstimatorPipelineStatus {
	runDate := appEstimatorTodayDate()
	st, err := appEstimatorLoadPipelineState(runDate)
	if err != nil {
		return appEstimatorPipelineStatus{
			Enabled:  appEstimatorPipelineEnabled(),
			RunDate:  runDate,
			Timezone: "Asia/Shanghai",
			Overall:  "failed",
			LastError: err.Error(),
			SkillRoot: appEstimatorSkillRoot(),
			Steps:    appEstimatorBuildPipelineStatus(nil).Steps,
		}
	}
	return appEstimatorBuildPipelineStatus(st)
}

func (r *Runner) appEstimatorPipelineTick(ctx context.Context) {
	if !appEstimatorPipelineEnabled() {
		return
	}
	skillRoot := appEstimatorSkillRoot()
	if st, err := os.Stat(skillRoot); err != nil || !st.IsDir() {
		return
	}

	appEstimatorPipelineMu.Lock()
	defer appEstimatorPipelineMu.Unlock()

	runDate := appEstimatorTodayDate()
	state, err := appEstimatorLoadPipelineState(runDate)
	if err != nil {
		log.Printf("[AppEstimator] pipeline state load error: %v", err)
		return
	}
	state.LastTickAt = time.Now().UTC().Format(time.RFC3339)

	if state.Running {
		_ = appEstimatorSavePipelineState(state)
		return
	}
	if appEstimatorPipelineOverall(state) == "completed" {
		_ = appEstimatorSavePipelineState(state)
		return
	}

	db, dbErr := getAppEstimatorDB()
	if state.StartedAt == "" {
		state.StartedAt = time.Now().UTC().Format(time.RFC3339)
	}

	// Mark steps already satisfied in DB (e.g. manual run) without re-executing.
	if dbErr == nil {
		for _, def := range appEstimatorPipelineSteps {
			step := state.Steps[def.ID]
			if step.Status == "completed" {
				continue
			}
			ok, src := appEstimatorPipelineStepSatisfied(db, def.ID, runDate)
			if ok {
				step.Status = "completed"
				step.VerifiedBy = "db:" + src
				step.FinishedAt = time.Now().UTC().Format(time.RFC3339)
				step.Error = ""
				state.Steps[def.ID] = step
			}
		}
		if appEstimatorPipelineOverall(state) == "completed" {
			state.FinishedAt = time.Now().UTC().Format(time.RFC3339)
			state.LastError = ""
			_ = appEstimatorSavePipelineState(state)
			log.Printf("[AppEstimator] pipeline for %s already complete (db verified)", runDate)
			return
		}
	}

	state.Running = true
	state.LastError = ""
	state.FinishedAt = ""
	_ = appEstimatorSavePipelineState(state)

	py := appEstimatorPythonBin(skillRoot)

	for _, def := range appEstimatorPipelineSteps {
		step := state.Steps[def.ID]
		if step.Status == "completed" {
			continue
		}
		if dbErr == nil {
			if ok, src := appEstimatorPipelineStepSatisfied(db, def.ID, runDate); ok {
				step.Status = "completed"
				step.VerifiedBy = "db:" + src
				step.FinishedAt = time.Now().UTC().Format(time.RFC3339)
				state.Steps[def.ID] = step
				continue
			}
		}

		scriptPath, extraArgs, resolveErr := appEstimatorResolvePipelineScript(def, runDate)
		if resolveErr != nil {
			step.Status = "failed"
			step.Error = resolveErr.Error()
			state.Steps[def.ID] = step
			state.LastError = step.Error
			state.Running = false
			_ = appEstimatorSavePipelineState(state)
			log.Printf("[AppEstimator] pipeline step %s failed: %s", def.ID, step.Error)
			return
		}

		step.Status = "running"
		step.StartedAt = time.Now().UTC().Format(time.RFC3339)
		step.FinishedAt = ""
		step.Error = ""
		step.VerifiedBy = ""
		state.Steps[def.ID] = step
		_ = appEstimatorSavePipelineState(state)

		log.Printf("[AppEstimator] pipeline step %s (%s) starting", def.ID, filepath.Base(scriptPath))
		cmdCtx, cancel := context.WithTimeout(ctx, 2*time.Hour)
		cmdArgs := append([]string{scriptPath}, extraArgs...)
		cmd := exec.CommandContext(cmdCtx, py, cmdArgs...)
		cmd.Dir = skillRoot
		cmd.Env = append(os.Environ(),
			"APP_ESTIMATOR_SKILL_ROOT="+skillRoot,
			"APP_ESTIMATOR_DB_PATH="+appEstimatorDBPath(),
		)
		out, runErr := cmd.CombinedOutput()
		cancel()

		if runErr != nil {
			step.Status = "failed"
			step.Error = strings.TrimSpace(fmt.Sprintf("%v: %s", runErr, truncatePipelineLog(string(out), 800)))
			step.FinishedAt = time.Now().UTC().Format(time.RFC3339)
			state.Steps[def.ID] = step
			state.LastError = step.Error
			state.Running = false
			_ = appEstimatorSavePipelineState(state)
			log.Printf("[AppEstimator] pipeline step %s failed: %s", def.ID, step.Error)
			return
		}
		if def.ID == "estimate" && dbErr == nil {
			if ok, src := appEstimatorPipelineStepSatisfied(db, def.ID, runDate); !ok {
				step.Status = "failed"
				step.Error = "estimate script finished but no download_estimates rows for runDate"
				step.FinishedAt = time.Now().UTC().Format(time.RFC3339)
				state.Steps[def.ID] = step
				state.LastError = step.Error
				state.Running = false
				_ = appEstimatorSavePipelineState(state)
				log.Printf("[AppEstimator] pipeline step %s failed: %s", def.ID, step.Error)
				return
			} else {
				step.VerifiedBy = "db:" + src
			}
		}

		step.Status = "completed"
		if step.VerifiedBy == "" {
			step.VerifiedBy = "runner"
		}
		step.FinishedAt = time.Now().UTC().Format(time.RFC3339)
		state.Steps[def.ID] = step
		log.Printf("[AppEstimator] pipeline step %s completed", def.ID)
	}

	state.Running = false
	state.FinishedAt = time.Now().UTC().Format(time.RFC3339)
	state.LastError = ""
	_ = appEstimatorSavePipelineState(state)
	log.Printf("[AppEstimator] pipeline for %s completed", runDate)
}

func truncatePipelineLog(s string, max int) string {
	s = strings.TrimSpace(s)
	if len(s) <= max {
		return s
	}
	return s[len(s)-max:]
}

func (r *Runner) appEstimatorPipelineLoop(ctx context.Context) {
	interval := appEstimatorPipelineInterval()
	log.Printf("[AppEstimator] pipeline scheduler enabled (interval=%s, skillRoot=%s)", interval, appEstimatorSkillRoot())

	// Initial tick after short delay so HTTP server is up first.
	select {
	case <-ctx.Done():
		return
	case <-time.After(15 * time.Second):
	}
	r.appEstimatorPipelineTick(ctx)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			r.appEstimatorPipelineTick(ctx)
		}
	}
}

// GET /api/app-estimator/pipeline
func (r *Runner) getAppEstimatorPipelineHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"pipeline": appEstimatorGetPipelineStatus(),
	})
}
