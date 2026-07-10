---
name: deploy-suhan-workspace
description: 프로젝트 전용 deployment_operator 서브에이전트로 Suhan Workspace의 PM2 배포를 수행한 뒤 메인 에이전트가 결과를 독립 감사한다. 사용자가 $deploy-suhan-workspace를 명시적으로 호출했을 때만 사용한다.
---

# Suhan Workspace 배포

배포 실행과 감사를 분리한다. 배포는 `deployment_operator`만 수행하고, 메인 에이전트는 배포 완료 후 읽기 전용 감사와 최종 보고만 수행한다.

## 1. 배포 위임

1. 프로젝트 루트에서 `AGENTS.md`와 `docs/deploy/pm2.md`를 읽는다.
2. 메인 에이전트에서 빌드, 동기화, PM2 재시작을 직접 실행하지 않는다.
3. 에이전트 유형 또는 이름이 정확히 `deployment_operator`인 커스텀 서브에이전트를 한 번만 호출한다.
   - 내장 `worker`, `default` 또는 다른 에이전트로 대체하지 않는다.
   - 현재 런타임에서 해당 커스텀 에이전트를 선택할 수 없으면 배포를 시작하지 않고 설정 오류로 보고한다.
4. 서브에이전트에 사용자의 배포 요청을 전달하고 아래 항목을 포함한 구조화된 결과를 요구한다.
   - 성공 또는 실패
   - 소스 커밋과 미커밋 변경 경로
   - 감지한 frontend/backend 포트
   - 빌드, 산출물 검사, 동기화, 재시작 결과
   - HTTP 검증 결과
   - 경고, 실패 원인, 다음 조치
5. 서브에이전트가 끝날 때까지 기다린다.
6. 서브에이전트가 실패했거나 완전한 결과를 반환하지 않으면 `배포 실패`로 보고하고 중단한다. 메인 에이전트가 대신 배포하거나 복구하지 않는다.

## 2. 독립 감사

서브에이전트가 성공을 보고한 경우에만 다음 읽기 전용 검사를 메인 에이전트가 직접 수행한다. `.env`, PM2 ecosystem 설정, PM2 env 출력, secret 값, `uploads` 내부 파일은 읽지 않는다.

1. `pm2 pid suhan-workspace-backend`와 `pm2 pid suhan-workspace-frontend`로 PID를 확인한다.
2. 각 PID에 `lsof -nP -a -p <pid> -iTCP -sTCP:LISTEN`을 실행해 실제 포트를 독립 확인한다.
3. 다음 네 매핑을 `rsync --dry-run --itemize-changes`로 비교한다. 감사에서는 `--delete`를 사용하지 않는다.
   - `apps/frontend/.next/standalone/apps/frontend/` → `/Users/kim/Developer/tools/suhan-workspace/apps/frontend/`
   - `apps/frontend/.next/static/` → `/Users/kim/Developer/tools/suhan-workspace/apps/frontend/.next/static/`
   - `apps/backend/dist/` → `/Users/kim/Developer/tools/suhan-workspace/apps/backend/dist/`
   - `apps/backend/drizzle/` → `/Users/kim/Developer/tools/suhan-workspace/apps/backend/drizzle/`
4. `pm2 list`에서 `suhan-workspace-backend`와 `suhan-workspace-frontend`가 모두 `online`인지 확인한다.
5. 감지한 포트로 다음 요청을 실행하고 HTTP 상태가 모두 `200`인지 확인한다.
   - frontend `/notes`
   - frontend `/api/projects`
   - backend `/health/db`
6. dry-run에 누락 또는 내용 차이가 있거나, PM2 상태가 `online`이 아니거나, HTTP 응답 중 하나라도 `200`이 아니면 `배포 감사 실패`로 판정한다.
7. 감사 실패 시 재빌드, 재동기화, 재시작 또는 파일 수정을 하지 않는다.

## 3. 최종 보고

한국어로 다음 항목만 간결하게 보고한다.

- 최종 판정: `배포 완료`, `배포 실패`, `배포 감사 실패`
- 소스 커밋과 미커밋 변경 여부
- 감지한 frontend/backend 포트
- 빌드, 동기화, PM2 재시작 결과
- 산출물 dry-run과 세 HTTP 검사 결과
- 실패한 경우 원인과 사용자가 확인할 다음 조치
