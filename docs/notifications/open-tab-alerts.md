# Open Tab Alerts

대시보드 알림은 브라우저 탭이 열려 있을 때만 동작한다.
Service Worker, Push API, Tauri/macOS 네이티브 알림은 사용하지 않는다.

- GitHub Review PR: 기존 active PR baseline 이후 새 active PR이 등장하면 알림
- Project Status: `healthy -> unhealthy` 전환만 알림
- 초기 로드 데이터는 baseline으로만 저장하고 알림을 울리지 않는다
- 소리는 Web Audio API의 짧은 beep로 처리하며, 브라우저 정책으로 실패해도 화면 알림 흐름을 막지 않는다
