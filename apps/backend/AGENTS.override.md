# 백엔드 작업 지침

- 백엔드 코드는 기능 단위로 묶는 것을 기본 방향으로 한다.
- 새 기능을 추가하거나 기존 기능 파일을 크게 수정할 때는 가능하면 `src/features/{feature}/` 아래에 둔다.
- 기능 폴더 안에서는 필요에 따라 `{feature}.controller.ts`, `{feature}.service.ts`, `{feature}.type.ts`, `{feature}.helper.ts` 형태로 나눈다.
- 파일은 역할이 실제로 생겼을 때만 만든다. 비어 있거나 얇은 전달만 하는 `type`, `helper`, `service` 파일을 구조 맞추기 용도로 만들지 않는다.
- `controller`는 Hono 라우팅, 요청 파싱, 응답 변환만 담당한다.
- `service`는 해당 기능의 유스케이스, DB 접근 흐름, 외부 API 호출 흐름을 담당한다.
- `type`은 여러 파일에서 공유되는 타입, API 응답/요청 계약, 도메인 의미가 있는 타입만 둔다.
- `helper`는 순수 함수에 가까운 검증, 변환, 정렬, 포맷팅 로직이 서비스 안을 시끄럽게 만들 때만 둔다.
- 여러 기능에서 공유하는 DB/env/error/SSE/file-upload 유틸은 `src/common/`에 둔다.
- 특정 기능에만 쓰이는 값이나 함수는 `common`으로 올리지 않는다.
- `src` 루트에는 진입점 같은 앱 조립 파일만 둔다. 새 feature 구현 파일을 `src/*.ts`에 다시 만들지 않는다.
- 기존 구조에서 남은 루트 feature 파일이 발견되면 관련 작업 범위 안에서 `src/features/{feature}/`로 옮긴다.
- 공통 파일 업로드 구조를 건드릴 때는 루트 `AGENTS.md`의 지침대로 `docs/files/common-file-upload.md`와 고아 파일 정리 보호 참조를 함께 확인한다.

# 검증

- 백엔드 수정 후 가능한 경우 `pnpm --dir apps/backend typecheck`, `pnpm --dir apps/backend test`, `pnpm --dir apps/backend build` 중 변경 범위에 맞는 명령을 실행한다.
- 문서만 수정한 경우에는 테스트 실행이 필수는 아니다.
