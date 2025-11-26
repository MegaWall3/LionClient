#!/usr/bin/env node
import { execSync, spawnSync } from "node:child_process";
import os from "node:os";

const portArg = process.argv[2];
const PORT = Number(portArg || 9527);

function log(msg) {
  console.log(`[free-port] ${msg}`);
}

function listPids(port) {
  try {
    if (process.platform === "win32") {
      const result = execSync(`netstat -ano | findstr ":${port}"`, {
        encoding: "utf8",
        stdio: "pipe",
      });
      const lines = result
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const pids = new Set();
      for (const line of lines) {
        const parts = line.split(/\s+/);
        const pid = parts.at(-1);
        if (pid && /^\d+$/.test(pid)) {
          pids.add(pid);
        }
      }
      return [...pids];
    }

    const result = execSync(`lsof -i :${port} -t`, {
      encoding: "utf8",
      stdio: "pipe",
    });
    return result
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    return [];
  }
}

function killPid(pid) {
  if (process.platform === "win32") {
    const ps = spawnSync("powershell", [
      "-NoProfile",
      "-Command",
      `Stop-Process -Id ${pid} -Force`,
    ]);
    if (ps.error) {
      throw ps.error;
    }
    if (ps.status !== 0) {
      throw new Error(ps.stderr.toString() || `Failed to kill ${pid}`);
    }
  } else {
    execSync(`kill -9 ${pid}`);
  }
}

log(`Scanning for processes using port ${PORT}...`);
const pids = listPids(PORT);

if (pids.length === 0) {
  log("No process is currently using that port.");
  process.exit(0);
}

log(`Found PIDs: ${pids.join(", ")}`);

for (const pid of pids) {
  try {
    killPid(pid);
    log(`Terminated PID ${pid}`);
  } catch (error) {
    log(`Failed to terminate PID ${pid}: ${error.message}`);
  }
}

log(`Port ${PORT} should now be free.`);


