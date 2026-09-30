// Where kiku listens and where its speech environment lives: pure functions of the environment,
// so a test can hand them one instead of touching process.env.
import path from "node:path";

/**
 * The interface the page answers on. Loopback unless KIKU_HOST says otherwise, so a fresh
 * install is reachable from the machine it runs on and from nothing else on the network.
 * KIKU_HOST=0.0.0.0 opens it to the home network (the phone reads /feed.xml over Wi-Fi).
 */
export function listenHost(env: NodeJS.ProcessEnv = process.env): string {
  return env.KIKU_HOST || "127.0.0.1";
}

export function isLoopback(host: string): boolean {
  return /^(127\.\d+\.\d+\.\d+|localhost|::1)$/.test(host);
}

/**
 * The Python environment the speech step runs in: `.venv` at the repo root, unless KIKU_VENV
 * moves it. A Homebrew install keeps the code where it cannot be written to, so it points this
 * at ~/Library/Application Support/Kiku/venv.
 */
export function venvDir(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.KIKU_VENV || path.join(root, ".venv");
}

export function venvPython(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return path.join(venvDir(root, env), "bin", "python");
}
