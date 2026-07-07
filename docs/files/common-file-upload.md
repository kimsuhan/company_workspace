# Common File Upload

공통 파일 업로드는 health check 로고와 프로젝트 문서 이미지/첨부가 함께 쓰는 로컬 파일 저장 구조다.

## 저장 구조

- DB 메타데이터: `files`
- 파일 본문: `apps/backend/uploads/files`
- public URL: `/api/files/:id`
- 다운로드 URL: `/api/files/:id/download`
- 삭제: 파일 row의 `is_active=false` soft delete

파일 row에는 원본명, 저장명, MIME type, byte size, storage path, public URL을 저장한다. 파일 본문은 DB에 넣지 않는다.

## API

- `POST /api/files`: `multipart/form-data`의 `file` 필드를 업로드한다.
- `GET /api/files/:id`: active 파일을 inline 응답한다.
- `GET /api/files/:id/download`: active 파일을 attachment 응답한다.
- `DELETE /api/files/:id`: active row를 비활성화하고 로컬 파일 본문을 삭제한다.

기본 제한은 10MB다. v1은 권한/인증, 파일 관리 화면, 이미지 리사이즈를 다루지 않는다.

## 정리 정책

서버는 시작 시 1회, 이후 매일 03:17에 고아 파일을 정리한다.

- 정리 대상: `is_active=true`이고 생성 후 1시간이 지난 파일 중 어디에도 참조되지 않는 파일
- 보호 참조: active Project의 `logo_file_id`, active Project에 속한 Todo/Project 문서 본문, Note 본문 안의 `/api/files/:id` 또는 `/api/files/:id/download`
- 정리 동작: 로컬 파일 본문을 삭제하고 `files.is_active=false`로 변경한다.

최근 1시간 파일은 에디터 작성 중이거나 저장 전일 수 있어 정리하지 않는다.

## 사용처

- Project Health: `projects.logo_file_id`가 `files.id`를 참조한다. API 응답은 UI 호환을 위해 `logoUrl`도 함께 내려준다.
- Project Documents: `project_nodes.content` HTML 안에 이미지 URL 또는 첨부 다운로드 링크를 저장한다. 별도 프로젝트 첨부 테이블은 없다.

기존 health check의 base64 `logo_url` 데이터는 즉시 변환하지 않고 호환 응답으로 유지한다. 새 로고 업로드는 `logoFileId`를 기준으로 저장한다.
