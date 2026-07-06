# Backend

Hono 기반 백엔드입니다. GitHub Review PRs 목록을 주기적으로 가져와 Postgres에 저장하고, 프론트에는 HTTP API와 SSE로 전달합니다.

## 환경 변수

`apps/backend/.env.example`을 참고해 `apps/backend/.env`를 만듭니다.

```env
PORT=13001
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/suhan_workspace
FRONTEND_ORIGIN=http://localhost:13000
GITHUB_TOKEN=<github-personal-access-token>
GITHUB_REVIEW_SEARCH_QUERY=is:pr is:open user-review-requested:@me archived:false
```

## GitHub 설정

`GITHUB_TOKEN`에는 GitHub Personal Access Token을 넣습니다.

- Fine-grained token을 쓰는 경우, 리뷰 PR을 조회할 repository에 접근 권한을 줍니다.
- private repository까지 조회해야 하면 repository contents/metadata 접근이 가능한 토큰을 사용합니다.
- `GITHUB_REVIEW_SEARCH_QUERY` 기본값은 `is:pr is:open user-review-requested:@me archived:false`입니다.
- 팀 리뷰 요청이나 특정 org/repo로 범위를 바꾸고 싶으면 GitHub issue search 문법으로 query만 바꾸면 됩니다.

예시:

```env
GITHUB_REVIEW_SEARCH_QUERY=is:pr is:open user-review-requested:@me org:my-org archived:false
```

백엔드는 1분마다 GitHub Search API를 호출합니다. 인증된 Search API 제한은 별도 제한이 있으므로 query 범위를 과하게 넓히지 않는 것이 좋습니다. rate limit이 걸리면 backend는 `retry-after` 또는 `x-ratelimit-reset` 기준으로 다음 호출을 건너뜁니다.

## 실행 순서

```bash
pnpm --dir apps/backend dev
```

서버 시작 시 `apps/backend/drizzle`에 있는 migration을 자동으로 적용합니다. 직접 확인하거나 수동으로 다시 적용해야 할 때만 `pnpm --dir apps/backend db:migrate`를 사용합니다.

서버가 뜨면 다음 endpoint를 사용합니다.

- `GET /health`
- `GET /health/db`
- `GET /github/review-prs`
- `GET /github/review-prs/events`
- `GET /todos`
- `GET /todos/events`
- `POST /todos`
- `PATCH /todos/:id`
- `DELETE /todos/:id`
- `POST /todos/:id/comments`
- `DELETE /todos/:id/comments/:commentId`

## 검증

```bash
pnpm --dir apps/backend test
pnpm --dir apps/backend typecheck
```
