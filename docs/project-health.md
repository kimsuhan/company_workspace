# Project Health

## 개요

Project Health는 프로젝트에 저장된 상태 API URL을 백엔드가 1분마다 호출하고, 결과를 기록한 뒤 프론트에 프로젝트 API와 SSE로 전달한다.

프론트 `/settings/projects` 화면에서 프로젝트, 상태 API URL, 로고를 함께 등록/수정한다. 브라우저에서는 Next rewrite를 통해 same-origin `/api/projects/*`로 호출한다.

## API

```bash
GET /api/projects
GET /api/projects/events
POST /api/projects
PATCH /api/projects/:id
DELETE /api/projects/:id
POST /api/projects/health/test
```

프로젝트 등록 예시:

```bash
curl -X POST http://localhost:13001/api/projects \
  -H 'content-type: application/json' \
  -d '{"name":"Admin Console","description":null,"healthApiUrl":"https://admin.suhan.dev/health","logoUrl":null,"logoVariant":"black"}'
```

상태 API 테스트 예시:

```bash
curl -X POST http://localhost:13001/api/projects/health/test \
  -H 'content-type: application/json' \
  -d '{"healthApiUrl":"https://admin.suhan.dev/health"}'
```

`GET /api/projects`와 SSE는 같은 배열 shape를 반환한다.

```ts
type Project = {
  id: number;
  name: string;
  description: string | null;
  logoUrl: string | null;
  logoVariant: "black" | "white";
  healthApiUrl: string | null;
  health: null | {
    status: "healthy" | "unhealthy";
    checkedAt: string;
    responseTimeMs: number | null;
    history: {
      checkedAt: string;
      status: "healthy" | "unhealthy";
      responseTimeMs: number | null;
    }[];
  };
};
```

## 동작

- 서버 시작 시 migration이 실행되어 `projects` 상태 컬럼과 `project_health_records` 테이블을 준비한다.
- active project 중 `healthApiUrl`이 있는 항목만 매 분 호출한다.
- HTTP 2xx 응답은 `healthy`, 그 외 응답/timeout/fetch 오류는 `unhealthy`로 기록한다.
- SSE는 `retry: 5000`과 heartbeat ping을 포함한다.
