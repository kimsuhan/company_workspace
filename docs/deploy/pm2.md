# PM2 Deploy

## 원칙

배포 target 디렉터리는 PM2 ecosystem에서 관리한다. 이미 PM2 ecosystem 환경 변수가 설정돼 있으면 다음 배포에서는 secret/env 값을 읽거나 덮어쓰지 않는다.

Codex는 배포 시 빌드 산출물만 갱신한다. 환경 변수 변경이 필요하면 키 이름과 영향 범위만 안내하고, 실제 값 입력은 사용자가 직접 한다.

## 배포 산출물

- frontend: Next standalone `apps/frontend/server.js`, `.next/static`, standalone `node_modules`
- backend: `apps/backend/dist`, `drizzle`, runtime `node_modules`
- uploads: `apps/backend/uploads/files` 디렉터리는 유지한다. 기존 업로드 데이터는 명시 요청 없이는 복제하거나 삭제하지 않는다.
- PM2 설정: `pm2.ecosystem.config.cjs`는 사용자가 직접 관리한다.

## 다음 배포 절차

1. source repo에서 빌드한다.
2. frontend standalone/static 산출물만 target에 갱신한다.
3. backend `dist`와 필요한 migration 산출물만 target에 갱신한다.
4. `pm2 restart`로 프로세스를 재시작한다.
5. logs로 backend/frontend 기동 오류를 확인한다.

## env 변경 시

`DATABASE_URL`, `GITHUB_TOKEN` 같은 secret 값은 Codex가 읽거나 출력하지 않는다.

`NEXT_PUBLIC_BACKEND_URL`처럼 frontend build-time env가 바뀌면, 사용자가 값을 반영한 뒤 frontend를 다시 빌드해서 standalone 산출물을 갱신해야 한다.

## 배포 전 포트 확인

PM2 배포 환경의 frontend/backend 포트는 source repo의 개발용 `.env`와 다를 수 있다.
배포 빌드 전 `pm2 logs` 또는 PM2 ecosystem 설정 기준으로 실제 backend 포트를 확인하고,
frontend standalone을 빌드할 때 `NEXT_PUBLIC_BACKEND_URL`이 실제 backend 포트와 맞는지 확인한다.

예: backend가 `14001`이면 frontend는 `NEXT_PUBLIC_BACKEND_URL=http://localhost:14001`로 빌드한다.
빌드 후 `server.js` 또는 `.next/static` 산출물에 예전 개발 포트가 남아 있지 않은지 확인한다.
