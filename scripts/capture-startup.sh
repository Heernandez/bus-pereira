#!/usr/bin/env bash
set -euo pipefail
# Run this before launching the app. Filter by tags, not PID (PID changes on cold start).
adb logcat -v threadtime BusPereiraStartup:I ReactNativeJS:V ActivityTaskManager:I ActivityManager:I '*:S'
