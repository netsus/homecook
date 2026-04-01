import { spawnSync } from "node:child_process";

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function canTalkToDocker() {
  const result = spawnSync("docker", ["info"], {
    env: process.env,
    encoding: "utf8",
    stdio: "ignore",
  });

  return result.status === 0;
}

export async function ensureDockerRunning() {
  if (canTalkToDocker()) {
    return;
  }

  if (process.platform !== "darwin") {
    throw new Error("Docker가 실행 중이 아니에요. 먼저 Docker를 켠 뒤 다시 시도해주세요.");
  }

  const openResult = spawnSync("open", ["-a", "Docker"], {
    env: process.env,
    encoding: "utf8",
  });

  if (openResult.status !== 0) {
    throw new Error("Docker Desktop을 자동으로 열지 못했어요. 직접 Docker를 켠 뒤 다시 시도해주세요.");
  }

  process.stdout.write("Docker Desktop을 시작했어요. 준비될 때까지 잠시 기다릴게요.\n");

  for (let attempt = 0; attempt < 45; attempt += 1) {
    await wait(2000);

    if (canTalkToDocker()) {
      process.stdout.write("Docker가 준비됐어요.\n");
      return;
    }
  }

  throw new Error("Docker가 아직 준비되지 않았어요. Docker Desktop 상태를 확인해주세요.");
}
