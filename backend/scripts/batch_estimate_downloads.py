#!/usr/bin/env python3
"""Batch wrapper for estimate_downloads.py (daily pipeline estimate step).

estimate_downloads.py expects per-app CLI args. This script loads candidates from
SQLite (v_latest_velocity + traindate_benchmarks + k_calibration) and invokes the
estimator for each row, or uses a native batch mode when available.
"""
from __future__ import annotations

import argparse
import math
import os
import sqlite3
import subprocess
import sys
from datetime import datetime
from pathlib import Path


def skill_root() -> Path:
    env = os.environ.get("APP_ESTIMATOR_SKILL_ROOT", "").strip()
    if env:
        return Path(env)
    db = db_path()
    return db.parent.parent


def db_path() -> Path:
    env = os.environ.get("APP_ESTIMATOR_DB_PATH", "").strip()
    if env:
        return Path(env)
    return skill_root() / "data" / "app_estimator.db"


def pipeline_date() -> str:
    tz_name = os.environ.get("APP_ESTIMATOR_PIPELINE_TZ", "Asia/Shanghai")
    try:
        from zoneinfo import ZoneInfo

        return datetime.now(ZoneInfo(tz_name)).strftime("%Y-%m-%d")
    except Exception:
        return datetime.utcnow().strftime("%Y-%m-%d")


def log(msg: str) -> None:
    print(f"[batch_estimate] {msg}", flush=True)


def norm_platform(platform: str) -> str:
    return (platform or "").strip().lower()


def run_cmd(cmd: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    log(" ".join(cmd))
    return subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True)


def try_direct_batch(estimate_script: Path, cwd: Path, date: str, db: Path) -> bool:
    patterns = [
        ["--batch", "--date", date],
        ["--batch", "--estimate-date", date],
        ["batch", "--date", date],
        ["--from-db", "--date", date],
        ["--all", "--date", date],
    ]
    py = sys.executable
    before = count_estimates_for_date(db, date)
    for extra in patterns:
        result = run_cmd([py, str(estimate_script), *extra], cwd)
        if result.returncode != 0:
            continue
        after = count_estimates_for_date(db, date)
        if after > before:
            if result.stdout.strip():
                print(result.stdout.strip())
            log(f"batch mode wrote {after - before} rows for {date}")
            return True
    return False


def try_run_pipeline(cwd: Path, date: str, db: Path) -> bool:
    script = cwd / "scripts" / "run_pipeline.py"
    if not script.exists():
        return False
    patterns = [
        ["--only", "estimate", "--date", date],
        ["--steps", "estimate", "--date", date],
        ["--skip-collect", "--skip-velocity", "--skip-calibrate", "--date", date],
        ["estimate", "--date", date],
    ]
    py = sys.executable
    before = count_estimates_for_date(db, date)
    for extra in patterns:
        result = run_cmd([py, str(script), *extra], cwd)
        if result.returncode != 0:
            continue
        after = count_estimates_for_date(db, date)
        if after > before:
            if result.stdout.strip():
                print(result.stdout.strip())
            log(f"run_pipeline wrote {after - before} rows for {date}")
            return True
    return False


def count_estimates_for_date(db: Path, date: str) -> int:
    if not db.exists():
        return 0
    conn = sqlite3.connect(db)
    try:
        row = conn.execute(
            "SELECT COUNT(*) FROM download_estimates WHERE estimate_date = ?",
            (date,),
        ).fetchone()
        return int(row[0] if row else 0)
    finally:
        conn.close()


def count_estimates_total(db: Path) -> int:
    if not db.exists():
        return 0
    conn = sqlite3.connect(db)
    try:
        row = conn.execute("SELECT COUNT(*) FROM download_estimates").fetchone()
        return int(row[0] if row else 0)
    finally:
        conn.close()


def resolve_appid(platform: str, app_id: str, package: str, bundle: str) -> str:
    if app_id:
        return app_id
    if norm_platform(platform) == "ios" and bundle:
        return bundle
    return package or bundle or app_id


def load_candidates(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    """Rows with a segment category that exists in k_calibration."""
    conn.row_factory = sqlite3.Row
    return conn.execute(
        """
        WITH latest_velocity AS (
            SELECT v.*
            FROM v_latest_velocity v
            INNER JOIN (
                SELECT platform, app_id, package, bundle, country,
                       MIN(calc_method) AS calc_method
                FROM v_latest_velocity
                GROUP BY platform, app_id, package, bundle, country
            ) pick
              ON pick.platform = v.platform
             AND pick.app_id = v.app_id
             AND pick.package = v.package
             AND pick.bundle = v.bundle
             AND pick.country = v.country
             AND pick.calc_method = v.calc_method
            WHERE v.current_rating_count IS NOT NULL
        ),
        benchmark_category AS (
            SELECT platform_key, app_id, package, bundle, country, segment_category
            FROM (
                SELECT
                    LOWER(TRIM(platform)) AS platform_key,
                    app_id,
                    package,
                    bundle,
                    country,
                    COALESCE(
                        NULLIF(TRIM(category_name), ''),
                        NULLIF(TRIM(category), '')
                    ) AS segment_category,
                    ROW_NUMBER() OVER (
                        PARTITION BY LOWER(TRIM(platform)), app_id, package, bundle, country
                        ORDER BY imported_at DESC
                    ) AS rn
                FROM traindate_benchmarks
                WHERE COALESCE(NULLIF(TRIM(category_name), ''), NULLIF(TRIM(category), '')) IS NOT NULL
            )
            WHERE rn = 1
        ),
        app_category AS (
            SELECT platform_key, app_id, package, bundle, segment_category
            FROM (
                SELECT
                    LOWER(TRIM(platform)) AS platform_key,
                    app_id,
                    package,
                    bundle,
                    COALESCE(
                        NULLIF(TRIM(category_name), ''),
                        NULLIF(TRIM(category), '')
                    ) AS segment_category,
                    ROW_NUMBER() OVER (
                        PARTITION BY LOWER(TRIM(platform)), app_id, package, bundle
                        ORDER BY imported_at DESC
                    ) AS rn
                FROM traindate_benchmarks
                WHERE COALESCE(NULLIF(TRIM(category_name), ''), NULLIF(TRIM(category), '')) IS NOT NULL
            )
            WHERE rn = 1
        )
        SELECT
            lv.platform,
            lv.app_id,
            lv.package,
            lv.bundle,
            lv.country,
            lv.confidence,
            lv.current_rating_count,
            lv.delta_ratings,
            lv.rating_velocity_daily,
            COALESCE(bc.segment_category, ba.segment_category) AS category,
            k.effective_k
        FROM latest_velocity lv
        LEFT JOIN benchmark_category bc
          ON bc.platform_key = LOWER(TRIM(lv.platform))
         AND bc.country = lv.country
         AND bc.app_id = lv.app_id
         AND bc.package = lv.package
         AND bc.bundle = lv.bundle
        LEFT JOIN app_category ba
          ON ba.platform_key = LOWER(TRIM(lv.platform))
         AND ba.app_id = lv.app_id
         AND ba.package = lv.package
         AND ba.bundle = lv.bundle
        INNER JOIN k_calibration k
          ON LOWER(TRIM(k.platform)) = LOWER(TRIM(lv.platform))
         AND k.country = lv.country
         AND LOWER(TRIM(k.category)) = LOWER(TRIM(COALESCE(bc.segment_category, ba.segment_category)))
        WHERE COALESCE(bc.segment_category, ba.segment_category) IS NOT NULL
        """
    ).fetchall()


def diagnose_skips(conn: sqlite3.Connection) -> None:
    conn.row_factory = sqlite3.Row
    stats = conn.execute(
        """
        WITH latest_velocity AS (
            SELECT COUNT(*) AS cnt FROM (
                SELECT 1
                FROM v_latest_velocity v
                INNER JOIN (
                    SELECT platform, app_id, package, bundle, country,
                           MIN(calc_method) AS calc_method
                    FROM v_latest_velocity
                    GROUP BY platform, app_id, package, bundle, country
                ) pick
                  ON pick.platform = v.platform
                 AND pick.app_id = v.app_id
                 AND pick.package = v.package
                 AND pick.bundle = v.bundle
                 AND pick.country = v.country
                 AND pick.calc_method = v.calc_method
            )
        ),
        with_benchmark AS (
            SELECT COUNT(*) AS cnt
            FROM v_latest_velocity v
            WHERE EXISTS (
                SELECT 1 FROM traindate_benchmarks tb
                WHERE LOWER(TRIM(tb.platform)) = LOWER(TRIM(v.platform))
                  AND tb.country = v.country
                  AND tb.app_id = v.app_id
                  AND tb.package = v.package
                  AND tb.bundle = v.bundle
                  AND COALESCE(NULLIF(TRIM(tb.category_name), ''), NULLIF(TRIM(tb.category), '')) IS NOT NULL
            )
        ),
        with_k AS (
            SELECT COUNT(*) AS cnt
            FROM v_latest_velocity v
            JOIN traindate_benchmarks tb
              ON LOWER(TRIM(tb.platform)) = LOWER(TRIM(v.platform))
             AND tb.country = v.country
             AND tb.app_id = v.app_id
             AND tb.package = v.package
             AND tb.bundle = v.bundle
            JOIN k_calibration k
              ON LOWER(TRIM(k.platform)) = LOWER(TRIM(v.platform))
             AND k.country = v.country
             AND k.category = COALESCE(NULLIF(TRIM(tb.category_name), ''), NULLIF(TRIM(tb.category), ''))
        )
        SELECT
            (SELECT cnt FROM latest_velocity) AS velocity_rows,
            (SELECT cnt FROM with_benchmark) AS with_benchmark_category,
            (SELECT cnt FROM with_k) AS with_k_match
        """
    ).fetchone()
    if stats:
        log(
            "diagnostics: "
            f"velocity={stats['velocity_rows']}, "
            f"benchmark_category={stats['with_benchmark_category']}, "
            f"k_match={stats['with_k_match']}"
        )


def build_estimate_cmd(
    py: str,
    estimate_script: Path,
    row: sqlite3.Row,
    category: str,
    date: str,
    with_traindate: bool = True,
) -> list[str]:
    appid = resolve_appid(row["platform"], row["app_id"], row["package"], row["bundle"])
    total = int(row["current_rating_count"] or 0)
    delta = row["delta_ratings"]
    if delta is None:
        delta = row["rating_velocity_daily"]
    if delta is None:
        delta = 0

    cmd = [
        py,
        str(estimate_script),
        "--appid",
        str(appid),
        "--category",
        str(category),
        "--country",
        str(row["country"]),
        "--total_ratings",
        str(total),
        "--delta_ratings",
        str(float(delta)),
    ]
    if with_traindate and date:
        cmd.extend(["--traindate", date])
    return cmd


def run_estimate_with_fallback(
    py: str,
    estimate_script: Path,
    row: sqlite3.Row,
    category: str,
    date: str,
    cwd: Path,
) -> tuple[bool, str]:
    attempts = [
        build_estimate_cmd(py, estimate_script, row, category, date, with_traindate=True),
        build_estimate_cmd(py, estimate_script, row, category, date, with_traindate=False),
    ]

    last_err = ""
    for cmd in attempts:
        result = run_cmd(cmd, cwd)
        if result.returncode == 0:
            return True, ""
        last_err = (result.stderr or result.stdout or "unknown error").strip()
    return False, last_err


def batch_from_db(cwd: Path, estimate_script: Path, date: str) -> None:
    db = db_path()
    if not db.exists():
        raise SystemExit(f"database not found: {db}")
    before_date = count_estimates_for_date(db, date)
    before_total = count_estimates_total(db)

    conn = sqlite3.connect(db)
    try:
        diagnose_skips(conn)
        rows = load_candidates(conn)
    finally:
        conn.close()

    if not rows:
        raise SystemExit(
            "no estimate candidates after joining velocity, traindate_benchmarks.category_name, and k_calibration"
        )

    log(f"processing {len(rows)} matched app/country rows")

    py = sys.executable
    ok = 0
    failed = 0
    first_error = ""

    for row in rows:
        category = str(row["category"])
        success, err = run_estimate_with_fallback(py, estimate_script, row, category, date, cwd)
        if success:
            ok += 1
        else:
            failed += 1
            if not first_error:
                first_error = err

    after_date = count_estimates_for_date(db, date)
    after_total = count_estimates_total(db)
    wrote_date = after_date - before_date
    wrote_total = after_total - before_total

    log(
        "done: "
        f"cmd_ok={ok}, cmd_failed={failed}, "
        f"rows_today+={wrote_date}, rows_total+={wrote_total}"
    )
    if wrote_date <= 0:
        fallback_rows = insert_fallback_estimates(db, rows, date)
        after_date = count_estimates_for_date(db, date)
        wrote_date = after_date - before_date
        log(f"fallback_inserted={fallback_rows}, rows_today_after_fallback={wrote_date}")
    if wrote_date <= 0:
        detail = first_error or (
            "estimate_downloads.py exited 0 but inserted 0 rows "
            f"(date={date}, before={before_date}, after={after_date})"
        )
        raise SystemExit(f"batch estimate produced no rows: {detail}")


def insert_fallback_estimates(db: Path, rows: list[sqlite3.Row], date: str) -> int:
    """Fallback writer when estimate_downloads.py does not persist rows."""
    conn = sqlite3.connect(db)
    inserted = 0
    now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        for row in rows:
            delta = row["delta_ratings"]
            if delta is None:
                delta = row["rating_velocity_daily"]
            if delta is None:
                delta = 0.0
            try:
                delta_val = float(delta)
            except Exception:
                delta_val = 0.0
            try:
                k_val = float(row["effective_k"])
            except Exception:
                continue
            if not math.isfinite(k_val):
                continue
            est_daily = int(max(0.0, round(max(0.0, delta_val) * k_val)))
            est_monthly = est_daily * 30
            total_ratings = int(row["current_rating_count"] or 0)
            rating_velocity_daily = row["rating_velocity_daily"]
            try:
                rating_velocity_daily = float(rating_velocity_daily or 0.0)
            except Exception:
                rating_velocity_daily = 0.0

            conn.execute(
                """
                INSERT INTO download_estimates (
                    estimate_date, platform, app_id, package, bundle, country, category, rank,
                    total_ratings, delta_ratings, rating_velocity_daily, k_base, maturity_beta,
                    regional_m, est_monthly_downloads, est_daily_downloads, confidence, methodology,
                    benchmark_waterline, model_version, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
                ON CONFLICT(platform, app_id, package, bundle, country, estimate_date, model_version)
                DO UPDATE SET
                    total_ratings = excluded.total_ratings,
                    delta_ratings = excluded.delta_ratings,
                    rating_velocity_daily = excluded.rating_velocity_daily,
                    k_base = excluded.k_base,
                    maturity_beta = excluded.maturity_beta,
                    regional_m = excluded.regional_m,
                    est_monthly_downloads = excluded.est_monthly_downloads,
                    est_daily_downloads = excluded.est_daily_downloads,
                    confidence = excluded.confidence,
                    methodology = excluded.methodology,
                    created_at = excluded.created_at
                """,
                (
                    date,
                    norm_platform(row["platform"]),
                    row["app_id"] or "",
                    row["package"] or "",
                    row["bundle"] or "",
                    row["country"] or "",
                    row["category"] or "",
                    total_ratings,
                    delta_val,
                    rating_velocity_daily,
                    k_val,
                    1.0,
                    1.0,
                    est_monthly,
                    est_daily,
                    row["confidence"] or "low",
                    "fallback_k_x_delta",
                    "V4.1",
                    now,
                ),
            )
            inserted += 1
        conn.commit()
    finally:
        conn.close()
    return inserted


def main() -> None:
    parser = argparse.ArgumentParser(description="Batch download estimates for daily pipeline")
    parser.add_argument("--date", default=pipeline_date(), help="estimate_date (YYYY-MM-DD)")
    args = parser.parse_args()

    cwd = skill_root()
    db = db_path()
    estimate_script = cwd / "scripts" / "estimate_downloads.py"
    if not estimate_script.exists():
        raise SystemExit(f"estimate_downloads.py not found: {estimate_script}")

    if try_run_pipeline(cwd, args.date, db):
        log("completed via run_pipeline.py")
        return

    if try_direct_batch(estimate_script, cwd, args.date, db):
        log("completed via estimate_downloads batch mode")
        return

    batch_from_db(cwd, estimate_script, args.date)


if __name__ == "__main__":
    main()
