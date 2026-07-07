# 전역 form CSS 충돌 검증

- 상태: 관찰 중
- 생성된 evolve 회차 또는 날짜: 2026-07-06
- 검토 횟수: 3
- 최대 검토 횟수: 3
- 분야: skill
- 근거: 전역 `.field input` 스타일이 Tiptap task checkbox에 적용되어 체크박스가 1487px로 렌더링됐다. Dashboard Layout 커스텀 number input도 전역 input 계열 스타일/선택자 우선순위 때문에 의도한 패널 UI처럼 보이지 않았다.
- 다음 판단 조건: 다른 세션/프로젝트에서도 전역 form/button/label 스타일이 특정 기능 UI 내부 DOM을 깨는 문제가 반복되면 별도 검증 스킬 또는 기존 verification 지침 보강을 추천한다.
- 연장 사유: 없음
